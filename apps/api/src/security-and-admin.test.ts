import 'dotenv/config';
import { Algorithm, hash as argon2Hash } from '@node-rs/argon2';
import { inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { db, pool } from '../../../src/db/index.js';
import { auditEvents, users } from '../../../src/db/schema.js';
import { createApp } from './app.js';
import { buildCookieOptions } from './auth.js';
import {
  buildAllowedOrigins,
  parseEnv,
  parseExactOriginUrl,
  resolveTrustProxySetting,
  type AppEnv,
} from './config/env.js';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
const passwordOptions = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

function validProductionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    WEB_ORIGIN: 'https://sintaks.example.ac.id',
    CORS_ALLOWED_ORIGINS: 'https://portal.example.ac.id',
    TRUST_PROXY: 'loopback',
    COOKIE_SECURE: 'true',
    COOKIE_SAME_SITE: 'lax',
    PASSWORD_RESET_DEV_PREVIEW: 'false',
    SMTP_HOST: 'smtp.example.ac.id',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'mailer@example.ac.id',
    SMTP_PASS: 'super-secret-smtp-password',
    SMTP_FROM: 'SINTAKS <no-reply@example.ac.id>',
    ...overrides,
  };
}

function makeTestEnv(overrides: NodeJS.ProcessEnv = {}): AppEnv {
  return parseEnv({
    NODE_ENV: 'test',
    WEB_ORIGIN: 'https://app.sintaks.local',
    CORS_ALLOWED_ORIGINS: 'https://portal.sintaks.local',
    TRUST_PROXY: 'loopback',
    COOKIE_SECURE: 'false',
    COOKIE_SAME_SITE: 'lax',
    PASSWORD_RESET_DEV_PREVIEW: 'false',
    ...overrides,
  });
}

