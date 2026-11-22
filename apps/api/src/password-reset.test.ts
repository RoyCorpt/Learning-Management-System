import 'dotenv/config';
import { Algorithm, hash as argon2Hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { db, pool } from '../../../src/db/index.js';
import { auditEvents, passwordResetTokens, sessions, users } from '../../../src/db/schema.js';
import { createApp } from './app.js';
import { buildPasswordResetUrl, setPasswordResetMailHook, type PasswordResetEmailPayload } from './lib/mailer.js';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
const passwordOptions = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

async function startTestServer() {
  const server = createApp().listen(0);
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

describe('Lupa Kata Sandi (backend token reset without Firebase)', () => {
  afterAll(async () => {
    setPasswordResetMailHook(null);
    await pool.end();
  });

  it('validates inputs and builds reset URLs without Firebase', async () => {
    const resetUrl = buildPasswordResetUrl('abc+123/xyz');
    expect(resetUrl).toContain('/?resetToken=abc%2B123%2Fxyz');

    const { server, base } = await startTestServer();
    try {
      const invalidForgot = await fetch(`${base}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });
      expect(invalidForgot.status).toBe(400);
      expect((await invalidForgot.json()).error.code).toBe('INVALID_INPUT');

      const shortVerify = await fetch(`${base}/auth/reset-password/verify?token=short`);
      expect(shortVerify.status).toBe(400);
      expect((await shortVerify.json()).error.code).toBe('INVALID_RESET_TOKEN');

      const weakPasswordReset = await fetch(`${base}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'a'.repeat(32), newPassword: 'short' }),
      });
      expect(weakPasswordReset.status).toBe(400);
      expect((await weakPasswordReset.json()).error.code).toBe('INVALID_INPUT');
    } finally {
      await stopTestServer(server);
    }
  }, 15000);

  (enabled ? it : it.skip)('generates SHA-256 hashed single-use tokens, prevents email enumeration, revokes active sessions, and rejects reuse or expired tokens', async () => {
    const unique = randomUUID();
    const activeUserId = randomUUID();
    const inactiveUserId = randomUUID();
    const activeEmail = `reset-active-${unique}@example.invalid`;
    const inactiveEmail = `reset-inactive-${unique}@example.invalid`;
    const unknownEmail = `reset-unknown-${unique}@example.invalid`;
    const initialPassword = `Initial-Reset-${unique}-42!`;
    const nextPassword = `Updated-Reset-${unique}-99!`;
    const initialHash = await argon2Hash(initialPassword, passwordOptions);

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

    const { server, base } = await startTestServer();
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
      const firstToken = new URL(sentEmails[0]!.resetUrl).searchParams.get('resetToken')!;
      expect(firstToken.length).toBeGreaterThanOrEqual(32);

      // Requesting a second reset token must invalidate the previous unused token.
      const secondForgot = await fetch(`${base}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: activeEmail }),
      });
      expect(secondForgot.status).toBe(200);
      expect(sentEmails).toHaveLength(2);
      const secondToken = new URL(sentEmails[1]!.resetUrl).searchParams.get('resetToken')!;
      expect(secondToken).not.toBe(firstToken);

      const firstVerify = await fetch(`${base}/auth/reset-password/verify?token=${encodeURIComponent(firstToken)}`);
      expect(firstVerify.status).toBe(400);

      const secondVerify = await fetch(`${base}/auth/reset-password/verify?token=${encodeURIComponent(secondToken)}`);
      expect(secondVerify.status).toBe(200);
      expect(await secondVerify.json()).toEqual({ valid: true });

      const expectedHash = createHash('sha256').update(secondToken).digest('hex');
      const [storedRow] = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, expectedHash))
        .limit(1);
      expect(storedRow).toBeDefined();
      expect(storedRow!.usedAt).toBeNull();

      const resetRes = await fetch(`${base}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: secondToken, newPassword: nextPassword }),
      });
      expect(resetRes.status).toBe(200);

      // Token cannot be verified or reused after completion.
      expect((await fetch(`${base}/auth/reset-password/verify?token=${encodeURIComponent(secondToken)}`)).status).toBe(400);
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
      const thirdToken = new URL(sentEmails[2]!.resetUrl).searchParams.get('resetToken')!;
      await db
        .update(passwordResetTokens)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(passwordResetTokens.tokenHash, createHash('sha256').update(thirdToken).digest('hex')));
      expect((await fetch(`${base}/auth/reset-password/verify?token=${encodeURIComponent(thirdToken)}`)).status).toBe(400);
      const expiredReset = await fetch(`${base}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: thirdToken, newPassword: `${nextPassword}expired` }),
      });
      expect(expiredReset.status).toBe(400);
    } finally {
      setPasswordResetMailHook(null);
      await stopTestServer(server);
      await db.delete(auditEvents).where(eq(auditEvents.actorId, activeUserId));
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, activeUserId));
      await db.delete(users).where(eq(users.id, activeUserId));
      await db.delete(users).where(eq(users.id, inactiveUserId));
    }
  }, 30000);
});
