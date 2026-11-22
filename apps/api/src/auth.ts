import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Algorithm, hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { and, asc, count, desc, eq, gt, ilike, isNull, or, sql } from 'drizzle-orm';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../../../src/db/index.js';
import {
  auditEvents,
  passwordResetTokens,
  sessions,
  studentRoster,
  users,
  type AccountStatus,
  type Role,
} from '../../../src/db/schema.js';
import { env, type AppEnv } from './config/env.js';
import {
  buildPasswordResetUrl,
  isPasswordResetEmailDeliveryConfigured,
  MailDeliveryError,
  sendPasswordResetEmail,
} from './lib/mailer.js';
import {
  consumeRateLimit,
  deriveAccountRateLimitKey,
  deriveIpRateLimitKey,
  normalizeEmailForRateLimit,
  type RateLimitResult,
} from './lib/rate-limit.js';
import { formatStudentRosterCsv, parseStudentRosterCsv, RosterCsvError } from './roster.js';

const SESSION_COOKIE = 'lms_session';
const CSRF_COOKIE = 'lms_csrf';
const ROLES = ['ADMIN', 'DOSEN', 'MAHASISWA'] as const;
const ACCOUNT_STATUSES = ['ACTIVE', 'INACTIVE', 'PENDING'] as const;

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: AccountStatus;
  mustChangePassword: boolean;
};

type AuthRequest = Request & { auth?: AuthUser; sessionId?: string; sessionHeaderAuth?: boolean };

const passwordOptions = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const dummyHash = argon2Hash(randomBytes(32).toString('hex'), passwordOptions);

export function buildCookieOptions(
  isSecureRequest: boolean,
  runtimeEnv: Pick<AppEnv, 'COOKIE_SECURE' | 'COOKIE_SAME_SITE'> = env,
) {
  const secure = runtimeEnv.COOKIE_SECURE || isSecureRequest;
  return {
    secure,
    sameSite: runtimeEnv.COOKIE_SAME_SITE,
    path: '/',
  } as const;
}