async function startTestServer(runtimeEnv: AppEnv) {
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

afterAll(async () => {
  await pool.end();
});

describe('Environment, CORS, cookie, and proxy hardening', () => {
  it('validates exact origins, trust proxy rules, and fail-closed production startup config', () => {
    expect(parseExactOriginUrl('https://sintaks.example.ac.id/')).toBe('https://sintaks.example.ac.id');
    expect(parseExactOriginUrl('https://*.example.ac.id')).toBeNull();
    expect(parseExactOriginUrl('https://sintaks.example.ac.id/path')).toBeNull();
    expect(parseExactOriginUrl('https://user:pass@sintaks.example.ac.id')).toBeNull();
    expect(parseExactOriginUrl('ftp://sintaks.example.ac.id')).toBeNull();

    expect(resolveTrustProxySetting('false')).toBe(false);
    expect(resolveTrustProxySetting('0')).toBe(false);
    expect(resolveTrustProxySetting('loopback')).toBe('loopback');
    expect(resolveTrustProxySetting('1')).toBe(1);
    expect(resolveTrustProxySetting('10.0.0.0/8, 172.16.0.0/12')).toEqual(['10.0.0.0/8', '172.16.0.0/12']);
    expect(() => resolveTrustProxySetting('true')).toThrow();
    expect(() => resolveTrustProxySetting('not-an-ip')).toThrow();

    const okProd = parseEnv(validProductionEnv());
    expect(okProd.NODE_ENV).toBe('production');
    expect(okProd.COOKIE_SECURE).toBe(true);
    expect(okProd.COOKIE_SAME_SITE).toBe('lax');
    expect(buildAllowedOrigins(okProd)).toEqual(
      new Set(['https://sintaks.example.ac.id', 'https://portal.example.ac.id']),
    );

    expect(() => parseEnv(validProductionEnv({ COOKIE_SECURE: 'false' }))).toThrow(/COOKIE_SECURE/);
    expect(() => parseEnv(validProductionEnv({ WEB_ORIGIN: 'http://sintaks.example.ac.id' }))).toThrow(/WEB_ORIGIN/);
    expect(() =>
      parseEnv(validProductionEnv({ CORS_ALLOWED_ORIGINS: 'http://insecure.example.ac.id' })),
    ).toThrow(/CORS_ALLOWED_ORIGINS/);
    expect(() => parseEnv(validProductionEnv({ PASSWORD_RESET_DEV_PREVIEW: 'true' }))).toThrow(
      /PASSWORD_RESET_DEV_PREVIEW/,
    );
    expect(() => parseEnv(validProductionEnv({ SMTP_HOST: '' }))).toThrow(/SMTP_HOST/);
    expect(() => parseEnv(validProductionEnv({ SMTP_PASS: '' }))).toThrow(/SMTP_USER/);
    expect(() => parseEnv(validProductionEnv({ SMTP_FROM: 'invalid-from' }))).toThrow(/SMTP_FROM/);
    expect(() => parseEnv(validProductionEnv({ TRUST_PROXY: 'true' }))).toThrow(/TRUST_PROXY/);
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        COOKIE_SAME_SITE: 'none',
        COOKIE_SECURE: 'false',
      }),
    ).toThrow(/COOKIE_SECURE/);
  });

  it('enforces exact CORS allowlist, allows credentials only for trusted origins, and rejects untrusted cross-site origins', async () => {
    const runtimeEnv = makeTestEnv();
    const { server, base } = await startTestServer(runtimeEnv);
    try {
      const trustedPreflight = await fetch(`${base}/auth/login`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://app.sintaks.local',
          'Access-Control-Request-Method': 'POST',
        },
      });
      expect(trustedPreflight.status).toBe(204);
      expect(trustedPreflight.headers.get('access-control-allow-origin')).toBe('https://app.sintaks.local');
      expect(trustedPreflight.headers.get('access-control-allow-credentials')).toBe('true');

      const extraOriginPreflight = await fetch(`${base}/auth/login`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://portal.sintaks.local',
          'Access-Control-Request-Method': 'POST',
        },
      });
      expect(extraOriginPreflight.status).toBe(204);
      expect(extraOriginPreflight.headers.get('access-control-allow-origin')).toBe('https://portal.sintaks.local');
      expect(extraOriginPreflight.headers.get('access-control-allow-credentials')).toBe('true');

      const untrustedGet = await fetch(`${base}/auth/me`, {
        headers: { Origin: 'https://evil.attacker.invalid' },
      });
      expect(untrustedGet.status).toBe(403);
      expect(untrustedGet.headers.get('access-control-allow-origin')).toBeNull();
      expect(untrustedGet.headers.get('access-control-allow-credentials')).toBeNull();
      expect((await untrustedGet.json()).error.code).toBe('CORS_ORIGIN_DENIED');

      const noOriginHealth = await fetch(`${base}/health`);
      expect(noOriginHealth.status).toBe(200);
      expect(noOriginHealth.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      await stopTestServer(server);
    }
  }, 15000);

  (enabled ? it : it.skip)(
    'applies Secure/HttpOnly/SameSite/host-only cookie flags and ignores spoofed X-Forwarded-Proto when TRUST_PROXY=false',
    async () => {
      const unique = randomUUID();
      const userId = randomUUID();
      const email = `cookie-sec-${unique}@example.invalid`;
      const password = `Cookie-Sec-${unique}-42!`;
      const passwordHash = await argon2Hash(password, passwordOptions);

      await db.insert(users).values({
        id: userId,
        email,
        fullName: 'Cookie Security Test',
        role: 'MAHASISWA',
        status: 'ACTIVE',
        passwordHash,
      });

      expect(buildCookieOptions(false, { COOKIE_SECURE: true, COOKIE_SAME_SITE: 'lax' })).toEqual({
        secure: true,
        sameSite: 'lax',
        path: '/',
      });

      const untrustedProxyServer = await startTestServer(
        makeTestEnv({ TRUST_PROXY: 'false', COOKIE_SECURE: 'false', COOKIE_SAME_SITE: 'lax' }),
      );
      const trustedProxyServer = await startTestServer(
        makeTestEnv({ TRUST_PROXY: 'loopback', COOKIE_SECURE: 'false', COOKIE_SAME_SITE: 'lax' }),
      );
      const forcedSecureServer = await startTestServer(
        makeTestEnv({ TRUST_PROXY: 'false', COOKIE_SECURE: 'true', COOKIE_SAME_SITE: 'lax' }),
      );

      try {
        // Spoofed X-Forwarded-Proto: https must NOT set Secure when TRUST_PROXY=false.
        const spoofedLogin = await fetch(`${untrustedProxyServer.base}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-Proto': 'https',
          },
          body: JSON.stringify({ email, password }),
        });
        expect(spoofedLogin.status).toBe(200);
        const spoofedCookies = spoofedLogin.headers.getSetCookie();
        const spoofedSession = spoofedCookies.find((c) => c.startsWith('lms_session='))!;
        expect(spoofedSession).toContain('HttpOnly');
        expect(spoofedSession).toContain('SameSite=Lax');
        expect(spoofedSession).not.toContain('Secure');
        expect(spoofedSession).not.toContain('Domain=');

        // Trusted loopback proxy X-Forwarded-Proto: https MUST set Secure.
        const proxiedLogin = await fetch(`${trustedProxyServer.base}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-Proto': 'https',
          },
          body: JSON.stringify({ email, password }),
        });
        expect(proxiedLogin.status).toBe(200);
        const proxiedSession = proxiedLogin.headers
          .getSetCookie()
          .find((c) => c.startsWith('lms_session='))!;
        expect(proxiedSession).toContain('HttpOnly');
        expect(proxiedSession).toContain('SameSite=Lax');
        expect(proxiedSession).toContain('Secure');
        expect(proxiedSession).not.toContain('Domain=');

        // COOKIE_SECURE=true always forces Secure attribute.
        const forcedLogin = await fetch(`${forcedSecureServer.base}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        expect(forcedLogin.status).toBe(200);
        const forcedSession = forcedLogin.headers
          .getSetCookie()
          .find((c) => c.startsWith('lms_session='))!;
        expect(forcedSession).toContain('Secure');
      } finally {
        await stopTestServer(untrustedProxyServer.server);
        await stopTestServer(trustedProxyServer.server);
        await stopTestServer(forcedSecureServer.server);
        await db.delete(auditEvents).where(inArray(auditEvents.actorId, [userId]));
        await db.delete(users).where(inArray(users.id, [userId]));
      }
    },
    25000,
  );
});

describe('Admin paginated user directory, search, filtering, and RBAC', () => {
  (enabled ? it : it.skip)(
    'supports server-side pagination, escaped ILIKE search by name/email, role/status filters, empty states, and enforces Admin RBAC',
    async () => {
      const unique = randomUUID().slice(0, 8);
      const adminId = randomUUID();
      const dosenActiveId = randomUUID();
      const studentActiveAId = randomUUID();
      const studentActiveBId = randomUUID();
      const studentPendingId = randomUUID();
      const studentPercentId = randomUUID();
      const allIds = [
        adminId,
        dosenActiveId,
        studentActiveAId,
        studentActiveBId,
        studentPendingId,
        studentPercentId,
      ];

      const adminEmail = `adm-page-${unique}@example.invalid`;
      const dosenEmail = `dsn-page-${unique}@example.invalid`;
      const studentAEmail = `mhs-alpha-${unique}@example.invalid`;
      const studentBEmail = `mhs-beta-${unique}@example.invalid`;
      const studentPendingEmail = `mhs-pend-${unique}@example.invalid`;
      const studentPercentEmail = `mhs-100pct-${unique}@example.invalid`;
      const pass = `Admin-Dir-${unique}-42!`;
      const passHash = await argon2Hash(pass, passwordOptions);

      const baseTime = Date.now();
      await db.insert(users).values([
        {
          id: adminId,
          email: adminEmail,
          fullName: `Admin Paginator ${unique}`,
          role: 'ADMIN',
          status: 'ACTIVE',
          passwordHash: passHash,
          createdAt: new Date(baseTime + 1000),
        },
        {
          id: dosenActiveId,
          email: dosenEmail,
          fullName: `Dr. Siti Dosen ${unique}`,
          role: 'DOSEN',
          status: 'ACTIVE',
          passwordHash: passHash,
          createdAt: new Date(baseTime + 2000),
        },
        {
          id: studentActiveAId,
          email: studentAEmail,
          fullName: `Andi Alpha ${unique}`,
          role: 'MAHASISWA',
          status: 'ACTIVE',
          passwordHash: passHash,
          createdAt: new Date(baseTime + 3000),
        },
        {
          id: studentActiveBId,
          email: studentBEmail,
          fullName: `Budi Beta ${unique}`,
          role: 'MAHASISWA',
          status: 'ACTIVE',
          passwordHash: passHash,
          createdAt: new Date(baseTime + 4000),
        },
        {
          id: studentPendingId,
          email: studentPendingEmail,
          fullName: `Citra Pending ${unique}`,
          role: 'MAHASISWA',
          status: 'PENDING',
          passwordHash: passHash,
          createdAt: new Date(baseTime + 5000),
        },
        {
          id: studentPercentId,
          email: studentPercentEmail,
          fullName: `Dina 100% Scorer ${unique}`,
          role: 'MAHASISWA',
          status: 'ACTIVE',
          passwordHash: passHash,
          createdAt: new Date(baseTime + 6000),
        },
      ]);

      const { server, base } = await startTestServer(makeTestEnv());
      try {
        expect((await fetch(`${base}/auth/admin/users`)).status).toBe(401);

        const dosenLogin = await fetch(`${base}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: dosenEmail, password: pass }),
        });
        const dosenCookie = dosenLogin.headers
          .getSetCookie()
          .find((c) => c.startsWith('lms_session='))!
          .split(';')[0]!;
        expect((await fetch(`${base}/auth/admin/users`, { headers: { Cookie: dosenCookie } })).status).toBe(403);

        const studentLogin = await fetch(`${base}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: studentAEmail, password: pass }),
        });
        const studentCookie = studentLogin.headers
          .getSetCookie()
          .find((c) => c.startsWith('lms_session='))!
          .split(';')[0]!;
        expect((await fetch(`${base}/auth/admin/users`, { headers: { Cookie: studentCookie } })).status).toBe(403);

        const adminLogin = await fetch(`${base}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: adminEmail, password: pass }),
        });
        const adminCookie = adminLogin.headers
          .getSetCookie()
          .find((c) => c.startsWith('lms_session='))!
          .split(';')[0]!;

        // Paginated search scoped to this test run via unique tag.
        const page1Res = await fetch(
          `${base}/auth/admin/users?page=1&limit=2&status=ACTIVE&search=${encodeURIComponent(unique)}`,
          { headers: { Cookie: adminCookie } },
        );
        expect(page1Res.status).toBe(200);
        const page1 = (await page1Res.json()) as {
          users: Array<{ id: string; email: string; fullName: string; role: string; status: string }>;
          pagination: { page: number; limit: number; total: number; totalPages: number };
          totalAccounts: number;
        };
        expect(page1.users).toHaveLength(2);
        expect(page1.pagination).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
        expect(page1.totalAccounts).toBeGreaterThanOrEqual(6);

        const page3Res = await fetch(
          `${base}/auth/admin/users?page=3&limit=2&status=ACTIVE&search=${encodeURIComponent(unique)}`,
          { headers: { Cookie: adminCookie } },
        );
        expect(page3Res.status).toBe(200);
        const page3 = await page3Res.json();
        expect(page3.users).toHaveLength(1);
        expect(page3.pagination.page).toBe(3);

        // Search by email substring + role filter.
        const dosenSearchRes = await fetch(
          `${base}/auth/admin/users?page=1&limit=10&status=ACTIVE&role=DOSEN&search=${encodeURIComponent(`dsn-page-${unique}`)}`,
          { headers: { Cookie: adminCookie } },
        );
        expect(dosenSearchRes.status).toBe(200);
        const dosenSearch = await dosenSearchRes.json();
        expect(dosenSearch.users).toHaveLength(1);
        expect(dosenSearch.users[0].id).toBe(dosenActiveId);

        // Status filter PENDING.
        const pendingRes = await fetch(
          `${base}/auth/admin/users?page=1&limit=10&status=PENDING&search=${encodeURIComponent(unique)}`,
          { headers: { Cookie: adminCookie } },
        );
        expect(pendingRes.status).toBe(200);
        const pendingBody = await pendingRes.json();
        expect(pendingBody.users).toHaveLength(1);
        expect(pendingBody.users[0].id).toBe(studentPendingId);

        // Escaped ILIKE wildcard `%` must match only the literal "100%" user, not all users.
        const wildcardRes = await fetch(
          `${base}/auth/admin/users?page=1&limit=20&status=ALL&search=${encodeURIComponent(`100% Scorer ${unique}`)}`,
          { headers: { Cookie: adminCookie } },
        );
        expect(wildcardRes.status).toBe(200);
        const wildcardBody = await wildcardRes.json();
        expect(wildcardBody.users).toHaveLength(1);
        expect(wildcardBody.users[0].id).toBe(studentPercentId);

        // Empty search result.
        const emptyRes = await fetch(
          `${base}/auth/admin/users?page=1&limit=20&status=ALL&search=${encodeURIComponent(`definitely-no-match-${unique}`)}`,
          { headers: { Cookie: adminCookie } },
        );
        expect(emptyRes.status).toBe(200);
        const emptyBody = await emptyRes.json();
        expect(emptyBody.users).toEqual([]);
        expect(emptyBody.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
      } finally {
        await stopTestServer(server);
        await db.delete(auditEvents).where(inArray(auditEvents.actorId, allIds));
        await db.delete(users).where(inArray(users.id, allIds));
      }
    },
    30000,
  );
});
