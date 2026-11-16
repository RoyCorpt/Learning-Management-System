import 'dotenv/config';
import { Algorithm, hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
const passwordOptions = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

type Fixture = {
  id: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  currentPasswordHash: string;
  server: Server;
  base: string;
  sessions: Array<{ cookie: string; csrf: string }>;
};

async function createFixture(): Promise<Fixture> {
  const unique = randomUUID();
  const id = randomUUID();
  const email = `f01-${unique}@example.invalid`;
  const currentPassword = `Current-${unique}-42!`;
  const newPassword = `New-${unique}-52!`;
  const currentPasswordHash = await argon2Hash(currentPassword, passwordOptions);
  let server: Server | undefined;
  try {
    await prisma.user.create({
      data: {
        id,
        email,
        fullName: 'F-01 Transaction Test',
        role: 'DOSEN',
        status: 'ACTIVE',
        mustChangePassword: true,
        passwordHash: currentPasswordHash,
      },
    });

    server = createApp().listen(0);
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('F-01 test server did not bind a TCP port');
    const base = `http://127.0.0.1:${address.port}`;
    const sessions: Fixture['sessions'] = [];
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: currentPassword }),
      });
      if (response.status !== 200) throw new Error(`F-01 fixture login failed with ${response.status}`);
      const cookies = response.headers.getSetCookie().map((value) => value.split(';')[0]!);
      const session = cookies.find((value) => value.startsWith('lms_session='));
      const csrf = cookies.find((value) => value.startsWith('lms_csrf='))?.slice('lms_csrf='.length);
      if (!session || !csrf) throw new Error('F-01 fixture cookies were not issued');
      sessions.push({ cookie: `${session}; lms_csrf=${csrf}`, csrf });
    }
    return { id, email, currentPassword, newPassword, currentPasswordHash, server, base, sessions };
  } catch (failure) {
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await prisma.auditEvent.deleteMany({ where: { actorId: id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id } }).catch(() => undefined);
    throw failure;
  }
}

async function closeFixture(fixture: Fixture | undefined) {
  if (!fixture) return;
  if (fixture.server.listening) {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => error ? reject(error) : resolve()));
  }
  await prisma.auditEvent.deleteMany({ where: { actorId: fixture.id } });
  await prisma.user.deleteMany({ where: { id: fixture.id } });
}

