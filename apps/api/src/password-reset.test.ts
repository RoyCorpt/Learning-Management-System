import 'dotenv/config';
import { Algorithm, hash as argon2Hash } from '@node-rs/argon2';
import { eq, inArray } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { db, pool } from '../../../src/db/index.js';
import {
  auditEvents,
  passwordResetTokens,
  rateLimitBuckets,
  sessions,
  users,
} from '../../../src/db/schema.js';
import { createApp } from './app.js';
import { parseEnv, type AppEnv } from './config/env.js';
import {
  buildPasswordResetUrl,
  isPasswordResetEmailDeliveryConfigured,
  MailDeliveryError,
  setPasswordResetMailHook,
  type PasswordResetEmailPayload,
} from './lib/mailer.js';
import {
  deriveAccountRateLimitKey,
  deriveIpRateLimitKey,
  normalizeEmailForRateLimit,
  purgeExpiredRateLimitBuckets,
} from './lib/rate-limit.js';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
const passwordOptions = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

function makeTestEnv(overrides: NodeJS.ProcessEnv = {}): AppEnv {
  return parseEnv({
    NODE_ENV: 'test',
    WEB_ORIGIN: 'http://localhost:3000',
    TRUST_PROXY: 'loopback',
    PASSWORD_RESET_DEV_PREVIEW: 'false',
    ...overrides,
  });
}

async function startTestServer(runtimeEnv?: AppEnv) {
  const server = createApp(undefined, runtimeEnv).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test server did not bind a TCP port');
  }
  return { server, base: `http://127.0.0.1:${address.port}` };
}

