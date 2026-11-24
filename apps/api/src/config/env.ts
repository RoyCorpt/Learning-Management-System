import { isIP } from 'node:net';
import { z } from 'zod';
import { loadLocalEnvFile } from '../../../../src/db/config.js';

loadLocalEnvFile();

const NAMED_PROXY_SUBNETS = new Set(['loopback', 'linklocal', 'uniquelocal']);

export function parseExactOriginUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes('*')) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname) return null;
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
  if (parsed.username || parsed.password) return null;
  return parsed.origin;
}

function isValidIpOrCidr(token: string): boolean {
  if (NAMED_PROXY_SUBNETS.has(token)) return true;
  const slashIndex = token.indexOf('/');
  if (slashIndex === -1) {
    return isIP(token) !== 0;
  }
  const ip = token.slice(0, slashIndex);
  const prefixRaw = token.slice(slashIndex + 1);
  if (!/^\d+$/.test(prefixRaw)) return false;
  const prefix = Number(prefixRaw);
  const ipVersion = isIP(ip);
  if (ipVersion === 4) return prefix >= 0 && prefix <= 32;
  if (ipVersion === 6) return prefix >= 0 && prefix <= 128;
  return false;
}

export function resolveTrustProxySetting(raw: string): boolean | number | string | string[] {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'false' || lower === '0') return false;
  if (lower === 'true') {
    throw new Error('TRUST_PROXY tidak boleh bernilai "true" karena memercayai semua header forwarded secara tidak aman.');
  }
  if (/^[1-5]$/.test(trimmed)) return Number(trimmed);
  if (NAMED_PROXY_SUBNETS.has(lower)) return lower;

  const entries = trimmed
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (entries.length === 0 || !entries.every(isValidIpOrCidr)) {
    throw new Error(
      'TRUST_PROXY tidak valid. Gunakan "false", jumlah hop (1-5), "loopback", atau daftar IP/CIDR tepercaya.',
    );
  }
  return entries.length === 1 ? entries[0]! : entries;
}

const simpleEmailRegex = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function isValidFromAddress(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 255) return false;
  const angleMatch = trimmed.match(/^[^<>]*<([^<>]+)>$/);
  const emailPart = angleMatch ? angleMatch[1]!.trim() : trimmed;
  return simpleEmailRegex.test(emailPart);
}

export function parseOriginsFromHosts(rawHosts?: string): string[] {
  if (!rawHosts) return [];
  const origins: string[] = [];
  for (const token of rawHosts.split(',')) {
    const host = token.trim();
    if (!host || host.includes('*') || host.includes('/') || host.includes('@')) continue;
    const origin = parseExactOriginUrl(`https://${host}`);
    if (origin && !origins.includes(origin)) {
      origins.push(origin);
    }
  }
  return origins;
}

export function parseOriginFromHosts(rawHosts?: string): string | undefined {
  return parseOriginsFromHosts(rawHosts)[0];
}

