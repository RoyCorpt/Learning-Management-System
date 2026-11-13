import { createHash, randomBytes } from 'node:crypto';
import { Prisma, Role, type Class as ClassRecord } from '@prisma/client';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, csrf, requireRole } from './auth.js';
import { prisma } from './lib/prisma.js';

type Principal = { id: string; role: Role };
type ClassRequest = Request & { auth?: Principal };
type Page = { limit: number; offset: number; hasMore: boolean };
const router = Router();
const classSelect = { id: true, name: true, description: true, status: true, ownerId: true, createdAt: true } as const;
const digest = (code: string) => createHash('sha256').update(code, 'utf8').digest('hex');
const uuid = z.string().uuid();
const cleanName = z.string().transform((s) => s.trim()).refine((s) => Array.from(s).length >= 1 && Array.from(s).length <= 120);
const cleanDescription = z.string().transform((s) => s.trim()).refine((s) => Array.from(s).length <= 2000).transform((s) => s || null).nullable();
const createSchema = z.object({ name: cleanName, description: cleanDescription.optional() }).strict();
const patchSchema = z.object({ name: cleanName.optional(), description: cleanDescription.optional() }).strict().refine((v) => Object.keys(v).length > 0);
const joinSchema = z.object({ invitationCode: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const pageSchema = z.object({ limit: z.string().regex(/^\d+$/).optional(), offset: z.string().regex(/^\d+$/).optional() });

class DomainError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
function isSerializationConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && (
    error.code === 'P2034' || (error.code === 'P2010' && (error.message.includes('40001') || String(error.meta?.code ?? '') === '40001'))
  );
}
const fail = (status: number, code: string, message = code) => new DomainError(status, code, message);
function sendError(res: Response, error: unknown) {
  const id = res.locals.requestId as string | undefined;
  if (error instanceof DomainError) return res.status(error.status).json({ error: { code: error.code, message: error.message, ...(id ? { requestId: id } : {}) } });
  return undefined;
}
function handle(next: NextFunction, res: Response, error: unknown) { if (!sendError(res, error)) next(error); }
const actor = (req: ClassRequest) => {
  if (!req.auth) throw fail(401, 'UNAUTHENTICATED', 'Autentikasi diperlukan.');
  return req.auth;
};
function requestId(res: Response) { return res.locals.requestId as string | undefined; }
function pageFrom(query: Request['query']): Page {
  const parsed = pageSchema.parse(query);
  const limit = parsed.limit === undefined ? 50 : Number(parsed.limit);
  const offset = parsed.offset === undefined ? 0 : Number(parsed.offset);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) throw fail(400, 'INVALID_INPUT', 'Parameter halaman tidak valid.');
  return { limit, offset, hasMore: false };
}
function safeClass(record: Pick<ClassRecord, 'id' | 'name' | 'description' | 'status' | 'ownerId' | 'createdAt'>) {
  return { id: record.id, name: record.name, description: record.description, status: record.status, ownerId: record.ownerId, createdAt: record.createdAt };
}
async function lockClass(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM classes WHERE id = ${id}::uuid FOR UPDATE`;
}
const attempts = new Map<string, number[]>();
const WINDOW = 15 * 60_000;
function throttle(req: Request, userId: string) {
  const now = Date.now(); const ip = req.ip ?? 'unknown';
  for (const [key, dates] of attempts) { const recent = dates.filter((at) => at > now - WINDOW); if (recent.length) attempts.set(key, recent); else attempts.delete(key); }
  const ipKey = `ip:${ip}`; const userKey = `user:${userId}`;
  const byIp = attempts.get(ipKey) ?? []; const byUser = attempts.get(userKey) ?? [];
  const oldest = Math.max(byIp.length >= 30 ? byIp[0]! : 0, byUser.length >= 10 ? byUser[0]! : 0);
  if (oldest) return Math.max(1, Math.ceil((oldest + WINDOW - now) / 1000));
  return 0;
}
function recordFailure(req: Request, userId: string) {
  const now = Date.now(); const ipKey = `ip:${req.ip ?? 'unknown'}`; const userKey = `user:${userId}`;
  attempts.set(ipKey, [...(attempts.get(ipKey) ?? []).filter((at) => at > now - WINDOW), now]);
  attempts.set(userKey, [...(attempts.get(userKey) ?? []).filter((at) => at > now - WINDOW), now]);
}
function joinUnavailable(res: Response, req: Request, userId: string) {
  recordFailure(req, userId);
  return res.status(400).json({ error: { code: 'JOIN_NOT_AVAILABLE', message: 'Kode undangan tidak tersedia.', ...(requestId(res) ? { requestId: requestId(res) } : {}) } });
}

router.use(authenticate);
router.get('/', (req: ClassRequest, res, next) => {
  try {
    const user = actor(req); if (user.role === Role.ADMIN) throw fail(403, 'FORBIDDEN', 'Akses tidak diizinkan.');
    const page = pageFrom(req.query);
    void (async () => {
      const where = user.role === Role.DOSEN ? { ownerId: user.id } : { memberships: { some: { userId: user.id } } };
      const rows = await prisma.class.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: page.offset, take: page.limit + 1, select: classSelect });
      const hasMore = rows.length > page.limit; res.json({ classes: rows.slice(0, page.limit).map(safeClass), page: { limit: page.limit, offset: page.offset, hasMore } });
    })().catch(next);
  } catch (error) { handle(next, res, error); }
});

router.post('/', csrf, requireRole(Role.DOSEN), async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req); const input = createSchema.parse(req.body);
    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.class.create({ data: { ownerId: user.id, name: input.name, description: input.description ?? null } });
      await tx.auditEvent.create({ data: { action: 'CLASS_CREATED', actorId: user.id, subjectId: record.id, details: { requestId: requestId(res) } } });
      return record;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return res.status(201).json({ class: safeClass(created) });
  } catch (error) { handle(next, res, error); }
});

router.get('/:id', async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req); if (user.role === Role.ADMIN) throw fail(403, 'FORBIDDEN', 'Akses tidak diizinkan.');
    const id = uuid.parse(req.params.id);
    const record = user.role === Role.DOSEN
      ? await prisma.class.findFirst({ where: { id, ownerId: user.id }, select: classSelect })
      : await prisma.class.findFirst({ where: { id, memberships: { some: { userId: user.id } } }, select: classSelect });
    if (!record) throw fail(404, 'NOT_FOUND', 'Kelas tidak ditemukan.');
    return res.json({ class: safeClass(record) });
  } catch (error) { handle(next, res, error); }
});

router.patch('/:id', csrf, requireRole(Role.DOSEN), async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req); const id = uuid.parse(req.params.id); const input = patchSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      await lockClass(tx, id);
      const before = await tx.class.findFirst({ where: { id, ownerId: user.id } });
      if (!before) throw fail(404, 'NOT_FOUND', 'Kelas tidak ditemukan.');
      const updated = await tx.class.update({ where: { id }, data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      } });
      await tx.auditEvent.create({ data: { action: 'CLASS_UPDATED', actorId: user.id, subjectId: id, details: { requestId: requestId(res), fields: Object.keys(input).sort() } } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return res.json({ class: safeClass(result) });
  } catch (error) { handle(next, res, error); }
});

router.post('/join', csrf, requireRole(Role.MAHASISWA), async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req);
    const retry = throttle(req, user.id);
    if (retry) { res.setHeader('Retry-After', String(retry)); return res.status(429).json({ error: { code: 'JOIN_RATE_LIMITED', message: 'Terlalu banyak percobaan. Coba lagi nanti.', ...(requestId(res) ? { requestId: requestId(res) } : {}) } }); }
    const body = joinSchema.safeParse(req.body);
    if (!body.success) return joinUnavailable(res, req, user.id);
    const codeHash = digest(body.data.invitationCode);
    const candidate = await prisma.class.findUnique({ where: { invitationCodeHash: codeHash }, select: { id: true } });
    if (!candidate) return joinUnavailable(res, req, user.id);
    try {
      const membership = await prisma.$transaction(async (tx) => {
        await lockClass(tx, candidate.id);
        const record = await tx.class.findUnique({ where: { id: candidate.id } });
        if (!record || record.status !== 'OPEN' || record.invitationCodeHash !== codeHash) throw new DomainError(400, 'JOIN_NOT_AVAILABLE', 'Kode undangan tidak tersedia.');
        const joined = await tx.membership.create({ data: { classId: record.id, userId: user.id } });
        await tx.auditEvent.create({ data: { action: 'CLASS_JOIN_SUCCEEDED', actorId: user.id, subjectId: record.id, details: { requestId: requestId(res), membershipId: joined.id } } });
        return joined;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return res.status(201).json({ membership });
    } catch (error) {
      if (error instanceof DomainError && error.code === 'JOIN_NOT_AVAILABLE') return joinUnavailable(res, req, user.id);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ error: { code: 'ALREADY_MEMBER', message: 'Anda sudah menjadi anggota kelas ini.', ...(requestId(res) ? { requestId: requestId(res) } : {}) } });
      if (isSerializationConflict(error)) {
        if (await prisma.membership.findUnique({ where: { classId_userId: { classId: candidate.id, userId: user.id } }, select: { id: true } })) return res.status(409).json({ error: { code: 'ALREADY_MEMBER', message: 'Anda sudah menjadi anggota kelas ini.', ...(requestId(res) ? { requestId: requestId(res) } : {}) } });
        return res.status(409).json({ error: { code: 'CONCURRENT_UPDATE', message: 'Kelas berubah bersamaan. Coba lagi.', ...(requestId(res) ? { requestId: requestId(res) } : {}) } });
      }
      throw error;
    }
  } catch (error) {
    if (isSerializationConflict(error)) return handle(next, res, fail(409, 'CONCURRENT_UPDATE', 'Kelas berubah bersamaan. Coba lagi.'));
    handle(next, res, error);
  }
});

router.post('/:id/close', csrf, requireRole(Role.DOSEN), async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req); const id = uuid.parse(req.params.id);
    const result = await prisma.$transaction(async (tx) => {
      await lockClass(tx, id);
      const record = await tx.class.findFirst({ where: { id, ownerId: user.id } });
      if (!record) throw fail(404, 'NOT_FOUND', 'Kelas tidak ditemukan.');
      if (record.status === 'CLOSED') throw fail(409, 'CLASS_CLOSED', 'Kelas sudah ditutup.');
      const closed = await tx.class.update({ where: { id }, data: { status: 'CLOSED' } });
      await tx.auditEvent.create({ data: { action: 'CLASS_CLOSED', actorId: user.id, subjectId: id, details: { requestId: requestId(res) } } });
      return closed;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return res.json({ class: safeClass(result) });
  } catch (error) {
    if (isSerializationConflict(error)) return handle(next, res, fail(409, 'CONCURRENT_UPDATE', 'Kelas berubah bersamaan. Coba lagi.'));
    handle(next, res, error);
  }
});

router.post('/:id/invitation-code', csrf, requireRole(Role.DOSEN), async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req); const id = uuid.parse(req.params.id);
    const original = await prisma.class.findFirst({ where: { id, ownerId: user.id }, select: { invitationCodeVersion: true } });
    if (!original) throw fail(404, 'NOT_FOUND', 'Kelas tidak ditemukan.');
    const code = randomBytes(32).toString('base64url'); const codeHash = digest(code);
    let issuedAt: Date;
    try {
      issuedAt = await prisma.$transaction(async (tx) => {
        await lockClass(tx, id);
        const current = await tx.class.findFirst({ where: { id, ownerId: user.id } });
        if (!current) throw fail(404, 'NOT_FOUND', 'Kelas tidak ditemukan.');
        if (current.status !== 'OPEN') throw fail(409, 'CLASS_CLOSED', 'Kode hanya dapat diterbitkan untuk kelas OPEN.');
        if (current.invitationCodeVersion !== original.invitationCodeVersion) throw fail(409, 'CONCURRENT_UPDATE', 'Kode undangan berubah bersamaan. Coba lagi.');
        const when = new Date();
        await tx.class.update({ where: { id }, data: { invitationCodeHash: codeHash, invitationCodeVersion: { increment: 1 } } });
        await tx.auditEvent.create({ data: { action: current.invitationCodeHash ? 'CLASS_INVITATION_ROTATED' : 'CLASS_INVITATION_CREATED', actorId: user.id, subjectId: id, details: { requestId: requestId(res), version: current.invitationCodeVersion + 1 } } });
        return when;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw fail(409, 'CONCURRENT_UPDATE', 'Rotasi kode undangan bertabrakan. Coba lagi.');
      if (isSerializationConflict(error)) throw fail(409, 'CONCURRENT_UPDATE', 'Rotasi kode undangan bertabrakan. Coba lagi.');
      throw error;
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ invitationCode: code, rotatedAt: issuedAt });
  } catch (error) { handle(next, res, error); }
});

router.get('/:id/members', requireRole(Role.DOSEN), async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req); const id = uuid.parse(req.params.id); const page = pageFrom(req.query);
    if (!await prisma.class.findFirst({ where: { id, ownerId: user.id }, select: { id: true } })) throw fail(404, 'NOT_FOUND', 'Kelas tidak ditemukan.');
    const rows = await prisma.membership.findMany({ where: { classId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: page.offset, take: page.limit + 1, select: { userId: true, createdAt: true, user: { select: { fullName: true } } } });
    return res.json({ members: rows.slice(0, page.limit).map(({ userId, createdAt, user: member }) => ({ userId, fullName: member.fullName, createdAt })), page: { limit: page.limit, offset: page.offset, hasMore: rows.length > page.limit } });
  } catch (error) { handle(next, res, error); }
});

router.get('/:id/membership', requireRole(Role.MAHASISWA), async (req: ClassRequest, res, next) => {
  try {
    const user = actor(req); const id = uuid.parse(req.params.id);
    const membership = await prisma.membership.findUnique({ where: { classId_userId: { classId: id, userId: user.id } }, select: { id: true, classId: true, userId: true, createdAt: true } });
    return res.json({ membership });
  } catch (error) { handle(next, res, error); }
});

export const classesRouter = router;