async function stopTestServer(server: Server | undefined) {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function extractTokenFromResetUrl(resetUrl: string): string {
  const parsed = new URL(resetUrl);
  expect(parsed.searchParams.has('resetToken')).toBe(false);
  const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
  const token = new URLSearchParams(hash).get('resetToken');
  if (!token) throw new Error(`Missing #resetToken fragment in ${resetUrl}`);
  return token;
}

describe('Lupa Kata Sandi (backend token reset without Firebase)', () => {
  afterAll(async () => {
    setPasswordResetMailHook(null);
    await pool.end();
  });

  it('validates inputs, enforces URL fragments + security headers, and removes GET query token verification', async () => {
    const resetUrl = buildPasswordResetUrl('abc+123/xyz', 'https://lms.example.ac.id');
    expect(resetUrl).toBe('https://lms.example.ac.id/#resetToken=abc%2B123%2Fxyz');
    expect(resetUrl).not.toContain('?resetToken=');

    expect(
      isPasswordResetEmailDeliveryConfigured({
        NODE_ENV: 'production',
        SMTP_HOST: undefined,
        SMTP_USER: undefined,
        SMTP_PASS: undefined,
        PASSWORD_RESET_DEV_PREVIEW: false,
      }),
    ).toBe(false);

    expect(
      isPasswordResetEmailDeliveryConfigured({
        NODE_ENV: 'development',
        SMTP_HOST: undefined,
        SMTP_USER: undefined,
        SMTP_PASS: undefined,
        PASSWORD_RESET_DEV_PREVIEW: false,
      }),
    ).toBe(false);

    expect(
      isPasswordResetEmailDeliveryConfigured({
        NODE_ENV: 'development',
        SMTP_HOST: undefined,
        SMTP_USER: undefined,
        SMTP_PASS: undefined,
        PASSWORD_RESET_DEV_PREVIEW: true,
      }),
    ).toBe(true);

    const { server, base } = await startTestServer(makeTestEnv({ PASSWORD_RESET_IP_LIMIT: '50' }));
    try {
      const invalidForgot = await fetch(`${base}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });
      expect(invalidForgot.status).toBe(400);
      expect(invalidForgot.headers.get('cache-control')).toBe('no-store');
      expect(invalidForgot.headers.get('referrer-policy')).toBe('no-referrer');
      expect((await invalidForgot.json()).error.code).toBe('INVALID_INPUT');

      const legacyGetVerify = await fetch(`${base}/auth/reset-password/verify?token=${'a'.repeat(32)}`);
      expect(legacyGetVerify.status).toBe(404);
      expect((await legacyGetVerify.json()).error.code).toBe('NOT_FOUND');

      const shortVerify = await fetch(`${base}/auth/reset-password/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'short' }),
      });
      expect(shortVerify.status).toBe(400);
      expect(shortVerify.headers.get('cache-control')).toBe('no-store');
      expect(shortVerify.headers.get('referrer-policy')).toBe('no-referrer');
      expect((await shortVerify.json()).error.code).toBe('INVALID_RESET_TOKEN');

      const weakPasswordReset = await fetch(`${base}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'a'.repeat(32), newPassword: 'short' }),
      });
      expect(weakPasswordReset.status).toBe(400);
      expect(weakPasswordReset.headers.get('cache-control')).toBe('no-store');
      expect(weakPasswordReset.headers.get('referrer-policy')).toBe('no-referrer');
      expect((await weakPasswordReset.json()).error.code).toBe('INVALID_INPUT');
    } finally {
      await stopTestServer(server);
    }
  }, 15000);

  (enabled ? it : it.skip)(
    'generates SHA-256 hashed single-use tokens, verifies with POST even during active session, handles concurrent reset race, revokes sessions, and rejects reuse or expired tokens',
    async () => {
      const unique = randomUUID();
      const activeUserId = randomUUID();
      const inactiveUserId = randomUUID();
      const activeEmail = `reset-active-${unique}@example.invalid`;
      const inactiveEmail = `reset-inactive-${unique}@example.invalid`;
      const unknownEmail = `reset-unknown-${unique}@example.invalid`;
      const initialPassword = `Initial-Reset-${unique}-42!`;
      const nextPassword = `Updated-Reset-${unique}-99!`;
      const initialHash = await argon2Hash(initialPassword, passwordOptions);

      const usedBucketKeys = [
        deriveIpRateLimitKey('fp', '127.0.0.1'),
        deriveIpRateLimitKey('rp_verify', '127.0.0.1'),
        deriveIpRateLimitKey('rp', '127.0.0.1'),
        deriveAccountRateLimitKey('fp', normalizeEmailForRateLimit(activeEmail)),
        deriveAccountRateLimitKey('fp', normalizeEmailForRateLimit(inactiveEmail)),
        deriveAccountRateLimitKey('fp', normalizeEmailForRateLimit(unknownEmail)),
      ];

      await db.delete(rateLimitBuckets).where(inArray(rateLimitBuckets.bucketKey, usedBucketKeys));

      await db.insert(users).values([
        {
          id: activeUserId,
          email: activeEmail,
          fullName: 'Active Reset User',
          role: 'MAHASISWA',
          status: 'ACTIVE',
          mustChangePassword: true,
          passwordHash: initialHash,
        },
        {
          id: inactiveUserId,
          email: inactiveEmail,
          fullName: 'Inactive Reset User',
          role: 'MAHASISWA',
          status: 'INACTIVE',
          mustChangePassword: false,
          passwordHash: initialHash,
        },
      ]);

      const sentEmails: PasswordResetEmailPayload[] = [];
      setPasswordResetMailHook((payload) => {
        sentEmails.push(payload);
      });

      const { server, base } = await startTestServer(
        makeTestEnv({
          WEB_ORIGIN: 'https://sintaks.example.ac.id',
          PASSWORD_RESET_IP_LIMIT: '50',
          PASSWORD_RESET_ACCOUNT_LIMIT: '20',
        }),
      );
      try {
        const loginBefore = await fetch(`${base}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: activeEmail, password: initialPassword }),
        });
        expect(loginBefore.status).toBe(200);
        const oldSessionCookie = loginBefore.headers
          .getSetCookie()
          .find((value) => value.startsWith('lms_session='))!
          .split(';')[0]!;
        expect((await fetch(`${base}/auth/me`, { headers: { Cookie: oldSessionCookie } })).status).toBe(200);

        const unknownResp = await fetch(`${base}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: unknownEmail }),
        });
        const inactiveResp = await fetch(`${base}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: inactiveEmail }),
        });
        expect(unknownResp.status).toBe(200);
        expect(inactiveResp.status).toBe(200);
        expect(await unknownResp.json()).toEqual(await inactiveResp.json());
        expect(sentEmails).toHaveLength(0);

        const firstForgot = await fetch(`${base}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: activeEmail.toUpperCase() }),
        });
        expect(firstForgot.status).toBe(200);
        expect(sentEmails).toHaveLength(1);
        const firstToken = extractTokenFromResetUrl(sentEmails[0]!.resetUrl);
        expect(firstToken.length).toBeGreaterThanOrEqual(32);

        // Requesting a second reset token must invalidate the previous unused token.
        const secondForgot = await fetch(`${base}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: activeEmail }),
        });
        expect(secondForgot.status).toBe(200);
        expect(sentEmails).toHaveLength(2);
        const secondToken = extractTokenFromResetUrl(sentEmails[1]!.resetUrl);
        expect(secondToken).not.toBe(firstToken);

        const firstVerify = await fetch(`${base}/auth/reset-password/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: firstToken }),
        });
        expect(firstVerify.status).toBe(400);

        // Verify POST works even if the browser currently carries an active logged-in session cookie.
        const secondVerify = await fetch(`${base}/auth/reset-password/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: oldSessionCookie,
          },
          body: JSON.stringify({ token: secondToken }),
        });
        expect(secondVerify.status).toBe(200);
        expect(secondVerify.headers.get('cache-control')).toBe('no-store');
        expect(secondVerify.headers.get('referrer-policy')).toBe('no-referrer');
        expect(await secondVerify.json()).toEqual({ valid: true });

        const expectedHash = createHash('sha256').update(secondToken).digest('hex');
        const [storedRow] = await db
          .select()
          .from(passwordResetTokens)
          .where(eq(passwordResetTokens.tokenHash, expectedHash))
          .limit(1);
        expect(storedRow).toBeDefined();
        expect(storedRow!.usedAt).toBeNull();

        // Concurrent submission protection: only one reset succeeds, the other gets 400.
        const [raceA, raceB] = await Promise.all([
          fetch(`${base}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: oldSessionCookie },
            body: JSON.stringify({ token: secondToken, newPassword: nextPassword }),
          }),
          fetch(`${base}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: oldSessionCookie },
            body: JSON.stringify({ token: secondToken, newPassword: `${nextPassword}-race` }),
          }),
        ]);
        const statuses = [raceA.status, raceB.status].sort((a, b) => a - b);
        expect(statuses).toEqual([200, 400]);

        // Token cannot be verified or reused after completion.
        expect(
          (
            await fetch(`${base}/auth/reset-password/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: secondToken }),
            })
          ).status,
        ).toBe(400);
        const replayRes = await fetch(`${base}/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: secondToken, newPassword: `${nextPassword}x` }),
        });
        expect(replayRes.status).toBe(400);

        // Existing sessions must be revoked, mustChangePassword cleared, authVersion incremented, audit inserted.
        expect((await fetch(`${base}/auth/me`, { headers: { Cookie: oldSessionCookie } })).status).toBe(401);
        const [updatedUser] = await db.select().from(users).where(eq(users.id, activeUserId)).limit(1);
        expect(updatedUser!.mustChangePassword).toBe(false);
        expect(updatedUser!.authVersion).toBe(1);
        const activeSessions = await db.select().from(sessions).where(eq(sessions.userId, activeUserId));
        expect(activeSessions.every((session) => session.revokedAt !== null)).toBe(true);

        const userAudits = await db.select().from(auditEvents).where(eq(auditEvents.actorId, activeUserId));
        expect(userAudits.some((event) => event.action === 'AUTH_PASSWORD_RESET_REQUESTED')).toBe(true);
        expect(userAudits.some((event) => event.action === 'AUTH_PASSWORD_RESET_COMPLETED')).toBe(true);

        // Old password fails; new password logs in cleanly.
        const oldPwLogin = await fetch(`${base}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: activeEmail, password: initialPassword }),
        });
        expect(oldPwLogin.status).toBe(401);

        const newPwLogin = await fetch(`${base}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: activeEmail, password: nextPassword }),
        });
        expect(newPwLogin.status).toBe(200);

        // Expired reset token must be rejected.
        await fetch(`${base}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: activeEmail }),
        });
        expect(sentEmails).toHaveLength(3);
        const thirdToken = extractTokenFromResetUrl(sentEmails[2]!.resetUrl);
        await db
          .update(passwordResetTokens)
          .set({ expiresAt: new Date(Date.now() - 60_000) })
          .where(eq(passwordResetTokens.tokenHash, createHash('sha256').update(thirdToken).digest('hex')));
        expect(
          (
            await fetch(`${base}/auth/reset-password/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: thirdToken }),
            })
          ).status,
        ).toBe(400);
        const expiredReset = await fetch(`${base}/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: thirdToken, newPassword: `${nextPassword}expired` }),
        });
        expect(expiredReset.status).toBe(400);
      } finally {
        setPasswordResetMailHook(null);
        await stopTestServer(server);
        await db.delete(rateLimitBuckets).where(inArray(rateLimitBuckets.bucketKey, usedBucketKeys));
        await db.delete(auditEvents).where(eq(auditEvents.actorId, activeUserId));
        await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, activeUserId));
        await db.delete(users).where(eq(users.id, activeUserId));
        await db.delete(users).where(eq(users.id, inactiveUserId));
      }
    },
    30000,
  );

  (enabled ? it : it.skip)(
    'invalidates created reset token and returns 503 EMAIL_DELIVERY_FAILED when SMTP delivery fails without leaking raw tokens in logs',
    async () => {
      const unique = randomUUID();
      const userId = randomUUID();
      const email = `reset-smtp-fail-${unique}@example.invalid`;
      const passwordHash = await argon2Hash(`Pass-${unique}-123!`, passwordOptions);
      const bucketKeys = [
        deriveIpRateLimitKey('fp', '127.0.0.1'),
        deriveAccountRateLimitKey('fp', normalizeEmailForRateLimit(email)),
      ];

      await db.delete(rateLimitBuckets).where(inArray(rateLimitBuckets.bucketKey, bucketKeys));
      await db.insert(users).values({
        id: userId,
        email,
        fullName: 'SMTP Fail User',
        role: 'MAHASISWA',
        status: 'ACTIVE',
        mustChangePassword: false,
        passwordHash,
      });

      const loggedErrors: string[] = [];
      const originalConsoleError = console.error;
      console.error = (...args: unknown[]) => {
        loggedErrors.push(args.map((a) => String(a)).join(' '));
      };

      setPasswordResetMailHook(() => {
        throw new MailDeliveryError('SMTP connection refused');
      });

      const { server, base } = await startTestServer(
        makeTestEnv({
          PASSWORD_RESET_IP_LIMIT: '50',
          PASSWORD_RESET_ACCOUNT_LIMIT: '10',
        }),
      );

      try {
        const res = await fetch(`${base}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.error.code).toBe('EMAIL_DELIVERY_FAILED');

        const tokenRows = await db
          .select()
          .from(passwordResetTokens)
          .where(eq(passwordResetTokens.userId, userId));
        expect(tokenRows).toHaveLength(1);
        expect(tokenRows[0]!.usedAt).not.toBeNull();

        expect(loggedErrors.some((line) => line.includes('password_reset_email_failed'))).toBe(true);
        for (const line of loggedErrors) {
          expect(line).not.toContain('resetToken');
        }
      } finally {
        console.error = originalConsoleError;
        setPasswordResetMailHook(null);
        await stopTestServer(server);
        await db.delete(rateLimitBuckets).where(inArray(rateLimitBuckets.bucketKey, bucketKeys));
        await db.delete(auditEvents).where(eq(auditEvents.actorId, userId));
        await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
        await db.delete(users).where(eq(users.id, userId));
      }
    },
    25000,
  );

  (enabled ? it : it.skip)(
    'enforces independent PostgreSQL IP and cross-IP normalized account-identifier limits, concurrent bursts, and expiration reset',
    async () => {
      const unique = randomUUID();
      const targetEmail = `rl-target-${unique}@example.invalid`;
      const unknownEmail = `rl-unknown-${unique}@example.invalid`;
      const distinctIpEmails = [0, 1, 2, 3].map((idx) => `rl-ip-${idx}-${unique}@example.invalid`);
      const ips = ['198.51.100.10', '198.51.100.11', '198.51.100.12', '198.51.100.13', '198.51.100.20'];

      const bucketKeys = [
        deriveIpRateLimitKey('fp', '127.0.0.1'),
        ...ips.map((ip) => deriveIpRateLimitKey('fp', ip)),
        deriveAccountRateLimitKey('fp', normalizeEmailForRateLimit(targetEmail)),
        deriveAccountRateLimitKey('fp', normalizeEmailForRateLimit(unknownEmail)),
        ...distinctIpEmails.map((email) => deriveAccountRateLimitKey('fp', normalizeEmailForRateLimit(email))),
      ];

      await db.delete(rateLimitBuckets).where(inArray(rateLimitBuckets.bucketKey, bucketKeys));

      setPasswordResetMailHook(() => undefined);

      // 1) Test IP-based limit across different emails from same IP (limit = 3).
      const ipLimitedEnv = makeTestEnv({
        TRUST_PROXY: 'loopback',
        PASSWORD_RESET_IP_LIMIT: '3',
        PASSWORD_RESET_ACCOUNT_LIMIT: '20',
      });
      const { server: ipServer, base: ipBase } = await startTestServer(ipLimitedEnv);
      try {
        for (let i = 0; i < 3; i += 1) {
          const okRes = await fetch(`${ipBase}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ips[4]! },
            body: JSON.stringify({ email: distinctIpEmails[i]! }),
          });
          expect(okRes.status).toBe(200);
        }
        const blockedByIp = await fetch(`${ipBase}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ips[4]! },
          body: JSON.stringify({ email: distinctIpEmails[3]! }),
        });
        expect(blockedByIp.status).toBe(429);
        expect(blockedByIp.headers.get('retry-after')).toBeTruthy();
        expect((await blockedByIp.json()).error.code).toBe('PASSWORD_RESET_RATE_LIMITED');
      } finally {
        await stopTestServer(ipServer);
      }

      // 2) Test cross-IP normalized account-identifier limit (limit = 2) + concurrent bursts + expiration reset.
      const acctLimitedEnv = makeTestEnv({
        TRUST_PROXY: 'loopback',
        PASSWORD_RESET_IP_LIMIT: '20',
        PASSWORD_RESET_ACCOUNT_LIMIT: '2',
      });
      const { server: acctServer, base: acctBase } = await startTestServer(acctLimitedEnv);
      try {
        const res1 = await fetch(`${acctBase}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ips[0]! },
          body: JSON.stringify({ email: targetEmail }),
        });
        const res2 = await fetch(`${acctBase}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ips[1]! },
          body: JSON.stringify({ email: `  ${targetEmail.toUpperCase()}  ` }),
        });
        expect(res1.status).toBe(200);
        expect(res2.status).toBe(200);

        // 3rd request from a completely different IP for the same normalized email must be blocked with 429.
        const res3 = await fetch(`${acctBase}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ips[2]! },
          body: JSON.stringify({ email: targetEmail.toUpperCase() }),
        });
        expect(res3.status).toBe(429);
        expect((await res3.json()).error.code).toBe('PASSWORD_RESET_RATE_LIMITED');

        // Concurrent burst against unknown email across distinct IPs: atomic limit=2 -> strictly 2 x 200 and 3 x 429.
        const burst = await Promise.all(
          [0, 1, 2, 3, 4].map((idx) =>
            fetch(`${acctBase}/auth/forgot-password`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': `198.51.100.${50 + idx}`,
              },
              body: JSON.stringify({ email: idx % 2 === 0 ? unknownEmail : unknownEmail.toUpperCase() }),
            }),
          ),
        );
        const statusCounts = burst.reduce<Record<number, number>>((acc, r) => {
          acc[r.status] = (acc[r.status] ?? 0) + 1;
          return acc;
        }, {});
        expect(statusCounts[200]).toBe(2);
        expect(statusCounts[429]).toBe(3);

        // Expire the account window and confirm requests are accepted again and purge works.
        const targetAcctBucket = deriveAccountRateLimitKey('fp', normalizeEmailForRateLimit(targetEmail));
        await db
          .update(rateLimitBuckets)
          .set({ resetAt: new Date(Date.now() - 5_000) })
          .where(eq(rateLimitBuckets.bucketKey, targetAcctBucket));

        const afterExpiry = await fetch(`${acctBase}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ips[3]! },
          body: JSON.stringify({ email: targetEmail }),
        });
        expect(afterExpiry.status).toBe(200);

        const unknownAcctBucket = deriveAccountRateLimitKey('fp', normalizeEmailForRateLimit(unknownEmail));
        await db
          .update(rateLimitBuckets)
          .set({ resetAt: new Date(Date.now() - 5_000) })
          .where(eq(rateLimitBuckets.bucketKey, unknownAcctBucket));
        await purgeExpiredRateLimitBuckets(new Date());
        const remainingExpired = await db
          .select()
          .from(rateLimitBuckets)
          .where(eq(rateLimitBuckets.bucketKey, unknownAcctBucket));
        expect(remainingExpired).toHaveLength(0);
      } finally {
        setPasswordResetMailHook(null);
        await stopTestServer(acctServer);
        await db.delete(rateLimitBuckets).where(inArray(rateLimitBuckets.bucketKey, bucketKeys));
        await db
          .delete(rateLimitBuckets)
          .where(
            inArray(
              rateLimitBuckets.bucketKey,
              [0, 1, 2, 3, 4].map((idx) => deriveIpRateLimitKey('fp', `198.51.100.${50 + idx}`)),
            ),
          );
      }
    },
    30000,
  );
});
