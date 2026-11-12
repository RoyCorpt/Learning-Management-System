import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { parseStudentRosterCsv } from './roster.js';

describe('Sprint 1 authentication foundation', () => {
  let dbIntegrationStartedAt: Date | undefined;
  beforeAll(() => { if (process.env.RUN_DB_INTEGRATION === '1') dbIntegrationStartedAt = new Date(); });
  afterAll(async () => {
    if (!dbIntegrationStartedAt) return;
    const { prisma } = await import('./lib/prisma.js');
    await prisma.auditEvent.deleteMany({ where: { action: 'AUTH_LOGIN_FAILED', actorId: null, createdAt: { gte: dbIntegrationStartedAt } } });
  });
  (process.env.RUN_DB_INTEGRATION === '1' ? it : it.skip)('bootstraps exactly one initial Admin without printing credentials', async (context) => {
    const { prisma } = await import('./lib/prisma.js');
    const existingAdmins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
    if (existingAdmins.length) context.skip('An Admin already exists; preserve the configured database and skip one-time bootstrap rehearsal.');
    const id = randomUUID(); const email = `bootstrap-${id}@example.invalid`; const password = `Bootstrap-Test-${id}-42!`;
    const run = promisify(execFile);
    const repoRoot = resolve(process.cwd(), '../..');
    const script = resolve(repoRoot, 'apps/api/src/bootstrap-admin.ts');
    const tsx = resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs');
    const childEnv = { ...process.env, BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_NAME: 'Temporary Bootstrap Test', BOOTSTRAP_ADMIN_PASSWORD: password };
    if (process.platform === 'win32') {
      // tsx calls os.userInfo() to select its cache directory on Windows. In this
      // environment libuv can fail that lookup with ENOMEM; tsx only needs a name.
      const tsxOsPreload = resolve(repoRoot, 'apps/api/src/test-support/windows-tsx-userinfo.cjs').replaceAll('\\', '/');
      const preloadOption = `--require=\"${tsxOsPreload}\"`;
      childEnv.NODE_OPTIONS = [childEnv.NODE_OPTIONS, preloadOption].filter(Boolean).join(' ');
    }
    try {
      const first = await run(process.execPath, [tsx, script], { cwd: repoRoot, env: childEnv, encoding: 'utf8' });
      expect(first.stdout).toContain('admin_bootstrap_succeeded');
      expect(first.stdout).not.toContain(password);
      const bootstrapped = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true, role: true, status: true, passwordHash: true } });
      expect(bootstrapped.role).toBe('ADMIN');
      expect(bootstrapped.status).toBe('ACTIVE');
      expect(bootstrapped.passwordHash).not.toBe(password);
      await expect(run(process.execPath, [tsx, script], { cwd: repoRoot, env: childEnv, encoding: 'utf8' })).rejects.toMatchObject({ code: 1, stdout: expect.not.stringContaining(password) });
      expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1);
    } finally {
      const created = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (created) {
        await prisma.auditEvent.deleteMany({ where: { subjectId: created.id } });
        await prisma.user.delete({ where: { id: created.id } });
      }
    }
  }, 30000);

  it('hashes passwords with Argon2id and verifies without storing plaintext', async () => {
    const password = 'Example-Long-Password-42!';
    const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
    expect(hash).not.toBe(password);
    expect(hash).toContain('$argon2id$');
    await expect(argon2.verify(hash, password)).resolves.toBe(true);
    await expect(argon2.verify(hash, `${password}wrong`)).resolves.toBe(false);
  });

  it('protects the profile endpoint without a valid session', async () => {
    const { createApp } = await import('./app.js');
    const server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port');
    try {
      const live = await fetch(`http://127.0.0.1:${address.port}/health`);
      expect(live.status).toBe(200);
      const ready = await fetch(`http://127.0.0.1:${address.port}/ready`);
      expect(ready.status).toBe(200);
      expect((await ready.json()).checks.database).toBe('ok');
      const response = await fetch(`http://127.0.0.1:${address.port}/auth/me`);
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe('UNAUTHENTICATED');
    } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  });

  (process.env.RUN_DB_INTEGRATION === '1' ? it : it.skip)('revokes sessions, checks account status on each request, enforces RBAC and rate limits', async () => {
    const { createApp } = await import('./app.js');
    const { prisma } = await import('./lib/prisma.js');
    const id = randomUUID(); const email = `sprint1-${id}@example.invalid`; const password = 'Integration-Password-42!';
    const user = await prisma.user.create({ data: { email, fullName: 'Sprint One Test', role: 'MAHASISWA', status: 'ACTIVE', passwordHash: await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }) } });
    const server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port');
    const base = `http://127.0.0.1:${address.port}`;
    try {
      const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      expect(login.status).toBe(200);
      const setCookies = login.headers.getSetCookie();
      expect(setCookies.find((v) => v.startsWith('lms_session='))).toContain('HttpOnly');
      expect(setCookies.every((v) => v.includes('SameSite=Strict'))).toBe(true);
      expect(setCookies.find((v) => v.startsWith('lms_csrf='))).not.toContain('HttpOnly');
      const cookies = setCookies.map((v) => v.split(';')[0]!);
      const cookieHeader = cookies.join('; '); const csrf = cookies.find((v) => v.startsWith('lms_csrf='))!.slice('lms_csrf='.length);
      expect((await fetch(`${base}/auth/me`, { headers: { Cookie: cookieHeader } })).status).toBe(200);
      expect((await fetch(`${base}/auth/admin/users`, { headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrf, 'X-Role': 'ADMIN' } })).status).toBe(403);
      expect((await fetch(`${base}/auth/admin/roster/import`, { method: 'POST', headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrf, 'X-Role': 'ADMIN', 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: 'bad' }) })).status).toBe(403);
      expect((await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Cookie: cookieHeader } })).status).toBe(403);
      expect((await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Cookie: cookieHeader, 'X-CSRF-Token': 'invalid-token' } })).status).toBe(403);
      expect((await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrf } })).status).toBe(204);
      expect((await fetch(`${base}/auth/me`, { headers: { Cookie: cookieHeader } })).status).toBe(401);
      const secondLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const secondCookies = secondLogin.headers.getSetCookie().map((v) => v.split(';')[0]!);
      const expiredSessionCookie = secondCookies.find((v) => v.startsWith('lms_session='));
      const expiredToken = expiredSessionCookie!.slice('lms_session='.length);
      const { createHash } = await import('node:crypto');
      await prisma.session.update({ where: { tokenHash: createHash('sha256').update(expiredToken).digest('hex') }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await fetch(`${base}/auth/me`, { headers: { Cookie: expiredSessionCookie! } })).status).toBe(401);
      const thirdLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const oldSessionCookie = thirdLogin.headers.getSetCookie().find((v) => v.startsWith('lms_session='))!.split(';')[0]!;
      await prisma.user.update({ where: { id: user.id }, data: { status: 'INACTIVE' } });
      expect((await fetch(`${base}/auth/me`, { headers: { Cookie: oldSessionCookie } })).status).toBe(401);
      const inactiveLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const unknownLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `unknown-${id}@example.invalid`, password }) });
      expect(inactiveLogin.status).toBe(401); expect(unknownLogin.status).toBe(401);
      expect(await inactiveLogin.json()).toEqual(await unknownLogin.json());
      for (let i = 0; i < 9; i++) await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'wrong-password' }) });
      const limited = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'wrong-password' }) });
      expect(limited.status).toBe(429);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await prisma.auditEvent.deleteMany({ where: { actorId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.$disconnect();
    }
  }, 30000);

  (process.env.RUN_DB_INTEGRATION === '1' ? it : it.skip)('rolls back logout session revocation when audit insertion fails', async () => {
    const { createApp } = await import('./app.js');
    const { prisma } = await import('./lib/prisma.js');
    const id = randomUUID(); const email = `logout-rollback-${id}@example.invalid`; const password = 'Logout-Rollback-Password-42!';
    const trigger = `logout_${id.replaceAll('-', '')}_trigger`; const fn = `logout_${id.replaceAll('-', '')}_fn`;
    const user = await prisma.user.create({ data: { email, fullName: 'Logout Rollback Test', role: 'MAHASISWA', status: 'ACTIVE', passwordHash: await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }) } });
    let server: Server | undefined;
    try {
      server = createApp().listen(0);
      await new Promise<void>((resolve) => server!.once('listening', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port');
      const base = `http://127.0.0.1:${address.port}`;
      const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      expect(login.status).toBe(200);
      const cookies = login.headers.getSetCookie().map((value) => value.split(';')[0]!);
      const sessionCookie = cookies.find((value) => value.startsWith('lms_session='))!;
      const csrf = cookies.find((value) => value.startsWith('lms_csrf='))!.slice('lms_csrf='.length);
      await prisma.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor_id = '${user.id}'::uuid AND NEW.action = 'AUTH_LOGOUT' THEN RAISE EXCEPTION 'logout audit failure'; END IF; RETURN NEW; END; $$`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "audit_events" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`);

      const logout = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Cookie: cookies.join('; '), 'X-CSRF-Token': csrf } });
      expect(logout.status).toBe(500);
      const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(session.revokedAt).toBeNull();
      expect(await prisma.auditEvent.count({ where: { action: 'AUTH_LOGOUT', actorId: user.id } })).toBe(0);
      expect((await fetch(`${base}/auth/me`, { headers: { Cookie: sessionCookie } })).status).toBe(200);
    } finally {
      if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "audit_events"`).catch(() => undefined);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`).catch(() => undefined);
      await prisma.auditEvent.deleteMany({ where: { actorId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }, 30000);

  (process.env.RUN_DB_INTEGRATION === '1' ? it : it.skip)('provisions a Dosen once, enforces password change, and audits atomically', async () => {
    const { createApp } = await import('./app.js');
    const { prisma } = await import('./lib/prisma.js');
    const id = randomUUID(); const email = `admin-provision-${id}@example.invalid`; const instructorEmail = `dosen-${id}@example.invalid`; const password = 'Temporary-Admin-Password-42!';
    const admin = await prisma.user.create({ data: { email, fullName: 'Temporary Provisioning Admin', role: 'ADMIN', status: 'ACTIVE', passwordHash: await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }) } });
    const targetAdminEmail = `admin-target-${id}@example.invalid`; const targetAdminPassword = 'Target-Admin-Password-42!';
    const targetAdmin = await prisma.user.create({ data: { email: targetAdminEmail, fullName: 'Temporary Target Admin', role: 'ADMIN', status: 'ACTIVE', passwordHash: await argon2.hash(targetAdminPassword, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }) } });
    let server: Server | undefined; let instructorId: string | undefined;
    try {
      server = createApp().listen(0);
      await new Promise<void>((resolve) => server!.once('listening', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port');
      const base = `http://127.0.0.1:${address.port}`;
      const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      expect(login.status).toBe(200);
      const cookies = login.headers.getSetCookie().map((v) => v.split(';')[0]!);
      const cookieHeader = cookies.join('; '); const csrf = cookies.find((v) => v.startsWith('lms_csrf='))!.slice('lms_csrf='.length);
      const adminUsers = await fetch(`${base}/auth/admin/users`, { headers: { Cookie: cookieHeader } });
      expect(adminUsers.status).toBe(200);
      const targetLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: targetAdminEmail, password: targetAdminPassword }) });
      expect(targetLogin.status).toBe(200);
      const targetSession = targetLogin.headers.getSetCookie().find((v) => v.startsWith('lms_session='))!.split(';')[0]!;
      const provisioned = await fetch(`${base}/auth/admin/instructors`, { method: 'POST', headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: instructorEmail, fullName: 'Temporary Test Instructor' }) });
      expect(provisioned.status).toBe(201);
      const body = await provisioned.json() as { user: { id: string; role: string; status: string }; temporaryPassword: string; mustChangePassword: boolean };
      instructorId = body.user.id;
      expect(body.user.role).toBe('DOSEN'); expect(body.user.status).toBe('ACTIVE'); expect(body.mustChangePassword).toBe(true);
      expect(body.temporaryPassword).toHaveLength(32);
      const auditEvent = await prisma.auditEvent.findFirst({ where: { action: 'ADMIN_INSTRUCTOR_CREATED', actorId: admin.id, subjectId: instructorId } });
      expect(auditEvent).not.toBeNull();
      const instructorLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: instructorEmail, password: body.temporaryPassword }) });
      expect(instructorLogin.status).toBe(200);
      expect((await instructorLogin.json()).user.mustChangePassword).toBe(true);
      const instructorCookies = instructorLogin.headers.getSetCookie().map((v) => v.split(';')[0]!);
      const instructorCsrf = instructorCookies.find((v) => v.startsWith('lms_csrf='))!.slice('lms_csrf='.length);
      expect((await fetch(`${base}/auth/admin/users`, { headers: { Cookie: instructorCookies.join('; '), 'X-CSRF-Token': instructorCsrf } })).status).toBe(403);
      const changed = await fetch(`${base}/auth/change-password`, { method: 'POST', headers: { Cookie: instructorCookies.join('; '), 'X-CSRF-Token': instructorCsrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: body.temporaryPassword, newPassword: 'Permanent-Dosen-Password-52!' }) });
      expect(changed.status).toBe(204);
      const oldInstructorSession = instructorCookies.find((v) => v.startsWith('lms_session='))!;
      expect((await fetch(`${base}/auth/me`, { headers: { Cookie: oldInstructorSession } })).status).toBe(401);
      const duplicate = await fetch(`${base}/auth/admin/instructors`, { method: 'POST', headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: instructorEmail.toUpperCase(), fullName: 'Duplicate Instructor' }) });
      expect(duplicate.status).toBe(409);
      expect(await prisma.user.count({ where: { email: instructorEmail } })).toBe(1);
      const changedRoleLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: instructorEmail, password: 'Permanent-Dosen-Password-52!' }) });
      const changedRoleSession = changedRoleLogin.headers.getSetCookie().find((v) => v.startsWith('lms_session='))!.split(';')[0]!;
      const roleChange = await fetch(`${base}/auth/admin/users/${instructorId}/role`, { method: 'PATCH', headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'MAHASISWA' }) });
      expect(roleChange.status).toBe(200);
      expect((await fetch(`${base}/auth/me`, { headers: { Cookie: changedRoleSession } })).status).toBe(401);
      expect(await prisma.auditEvent.count({ where: { action: 'ADMIN_ACCOUNT_ROLE_CHANGED', actorId: admin.id, subjectId: instructorId } })).toBe(1);
      const deactivateTarget = await fetch(`${base}/auth/admin/users/${targetAdmin.id}/status`, { method: 'PATCH', headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'INACTIVE' }) });
      expect(deactivateTarget.status).toBe(200);
      expect((await fetch(`${base}/auth/me`, { headers: { Cookie: targetSession } })).status).toBe(401);
      const lastAdminGuard = await fetch(`${base}/auth/admin/users/${targetAdmin.id}/status`, { method: 'PATCH', headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'INACTIVE' }) });
      expect(lastAdminGuard.status).toBe(409);
      expect((await lastAdminGuard.json()).error.code).toBe('LAST_ACTIVE_ADMIN');
    } finally {
      if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
      await prisma.auditEvent.deleteMany({ where: { OR: [{ actorId: admin.id }, { actorId: targetAdmin.id }, ...(instructorId ? [{ actorId: instructorId }, { subjectId: instructorId }] : []), { subjectId: targetAdmin.id }] } });
      await prisma.user.deleteMany({ where: { OR: [{ id: admin.id }, { id: targetAdmin.id }, { email: instructorEmail }] } });
    }
  }, 30000);

  it.skipIf(process.env.RUN_OFFICIAL_ROSTER_INTEGRATION !== '1' || !process.env.OFFICIAL_ROSTER_CSV_PATH)('imports the supplied roster, registers an eligible student once, and keeps the account pending', async (context) => {
    const { createApp } = await import('./app.js');
    const { prisma } = await import('./lib/prisma.js');
    const csvSource = await readFile(process.env.OFFICIAL_ROSTER_CSV_PATH!, 'utf8');
    const entries = parseStudentRosterCsv(csvSource, ['unimed.ac.id', 'mhs.unimed.ac.id']);
    const rosterMatches = await prisma.studentRoster.findMany({ where: { OR: entries.flatMap(({ nim, email }) => [{ nim }, { email: { equals: email, mode: 'insensitive' as const } }]) }, select: { id: true } });
    const userMatches = await prisma.user.findMany({ where: { OR: entries.map(({ email }) => ({ email })) }, select: { id: true } });
    if (rosterMatches.length || userMatches.length) context.skip('Official roster identities already exist in the local database; skipped to preserve existing records.');

    const id = randomUUID(); const adminEmail = `roster-test-${id}@example.invalid`; const password = 'Roster-Admin-Integration-42!';
    const rollbackNimA = `ra-${id.slice(0, 20)}`; const rollbackNimB = `rb-${id.slice(0, 20)}`;
    const rollbackEmailA = `rollback-a-${id}@mhs.unimed.ac.id`; const rollbackEmailB = `rollback-b-${id}@mhs.unimed.ac.id`;
    const freshNim = `rn-${id.slice(0, 20)}`; const freshEmail = `rollback-new-${id}@mhs.unimed.ac.id`;
    await prisma.studentRoster.createMany({ data: [
      { nim: rollbackNimA, email: rollbackEmailA, fullName: 'Temporary Conflict A', registrationEligible: true },
      { nim: rollbackNimB, email: rollbackEmailB, fullName: 'Temporary Conflict B', registrationEligible: true },
    ] });
    const admin = await prisma.user.create({ data: { email: adminEmail, fullName: 'Temporary Roster Test Admin', role: 'ADMIN', status: 'ACTIVE', passwordHash: await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }) } });
    let server: Server | undefined;
    try {
      server = createApp().listen(0);
      await new Promise<void>((resolve) => server!.once('listening', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port');
      const base = `http://127.0.0.1:${address.port}`;
      const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: adminEmail, password }) });
      expect(login.status).toBe(200);
      const cookies = login.headers.getSetCookie().map((v) => v.split(';')[0]!);
      const cookieHeader = cookies.join('; '); const csrf = cookies.find((v) => v.startsWith('lms_csrf='))!.slice('lms_csrf='.length);
      const partialConflict = `;;;;nim;nama;email;status\n;;;;${freshNim};Temporary New;${freshEmail};layak\n;;;;${rollbackNimB};Temporary Conflict;${rollbackEmailA};layak`;
      const partialResponse = await fetch(`${base}/auth/admin/roster/import`, { method: 'POST', headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: partialConflict }) });
      expect(partialResponse.status).toBe(409);
      expect((await partialResponse.json()).error.code).toBe('ROSTER_CONFLICT');
      expect(await prisma.studentRoster.findUnique({ where: { nim: freshNim } })).toBeNull();
      expect((await prisma.studentRoster.findUniqueOrThrow({ where: { nim: rollbackNimB } })).email).toBe(rollbackEmailB);
      expect(await prisma.auditEvent.count({ where: { action: 'ADMIN_ROSTER_IMPORTED', actorId: admin.id } })).toBe(0);
      const imported = await fetch(`${base}/auth/admin/roster/import`, { method: 'POST', headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: csvSource }) });
      expect(imported.status).toBe(200);
      expect((await imported.json()).summary).toEqual({ rows: entries.length, created: entries.length, updated: 0 });
      expect(await prisma.auditEvent.count({ where: { action: 'ADMIN_ROSTER_IMPORTED', actorId: admin.id } })).toBe(1);
      const unknownStatusCsv = ';;;;nim;nama;email;status\n;;;;0000000001;Fixture;fixture@mhs.unimed.ac.id;unknown';
      const invalidImport = await fetch(`${base}/auth/admin/roster/import`, { method: 'POST', headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: unknownStatusCsv }) });
      expect(invalidImport.status).toBe(400);

      const selected = entries[0]!;
      const wrongNim = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: selected.email, nim: `${selected.nim}-wrong`, password: 'Student-Registration-42!' }) });
      expect(wrongNim.status).toBe(400);
      const wrongDomain = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: selected.email.replace(/@.*/, '@other.invalid'), nim: selected.nim, password: 'Student-Registration-42!' }) });
      expect(wrongDomain.status).toBe(400);
      const registration = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: selected.email.toUpperCase(), nim: selected.nim, password: 'Student-Registration-42!' }) });
      expect(registration.status).toBe(202);
      expect((await registration.json()).status).toBe('PENDING');
      const student = await prisma.user.findUniqueOrThrow({ where: { email: selected.email }, select: { id: true, status: true, role: true } });
      expect(student.status).toBe('PENDING');
      expect(student.role).toBe('MAHASISWA');
      let rosterEntry = await prisma.studentRoster.findUniqueOrThrow({ where: { nim: selected.nim }, select: { registrationEligible: true, registeredAt: true, registeredUserId: true } });
      expect(rosterEntry.registrationEligible).toBe(true);
      expect(rosterEntry.registeredAt).not.toBeNull();
      expect(rosterEntry.registeredUserId).toBe(student.id);

      const reimport = await fetch(`${base}/auth/admin/roster/import`, { method: 'POST', headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: csvSource }) });
      expect(reimport.status).toBe(200);
      expect((await reimport.json()).summary).toEqual({ rows: entries.length, created: 0, updated: entries.length });
      const repeated = await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: selected.email, nim: selected.nim, password: 'Student-Registration-43!' }) });
      expect(repeated.status).toBe(400);
      rosterEntry = await prisma.studentRoster.findUniqueOrThrow({ where: { nim: selected.nim }, select: { registrationEligible: true, registeredAt: true, registeredUserId: true } });
      expect(rosterEntry.registrationEligible).toBe(true);
      expect(rosterEntry.registeredUserId).toBe(student.id);
    } finally {
      if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
      const studentUsers = await prisma.user.findMany({ where: { email: { in: entries.map(({ email }) => email) } }, select: { id: true } });
      await prisma.auditEvent.deleteMany({ where: { OR: [{ actorId: admin.id }, { subjectId: { in: studentUsers.map(({ id: studentUserId }) => studentUserId) } }] } });
      await prisma.studentRoster.deleteMany({ where: { nim: { in: entries.map(({ nim }) => nim) } } });
      await prisma.studentRoster.deleteMany({ where: { nim: { in: [rollbackNimA, rollbackNimB, freshNim] } } });
      await prisma.user.deleteMany({ where: { OR: [{ id: admin.id }, { email: { in: entries.map(({ email }) => email) } }] } });
      expect(await prisma.studentRoster.count({ where: { nim: { in: entries.map(({ nim }) => nim) } } })).toBe(0);
      expect(await prisma.user.count({ where: { OR: [{ id: admin.id }, { email: { in: entries.map(({ email }) => email) } }] } })).toBe(0);
    }
  }, 30000);

  (process.env.RUN_DB_INTEGRATION === '1' ? it : it.skip)('enforces the aggregate login limit per IP across distinct identifiers', async () => {
    const { createApp } = await import('./app.js');
    const server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port');
    try {
      const base = `http://127.0.0.1:${address.port}`;
      let limited = false;
      for (let i = 0; i < 60 && !limited; i += 1) {
        const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `ip-bucket-${i}-${randomUUID()}@example.invalid`, password: 'Unknown-Password-42!' }) });
        limited = response.status === 429;
      }
      expect(limited).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }, 30000);
});
