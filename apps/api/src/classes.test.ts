import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { and, count, eq, inArray, like, or } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { db, pool } from '../../../src/db/index.js';
import { auditEvents, classes, memberships, sessions, users } from '../../../src/db/schema.js';

const enabled = process.env.RUN_DB_INTEGRATION === '1' ? it : it.skip;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

async function cleanInterruptedFixtures() {
  const prefixes = ['s2-owner-', 's2-student-', 's2-other-', 's2-admin-', 's2-pending-', 's2-inactive-', 's2-outsider-'];
  const matchedUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(or(...prefixes.map((prefix) => like(users.email, `${prefix}%`))));
  const userIds = matchedUsers.map(({ id }) => id);
  if (!userIds.length) return;
  const ownedClasses = await db.select({ id: classes.id }).from(classes).where(inArray(classes.ownerId, userIds));
  const classIds = ownedClasses.map(({ id }) => id);
  if (classIds.length > 0) {
    await db.delete(memberships).where(or(inArray(memberships.userId, userIds), inArray(memberships.classId, classIds)));
    await db.delete(auditEvents).where(or(inArray(auditEvents.actorId, userIds), inArray(auditEvents.subjectId, classIds)));
    await db.delete(classes).where(inArray(classes.id, classIds));
  } else {
    await db.delete(memberships).where(inArray(memberships.userId, userIds));
    await db.delete(auditEvents).where(inArray(auditEvents.actorId, userIds));
  }
  await db.delete(sessions).where(inArray(sessions.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
}

describe('Sprint 2 classes and membership', () => {
  enabled('enforces ownership, invitation rotation, membership uniqueness, closure, pagination, and atomic audit', async () => {
    const { createApp } = await import('./app.js');
    await cleanInterruptedFixtures();
    const id = randomUUID();
    const [owner] = await db.insert(users).values({ email: `s2-owner-${id}@example.invalid`, fullName: 'Sprint Two Owner', role: 'DOSEN', status: 'ACTIVE', passwordHash: 'unused-test-hash' }).returning();
    const [student] = await db.insert(users).values({ email: `s2-student-${id}@example.invalid`, fullName: 'Sprint Two Student', role: 'MAHASISWA', status: 'ACTIVE', passwordHash: 'unused-test-hash' }).returning();
    const [otherStudent] = await db.insert(users).values({ email: `s2-other-${id}@example.invalid`, fullName: 'Other Student', role: 'MAHASISWA', status: 'ACTIVE', passwordHash: 'unused-test-hash' }).returning();
    const [admin] = await db.insert(users).values({ email: `s2-admin-${id}@example.invalid`, fullName: 'Sprint Two Admin', role: 'ADMIN', status: 'ACTIVE', passwordHash: 'unused-test-hash' }).returning();
    const [pendingStudent] = await db.insert(users).values({ email: `s2-pending-${id}@example.invalid`, fullName: 'Pending Student', role: 'MAHASISWA', status: 'PENDING', passwordHash: 'unused-test-hash' }).returning();
    const [inactiveStudent] = await db.insert(users).values({ email: `s2-inactive-${id}@example.invalid`, fullName: 'Inactive Student', role: 'MAHASISWA', status: 'INACTIVE', passwordHash: 'unused-test-hash' }).returning();
    const [outsider] = await db.insert(users).values({ email: `s2-outsider-${id}@example.invalid`, fullName: 'Other Instructor', role: 'DOSEN', status: 'ACTIVE', passwordHash: 'unused-test-hash' }).returning();

    const fixtureUsers = [owner!, student!, otherStudent!, admin!, pendingStudent!, inactiveStudent!, outsider!];
    const sessionTokens = new Map<string, { cookie: string; csrf: string }>();
    for (const user of fixtureUsers) {
      const token = randomBytes(32).toString('base64url');
      const csrf = randomBytes(32).toString('base64url');
      await db.insert(sessions).values({
        userId: user.id,
        tokenHash: digest(token),
        csrfHash: digest(csrf),
        expiresAt: new Date(Date.now() + 60_000),
      });
      sessionTokens.set(user.id, { cookie: `lms_session=${token}; lms_csrf=${csrf}`, csrf });
    }

    let server: Server | undefined;
    let classId: string | undefined;
    try {
      server = createApp().listen(0);
      await new Promise<void>((resolve) => server!.once('listening', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Test server did not bind');
      const base = `http://127.0.0.1:${address.port}/api/classes`;
      const request = (userId: string, path: string, init: RequestInit = {}) => {
        const session = sessionTokens.get(userId)!;
        const headers = new Headers(init.headers);
        headers.set('Cookie', session.cookie);
        if (init.method && init.method !== 'GET') headers.set('X-CSRF-Token', session.csrf);
        if (init.body) headers.set('Content-Type', 'application/json');
        return fetch(`${base}${path}`, { ...init, headers });
      };

      const deniedAdmin = await request(admin!.id, '', { method: 'POST', body: JSON.stringify({ name: 'Denied' }) });
      expect(deniedAdmin.status).toBe(403);
      const missingCsrf = await fetch(base, {
        method: 'POST',
        headers: { Cookie: sessionTokens.get(owner!.id)!.cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'No CSRF' }),
      });
      expect(missingCsrf.status).toBe(403);
      const invalid = await request(owner!.id, '', { method: 'POST', body: JSON.stringify({ name: '  ', ownerId: student!.id }) });
      expect(invalid.status).toBe(400);

      const created = await request(owner!.id, '', { method: 'POST', body: JSON.stringify({ name: `${'K'.repeat(119)}😀`, description: ' Cohort ' }) });
      expect(created.status).toBe(201);
      const classBody = (await created.json()) as { class: { id: string; name: string; status: string } };
      classId = classBody.class.id;
      expect(classBody.class.name).toHaveLength(121);
      expect(classBody.class.status).toBe('OPEN');
      expect((await request(outsider!.id, `/${classId}`)).status).toBe(404);
      expect((await request(outsider!.id, `/${classId}/close`, { method: 'POST' })).status).toBe(404);
      expect((await request(pendingStudent!.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: 'A'.repeat(43) }) })).status).toBe(401);
      expect((await request(inactiveStudent!.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: 'A'.repeat(43) }) })).status).toBe(401);
      expect((await request(outsider!.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: 'A'.repeat(43) }) })).status).toBe(403);

      const issued = await request(owner!.id, `/${classId}/invitation-code`, { method: 'POST' });
      expect(issued.status).toBe(200);
      expect(issued.headers.get('cache-control')).toBe('no-store');
      const firstCode = ((await issued.json()) as { invitationCode: string }).invitationCode;
      expect(firstCode).toHaveLength(43);

      const rotationRace = await Promise.all([1, 2].map(() => request(owner!.id, `/${classId}/invitation-code`, { method: 'POST' })));
      expect(rotationRace.every((response) => response.status === 200 || response.status === 409)).toBe(true);
      expect(rotationRace.some((response) => response.status === 200)).toBe(true);
      const rotatedCodes = await Promise.all(
        rotationRace
          .filter((response) => response.status === 200)
          .map(async (response) => ((await response.json()) as { invitationCode: string }).invitationCode),
      );
      const [afterRotationRace] = await db
        .select({ invitationCodeHash: classes.invitationCodeHash })
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1);
      expect(afterRotationRace).toBeDefined();
      const currentCodes = rotatedCodes.filter((code) => digest(code) === afterRotationRace!.invitationCodeHash);
      expect(currentCodes).toHaveLength(1);
      const secondCode = currentCodes[0]!;
      for (const staleCode of rotatedCodes.filter((code) => code !== secondCode)) {
        const staleJoin = await request(student!.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: staleCode }) });
        expect(staleJoin.status).toBe(400);
      }
      expect(secondCode).not.toBe(firstCode);
      const previousCode = await request(student!.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: firstCode }) });
      expect(previousCode.status).toBe(400);
      expect((await previousCode.json()).error.code).toBe('JOIN_NOT_AVAILABLE');
      const unknownCode = await request(student!.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: 'Z'.repeat(43) }) });
      expect(unknownCode.status).toBe(400);
      expect((await unknownCode.json()).error.code).toBe('JOIN_NOT_AVAILABLE');

      const concurrent = await Promise.all([1, 2].map(() => request(student!.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: secondCode }) })));
      expect(concurrent.map((response) => response.status).sort()).toEqual([201, 409]);
      const [membership] = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.classId, classId), eq(memberships.userId, student!.id)))
        .limit(1);
      expect(membership).toBeDefined();
      const [membershipCount] = await db
        .select({ total: count() })
        .from(memberships)
        .where(and(eq(memberships.classId, classId), eq(memberships.userId, student!.id)));
      expect(membershipCount?.total).toBe(1);
      expect((await request(student!.id, `/${classId}/membership`)).status).toBe(200);
      const ownMembership = await request(otherStudent!.id, `/${classId}/membership`);
      expect((await ownMembership.json()).membership).toBeNull();
      expect((await request(otherStudent!.id, `/${classId}`)).status).toBe(404);
      expect((await request(student!.id, `/${classId}/members`)).status).toBe(403);
      expect((await request(admin!.id, `/${classId}/members`)).status).toBe(403);
      const list = await request(owner!.id, `?limit=1&offset=0`);
      expect(list.status).toBe(200);
      expect((await request(owner!.id, `?limit=101`)).status).toBe(400);
      const roster = await request(owner!.id, `/${classId}/members`);
      expect(roster.status).toBe(200);
      expect((await roster.json()).members).toHaveLength(1);

      const close = await request(owner!.id, `/${classId}/close`, { method: 'POST' });
      expect(close.status).toBe(200);
      const repeatedClose = await request(owner!.id, `/${classId}/close`, { method: 'POST' });
      expect(repeatedClose.status).toBe(409);
      expect((await repeatedClose.json()).error.code).toBe('CLASS_CLOSED');
      const closedJoin = await request(otherStudent!.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: secondCode }) });
      expect(closedJoin.status).toBe(400);
      expect((await closedJoin.json()).error.code).toBe('JOIN_NOT_AVAILABLE');
      expect((await request(owner!.id, `/${classId}/invitation-code`, { method: 'POST' })).status).toBe(409);
      expect((await request(owner!.id, `/${classId}/reopen`, { method: 'POST' })).status).toBe(404);
      expect((await request(student!.id, `/${classId}/leave`, { method: 'POST' })).status).toBe(404);
      expect((await request(student!.id, `/${classId}`)).status).toBe(200);
      const edited = await request(owner!.id, `/${classId}`, { method: 'PATCH', body: JSON.stringify({ description: null }) });
      expect(edited.status).toBe(200);
      expect((await edited.json()).class.status).toBe('CLOSED');

      const raceClassResponse = await request(owner!.id, '', { method: 'POST', body: JSON.stringify({ name: 'Join close race' }) });
      expect(raceClassResponse.status).toBe(201);
      const raceClassId = ((await raceClassResponse.json()) as { class: { id: string } }).class.id;
      const raceCodeResponse = await request(owner!.id, `/${raceClassId}/invitation-code`, { method: 'POST' });
      const raceCode = ((await raceCodeResponse.json()) as { invitationCode: string }).invitationCode;
      const [raceJoin, raceClose] = await Promise.all([
        request(otherStudent!.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: raceCode }) }),
        request(owner!.id, `/${raceClassId}/close`, { method: 'POST' }),
      ]);
      expect(raceClose.status).toBe(200);
      expect([201, 400, 409]).toContain(raceJoin.status);
      const [joinedDuringRace] = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.classId, raceClassId), eq(memberships.userId, otherStudent!.id)))
        .limit(1);
      expect(Boolean(joinedDuringRace)).toBe(raceJoin.status === 201);
      const [raceClassRecord] = await db.select({ status: classes.status }).from(classes).where(eq(classes.id, raceClassId)).limit(1);
      expect(raceClassRecord?.status).toBe('CLOSED');

      let limited: Response | undefined;
      for (let attempt = 0; attempt < 12 && !limited; attempt += 1) {
        const response = await request(otherStudent!.id, '/join', { method: 'POST', body: JSON.stringify({ invitationCode: 'X'.repeat(43) }) });
        if (response.status === 429) limited = response;
        else expect(response.status).toBe(400);
      }
      expect(limited).toBeDefined();
      expect(Number(limited!.headers.get('retry-after'))).toBeGreaterThan(0);

      const [stored] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
      expect(stored).toBeDefined();
      expect(stored!.invitationCodeHash).toBe(digest(secondCode));
      expect(JSON.stringify(stored)).not.toContain(secondCode);
      expect(stored!.invitationCodeVersion).toBe(1 + rotatedCodes.length);
      const [closedAuditCount] = await db
        .select({ total: count() })
        .from(auditEvents)
        .where(and(eq(auditEvents.actorId, owner!.id), eq(auditEvents.subjectId, classId), eq(auditEvents.action, 'CLASS_CLOSED')));
      expect(closedAuditCount?.total).toBe(1);
      const [joinAuditCount] = await db
        .select({ total: count() })
        .from(auditEvents)
        .where(and(eq(auditEvents.actorId, student!.id), eq(auditEvents.subjectId, classId), eq(auditEvents.action, 'CLASS_JOIN_SUCCEEDED')));
      expect(joinAuditCount?.total).toBe(1);
      expect(membership!.userId).toBe(student!.id);
    } finally {
      if (server?.listening) {
        await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
      }
      if (classId) {
        await db.delete(auditEvents).where(eq(auditEvents.subjectId, classId));
        await db.delete(memberships).where(eq(memberships.classId, classId));
        await db.delete(classes).where(eq(classes.id, classId));
      }
      const testIds = fixtureUsers.map(({ id: userId }) => userId);
      const remainingClasses = await db.select({ id: classes.id }).from(classes).where(inArray(classes.ownerId, testIds));
      const remainingClassIds = remainingClasses.map(({ id: remainingId }) => remainingId);
      if (remainingClassIds.length > 0) {
        await db.delete(memberships).where(inArray(memberships.classId, remainingClassIds));
        await db.delete(auditEvents).where(or(inArray(auditEvents.actorId, testIds), inArray(auditEvents.subjectId, remainingClassIds)));
        await db.delete(classes).where(inArray(classes.id, remainingClassIds));
      } else {
        await db.delete(auditEvents).where(inArray(auditEvents.actorId, testIds));
      }
      await db.delete(sessions).where(inArray(sessions.userId, testIds));
      await db.delete(users).where(inArray(users.id, testIds));
    }
  }, 30000);
});

afterAll(async () => {
  await pool.end();
});