async function requestPasswordChange(fixture: Fixture, sessionIndex: number, currentPassword: string, newPassword: string) {
  const session = fixture.sessions[sessionIndex]!;
  return fetch(`${fixture.base}/auth/change-password`, {
    method: 'POST',
    headers: {
      Cookie: session.cookie,
      'X-CSRF-Token': session.csrf,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

describe('F-01 atomic password change', () => {
  it.skipIf(!enabled)('changes the password, revokes every old session, writes a secret-free audit event, and permits only the new password', async () => {
    let fixture: Fixture | undefined;
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      fixture = await createFixture();
      const sessionRowsBefore = await prisma.session.count({ where: { userId: fixture.id, revokedAt: null } });
      expect(sessionRowsBefore).toBe(2);

      const changed = await requestPasswordChange(fixture, 0, fixture.currentPassword, fixture.newPassword);
      expect(changed.status).toBe(204);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: fixture.id } });
      expect(user.mustChangePassword).toBe(false);
      expect(user.authVersion).toBe(1);
      expect(user.passwordHash).not.toBe(fixture.currentPasswordHash);
      await expect(argon2Verify(user.passwordHash, fixture.currentPassword)).resolves.toBe(false);
      await expect(argon2Verify(user.passwordHash, fixture.newPassword)).resolves.toBe(true);

      const sessions = await prisma.session.findMany({ where: { userId: fixture.id } });
      expect(sessions).toHaveLength(2);
      expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
      for (const session of fixture.sessions) {
        const oldSession = session.cookie.split(';')[0]!;
        const response = await fetch(`${fixture.base}/auth/me`, { headers: { Cookie: oldSession } });
        expect(response.status).toBe(401);
      }

      const oldPasswordLogin = await fetch(`${fixture.base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fixture.email, password: fixture.currentPassword }),
      });
      expect(oldPasswordLogin.status).toBe(401);
      const newPasswordLogin = await fetch(`${fixture.base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fixture.email, password: fixture.newPassword }),
      });
      expect(newPasswordLogin.status).toBe(200);

      const audit = await prisma.auditEvent.findMany({ where: { action: 'AUTH_PASSWORD_CHANGED', actorId: fixture.id } });
      expect(audit).toHaveLength(1);
      const auditText = JSON.stringify(audit[0]);
      expect(auditText).not.toContain(fixture.currentPassword);
      expect(auditText).not.toContain(fixture.newPassword);
      expect(auditText).not.toContain(fixture.currentPasswordHash);

      const logText = JSON.stringify([...info.mock.calls, ...error.mock.calls]);
      expect(logText).not.toContain(fixture.currentPassword);
      expect(logText).not.toContain(fixture.newPassword);
      expect(logText).not.toContain(fixture.currentPasswordHash);
    } finally {
      info.mockRestore();
      error.mockRestore();
      await closeFixture(fixture);
    }
  }, 30000);

  it.skipIf(!enabled).each([
    { stage: 'password storage', table: 'users', condition: (id: string) => `NEW.id = '${id}'::uuid` },
    { stage: 'session revocation', table: 'sessions', condition: (id: string) => `NEW.user_id = '${id}'::uuid` },
    { stage: 'audit insertion', table: 'audit_events', condition: (id: string) => `NEW.actor_id = '${id}'::uuid AND NEW.action = 'AUTH_PASSWORD_CHANGED'` },
  ])('rolls back password, sessions, and audit when $stage fails', async ({ stage, table, condition }) => {
    let fixture: Fixture | undefined;
    let triggerName: string | undefined;
    let functionName: string | undefined;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      fixture = await createFixture();
      const suffix = `f01_${randomUUID().replaceAll('-', '')}`;
      triggerName = `${suffix}_trigger`;
      functionName = `${suffix}_fn`;
      const predicate = condition(fixture.id);
      await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${predicate} THEN RAISE EXCEPTION 'f01 injected database failure'; END IF; RETURN NEW; END; $$`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE ${table === 'audit_events' ? 'INSERT' : 'UPDATE'} ON "${table}" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);

      const response = await requestPasswordChange(fixture, 0, fixture.currentPassword, fixture.newPassword);
      expect(response.status, `Injected failure at ${stage} must fail the request`).toBe(500);
      expect((await response.json()).error.code).toBe('INTERNAL_SERVER_ERROR');

      const user = await prisma.user.findUniqueOrThrow({ where: { id: fixture.id } });
      expect(user.passwordHash).toBe(fixture.currentPasswordHash);
      expect(user.mustChangePassword).toBe(true);
      expect(user.authVersion).toBe(0);
      const sessions = await prisma.session.findMany({ where: { userId: fixture.id } });
      expect(sessions).toHaveLength(2);
      expect(sessions.every((session) => session.revokedAt === null)).toBe(true);
      expect(await prisma.auditEvent.count({ where: { action: 'AUTH_PASSWORD_CHANGED', actorId: fixture.id } })).toBe(0);
      expect((await fetch(`${fixture.base}/auth/me`, { headers: { Cookie: fixture.sessions[0]!.cookie.split(';')[0]! } })).status).toBe(200);

      const logs = JSON.stringify(error.mock.calls);
      expect(logs).not.toContain(fixture.currentPassword);
      expect(logs).not.toContain(fixture.newPassword);
      expect(logs).not.toContain(fixture.currentPasswordHash);
    } finally {
      error.mockRestore();
      if (triggerName) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "${table}"`).catch(() => undefined);
      if (functionName) await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`).catch(() => undefined);
      await closeFixture(fixture);
    }
  }, 30000);
});
