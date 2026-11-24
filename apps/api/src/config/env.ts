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

function normalizeBooleanInput(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (trimmed === 'true' || trimmed === '1' || trimmed === 'yes') return 'true';
  if (trimmed === 'false' || trimmed === '0' || trimmed === 'no') return 'false';
  return raw?.trim();
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
      .transform((v) => (v && v.trim().length > 0 ? v : undefined)),
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
  const normalizedEnv: NodeJS.ProcessEnv = { ...rawEnv };

  if (normalizedEnv.NODE_ENV !== undefined) {
    const cleanNodeEnv = normalizedEnv.NODE_ENV.trim().toLowerCase();
    if (cleanNodeEnv) {
      normalizedEnv.NODE_ENV = cleanNodeEnv;
    } else {
      delete normalizedEnv.NODE_ENV;
    }
  }

  if (normalizedEnv.COOKIE_SAME_SITE !== undefined) {
    const cleanSameSite = normalizedEnv.COOKIE_SAME_SITE.trim().toLowerCase();
    if (cleanSameSite) {
      normalizedEnv.COOKIE_SAME_SITE = cleanSameSite;
    } else {
      delete normalizedEnv.COOKIE_SAME_SITE;
    }
  }

  for (const boolKey of ['COOKIE_SECURE', 'PASSWORD_RESET_DEV_PREVIEW', 'SMTP_SECURE'] as const) {
    const norm = normalizeBooleanInput(normalizedEnv[boolKey]);
    if (norm === undefined) {
      delete normalizedEnv[boolKey];
    } else {
      normalizedEnv[boolKey] = norm;
    }
  }

  const isProd = normalizedEnv.NODE_ENV === 'production';
  const isCloudRun = Boolean(normalizedEnv.K_SERVICE?.trim());

  if (!normalizedEnv.COOKIE_SECURE?.trim()) {
    normalizedEnv.COOKIE_SECURE = isProd ? 'true' : 'false';
  }

  if (!normalizedEnv.TRUST_PROXY?.trim()) {
    normalizedEnv.TRUST_PROXY = isCloudRun ? '1' : 'loopback';
  }

  const allowedHostOrigins = parseOriginsFromHosts(normalizedEnv.NG_ALLOWED_HOSTS);
  const rawAppOrigin = normalizedEnv.APP_URL ? parseExactOriginUrl(normalizedEnv.APP_URL) : null;
  const appOrigin = rawAppOrigin && (!isProd || rawAppOrigin.startsWith('https://')) ? rawAppOrigin : null;
  const derivedOrigins = [...allowedHostOrigins];
  if (appOrigin && !derivedOrigins.includes(appOrigin)) {
    derivedOrigins.push(appOrigin);
  }

  if (!normalizedEnv.WEB_ORIGIN?.trim()) {
    if (isProd) {
      if (derivedOrigins[0]) {
        normalizedEnv.WEB_ORIGIN = derivedOrigins[0];
      } else {
        delete normalizedEnv.WEB_ORIGIN;
      }
    } else {
      normalizedEnv.WEB_ORIGIN = 'http://localhost:3000';
    }
  }

  if (!normalizedEnv.CORS_ALLOWED_ORIGINS?.trim() && derivedOrigins.length > 0) {
    normalizedEnv.CORS_ALLOWED_ORIGINS = derivedOrigins.join(',');
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
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_FROM',
    'RATE_LIMIT_SECRET',
    'CORS_ALLOWED_ORIGINS',
  ] as const) {
    if (normalizedEnv[key] !== undefined && normalizedEnv[key]!.trim() === '') {
      delete normalizedEnv[key];
    }
  }

  // On managed Cloud Run production runtime, enforce secure defaults over stale/incomplete optional overrides
  // so deployment health probes are never blocked by non-fatal config mismatches.
  if (isProd && isCloudRun) {
    if (normalizedEnv.COOKIE_SECURE !== 'true') {
      console.warn(JSON.stringify({ level: 'warn', event: 'cloudrun_env_hardened', key: 'COOKIE_SECURE', value: 'true' }));
      normalizedEnv.COOKIE_SECURE = 'true';
    }
    if (normalizedEnv.PASSWORD_RESET_DEV_PREVIEW === 'true') {
      console.warn(JSON.stringify({ level: 'warn', event: 'cloudrun_env_hardened', key: 'PASSWORD_RESET_DEV_PREVIEW', value: 'false' }));
      normalizedEnv.PASSWORD_RESET_DEV_PREVIEW = 'false';
    }
    if (normalizedEnv.TRUST_PROXY?.trim().toLowerCase() === 'true') {
      console.warn(JSON.stringify({ level: 'warn', event: 'cloudrun_env_hardened', key: 'TRUST_PROXY', value: '1' }));
      normalizedEnv.TRUST_PROXY = '1';
    }
    if (normalizedEnv.WEB_ORIGIN) {
      const parsedOrigin = parseExactOriginUrl(normalizedEnv.WEB_ORIGIN);
      if (!parsedOrigin || !parsedOrigin.startsWith('https://')) {
        console.warn(JSON.stringify({ level: 'warn', event: 'cloudrun_env_hardened', key: 'WEB_ORIGIN' }));
        if (derivedOrigins[0]) {
          normalizedEnv.WEB_ORIGIN = derivedOrigins[0];
        } else {
          delete normalizedEnv.WEB_ORIGIN;
        }
      }
    }
    if (normalizedEnv.CORS_ALLOWED_ORIGINS) {
      const safeCorsOrigins = normalizedEnv.CORS_ALLOWED_ORIGINS
        .split(',')
        .map((item) => parseExactOriginUrl(item))
        .filter((origin): origin is string => Boolean(origin && origin.startsWith('https://')));
      const mergedCors = Array.from(new Set([...safeCorsOrigins, ...derivedOrigins]));
      if (mergedCors.length > 0) {
        normalizedEnv.CORS_ALLOWED_ORIGINS = mergedCors.join(',');
      } else {
        delete normalizedEnv.CORS_ALLOWED_ORIGINS;
      }
    }
    if (normalizedEnv.SMTP_FROM && !isValidFromAddress(normalizedEnv.SMTP_FROM)) {
      console.warn(JSON.stringify({ level: 'warn', event: 'cloudrun_env_hardened', key: 'SMTP_FROM' }));
      delete normalizedEnv.SMTP_FROM;
    }
    const hasPartialSmtp =
      Boolean(normalizedEnv.SMTP_HOST || normalizedEnv.SMTP_USER || normalizedEnv.SMTP_PASS) &&
      !(normalizedEnv.SMTP_HOST && normalizedEnv.SMTP_USER && normalizedEnv.SMTP_PASS);
    if (hasPartialSmtp) {
      console.warn(JSON.stringify({ level: 'warn', event: 'cloudrun_smtp_incomplete_cleared' }));
      delete normalizedEnv.SMTP_HOST;
      delete normalizedEnv.SMTP_USER;
      delete normalizedEnv.SMTP_PASS;
    }
  }

  const parsed = envSchema.safeParse(normalizedEnv);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'env_validation_failed',
        nodeEnv: normalizedEnv.NODE_ENV ?? null,
        isCloudRun,
        details,
      }),
    );
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
