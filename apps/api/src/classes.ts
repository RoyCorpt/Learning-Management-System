import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../../../src/db/index.js';
import {
  auditEvents,
  classes,
  memberships,
  users,
  type ClassStatus,
  type Role,
} from '../../../src/db/schema.js';
import { authenticate, csrf, requireRole } from './auth.js';
import { communicationRouter } from './communication.js';
import { learningRouter } from './learning.js';
import { getPgErrorCode } from './middleware/error-handler.js';
import { classQuizzesRouter } from './quizzes.js';

type Principal = { id: string; role: Role };
type ClassRequest = Request & { auth?: Principal };
type Page = { limit: number; offset: number; hasMore: boolean };
type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

const router = Router();
const classColumns = {
  id: classes.id,
  name: classes.name,
  description: classes.description,
  status: classes.status,
  ownerId: classes.ownerId,
  createdAt: classes.createdAt,
};

const digest = (code: string) => createHash('sha256').update(code, 'utf8').digest('hex');
const uuid = z.string().uuid();
const cleanName = z.string().transform((s) => s.trim()).refine((s) => Array.from(s).length >= 1 && Array.from(s).length <= 120);
const cleanDescription = z.string().transform((s) => s.trim()).refine((s) => Array.from(s).length <= 2000).transform((s) => s || null).nullable();
const createSchema = z.object({ name: cleanName, description: cleanDescription.optional() }).strict();
const patchSchema = z.object({ name: cleanName.optional(), description: cleanDescription.optional() }).strict().refine((v) => Object.keys(v).length > 0);
const joinSchema = z.object({ invitationCode: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const pageSchema = z.object({ limit: z.string().regex(/^\d+$/).optional(), offset: z.string().regex(/^\d+$/).optional() });

class DomainError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function isSerializationConflict(error: unknown) {
  return getPgErrorCode(error) === '40001';
}

const fail = (status: number, code: string, message = code) => new DomainError(status, code, message);

function sendError(res: Response, error: unknown) {
  const id = res.locals.requestId as string | undefined;
  if (error instanceof DomainError) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message, ...(id ? { requestId: id } : {}) } });
  }
  return undefined;
}

function handle(next: NextFunction, res: Response, error: unknown) {
  if (!sendError(res, error)) next(error);
}

const actor = (req: ClassRequest) => {
  if (!req.auth) throw fail(401, 'UNAUTHENTICATED', 'Autentikasi diperlukan.');
  return req.auth;
};

function requestId(res: Response) {
  return res.locals.requestId as string | undefined;
}

function pageFrom(query: Request['query']): Page {
  const parsed = pageSchema.parse(query);
  const limit = parsed.limit === undefined ? 50 : Number(parsed.limit);
  const offset = parsed.offset === undefined ? 0 : Number(parsed.offset);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) {
    throw fail(400, 'INVALID_INPUT', 'Parameter halaman tidak valid.');
  }
  return { limit, offset, hasMore: false };
}

function safeClass(record: { id: string; name: string; description: string | null; status: ClassStatus; ownerId: string; createdAt: Date }) {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    status: record.status,
    ownerId: record.ownerId,
    createdAt: record.createdAt,
  };
}

async function lockClass(tx: TxClient, id: string) {
  await tx.execute(sql`SELECT id FROM classes WHERE id = ${id}::uuid FOR UPDATE`);
}

const attempts = new Map<string, number[]>();
const WINDOW = 15 * 60_000;

function throttle(req: Request, userId: string) {
  const now = Date.now();
  const ip = req.ip ?? 'unknown';
  for (const [key, dates] of attempts) {
    const recent = dates.filter((at) => at > now - WINDOW);
    if (recent.length) attempts.set(key, recent);
    else attempts.delete(key);
  }
  const ipKey = `ip:${ip}`;
  const userKey = `user:${userId}`;
  const byIp = attempts.get(ipKey) ?? [];
  const byUser = attempts.get(userKey) ?? [];
  const oldest = Math.max(byIp.length >= 30 ? byIp[0]! : 0, byUser.length >= 10 ? byUser[0]! : 0);
  if (oldest) return Math.max(1, Math.ceil((oldest + WINDOW - now) / 1000));
  return 0;
}

