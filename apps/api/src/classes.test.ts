import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './lib/prisma.js';

const enabled = process.env.RUN_DB_INTEGRATION === '1' ? it : it.skip;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

async function cleanInterruptedFixtures() {
  const prefixes = ['s2-owner-', 's2-student-', 's2-other-', 's2-admin-', 's2-pending-', 's2-inactive-', 's2-outsider-'];
  const users = await prisma.user.findMany({ where: { OR: prefixes.map((prefix) => ({ email: { startsWith: prefix } })) }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  if (!userIds.length) return;
  const classes = await prisma.class.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } });
  const classIds = classes.map(({ id }) => id);
  await prisma.membership.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { classId: { in: classIds } }] } });
  await prisma.auditEvent.deleteMany({ where: { OR: [{ actorId: { in: userIds } }, { subjectId: { in: classIds } }] } });
  await prisma.class.deleteMany({ where: { id: { in: classIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

describe('Sprint 2 classes and membership', () => {
  enabled('enforces ownership, invitation rotation, membership uniqueness, closure, pagination, and atomic audit', async () => {
    const { createApp } = await import('./app.js');
    await cleanInterruptedFixtures();
    const id = randomUUID();
    const owner = await prisma.user.create({ data: { email: `s2-owner-${id}@example.invalid`, fullName: 'Sprint Two Owner', role: 'DOSEN', status: 'ACTIVE', passwordHash: 'unused-test-hash' } });
    const student = await prisma.user.create({ data: { email: `s2-student-${id}@example.invalid`, fullName: 'Sprint Two Student', role: 'MAHASISWA', status: 'ACTIVE', passwordHash: 'unused-test-hash' } });
    const otherStudent = await prisma.user.create({ data: { email: `s2-other-${id}@example.invalid`, fullName: 'Other Student', role: 'MAHASISWA', status: 'ACTIVE', passwordHash: 'unused-test-hash' } });
    const admin = await prisma.user.create({ data: { email: `s2-admin-${id}@example.invalid`, fullName: 'Sprint Two Admin', role: 'ADMIN', status: 'ACTIVE', passwordHash: 'unused-test-hash' } });
    const pendingStudent = await prisma.user.create({ data: { email: `s2-pending-${id}@example.invalid`, fullName: 'Pending Student', role: 'MAHASISWA', status: 'PENDING', passwordHash: 'unused-test-hash' } });
    const inactiveStudent = await prisma.user.create({ data: { email: `s2-inactive-${id}@example.invalid`, fullName: 'Inactive Student', role: 'MAHASISWA', status: 'INACTIVE', passwordHash: 'unused-test-hash' } });
    const outsider = await prisma.user.create({ data: { email: `s2-outsider-${id}@example.invalid`, fullName: 'Other Instructor', role: 'DOSEN', status: 'ACTIVE', passwordHash: 'unused-test-hash' } });
    const sessions = new Map<string, { cookie: string; csrf: string }>();
    for (const user of [owner, student, otherStudent, admin, pendingStudent, inactiveStudent, outsider]) {
      const token = randomBytes(32).toString('base64url'); const csrf = randomBytes(32).toString('base64url');
      await prisma.session.create({ data: { userId: user.id, tokenHash: digest(token), csrfHash: digest(csrf), expiresAt: new Date(Date.now() + 60_000) } });
      sessions.set(user.id, { cookie: `lms_session=${token}; lms_csrf=${csrf}`, csrf });
    }
    let server: Server | undefined; let classId: string | undefined;
    try {
      server = createApp().listen(0); await new Promise<void>((resolve) => server!.once('listening', resolve));
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('Test server did not bind');
      const base = `http://127.0.0.1:${address.port}/api/classes`;
      const request = (userId: string, path: string, init: RequestInit = {}) => {
        const session = sessions.get(userId)!; const headers = new Headers(init.headers);
        headers.set('Cookie', session.cookie); if (init.method && init.method !== 'GET') headers.set('X-CSRF-Token', session.csrf);
        if (init.body) headers.set('Content-Type', 'application/json');
        return fetch(`${base}${path}`, { ...init, headers });
      };

      const deniedAdmin = await request(admin.id, '', { method: 'POST', body: JSON.stringify({ name: 'Denied' }) });
      expect(deniedAdmin.status).toBe(403);
      const missingCsrf = await fetch(base, { method: 'POST', headers: { Cookie: sessions.get(owner.id)!.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'No CSRF' }) });
      expect(missingCsrf.status).toBe(403);
      const invalid = await request(owner.id, '', { method: 'POST', body: JSON.stringify({ name: '  ', ownerId: student.id }) });
      expect(invalid.status).toBe(400);

      const created = await request(owner.id, '', { method: 'POST', body: JSON.stringify({ name: `${'K'.repeat(119)}😀`, description: ' Cohort ' }) });
      expect(created.status).toBe(201);
      const classBody = await created.json() as { class: { id: string; name: string; status: string } };
      classId = classBody.class.id; expect(classBody.class.name).toHaveLength(121); expect(classBody.class.status).toBe('OPEN');
      expect((await request(outsider.id, `/${classId}`)).status).toBe(404);
      expect((await request(outsider.id, `/${classId}/close`, { method: 'POST' })).status).toBe(404);
      expect((await request(pendingStudent.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: 'A'.repeat(43) }) })).status).toBe(401);
      expect((await request(inactiveStudent.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: 'A'.repeat(43) }) })).status).toBe(401);
      expect((await request(outsider.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: 'A'.repeat(43) }) })).status).toBe(403);
      const issued = await request(owner.id, `/${classId}/invitation-code`, { method: 'POST' });
      expect(issued.status).toBe(200); expect(issued.headers.get('cache-control')).toBe('no-store');
      const firstCode = (await issued.json() as { invitationCode: string }).invitationCode; expect(firstCode).toHaveLength(43);
      const rotationRace = await Promise.all([1, 2].map(() => request(owner.id, `/${classId}/invitation-code`, { method: 'POST' })));
      expect(rotationRace.every((response) => response.status === 200 || response.status === 409)).toBe(true);
      expect(rotationRace.some((response) => response.status === 200)).toBe(true);
      const rotatedCodes = await Promise.all(rotationRace.filter((response) => response.status === 200).map(async (response) => (await response.json() as { invitationCode: string }).invitationCode));
      const afterRotationRace = await prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { invitationCodeHash: true } });
      const currentCodes = rotatedCodes.filter((code) => digest(code) === afterRotationRace.invitationCodeHash);
      expect(currentCodes).toHaveLength(1);
      const secondCode = currentCodes[0]!;
      for (const staleCode of rotatedCodes.filter((code) => code !== secondCode)) {
        const staleJoin = await request(student.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: staleCode }) });
        expect(staleJoin.status).toBe(400);
      }
      expect(secondCode).not.toBe(firstCode);
      const previousCode = await request(student.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: firstCode }) });
      expect(previousCode.status).toBe(400); expect((await previousCode.json()).error.code).toBe('JOIN_NOT_AVAILABLE');
      const unknownCode = await request(student.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: 'Z'.repeat(43) }) });
      expect(unknownCode.status).toBe(400); expect((await unknownCode.json()).error.code).toBe('JOIN_NOT_AVAILABLE');

      const concurrent = await Promise.all([1, 2].map(() => request(student.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: secondCode }) })));
      expect(concurrent.map((response) => response.status).sort()).toEqual([201, 409]);
      const membership = await prisma.membership.findUniqueOrThrow({ where: { classId_userId: { classId, userId: student.id } } });
      expect(await prisma.membership.count({ where: { classId, userId: student.id } })).toBe(1);
      expect((await request(student.id, `/${classId}/membership`)).status).toBe(200);
      const ownMembership = await request(otherStudent.id, `/${classId}/membership`);
      expect((await ownMembership.json()).membership).toBeNull();
      expect((await request(otherStudent.id, `/${classId}`)).status).toBe(404);
      expect((await request(student.id, `/${classId}/members`)).status).toBe(403);
      expect((await request(admin.id, `/${classId}/members`)).status).toBe(403);
      const list = await request(owner.id, `?limit=1&offset=0`); expect(list.status).toBe(200);
      expect((await request(owner.id, `?limit=101`)).status).toBe(400);
      const roster = await request(owner.id, `/${classId}/members`); expect(roster.status).toBe(200);
      expect((await roster.json()).members).toHaveLength(1);

      const close = await request(owner.id, `/${classId}/close`, { method: 'POST' }); expect(close.status).toBe(200);
      const repeatedClose = await request(owner.id, `/${classId}/close`, { method: 'POST' });
      expect(repeatedClose.status).toBe(409); expect((await repeatedClose.json()).error.code).toBe('CLASS_CLOSED');
      const closedJoin = await request(otherStudent.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: secondCode }) });
      expect(closedJoin.status).toBe(400); expect((await closedJoin.json()).error.code).toBe('JOIN_NOT_AVAILABLE');
      expect((await request(owner.id, `/${classId}/invitation-code`, { method: 'POST' })).status).toBe(409);
      expect((await request(owner.id, `/${classId}/reopen`, { method: 'POST' })).status).toBe(404);
      expect((await request(student.id, `/${classId}/leave`, { method: 'POST' })).status).toBe(404);
      expect((await request(student.id, `/${classId}`)).status).toBe(200);
      const edited = await request(owner.id, `/${classId}`, { method: 'PATCH', body: JSON.stringify({ description: null }) });
      expect(edited.status).toBe(200); expect((await edited.json()).class.status).toBe('CLOSED');

      const raceClassResponse = await request(owner.id, '', { method: 'POST', body: JSON.stringify({ name: 'Join close race' }) });
      expect(raceClassResponse.status).toBe(201);
      const raceClassId = (await raceClassResponse.json() as { class: { id: string } }).class.id;
      const raceCodeResponse = await request(owner.id, `/${raceClassId}/invitation-code`, { method: 'POST' });
      const raceCode = (await raceCodeResponse.json() as { invitationCode: string }).invitationCode;
      const [raceJoin, raceClose] = await Promise.all([
        request(otherStudent.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: raceCode }) }),
        request(owner.id, `/${raceClassId}/close`, { method: 'POST' }),
      ]);
      expect(raceClose.status).toBe(200);
      expect([201, 400, 409]).toContain(raceJoin.status);
      const joinedDuringRace = await prisma.membership.findUnique({ where: { classId_userId: { classId: raceClassId, userId: otherStudent.id } } });
      expect(Boolean(joinedDuringRace)).toBe(raceJoin.status === 201);
      expect((await prisma.class.findUniqueOrThrow({ where: { id: raceClassId } })).status).toBe('CLOSED');
      let limited: Response | undefined;
      for (let attempt = 0; attempt < 12 && !limited; attempt += 1) {
        const response = await request(otherStudent.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: 'X'.repeat(43) }) });
        if (response.status === 429) limited = response;
        else expect(response.status).toBe(400);
      }
      expect(limited).toBeDefined(); expect(Number(limited!.headers.get('retry-after'))).toBeGreaterThan(0);

      const stored = await prisma.class.findUniqueOrThrow({ where: { id: classId } });
      expect(stored.invitationCodeHash).toBe(digest(secondCode));
      expect(JSON.stringify(stored)).not.toContain(secondCode);
      expect(stored.invitationCodeVersion).toBe(1 + rotatedCodes.length);
      expect(await prisma.auditEvent.count({ where: { actorId: owner.id, subjectId: classId, action: 'CLASS_CLOSED' } })).toBe(1);
      expect(await prisma.auditEvent.count({ where: { actorId: student.id, subjectId: classId, action: 'CLASS_JOIN_SUCCEEDED' } })).toBe(1);
      expect(membership.userId).toBe(student.id);
    } finally {
      if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
      if (classId) {
        await prisma.auditEvent.deleteMany({ where: { subjectId: classId } });
        await prisma.membership.deleteMany({ where: { classId } });
        await prisma.class.deleteMany({ where: { id: classId } });
      }
      const testIds = [owner.id, student.id, otherStudent.id, admin.id, pendingStudent.id, inactiveStudent.id, outsider.id];
      const remainingClasses = await prisma.class.findMany({ where: { ownerId: { in: testIds } }, select: { id: true } });
      const remainingClassIds = remainingClasses.map(({ id: remainingId }) => remainingId);
      await prisma.membership.deleteMany({ where: { classId: { in: remainingClassIds } } });
      await prisma.auditEvent.deleteMany({ where: { OR: [{ actorId: { in: testIds } }, { subjectId: { in: remainingClassIds } }] } });
      await prisma.class.deleteMany({ where: { id: { in: remainingClassIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: testIds } } });
      await prisma.user.deleteMany({ where: { id: { in: testIds } } });
    }
  }, 30000);
});

afterAll(async () => { await prisma.$disconnect(); });
