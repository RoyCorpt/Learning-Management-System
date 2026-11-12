import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { AccountStatus, Role } from '@prisma/client';
import { prisma } from './lib/prisma.js';
import { env } from './config/env.js';
import { parseStudentRosterCsv, RosterCsvError } from './roster.js';

const SESSION_COOKIE = 'lms_session';
const CSRF_COOKIE = 'lms_csrf';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string) => {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
type AuthUser = { id: string; email: string; fullName: string; role: Role; status: AccountStatus; mustChangePassword: boolean };
type AuthRequest = Request & { auth?: AuthUser; sessionId?: string };
const passwordOptions = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const dummyHash = argon2.hash(randomBytes(32).toString('hex'), passwordOptions);

function cookies(res: Response, session: string, csrf: string) {
  const common = { secure: env.COOKIE_SECURE, sameSite: 'strict' as const, path: '/', maxAge: env.SESSION_TTL_HOURS * 3600_000 };
  res.cookie(SESSION_COOKIE, session, { ...common, httpOnly: true });
  res.cookie(CSRF_COOKIE, csrf, { ...common, httpOnly: false });
}

async function audit(action: string, actorId?: string, subjectId?: string) {
  await prisma.auditEvent.create({ data: { action, actorId: actorId ?? null, subjectId: subjectId ?? null } });
}

const credentials = z.object({ email: z.string().email().max(255), password: z.string().min(1).max(200) });
const router = Router();
const loginIpLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 50, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'LOGIN_RATE_LIMITED', message: 'Terlalu banyak percobaan. Coba lagi nanti.' } } });
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${digest(String(req.body?.email ?? '').trim().toLowerCase())}`, message: { error: { code: 'LOGIN_RATE_LIMITED', message: 'Terlalu banyak percobaan. Coba lagi nanti.' } } });
const registrationLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'REGISTRATION_RATE_LIMITED', message: 'Terlalu banyak permintaan. Coba lagi nanti.' } } });
class RegistrationUnavailableError extends Error {}

router.post('/register', registrationLimiter, async (req, res, next) => {
  try {
    const input = z.object({ email: z.string().email().max(255), nim: z.string().trim().min(1).max(30), password: z.string().min(12).max(200) }).parse(req.body);
    const email = input.email.trim().toLowerCase();
    const domain = email.split('@').at(-1)!;
    if (!env.STUDENT_EMAIL_DOMAINS.includes(domain)) return res.status(400).json({ error: { code: 'REGISTRATION_NOT_ALLOWED', message: 'Data pendaftaran tidak memenuhi syarat.' } });
    let userId: string;
    try {
      userId = await prisma.$transaction(async (tx) => {
        const roster = await tx.studentRoster.findMany({ where: { email: { equals: email, mode: 'insensitive' }, nim: input.nim, registrationEligible: true, registeredAt: null, registeredUserId: null }, take: 2 });
        if (roster.length !== 1 || await tx.user.findUnique({ where: { email } })) throw new RegistrationUnavailableError();
        const claimed = await tx.studentRoster.updateMany({ where: { id: roster[0]!.id, registrationEligible: true, registeredAt: null, registeredUserId: null }, data: { registeredAt: new Date() } });
        if (claimed.count !== 1) throw new RegistrationUnavailableError();
        const user = await tx.user.create({ data: { email, fullName: roster[0]!.fullName, passwordHash: await argon2.hash(input.password, passwordOptions), role: Role.MAHASISWA, status: AccountStatus.PENDING }, select: { id: true } });
        await tx.studentRoster.update({ where: { id: roster[0]!.id }, data: { registeredUserId: user.id } });
        await tx.auditEvent.create({ data: { action: 'AUTH_STUDENT_REGISTERED', subjectId: user.id } });
        return user.id;
      });
    } catch (error) {
      if (error instanceof RegistrationUnavailableError) return res.status(400).json({ error: { code: 'REGISTRATION_NOT_ALLOWED', message: 'Data pendaftaran tidak memenuhi syarat.' } });
      throw error;
    }
    return res.status(202).json({ status: 'PENDING', message: 'Pendaftaran diterima dan menunggu aktivasi Admin.' });
  } catch (error) { next(error); }
});

router.post('/login', loginIpLimiter, loginLimiter, async (req, res, next) => {
  try {
    const parsed = credentials.safeParse(req.body);
    const email = parsed.success ? parsed.data.email.trim().toLowerCase() : '';
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    const password = parsed.success ? parsed.data.password : randomBytes(24).toString('hex');
    const valid = user ? await argon2.verify(user.passwordHash, password).catch(() => false) : await argon2.verify(await dummyHash, password).catch(() => false);
    if (!valid || !user || user.status !== AccountStatus.ACTIVE) {
      await audit('AUTH_LOGIN_FAILED', user?.id);
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email atau kata sandi tidak valid.' } });
    }
    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3600_000);
    const session = await prisma.session.create({ data: { userId: user.id, tokenHash: digest(token), csrfHash: digest(csrf), expiresAt } });
    cookies(res, token, csrf);
    await audit('AUTH_LOGIN_SUCCEEDED', user.id);
    return res.json({ user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, mustChangePassword: user.mustChangePassword } });
  } catch (error) { next(error); }
});

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string') return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Autentikasi diperlukan.' } });
    const session = await prisma.session.findUnique({ where: { tokenHash: digest(token) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== AccountStatus.ACTIVE) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sesi tidak berlaku.' } });
    req.auth = { id: session.user.id, email: session.user.email, fullName: session.user.fullName, role: session.user.role, status: session.user.status, mustChangePassword: session.user.mustChangePassword };
    req.sessionId = session.id;
    next();
  } catch (error) { next(error); }
}

export async function csrf(req: AuthRequest, res: Response, next: NextFunction) {
  const cookie = req.cookies?.[CSRF_COOKIE]; const header = req.get('X-CSRF-Token');
  try {
    if (typeof cookie !== 'string' || typeof header !== 'string' || !req.sessionId || !equal(digest(cookie), digest(header))) return res.status(403).json({ error: { code: 'CSRF_INVALID', message: 'Token keamanan tidak valid.' } });
    const session = await prisma.session.findUnique({ where: { id: req.sessionId }, select: { csrfHash: true } });
    if (!session || !equal(session.csrfHash, digest(cookie))) return res.status(403).json({ error: { code: 'CSRF_INVALID', message: 'Token keamanan tidak valid.' } });
    next();
  } catch (error) { next(error); }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Akses tidak diizinkan.' } });
    next();
  };
}

router.post('/logout', authenticate, csrf, async (req: AuthRequest, res, next) => {
  try {
    if (!req.sessionId || !req.auth) return res.status(401).end();
    await prisma.$transaction(async (tx) => {
      await tx.session.update({ where: { id: req.sessionId! }, data: { revokedAt: new Date() } });
      await tx.auditEvent.create({ data: { action: 'AUTH_LOGOUT', actorId: req.auth!.id } });
    });
    res.clearCookie(SESSION_COOKIE, { path: '/', secure: env.COOKIE_SECURE, sameSite: 'strict' });
    res.clearCookie(CSRF_COOKIE, { path: '/', secure: env.COOKIE_SECURE, sameSite: 'strict' });
    res.status(204).end();
  } catch (error) { next(error); }
});
router.get('/me', authenticate, (req: AuthRequest, res) => res.json({ user: req.auth }));
router.post('/change-password', authenticate, csrf, async (req: AuthRequest, res, next) => {
  try {
    if (!req.auth) return res.status(401).end();
    const input = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(12).max(200) }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.id } });
    if (!await argon2.verify(user.passwordHash, input.currentPassword).catch(() => false)) return res.status(400).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Kata sandi saat ini tidak valid.' } });
    const passwordHash = await argon2.hash(input.newPassword, passwordOptions);
    const changed = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash },
        data: { passwordHash, mustChangePassword: false, authVersion: { increment: 1 } },
      });
      if (updated.count !== 1) return false;
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditEvent.create({ data: { action: 'AUTH_PASSWORD_CHANGED', actorId: user.id } });
      return true;
    });
    if (!changed) return res.status(409).json({ error: { code: 'PASSWORD_CHANGE_CONFLICT', message: 'Kata sandi atau sesi berubah. Silakan masuk kembali.' } });
    res.clearCookie(SESSION_COOKIE, { path: '/', secure: env.COOKIE_SECURE, sameSite: 'strict' });
    res.clearCookie(CSRF_COOKIE, { path: '/', secure: env.COOKIE_SECURE, sameSite: 'strict' });
    res.status(204).end();
  } catch (error) { next(error); }
});
router.use('/admin', authenticate, requireRole(Role.ADMIN));
router.get('/admin/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({ orderBy: [{ createdAt: 'desc' }], take: 200, select: { id: true, email: true, fullName: true, role: true, status: true, createdAt: true } });
    res.json({ users });
  } catch (error) { next(error); }
});
router.post('/admin/roster/import', csrf, async (req: AuthRequest, res, next) => {
  try {
    if (!req.auth) return res.status(401).end();
    const { csv } = z.object({ csv: z.string().min(1).max(1_000_000) }).parse(req.body);
    const entries = parseStudentRosterCsv(csv, env.STUDENT_EMAIL_DOMAINS);
    const summary = await prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      for (const entry of entries) {
        const existingByNim = await tx.studentRoster.findUnique({ where: { nim: entry.nim } });
        const existingByEmail = await tx.studentRoster.findFirst({ where: { email: { equals: entry.email, mode: 'insensitive' } } });
        if (existingByEmail && existingByEmail.id !== existingByNim?.id) throw new RosterCsvError('ROSTER_CONFLICT', 'NIM atau email bertentangan dengan roster yang tersimpan.');
        if (existingByNim) {
          await tx.studentRoster.update({ where: { id: existingByNim.id }, data: { email: entry.email, fullName: entry.fullName, registrationEligible: entry.registrationEligible } });
          updated += 1;
        } else {
          await tx.studentRoster.create({ data: entry });
          created += 1;
        }
      }
      await tx.auditEvent.create({ data: { actorId: req.auth!.id, action: 'ADMIN_ROSTER_IMPORTED', details: { rows: entries.length, created, updated } } });
      return { rows: entries.length, created, updated };
    });
    res.json({ status: 'ok', summary });
  } catch (error) { next(error); }
});
router.post('/admin/instructors', csrf, async (req: AuthRequest, res, next) => {
  try {
    if (!req.auth) return res.status(401).end();
    const input = z.object({ email: z.string().email().max(255), fullName: z.string().trim().min(1).max(150) }).parse(req.body);
    const email = input.email.trim().toLowerCase();
    const temporaryPassword = randomBytes(24).toString('base64url');
    const passwordHash = await argon2.hash(temporaryPassword, passwordOptions);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email, fullName: input.fullName, role: Role.DOSEN, status: AccountStatus.ACTIVE, mustChangePassword: true, passwordHash }, select: { id: true, email: true, fullName: true, role: true, status: true } });
      await tx.auditEvent.create({ data: { action: 'ADMIN_INSTRUCTOR_CREATED', actorId: req.auth!.id, subjectId: created.id } });
      return created;
    });
    res.status(201).json({ user, temporaryPassword, mustChangePassword: true });
  } catch (error) { next(error); }
});
router.patch('/admin/users/:id/status', csrf, async (req: AuthRequest, res, next) => {
  try {
    if (!req.auth) return res.status(401).end();
    const { status } = z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING']) }).parse(req.body);
    const userId = req.params.id;
    if (!userId) return res.status(400).end();
    if (userId === req.auth.id && status !== AccountStatus.ACTIVE) return res.status(400).json({ error: { code: 'INVALID_STATUS_CHANGE', message: 'Admin tidak dapat menonaktifkan akunnya sendiri.' } });
    const outcome = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
      if (!target) return { missing: true as const };
      if (target.role === Role.ADMIN && status !== AccountStatus.ACTIVE && await tx.user.count({ where: { role: Role.ADMIN, status: AccountStatus.ACTIVE } }) <= 1) return { lastAdmin: true as const };
      const user = await tx.user.update({ where: { id: userId }, data: { status, authVersion: { increment: 1 } }, select: { id: true, email: true, role: true, status: true } });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditEvent.create({ data: { action: 'ADMIN_ACCOUNT_STATUS_CHANGED', actorId: req.auth!.id, subjectId: user.id } });
      return { user };
    }, { isolationLevel: 'Serializable' });
    if ('missing' in outcome) return res.status(404).end();
    if ('lastAdmin' in outcome) return res.status(409).json({ error: { code: 'LAST_ACTIVE_ADMIN', message: 'Minimal satu akun Admin aktif harus tersedia.' } });
    const { user } = outcome;
    res.json({ user });
  } catch (error) { next(error); }
});
router.patch('/admin/users/:id/role', csrf, async (req: AuthRequest, res, next) => {
  try {
    if (!req.auth) return res.status(401).end();
    const userId = req.params.id;
    if (!userId) return res.status(400).end();
    const { role } = z.object({ role: z.nativeEnum(Role) }).parse(req.body);
    if (userId === req.auth.id && role !== Role.ADMIN) return res.status(400).json({ error: { code: 'INVALID_ROLE_CHANGE', message: 'Admin tidak dapat menghapus peran Admin miliknya sendiri.' } });
    const temporaryPassword = role === Role.DOSEN ? randomBytes(24).toString('base64url') : undefined;
    const passwordHash = temporaryPassword ? await argon2.hash(temporaryPassword, passwordOptions) : undefined;
    const outcome = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
      if (!target) return { missing: true as const };
      if (target.role === Role.ADMIN && role !== Role.ADMIN && target.status === AccountStatus.ACTIVE && await tx.user.count({ where: { role: Role.ADMIN, status: AccountStatus.ACTIVE } }) <= 1) return { lastAdmin: true as const };
      const user = await tx.user.update({ where: { id: userId }, data: { role, authVersion: { increment: 1 }, mustChangePassword: role === Role.DOSEN, ...(passwordHash ? { passwordHash } : {}) }, select: { id: true, email: true, role: true, status: true } });
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditEvent.create({ data: { action: 'ADMIN_ACCOUNT_ROLE_CHANGED', actorId: req.auth!.id, subjectId: user.id } });
      return { user };
    }, { isolationLevel: 'Serializable' });
    if ('missing' in outcome) return res.status(404).end();
    if ('lastAdmin' in outcome) return res.status(409).json({ error: { code: 'LAST_ACTIVE_ADMIN', message: 'Minimal satu akun Admin aktif harus tersedia.' } });
    const { user } = outcome;
    res.json({ user, ...(temporaryPassword ? { temporaryPassword, mustChangePassword: true } : {}) });
  } catch (error) { next(error); }
});

export { router as authRouter };
