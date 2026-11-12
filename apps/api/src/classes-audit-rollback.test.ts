import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './lib/prisma.js';

const enabled = process.env.RUN_S2_AUDIT_ROLLBACK === '1' ? it : it.skip;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const actions = ['CLASS_CREATED', 'CLASS_INVITATION_ROTATED', 'CLASS_JOIN_SUCCEEDED', 'CLASS_CLOSED'] as const;

describe('Sprint 2 audit transaction rollback', () => {
  enabled('rolls back create, rotation, join, and close when their audit insert fails', async () => {
    const { createApp } = await import('./app.js');
    const id = randomUUID();
    const owner = await prisma.user.create({ data: { email: `s2-audit-owner-${id}@example.invalid`, fullName: 'Audit Test Owner', role: 'DOSEN', status: 'ACTIVE', passwordHash: 'unused-test-hash' } });
    const student = await prisma.user.create({ data: { email: `s2-audit-student-${id}@example.invalid`, fullName: 'Audit Test Student', role: 'MAHASISWA', status: 'ACTIVE', passwordHash: 'unused-test-hash' } });
    const tokens = new Map<string, { cookie: string; csrf: string }>();
    for (const user of [owner, student]) {
      const sessionToken = randomBytes(32).toString('base64url'); const csrf = randomBytes(32).toString('base64url');
      await prisma.session.create({ data: { userId: user.id, tokenHash: digest(sessionToken), csrfHash: digest(csrf), expiresAt: new Date(Date.now() + 60_000) } });
      tokens.set(user.id, { cookie: `lms_session=${sessionToken}; lms_csrf=${csrf}`, csrf });
    }
    let server: Server | undefined;
    let classId: string | undefined;
    const dropFailure = async () => {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS s2_audit_failure ON audit_events');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS s2_audit_failure()');
    };
    const injectFailure = async (action: typeof actions[number]) => {
      await dropFailure();
      await prisma.$executeRawUnsafe(`CREATE FUNCTION s2_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = TG_ARGV[0] THEN RAISE EXCEPTION 'forced audit failure'; END IF; RETURN NEW; END $$`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER s2_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION s2_audit_failure('${action}')`);
    };
    const request = (userId: string, url: string, init: RequestInit = {}) => {
      const session = tokens.get(userId)!; const headers = new Headers(init.headers);
      headers.set('Cookie', session.cookie);
      if (init.method && init.method !== 'GET') headers.set('X-CSRF-Token', session.csrf);
      if (init.body) headers.set('Content-Type', 'application/json');
      return fetch(url, { ...init, headers });
    };

    try {
      server = createApp().listen(0); await new Promise<void>((resolve) => server!.once('listening', resolve));
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('Test server did not bind');
      const base = `http://127.0.0.1:${address.port}/api/classes`;
      const failedCreateName = `Audit rollback ${id}`;
      await injectFailure('CLASS_CREATED');
      const failedCreate = await request(owner.id, base, { method: 'POST', body: JSON.stringify({ name: failedCreateName }) });
      expect(failedCreate.status).toBe(500);
      await dropFailure();
      expect(await prisma.class.count({ where: { ownerId: owner.id, name: failedCreateName } })).toBe(0);
      expect(await prisma.auditEvent.count({ where: { actorId: owner.id, action: 'CLASS_CREATED' } })).toBe(0);

      const created = await request(owner.id, base, { method: 'POST', body: JSON.stringify({ name: `Audit lifecycle ${id}` }) });
      expect(created.status).toBe(201); classId = (await created.json() as { class: { id: string } }).class.id;
      const firstCodeResponse = await request(owner.id, `${base}/${classId}/invitation-code`, { method: 'POST' });
      expect(firstCodeResponse.status).toBe(200); const firstCode = (await firstCodeResponse.json() as { invitationCode: string }).invitationCode;
      const beforeRotate = await prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { invitationCodeHash: true, invitationCodeVersion: true } });

      await injectFailure('CLASS_INVITATION_ROTATED');
      const failedRotation = await request(owner.id, `${base}/${classId}/invitation-code`, { method: 'POST' });
      expect(failedRotation.status).toBe(500);
      await dropFailure();
      expect(await prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { invitationCodeHash: true, invitationCodeVersion: true } })).toEqual(beforeRotate);
      expect(await prisma.auditEvent.count({ where: { subjectId: classId, action: 'CLASS_INVITATION_ROTATED' } })).toBe(0);

      await injectFailure('CLASS_JOIN_SUCCEEDED');
      const failedJoin = await request(student.id, `${base}/join`, { method: 'POST', body: JSON.stringify({ invitationCode: firstCode }) });
      expect(failedJoin.status).toBe(500);
      await dropFailure();
      expect(await prisma.membership.count({ where: { classId, userId: student.id } })).toBe(0);
      expect(await prisma.auditEvent.count({ where: { subjectId: classId, action: 'CLASS_JOIN_SUCCEEDED' } })).toBe(0);

      await injectFailure('CLASS_CLOSED');
      const failedClose = await request(owner.id, `${base}/${classId}/close`, { method: 'POST' });
      expect(failedClose.status).toBe(500);
      await dropFailure();
      expect((await prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { status: true } })).status).toBe('OPEN');
      expect(await prisma.auditEvent.count({ where: { subjectId: classId, action: 'CLASS_CLOSED' } })).toBe(0);
    } finally {
      await dropFailure();
      if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
      const classes = await prisma.class.findMany({ where: { ownerId: owner.id }, select: { id: true } });
      const classIds = classes.map(({ id: value }) => value);
      await prisma.membership.deleteMany({ where: { classId: { in: classIds } } });
      await prisma.auditEvent.deleteMany({ where: { OR: [{ actorId: { in: [owner.id, student.id] } }, { subjectId: { in: classIds } }] } });
      await prisma.class.deleteMany({ where: { id: { in: classIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: [owner.id, student.id] } } });
      await prisma.user.deleteMany({ where: { id: { in: [owner.id, student.id] } } });
    }
  }, 30000);
});

afterAll(async () => { await prisma.$disconnect(); });