function recordFailure(req: Request, userId: string) {
  const now = Date.now();
  const ipKey = `ip:${req.ip ?? 'unknown'}`;
  const userKey = `user:${userId}`;
  attempts.set(ipKey, [...(attempts.get(ipKey) ?? []).filter((at) => at > now - WINDOW), now]);
  attempts.set(userKey, [...(attempts.get(userKey) ?? []).filter((at) => at > now - WINDOW), now]);
}

function joinUnavailable(res: Response, req: Request, userId: string) {
  recordFailure(req, userId);
  return res.status(400).json({
    error: {
      code: 'JOIN_NOT_AVAILABLE',
      message: 'Kode undangan tidak tersedia.',
      ...(requestId(res) ? { requestId: requestId(res) } : {}),
    },
  });
}

router.use(authenticate);

router.get('/', (req: ClassRequest, res, next) => {
  try {
    const user = actor(req);
    if (user.role === 'ADMIN') throw fail(403, 'FORBIDDEN', 'Akses tidak diizinkan.');
    const page = pageFrom(req.query);
    void (async () => {
      const rows = user.role === 'DOSEN'
        ? await db
            .select(classColumns)
            .from(classes)
            .where(eq(classes.ownerId, user.id))
            .orderBy(desc(classes.createdAt), desc(classes.id))
            .limit(page.limit + 1)
            .offset(page.offset)
        : await db
            .select(classColumns)
            .from(classes)
            .innerJoin(memberships, and(eq(memberships.classId, classes.id), eq(memberships.userId, user.id)))
            .orderBy(desc(classes.createdAt), desc(classes.id))
            .limit(page.limit + 1)
            .offset(page.offset);

      const hasMore = rows.length > page.limit;
      res.json({ classes: rows.slice(0, page.limit).map(safeClass), page: { limit: page.limit, offset: page.offset, hasMore } });
    })().catch(next);
  } catch (error) {
    handle(next, res, error);
  }
});

router.post('/', csrf, requireRole('DOSEN'), async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req);
    const input = createSchema.parse(req.body);
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
      const inserted = await tx
        .insert(classes)
        .values({
          ownerId: user.id,
          name: input.name,
          description: input.description ?? null,
        })
        .returning(classColumns);
      const record = inserted[0]!;
      await tx.insert(auditEvents).values({
        action: 'CLASS_CREATED',
        actorId: user.id,
        subjectId: record.id,
        details: { requestId: requestId(res) },
      });
      return record;
    });
    return res.status(201).json({ class: safeClass(created) });
  } catch (error) {
    handle(next, res, error);
  }
});

router.get('/:id', async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req);
    if (user.role === 'ADMIN') throw fail(403, 'FORBIDDEN', 'Akses tidak diizinkan.');
    const id = uuid.parse(req.params.id);
    const rows = user.role === 'DOSEN'
      ? await db
          .select(classColumns)
          .from(classes)
          .where(and(eq(classes.id, id), eq(classes.ownerId, user.id)))
          .limit(1)
      : await db
          .select(classColumns)
          .from(classes)
          .innerJoin(memberships, and(eq(memberships.classId, classes.id), eq(memberships.userId, user.id)))
          .where(eq(classes.id, id))
          .limit(1);

    const record = rows[0];
    if (!record) throw fail(404, 'NOT_FOUND', 'Kelas tidak ditemukan.');
    return res.json({ class: safeClass(record) });
  } catch (error) {
    handle(next, res, error);
  }
});

router.patch('/:id', csrf, requireRole('DOSEN'), async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req);
    const id = uuid.parse(req.params.id);
    const input = patchSchema.parse(req.body);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
      await lockClass(tx, id);
      const found = await tx
        .select()
        .from(classes)
        .where(and(eq(classes.id, id), eq(classes.ownerId, user.id)))
        .limit(1);
      if (!found[0]) throw fail(404, 'NOT_FOUND', 'Kelas tidak ditemukan.');

      const updated = await tx
        .update(classes)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          updatedAt: new Date(),
        })
        .where(eq(classes.id, id))
        .returning(classColumns);

      await tx.insert(auditEvents).values({
        action: 'CLASS_UPDATED',
        actorId: user.id,
        subjectId: id,
        details: { requestId: requestId(res), fields: Object.keys(input).sort() },
      });
      return updated[0]!;
    });
    return res.json({ class: safeClass(result) });
  } catch (error) {
    handle(next, res, error);
  }
});

