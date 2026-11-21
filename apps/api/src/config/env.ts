import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  TRUST_PROXY: z.string().default('1'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  STUDENT_EMAIL_DOMAINS: z.string().default('unimed.ac.id,mhs.unimed.ac.id').transform((v) => v.split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  FIREBASE_VAPID_KEY: z.string().trim().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Konfigurasi environment tidak valid: ${details}`);
}

export const env = parsed.data;