function setPasswordResetSecurityHeaders(res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function applyRateLimitHeaders(res: Response, result: RateLimitResult) {
  res.setHeader('RateLimit-Limit', String(result.limit));
  res.setHeader('RateLimit-Remaining', String(result.remaining));
  res.setHeader('RateLimit-Reset', String(result.retryAfterSeconds));
}

export function escapeLikePattern(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

async function audit(action: string, actorId?: string, subjectId?: string) {
  await db.insert(auditEvents).values({
    action,
    actorId: actorId ?? null,
    subjectId: subjectId ?? null,
  });
}

const credentials = z.object({ email: z.string().email().max(255), password: z.string().min(1).max(200) });

export function createAuthRouter(runtimeEnv: AppEnv = env) {
function cookieOptions(req: Request) {
  return buildCookieOptions(req.secure, runtimeEnv);
}

function cookies(req: Request, res: Response, session: string, csrfToken: string) {
  const common = { ...cookieOptions(req), maxAge: runtimeEnv.SESSION_TTL_HOURS * 3600_000 };
  res.cookie(SESSION_COOKIE, session, { ...common, httpOnly: true });
  res.cookie(CSRF_COOKIE, csrfToken, { ...common, httpOnly: false });
}

function clearAuthCookies(req: Request, res: Response) {
  const base = cookieOptions(req);
  res.clearCookie(SESSION_COOKIE, { ...base, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
}

const router = Router();
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'LOGIN_RATE_LIMITED', message: 'Terlalu banyak percobaan. Coba lagi nanti.' } },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${digest(String(req.body?.email ?? '').trim().toLowerCase())}`,
  message: { error: { code: 'LOGIN_RATE_LIMITED', message: 'Terlalu banyak percobaan. Coba lagi nanti.' } },
});
const registrationLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'REGISTRATION_RATE_LIMITED', message: 'Terlalu banyak permintaan. Coba lagi nanti.' } },
});

class RegistrationUnavailableError extends Error {}
class InvalidResetTokenError extends Error {}

router.post('/register', registrationLimiter, async (req, res, next) => {
  try {
    const input = z.object({
      email: z.string().email().max(255),
      nim: z.string().trim().min(1).max(30),
      password: z.string().min(12).max(200),
    }).parse(req.body);
    const email = input.email.trim().toLowerCase();
    const domain = email.split('@').at(-1)!;
    if (!runtimeEnv.STUDENT_EMAIL_DOMAINS.includes(domain)) {
      return res.status(400).json({ error: { code: 'REGISTRATION_NOT_ALLOWED', message: 'Data pendaftaran tidak memenuhi syarat.' } });
    }

    const passwordHash = await argon2Hash(input.password, passwordOptions);
    try {
      await db.transaction(async (tx) => {
        const roster = await tx
          .select()
          .from(studentRoster)
          .where(
            and(
              ilike(studentRoster.email, email),
              eq(studentRoster.nim, input.nim),
              eq(studentRoster.registrationEligible, true),
              isNull(studentRoster.registeredAt),
              isNull(studentRoster.registeredUserId),
            ),
          )
          .limit(2);

        const existingUser = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
        if (roster.length !== 1 || existingUser[0]) throw new RegistrationUnavailableError();

        const claimed = await tx
          .update(studentRoster)
          .set({ registeredAt: new Date() })
          .where(
            and(
              eq(studentRoster.id, roster[0]!.id),
              eq(studentRoster.registrationEligible, true),
              isNull(studentRoster.registeredAt),
              isNull(studentRoster.registeredUserId),
            ),
          )
          .returning({ id: studentRoster.id });

        if (claimed.length !== 1) throw new RegistrationUnavailableError();

        const insertedUsers = await tx
          .insert(users)
          .values({
            email,
            fullName: roster[0]!.fullName,
            passwordHash,
            role: 'MAHASISWA',
            status: 'PENDING',
          })
          .returning({ id: users.id });

        const createdUser = insertedUsers[0]!;
        await tx
          .update(studentRoster)
          .set({ registeredUserId: createdUser.id })
          .where(eq(studentRoster.id, roster[0]!.id));

        await tx.insert(auditEvents).values({
          action: 'AUTH_STUDENT_REGISTERED',
          subjectId: createdUser.id,
        });
      });
    } catch (error) {
      if (error instanceof RegistrationUnavailableError) {
        return res.status(400).json({ error: { code: 'REGISTRATION_NOT_ALLOWED', message: 'Data pendaftaran tidak memenuhi syarat.' } });
      }
      throw error;
    }

    return res.status(202).json({ status: 'PENDING', message: 'Pendaftaran diterima dan menunggu aktivasi Admin.' });
  } catch (error) {
    next(error);
  }
});

router.post('/login', loginIpLimiter, loginLimiter, async (req, res, next) => {
  try {
    const parsed = credentials.safeParse(req.body);
    const email = parsed.success ? parsed.data.email.trim().toLowerCase() : '';
    const foundUsers = email ? await db.select().from(users).where(eq(users.email, email)).limit(1) : [];
    const user = foundUsers[0] ?? null;
    const password = parsed.success ? parsed.data.password : randomBytes(24).toString('hex');
    const valid = user
      ? await argon2Verify(user.passwordHash, password).catch(() => false)
      : await argon2Verify(await dummyHash, password).catch(() => false);

    if (!valid || !user || user.status !== 'ACTIVE') {
      await audit('AUTH_LOGIN_FAILED', user?.id);
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email atau kata sandi tidak valid.' } });
    }

    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + runtimeEnv.SESSION_TTL_HOURS * 3600_000);
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: digest(token),
      csrfHash: digest(csrfToken),
      expiresAt,
    });
    cookies(req, res, token, csrfToken);
    await audit('AUTH_LOGIN_SUCCEEDED', user.id);
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
      sessionToken: token,
      csrfToken,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  setPasswordResetSecurityHeaders(res);
  try {
    const input = z.object({ email: z.string().trim().email().max(255) }).parse(req.body);
    const email = normalizeEmailForRateLimit(input.email);
    const windowMs = runtimeEnv.PASSWORD_RESET_WINDOW_MINUTES * 60_000;

    const ipRate = await consumeRateLimit({
      bucketKey: deriveIpRateLimitKey('fp', req.ip ?? ''),
      limit: runtimeEnv.PASSWORD_RESET_IP_LIMIT,
      windowMs,
    });
    const accountRate = await consumeRateLimit({
      bucketKey: deriveAccountRateLimitKey('fp', email),
      limit: runtimeEnv.PASSWORD_RESET_ACCOUNT_LIMIT,
      windowMs,
    });

    const strictest = !ipRate.allowed && !accountRate.allowed
      ? (ipRate.retryAfterSeconds >= accountRate.retryAfterSeconds ? ipRate : accountRate)
      : !ipRate.allowed
        ? ipRate
        : !accountRate.allowed
          ? accountRate
          : accountRate;

    applyRateLimitHeaders(res, strictest);
    if (!ipRate.allowed || !accountRate.allowed) {
      res.setHeader('Retry-After', String(strictest.retryAfterSeconds));
      return res.status(429).json({
        error: {
          code: 'PASSWORD_RESET_RATE_LIMITED',
          message: 'Terlalu banyak permintaan atur ulang kata sandi. Coba lagi nanti.',
        },
      });
    }

    if (!isPasswordResetEmailDeliveryConfigured(runtimeEnv)) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'password_reset_delivery_unconfigured',
          requestId: res.locals.requestId,
        }),
      );
      return res.status(503).json({
        error: {
          code: 'EMAIL_DELIVERY_FAILED',
          message: 'Layanan pengiriman email sedang tidak tersedia. Silakan coba lagi nanti.',
          requestId: res.locals.requestId,
        },
      });
    }

    const genericMessage = 'Jika email terdaftar dan aktif, tautan atur ulang kata sandi telah dikirim.';
    const foundUsers = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = foundUsers[0];
    if (!user || user.status !== 'ACTIVE') {
      return res.status(200).json({ message: genericMessage });
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = digest(rawToken);
    const expiresAt = new Date(Date.now() + runtimeEnv.PASSWORD_RESET_TTL_MINUTES * 60_000);

    const createdToken = await db.transaction(async (tx) => {
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));

      const inserted = await tx
        .insert(passwordResetTokens)
        .values({
          userId: user.id,
          tokenHash,
          expiresAt,
        })
        .returning({ id: passwordResetTokens.id });

      await tx.insert(auditEvents).values({
        action: 'AUTH_PASSWORD_RESET_REQUESTED',
        actorId: user.id,
        subjectId: user.id,
      });

      return inserted[0]!;
    });

    try {
      await sendPasswordResetEmail(
        {
          to: user.email,
          fullName: user.fullName,
          resetUrl: buildPasswordResetUrl(rawToken, runtimeEnv.WEB_ORIGIN),
          expiresInMinutes: runtimeEnv.PASSWORD_RESET_TTL_MINUTES,
        },
        runtimeEnv,
      );
    } catch (mailError) {
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, createdToken.id))
        .catch(() => undefined);

      console.error(
        JSON.stringify({
          level: 'error',
          event: 'password_reset_email_failed',
          requestId: res.locals.requestId,
          errorType: mailError instanceof MailDeliveryError ? 'MAIL_DELIVERY_ERROR' : 'UNEXPECTED_MAIL_ERROR',
        }),
      );
      return res.status(503).json({
        error: {
          code: 'EMAIL_DELIVERY_FAILED',
          message: 'Layanan pengiriman email sedang tidak tersedia. Silakan coba lagi nanti.',
          requestId: res.locals.requestId,
        },
      });
    }

    return res.status(200).json({ message: genericMessage });
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password/verify', async (req, res, next) => {
  setPasswordResetSecurityHeaders(res);
  try {
    const verifyRate = await consumeRateLimit({
      bucketKey: deriveIpRateLimitKey('rp_verify', req.ip ?? ''),
      limit: Math.max(runtimeEnv.PASSWORD_RESET_IP_LIMIT, 30),
      windowMs: runtimeEnv.PASSWORD_RESET_WINDOW_MINUTES * 60_000,
    });
    applyRateLimitHeaders(res, verifyRate);
    if (!verifyRate.allowed) {
      res.setHeader('Retry-After', String(verifyRate.retryAfterSeconds));
      return res.status(429).json({
        error: {
          code: 'PASSWORD_RESET_RATE_LIMITED',
          message: 'Terlalu banyak percobaan verifikasi tautan atur ulang kata sandi. Coba lagi nanti.',
        },
      });
    }

    const parsed = z.object({ token: z.string().trim().min(16).max(300) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'INVALID_RESET_TOKEN', message: 'Tautan atur ulang kata sandi tidak valid atau sudah kedaluwarsa.' },
      });
    }

    const rows = await db
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .innerJoin(users, eq(passwordResetTokens.userId, users.id))
      .where(
        and(
          eq(passwordResetTokens.tokenHash, digest(parsed.data.token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
          eq(users.status, 'ACTIVE'),
        ),
      )
      .limit(1);

    if (!rows[0]) {
      return res.status(400).json({
        error: { code: 'INVALID_RESET_TOKEN', message: 'Tautan atur ulang kata sandi tidak valid atau sudah kedaluwarsa.' },
      });
    }

    return res.status(200).json({ valid: true });
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', async (req, res, next) => {
  setPasswordResetSecurityHeaders(res);
  try {
    const resetRate = await consumeRateLimit({
      bucketKey: deriveIpRateLimitKey('rp', req.ip ?? ''),
      limit: runtimeEnv.PASSWORD_RESET_IP_LIMIT,
      windowMs: runtimeEnv.PASSWORD_RESET_WINDOW_MINUTES * 60_000,
    });
    applyRateLimitHeaders(res, resetRate);
    if (!resetRate.allowed) {
      res.setHeader('Retry-After', String(resetRate.retryAfterSeconds));
      return res.status(429).json({
        error: {
          code: 'PASSWORD_RESET_RATE_LIMITED',
          message: 'Terlalu banyak percobaan atur ulang kata sandi. Coba lagi nanti.',
        },
      });
    }

    const input = z.object({
      token: z.string().trim().min(16).max(300),
      newPassword: z.string().min(12).max(200),
    }).parse(req.body);

    const passwordHash = await argon2Hash(input.newPassword, passwordOptions);

    try {
      await db.transaction(async (tx) => {
        const now = new Date();
        const claimed = await tx
          .update(passwordResetTokens)
          .set({ usedAt: now })
          .where(
            and(
              eq(passwordResetTokens.tokenHash, digest(input.token)),
              isNull(passwordResetTokens.usedAt),
              gt(passwordResetTokens.expiresAt, now),
            ),
          )
          .returning({ id: passwordResetTokens.id, userId: passwordResetTokens.userId });

        const tokenRecord = claimed[0];
        if (!tokenRecord) {
          throw new InvalidResetTokenError();
        }

        const updatedUsers = await tx
          .update(users)
          .set({
            passwordHash,
            mustChangePassword: false,
            authVersion: sql`${users.authVersion} + 1`,
            updatedAt: now,
          })
          .where(and(eq(users.id, tokenRecord.userId), eq(users.status, 'ACTIVE')))
          .returning({ id: users.id });

        if (updatedUsers.length !== 1) {
          throw new InvalidResetTokenError();
        }

        await tx
          .update(passwordResetTokens)
          .set({ usedAt: now })
          .where(and(eq(passwordResetTokens.userId, tokenRecord.userId), isNull(passwordResetTokens.usedAt)));

        await tx
          .update(sessions)
          .set({ revokedAt: now })
          .where(and(eq(sessions.userId, tokenRecord.userId), isNull(sessions.revokedAt)));

        await tx.insert(auditEvents).values({
          action: 'AUTH_PASSWORD_RESET_COMPLETED',
          actorId: tokenRecord.userId,
          subjectId: tokenRecord.userId,
        });
      });
    } catch (error) {
      if (error instanceof InvalidResetTokenError) {
        return res.status(400).json({
          error: { code: 'INVALID_RESET_TOKEN', message: 'Tautan atur ulang kata sandi tidak valid atau sudah kedaluwarsa.' },
        });
      }
      throw error;
    }

    clearAuthCookies(req, res);
    return res.status(200).json({
      message: 'Kata sandi berhasil diatur ulang. Silakan masuk dengan kata sandi baru Anda.',
    });
  } catch (error) {
    next(error);
  }
});

  registerAuthenticatedAuthRoutes(router, runtimeEnv);
  return router;
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const cookieToken = req.cookies?.[SESSION_COOKIE];
    const authHeader = req.headers.authorization;
    const headerSessionToken = authHeader && authHeader.startsWith('Session ')
      ? authHeader.slice('Session '.length).trim()
      : undefined;
    const sessionToken = typeof cookieToken === 'string' ? cookieToken : headerSessionToken;

    if (typeof sessionToken === 'string' && sessionToken.length > 0) {
      const rows = await db
        .select({ session: sessions, user: users })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(eq(sessions.tokenHash, digest(sessionToken)))
        .limit(1);

      const row = rows[0];
      if (!row || row.session.revokedAt || row.session.expiresAt <= new Date() || row.user.status !== 'ACTIVE') {
        return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sesi tidak berlaku.' } });
      }
      req.auth = {
        id: row.user.id,
        email: row.user.email,
        fullName: row.user.fullName,
        role: row.user.role,
        status: row.user.status,
        mustChangePassword: row.user.mustChangePassword,
      };
      req.sessionId = row.session.id;
      req.sessionHeaderAuth = typeof cookieToken !== 'string' && Boolean(headerSessionToken);
      return next();
    }

    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Autentikasi diperlukan.' } });
  } catch (error) {
    next(error);
  }
}

export async function csrf(req: AuthRequest, res: Response, next: NextFunction) {
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get('X-CSRF-Token');
  try {
    const tokenToVerify = typeof cookie === 'string'
      ? (typeof header === 'string' && equal(digest(cookie), digest(header)) ? cookie : null)
      : (req.sessionHeaderAuth && typeof header === 'string' ? header : null);

    if (!tokenToVerify || !req.sessionId) {
      return res.status(403).json({ error: { code: 'CSRF_INVALID', message: 'Token keamanan tidak valid.' } });
    }
    const found = await db
      .select({ csrfHash: sessions.csrfHash })
      .from(sessions)
      .where(eq(sessions.id, req.sessionId))
      .limit(1);
    const session = found[0];
    if (!session || !equal(session.csrfHash, digest(tokenToVerify))) {
      return res.status(403).json({ error: { code: 'CSRF_INVALID', message: 'Token keamanan tidak valid.' } });
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Akses tidak diizinkan.' } });
    }
    next();
  };
}

export function registerAuthenticatedAuthRoutes(router: Router, runtimeEnv: AppEnv = env) {
  function clearAuthCookies(req: Request, res: Response) {
    const base = buildCookieOptions(req.secure, runtimeEnv);
    res.clearCookie(SESSION_COOKIE, { ...base, httpOnly: true });
    res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
  }
  router.post('/logout', authenticate, csrf, async (req: AuthRequest, res, next) => {
  try {
    if (!req.auth || !req.sessionId) return res.status(401).end();
    await db.transaction(async (tx) => {
      await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, req.sessionId!));
      await tx.insert(auditEvents).values({ action: 'AUTH_LOGOUT', actorId: req.auth!.id });
    });
    clearAuthCookies(req, res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, (req: AuthRequest, res) => res.json({ user: req.auth }));

router.post('/change-password', authenticate, csrf, async (req: AuthRequest, res, next) => {
  try {
    if (!req.auth) return res.status(401).end();
    const input = z.object({
      currentPassword: z.string().min(1).max(200),
      newPassword: z.string().min(12).max(200),
    }).parse(req.body);
    const found = await db.select().from(users).where(eq(users.id, req.auth.id)).limit(1);
    const user = found[0];
    if (!user) return res.status(401).end();

    if (!await argon2Verify(user.passwordHash, input.currentPassword).catch(() => false)) {
      return res.status(400).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Kata sandi saat ini tidak valid.' } });
    }
    const passwordHash = await argon2Hash(input.newPassword, passwordOptions);
    const changed = await db.transaction(async (tx) => {
      const updated = await tx
        .update(users)
        .set({
          passwordHash,
          mustChangePassword: false,
          authVersion: sql`${users.authVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, user.id), eq(users.passwordHash, user.passwordHash)))
        .returning({ id: users.id });
      if (updated.length !== 1) return false;
      await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
      await tx.insert(auditEvents).values({ action: 'AUTH_PASSWORD_CHANGED', actorId: user.id });
      return true;
    });
    if (!changed) {
      return res.status(409).json({ error: { code: 'PASSWORD_CHANGE_CONFLICT', message: 'Kata sandi atau sesi berubah. Silakan masuk kembali.' } });
    }
    clearAuthCookies(req, res);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.use('/admin', authenticate, requireRole('ADMIN'));