const booleanFlag = (defaultValue: 'true' | 'false') =>
  z.enum(['true', 'false']).default(defaultValue).transform((v) => v === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    WEB_ORIGIN: z
      .string()
      .optional()
      .transform((value, ctx) => {
        if (value === undefined) return undefined;
        const origin = parseExactOriginUrl(value);
        if (!origin) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'WEB_ORIGIN harus berupa origin URL http:// atau https:// yang valid tanpa path atau wildcard.',
          });
          return z.NEVER;
        }
        return origin;
      }),
    CORS_ALLOWED_ORIGINS: z
      .string()
      .optional()
      .default('')
      .transform((value, ctx) => {
        const items = value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
        const origins: string[] = [];
        for (const item of items) {
          const origin = parseExactOriginUrl(item);
          if (!origin) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `CORS_ALLOWED_ORIGINS berisi origin tidak valid: ${item}`,
            });
            return z.NEVER;
          }
          origins.push(origin);
        }
        return origins;
      }),
    TRUST_PROXY: z
      .string()
      .default('loopback')
      .transform((value, ctx) => {
        try {
          resolveTrustProxySetting(value);
          return value.trim();
        } catch (error) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: error instanceof Error ? error.message : 'TRUST_PROXY tidak valid.',
          });
          return z.NEVER;
        }
      }),
    COOKIE_SECURE: booleanFlag('false'),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    STUDENT_EMAIL_DOMAINS: z
      .string()
      .default('unimed.ac.id,mhs.unimed.ac.id')
      .transform((v) => v.split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)),
    SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
    PASSWORD_RESET_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    PASSWORD_RESET_IP_LIMIT: z.coerce.number().int().min(1).max(1000).default(20),
    PASSWORD_RESET_ACCOUNT_LIMIT: z.coerce.number().int().min(1).max(100).default(5),
    RATE_LIMIT_SECRET: z
      .string()
      .optional()
      .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined)),
    PASSWORD_RESET_DEV_PREVIEW: booleanFlag('false'),
    SMTP_HOST: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: booleanFlag('false'),
    SMTP_USER: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    SMTP_PASS: z
      .string()
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    SMTP_FROM: z
      .string()
      .trim()
      .default('SINTAKS <no-reply@sintaks.local>')
      .refine(isValidFromAddress, { message: 'SMTP_FROM harus berupa alamat email pengirim yang valid.' }),
  })
  .superRefine((data, ctx) => {
    if (data.COOKIE_SAME_SITE === 'none' && !data.COOKIE_SECURE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SAME_SITE=none mewajibkan COOKIE_SECURE=true.',
      });
    }

    if (Boolean(data.SMTP_USER) !== Boolean(data.SMTP_PASS)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMTP_USER'],
        message: 'SMTP_USER dan SMTP_PASS harus diisi berpasangan.',
      });
    }

    if (data.NODE_ENV === 'production') {
      if (!data.COOKIE_SECURE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['COOKIE_SECURE'],
          message: 'COOKIE_SECURE wajib bernilai true pada mode produksi.',
        });
      }
      if (data.WEB_ORIGIN && !data.WEB_ORIGIN.startsWith('https://')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['WEB_ORIGIN'],
          message: 'WEB_ORIGIN wajib menggunakan https:// pada mode produksi.',
        });
      }
      for (const extraOrigin of data.CORS_ALLOWED_ORIGINS) {
        if (!extraOrigin.startsWith('https://')) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['CORS_ALLOWED_ORIGINS'],
            message: 'Semua origin pada CORS_ALLOWED_ORIGINS wajib menggunakan https:// pada mode produksi.',
          });
        }
      }
      if (data.PASSWORD_RESET_DEV_PREVIEW) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PASSWORD_RESET_DEV_PREVIEW'],
          message: 'PASSWORD_RESET_DEV_PREVIEW tidak boleh bernilai true pada mode produksi.',
        });
      }
      const hasAnySmtp = Boolean(data.SMTP_HOST || data.SMTP_USER || data.SMTP_PASS);
      if (hasAnySmtp) {
        if (!data.SMTP_HOST) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['SMTP_HOST'],
            message: 'SMTP_HOST wajib dikonfigurasi pada mode produksi untuk fitur Lupa Kata Sandi.',
          });
        }
        if (!data.SMTP_USER || !data.SMTP_PASS) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['SMTP_USER'],
            message: 'SMTP_USER dan SMTP_PASS wajib dikonfigurasi pada mode produksi.',
          });
        }
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: NodeJS.ProcessEnv): AppEnv {
  const isProd = rawEnv.NODE_ENV === 'production';
  const normalizedEnv: NodeJS.ProcessEnv = { ...rawEnv };

  if (!normalizedEnv.COOKIE_SECURE?.trim()) {
    normalizedEnv.COOKIE_SECURE = isProd ? 'true' : 'false';
  }

  if (!normalizedEnv.TRUST_PROXY?.trim()) {
    normalizedEnv.TRUST_PROXY = normalizedEnv.K_SERVICE ? '1' : 'loopback';
  }

  const allowedHostOrigins = parseOriginsFromHosts(normalizedEnv.NG_ALLOWED_HOSTS);

  if (!normalizedEnv.WEB_ORIGIN?.trim()) {
    if (isProd) {
      if (allowedHostOrigins[0]) {
        normalizedEnv.WEB_ORIGIN = allowedHostOrigins[0];
      } else {
        delete normalizedEnv.WEB_ORIGIN;
      }
    } else {
      normalizedEnv.WEB_ORIGIN = 'http://localhost:3000';
    }
  }

  if (!normalizedEnv.CORS_ALLOWED_ORIGINS?.trim() && allowedHostOrigins.length > 0) {
    normalizedEnv.CORS_ALLOWED_ORIGINS = allowedHostOrigins.join(',');
  }

  for (const key of [
    'NODE_ENV',
    'API_PORT',
    'COOKIE_SAME_SITE',
    'STUDENT_EMAIL_DOMAINS',
    'SESSION_TTL_HOURS',
    'PASSWORD_RESET_TTL_MINUTES',
    'PASSWORD_RESET_WINDOW_MINUTES',
    'PASSWORD_RESET_IP_LIMIT',
    'PASSWORD_RESET_ACCOUNT_LIMIT',
    'PASSWORD_RESET_DEV_PREVIEW',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_FROM',
  ] as const) {
    if (normalizedEnv[key] !== undefined && normalizedEnv[key]!.trim() === '') {
      delete normalizedEnv[key];
    }
  }

  const parsed = envSchema.safeParse(normalizedEnv);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Konfigurasi environment tidak valid: ${details}`);
  }
  return parsed.data;
}

export function buildAllowedOrigins(cfg: Pick<AppEnv, 'WEB_ORIGIN' | 'CORS_ALLOWED_ORIGINS'>): Set<string> {
  return new Set(
    [cfg.WEB_ORIGIN, ...cfg.CORS_ALLOWED_ORIGINS].filter((origin): origin is string => Boolean(origin)),
  );
}

export const env = parseEnv(process.env);
