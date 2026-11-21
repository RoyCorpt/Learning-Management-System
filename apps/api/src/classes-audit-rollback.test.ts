import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { and, count, eq, inArray, or } from 'drizzle-orm';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveDatabaseConnection } from '../../../src/db/config.js';
import { db, pool } from '../../../src/db/index.js';
import { auditEvents, classes, memberships, sessions, users } from '../../../src/db/schema.js';

const enabled = process.env.RUN_S2_AUDIT_ROLLBACK === '1' ? it : it.skip;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const actions = ['CLASS_CREATED', 'CLASS_INVITATION_ROTATED', 'CLASS_JOIN_SUCCEEDED', 'CLASS_CLOSED'] as const;

function createAdminDdlPool() {
  const conn = resolveDatabaseConnection('admin');
  return new Pool(
    conn.kind === 'url'
      ? { connectionString: conn.connectionString, ssl: conn.ssl }
      : {
          host: conn.host,
          port: conn.port,
          user: conn.user,
          password: conn.password,
          database: conn.database,
          ssl: conn.ssl,
        },
  );
}

describe('Sprint 2 audit transaction rollback', () => {
  enabled('rolls back create, rotation, join, and close when their audit insert fails', async () => {
    const { createApp } = await import('./app.js');
    const ddlPool = createAdminDdlPool();
    const id = randomUUID();
    const [owner] = await db
      .insert(users)
      .values({
        email: `s2-audit-owner-${id}@example.invalid`,
        fullName: 'Audit Test Owner',
        role: 'DOSEN',
        status: 'ACTIVE',
        passwordHash: 'unused-test-hash',
      })
      .returning();
    const [student] = await db
      .insert(users)
      .values({
        email: `s2-audit-student-${id}@example.invalid`,
        fullName: 'Audit Test Student',
        role: 'MAHASISWA',
        status: 'ACTIVE',
        passwordHash: 'unused-test-hash',
      })
      .returning();

    const tokens = new Map<string, { cookie: string; csrf: string }>();
    for (const user of [owner!, student!]) {
      const sessionToken = randomBytes(32).toString('base64url');
      const csrf = randomBytes(32).toString('base64url');
      await db.insert(sessions).values({
        userId: user.id,
        tokenHash: digest(sessionToken),
        csrfHash: digest(csrf),
        expiresAt: new Date(Date.now() + 60_000),
      });
      tokens.set(user.id, { cookie: `lms_session=${sessionToken}; lms_csrf=${csrf}`, csrf });
    }

    let server: Server | undefined;
    let classId: string | undefined;
    const dropFailure = async () => {
      await ddlPool.query('DROP TRIGGER IF EXISTS s2_audit_failure ON audit_events');
      await ddlPool.query('DROP FUNCTION IF EXISTS s2_audit_failure()');
    };
    const injectFailure = async (action: (typeof actions)[number]) => {
      await dropFailure();
      await ddlPool.query(
        `CREATE FUNCTION s2_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = TG_ARGV[0] THEN RAISE EXCEPTION 'forced audit failure'; END IF; RETURN NEW; END $$`,
      );
      await ddlPool.query(
        `CREATE TRIGGER s2_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION s2_audit_failure('${action}')`,
      );
    };
    const request = (userId: string, url: string, init: RequestInit = {}) => {
      const session = tokens.get(userId)!;
      const headers = new Headers(init.headers);
      headers.set('Cookie', session.cookie);
      if (init.method && init.method !== 'GET') headers.set('X-CSRF-Token', session.csrf);
      if (init.body) headers.set('Content-Type', 'application/json');
      return fetch(url, { ...init, headers });
    };

    try {
      server = createApp().listen(0);
      await new Promise<void>((resolve) => server!.once('listening', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Test server did not bind');
      const base = `http://127.0.0.1:${address.port}/api/classes`;
      const failedCreateName = `Audit rollback ${id}`;
      await injectFailure('CLASS_CREATED');
      const failedCreate = await request(owner!.id, base, { method: 'POST', body: JSON.stringify({ name: failedCreateName }) });
      expect(failedCreate.status).toBe(500);
      await dropFailure();
      const [failedClassCount] = await db
        .select({ total: count() })
        .from(classes)
        .where(and(eq(classes.ownerId, owner!.id), eq(classes.name, failedCreateName)));
      expect(failedClassCount?.total).toBe(0);
      const [failedCreateAuditCount] = await db
        .select({ total: count() })
        .from(auditEvents)
        .where(and(eq(auditEvents.actorId, owner!.id), eq(auditEvents.action, 'CLASS_CREATED')));
      expect(failedCreateAuditCount?.total).toBe(0);

      const created = await request(owner!.id, base, { method: 'POST', body: JSON.stringify({ name: `Audit lifecycle ${id}` }) });
      expect(created.status).toBe(201);
      classId = ((await created.json()) as { class: { id: string } }).class.id;
      const firstCodeResponse = await request(owner!.id, `${base}/${classId}/invitation-code`, { method: 'POST' });
      expect(firstCodeResponse.status).toBe(200);
      const firstCode = ((await firstCodeResponse.json()) as { invitationCode: string }).invitationCode;
      const [beforeRotate] = await db
        .select({ invitationCodeHash: classes.invitationCodeHash, invitationCodeVersion: classes.invitationCodeVersion })
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1);
      expect(beforeRotate).toBeDefined();

      await injectFailure('CLASS_INVITATION_ROTATED');
      const failedRotation = await request(owner!.id, `${base}/${classId}/invitation-code`, { method: 'POST' });
      expect(failedRotation.status).toBe(500);
      await dropFailure();
      const [afterFailedRotate] = await db
        .select({ invitationCodeHash: classes.invitationCodeHash, invitationCodeVersion: classes.invitationCodeVersion })
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1);
      expect(afterFailedRotate).toEqual(beforeRotate);
      const [failedRotateAuditCount] = await db
        .select({ total: count() })
        .from(auditEvents)
        .where(and(eq(auditEvents.subjectId, classId), eq(auditEvents.action, 'CLASS_INVITATION_ROTATED')));
      expect(failedRotateAuditCount?.total).toBe(0);

      await injectFailure('CLASS_JOIN_SUCCEEDED');
      const failedJoin = await request(student!.id, `${base}/join`, { method: 'POST', body: JSON.stringify({ invitationCode: firstCode }) });
      expect(failedJoin.status).toBe(500);
      await dropFailure();
      const [failedMembershipCount] = await db
        .select({ total: count() })
        .from(memberships)
        .where(and(eq(memberships.classId, classId), eq(memberships.userId, student!.id)));
      expect(failedMembershipCount?.total).toBe(0);
      const [failedJoinAuditCount] = await db
        .select({ total: count() })
        .from(auditEvents)
        .where(and(eq(auditEvents.subjectId, classId), eq(auditEvents.action, 'CLASS_JOIN_SUCCEEDED')));
      expect(failedJoinAuditCount?.total).toBe(0);

      await injectFailure('CLASS_CLOSED');
      const failedClose = await request(owner!.id, `${base}/${classId}/close`, { method: 'POST' });
      expect(failedClose.status).toBe(500);
      await dropFailure();
      const [afterFailedClose] = await db
        .select({ status: classes.status })
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1);
      expect(afterFailedClose?.status).toBe('OPEN');
      const [failedCloseAuditCount] = await db
        .select({ total: count() })
        .from(auditEvents)
        .where(and(eq(auditEvents.subjectId, classId), eq(auditEvents.action, 'CLASS_CLOSED')));
      expect(failedCloseAuditCount?.total).toBe(0);
    } finally {
      await dropFailure().catch(() => undefined);
      await ddlPool.end().catch(() => undefined);
      if (server?.listening) {
        await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
      }
      const ownedClasses = await db.select({ id: classes.id }).from(classes).where(eq(classes.ownerId, owner!.id));
      const classIds = ownedClasses.map(({ id: value }) => value);
      if (classIds.length > 0) {
        await db.delete(memberships).where(inArray(memberships.classId, classIds));
        await db
          .delete(auditEvents)
          .where(or(inArray(auditEvents.actorId, [owner!.id, student!.id]), inArray(auditEvents.subjectId, classIds)));
        await db.delete(classes).where(inArray(classes.id, classIds));
      } else {
        await db.delete(auditEvents).where(inArray(auditEvents.actorId, [owner!.id, student!.id]));
      }
      await db.delete(sessions).where(inArray(sessions.userId, [owner!.id, student!.id]));
      await db.delete(users).where(inArray(users.id, [owner!.id, student!.id]));
    }
  }, 30000);
});

afterAll(async () => {
  await pool.end();
});