router.post('/join', csrf, requireRole('MAHASISWA'), async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req);
    const retry = throttle(req, user.id);
    if (retry) {
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({
        error: {
          code: 'JOIN_RATE_LIMITED',
          message: 'Terlalu banyak percobaan. Coba lagi nanti.',
          ...(requestId(res) ? { requestId: requestId(res) } : {}),
        },
      });
    }
    const body = joinSchema.safeParse(req.body);
    if (!body.success) return joinUnavailable(res, req, user.id);
    const codeHash = digest(body.data.invitationCode);
    const candidates = await db
      .select({ id: classes.id })
      .from(classes)
      .where(eq(classes.invitationCodeHash, codeHash))
      .limit(1);
    const candidate = candidates[0];
    if (!candidate) return joinUnavailable(res, req, user.id);

    try {
      const membership = await db.transaction(async (tx) => {
        await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
        await lockClass(tx, candidate.id);
        const found = await tx.select().from(classes).where(eq(classes.id, candidate.id)).limit(1);
        const record = found[0];
        if (!record || record.status !== 'OPEN' || record.invitationCodeHash !== codeHash) {
          throw new DomainError(400, 'JOIN_NOT_AVAILABLE', 'Kode undangan tidak tersedia.');
        }
        const inserted = await tx
          .insert(memberships)
          .values({ classId: record.id, userId: user.id })
          .returning();
        const joined = inserted[0]!;
        await tx.insert(auditEvents).values({
          action: 'CLASS_JOIN_SUCCEEDED',
          actorId: user.id,
          subjectId: record.id,
          details: { requestId: requestId(res), membershipId: joined.id },
        });
        return joined;
      });
      return res.status(201).json({ membership });
    } catch (error) {
      if (error instanceof DomainError && error.code === 'JOIN_NOT_AVAILABLE') return joinUnavailable(res, req, user.id);
      if (getPgErrorCode(error) === '23505') {
        return res.status(409).json({
          error: {
            code: 'ALREADY_MEMBER',
            message: 'Anda sudah menjadi anggota kelas ini.',
            ...(requestId(res) ? { requestId: requestId(res) } : {}),
          },
        });
      }
      if (isSerializationConflict(error)) {
        const existing = await db
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.classId, candidate.id), eq(memberships.userId, user.id)))
          .limit(1);
        if (existing[0]) {
          return res.status(409).json({
            error: {
              code: 'ALREADY_MEMBER',
              message: 'Anda sudah menjadi anggota kelas ini.',
              ...(requestId(res) ? { requestId: requestId(res) } : {}),
            },
          });
        }
        return res.status(409).json({
          error: {
            code: 'CONCURRENT_UPDATE',
            message: 'Kelas berubah bersamaan. Coba lagi.',
            ...(requestId(res) ? { requestId: requestId(res) } : {}),
          },
        });
      }
      throw error;
    }
  } catch (error) {
    if (isSerializationConflict(error)) return handle(next, res, fail(409, 'CONCURRENT_UPDATE', 'Kelas berubah bersamaan. Coba lagi.'));
    handle(next, res, error);
  }
});

router.post('/:id/close', csrf, requireRole('DOSEN'), async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req);
    const id = uuid.parse(req.params.id);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
      await lockClass(tx, id);
      const found = await tx
        .select()
        .from(classes)
        .where(and(eq(classes.id, id), eq(classes.ownerId, user.id)))
        .limit(1);
      const record = found[0];
      if (!record) throw fail(404, 'NOT_FOUND', 'Kelas tidak ditemukan.');
      if (record.status === 'CLOSED') throw fail(409, 'CLASS_CLOSED', 'Kelas sudah ditutup.');
      const updated = await tx
        .update(classes)
        .set({ status: 'CLOSED', updatedAt: new Date() })
        .where(eq(classes.id, id))
        .returning(classColumns);
      await tx.insert(auditEvents).values({
        action: 'CLASS_CLOSED',
        actorId: user.id,
        subjectId: id,
        details: { requestId: requestId(res) },
      });
      return updated[0]!;
    });
    return res.json({ class: safeClass(result) });
  } catch (error) {
    if (isSerializationConflict(error)) return handle(next, res, fail(409, 'CONCURRENT_UPDATE', 'Kelas berubah bersamaan. Coba lagi.'));
    handle(next, res, error);
  }
});