router.get('/admin/users', async (req, res, next) => {
  try {
    const query = z.object({
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      search: z.string().trim().max(150).optional().default(''),
      role: z.enum(['ALL', ...ROLES]).default('ALL'),
      status: z.enum(['ALL', ...ACCOUNT_STATUSES]).default('ALL'),
    }).parse(req.query);

    const conditions = [];
    if (query.role !== 'ALL') {
      conditions.push(eq(users.role, query.role));
    }
    if (query.status !== 'ALL') {
      conditions.push(eq(users.status, query.status));
    }
    if (query.search.length > 0) {
      const pattern = `%${escapeLikePattern(query.search)}%`;
      conditions.push(or(ilike(users.fullName, pattern), ilike(users.email, pattern))!);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (query.page - 1) * query.limit;

    const [rows, filteredCountRows, totalAccountsRows] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(whereClause)
        .orderBy(desc(users.createdAt), asc(users.id))
        .limit(query.limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(users)
        .where(whereClause),
      db
        .select({ total: count() })
        .from(users),
    ]);

    const total = Number(filteredCountRows[0]?.total ?? 0);
    const totalAccounts = Number(totalAccountsRows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / query.limit));

    res.json({
      users: rows,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
      },
      totalAccounts,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/roster/import', csrf, async (req: AuthRequest, res, next) => {
  try {
    if (!req.auth) return res.status(401).end();
    const { csv } = z.object({ csv: z.string().min(1).max(1_000_000) }).parse(req.body);
    const entries = parseStudentRosterCsv(csv, runtimeEnv.STUDENT_EMAIL_DOMAINS);
    const summary = await db.transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      for (const entry of entries) {
        const byNim = await tx.select().from(studentRoster).where(eq(studentRoster.nim, entry.nim)).limit(1);
        const byEmail = await tx.select().from(studentRoster).where(ilike(studentRoster.email, entry.email)).limit(1);
        const existingByNim = byNim[0];
        const existingByEmail = byEmail[0];
        if (existingByEmail && existingByEmail.id !== existingByNim?.id) {
          throw new RosterCsvError('ROSTER_CONFLICT', 'NIM atau email bertentangan dengan roster yang tersimpan.');
        }
        if (existingByNim) {
          await tx
            .update(studentRoster)
            .set({
              email: entry.email,
              fullName: entry.fullName,
              registrationEligible: entry.registrationEligible,
            })
            .where(eq(studentRoster.id, existingByNim.id));
          updated += 1;
        } else {
          await tx.insert(studentRoster).values(entry);
          created += 1;
        }
      }
      await tx.insert(auditEvents).values({
        actorId: req.auth!.id,
        action: 'ADMIN_ROSTER_IMPORTED',
        details: { rows: entries.length, created, updated },
      });
      return { rows: entries.length, created, updated };
    });
    res.json({ status: 'ok', summary });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/roster/export', async (req: AuthRequest, res, next) => {
  try {
    if (!req.auth) return res.status(401).end();
    const rows = await db
      .select({
        nim: studentRoster.nim,
        fullName: studentRoster.fullName,
        email: studentRoster.email,
        registrationEligible: studentRoster.registrationEligible,
      })
      .from(studentRoster)
      .orderBy(asc(studentRoster.nim), asc(studentRoster.createdAt));

    await db.insert(auditEvents).values({
      actorId: req.auth.id,
      action: 'ADMIN_ROSTER_EXPORTED',
      details: { rows: rows.length },
    });

    const csv = formatStudentRosterCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="roster-mahasiswa-sintaks.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

router.post('/admin/instructors', csrf, async (req: AuthRequest, res, next) => {
  try {
    if (!req.auth) return res.status(401).end();
    const input = z.object({
      email: z.string().email().max(255),
      fullName: z.string().trim().min(1).max(150),
    }).parse(req.body);
    const email = input.email.trim().toLowerCase();
    const temporaryPassword = randomBytes(24).toString('base64url');
    const passwordHash = await argon2Hash(temporaryPassword, passwordOptions);
    const user = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(users)
        .values({
          email,
          fullName: input.fullName,
          role: 'DOSEN',
          status: 'ACTIVE',
          mustChangePassword: true,
          passwordHash,
        })
        .returning({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          status: users.status,
        });
      const created = inserted[0]!;
      await tx.insert(auditEvents).values({
        action: 'ADMIN_INSTRUCTOR_CREATED',
        actorId: req.auth!.id,
        subjectId: created.id,
      });
      return created;
    });
    res.status(201).json({ user, temporaryPassword, mustChangePassword: true });
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/users/:id/status', csrf, async (req: AuthRequest, res, next) => {
  try {
    if (!req.auth) return res.status(401).end();
    const { status } = z.object({ status: z.enum(ACCOUNT_STATUSES) }).parse(req.body);
    const userId = req.params.id;
    if (!userId) return res.status(400).end();
    if (userId === req.auth.id && status !== 'ACTIVE') {
      return res.status(400).json({ error: { code: 'INVALID_STATUS_CHANGE', message: 'Admin tidak dapat menonaktifkan akunnya sendiri.' } });
    }

    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
      const targets = await tx
        .select({ role: users.role, status: users.status })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const target = targets[0];
      if (!target) return { missing: true as const };

      if (target.role === 'ADMIN' && status !== 'ACTIVE') {
        const activeAdmins = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(and(eq(users.role, 'ADMIN'), eq(users.status, 'ACTIVE')));
        if ((activeAdmins[0]?.count ?? 0) <= 1) return { lastAdmin: true as const };
      }

      const updated = await tx
        .update(users)
        .set({
          status,
          authVersion: sql`${users.authVersion} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          email: users.email,
          role: users.role,
          status: users.status,
        });
      const user = updated[0]!;
      await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
      await tx.insert(auditEvents).values({
        action: 'ADMIN_ACCOUNT_STATUS_CHANGED',
        actorId: req.auth!.id,
        subjectId: user.id,
      });
      return { user };
    });

    if ('missing' in outcome) return res.status(404).end();
    if ('lastAdmin' in outcome) {
      return res.status(409).json({ error: { code: 'LAST_ACTIVE_ADMIN', message: 'Minimal satu akun Admin aktif harus tersedia.' } });
    }
    res.json({ user: outcome.user });
  } catch (error) {
    next(error);
  }
});

router.patch('/admin/users/:id/role', csrf, async (req: AuthRequest, res, next) => {
  try {
    if (!req.auth) return res.status(401).end();
    const userId = req.params.id;
    if (!userId) return res.status(400).end();
    const { role } = z.object({ role: z.enum(ROLES) }).parse(req.body);
    if (userId === req.auth.id && role !== 'ADMIN') {
      return res.status(400).json({ error: { code: 'INVALID_ROLE_CHANGE', message: 'Admin tidak dapat menghapus peran Admin miliknya sendiri.' } });
    }

    const temporaryPassword = role === 'DOSEN' ? randomBytes(24).toString('base64url') : undefined;
    const passwordHash = temporaryPassword ? await argon2Hash(temporaryPassword, passwordOptions) : undefined;

    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
      const targets = await tx
        .select({ role: users.role, status: users.status })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const target = targets[0];
      if (!target) return { missing: true as const };

      if (target.role === 'ADMIN' && role !== 'ADMIN' && target.status === 'ACTIVE') {
        const activeAdmins = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(and(eq(users.role, 'ADMIN'), eq(users.status, 'ACTIVE')));
        if ((activeAdmins[0]?.count ?? 0) <= 1) return { lastAdmin: true as const };
      }

      const updated = await tx
        .update(users)
        .set({
          role,
          authVersion: sql`${users.authVersion} + 1`,
          mustChangePassword: role === 'DOSEN',
          updatedAt: new Date(),
          ...(passwordHash ? { passwordHash } : {}),
        })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          email: users.email,
          role: users.role,
          status: users.status,
        });
      const user = updated[0]!;
      await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
      await tx.insert(auditEvents).values({
        action: 'ADMIN_ACCOUNT_ROLE_CHANGED',
        actorId: req.auth!.id,
        subjectId: user.id,
      });
      return { user };
    });

    if ('missing' in outcome) return res.status(404).end();
    if ('lastAdmin' in outcome) {
      return res.status(409).json({ error: { code: 'LAST_ACTIVE_ADMIN', message: 'Minimal satu akun Admin aktif harus tersedia.' } });
    }
    res.json({ user: outcome.user, ...(temporaryPassword ? { temporaryPassword, mustChangePassword: true } : {}) });
  } catch (error) {
    next(error);
  }
});
}

export const authRouter = createAuthRouter();