router.post('/:id/invitation-code', csrf, requireRole('DOSEN'), async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req);
    const id = uuid.parse(req.params.id);
    const originals = await db
      .select({ invitationCodeVersion: classes.invitationCodeVersion })
      .from(classes)
      .where(and(eq(classes.id, id), eq(classes.ownerId, user.id)))
      .limit(1);
    const original = originals[0];
    if (!original) throw fail(404, 'NOT_FOUND', 'Kelas tidak ditemukan.');

    const code = randomBytes(32).toString('base64url');
    const codeHash = digest(code);
    let issuedAt: Date;
    try {
      issuedAt = await db.transaction(async (tx) => {
        await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
        await lockClass(tx, id);
        const found = await tx
          .select()
          .from(classes)
          .where(and(eq(classes.id, id), eq(classes.ownerId, user.id)))
          .limit(1);
        const current = found[0];
        if (!current) throw fail(404, 'NOT_FOUND', 'Kelas tidak ditemukan.');
        if (current.status !== 'OPEN') throw fail(409, 'CLASS_CLOSED', 'Kode hanya dapat diterbitkan untuk kelas OPEN.');
        if (current.invitationCodeVersion !== original.invitationCodeVersion) {
          throw fail(409, 'CONCURRENT_UPDATE', 'Kode undangan berubah bersamaan. Coba lagi.');
        }
        const when = new Date();
        await tx
          .update(classes)
          .set({
            invitationCodeHash: codeHash,
            invitationCodeVersion: sql`${classes.invitationCodeVersion} + 1`,
            updatedAt: when,
          })
          .where(eq(classes.id, id));
        await tx.insert(auditEvents).values({
          action: current.invitationCodeHash ? 'CLASS_INVITATION_ROTATED' : 'CLASS_INVITATION_CREATED',
          actorId: user.id,
          subjectId: id,
          details: { requestId: requestId(res), version: current.invitationCodeVersion + 1 },
        });
        return when;
      });
    } catch (error) {
      if (getPgErrorCode(error) === '23505') throw fail(409, 'CONCURRENT_UPDATE', 'Rotasi kode undangan bertabrakan. Coba lagi.');
      if (isSerializationConflict(error)) throw fail(409, 'CONCURRENT_UPDATE', 'Rotasi kode undangan bertabrakan. Coba lagi.');
      throw error;
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ invitationCode: code, rotatedAt: issuedAt });
  } catch (error) {
    handle(next, res, error);
  }
});

router.get('/:id/members', requireRole('DOSEN'), async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req);
    const id = uuid.parse(req.params.id);
    const page = pageFrom(req.query);
    const owned = await db
      .select({ id: classes.id })
      .from(classes)
      .where(and(eq(classes.id, id), eq(classes.ownerId, user.id)))
      .limit(1);
    if (!owned[0]) throw fail(404, 'NOT_FOUND', 'Kelas tidak ditemukan.');

    const rows = await db
      .select({
        userId: memberships.userId,
        createdAt: memberships.createdAt,
        fullName: users.fullName,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.classId, id))
      .orderBy(desc(memberships.createdAt), desc(memberships.id))
      .limit(page.limit + 1)
      .offset(page.offset);

    return res.json({
      members: rows.slice(0, page.limit).map(({ userId, createdAt, fullName }) => ({ userId, fullName, createdAt })),
      page: { limit: page.limit, offset: page.offset, hasMore: rows.length > page.limit },
    });
  } catch (error) {
    handle(next, res, error);
  }
});

router.get('/:id/membership', requireRole('MAHASISWA'), async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req);
    const id = uuid.parse(req.params.id);
    const rows = await db
      .select({
        id: memberships.id,
        classId: memberships.classId,
        userId: memberships.userId,
        createdAt: memberships.createdAt,
      })
      .from(memberships)
      .where(and(eq(memberships.classId, id), eq(memberships.userId, user.id)))
      .limit(1);
    return res.json({ membership: rows[0] ?? null });
  } catch (error) {
    handle(next, res, error);
  }
});

router.use('/:classId/quizzes', classQuizzesRouter);
router.use('/:classId', communicationRouter);
router.use('/:classId', learningRouter);

export const classesRouter = router;
