import { z } from 'zod';
import { loadLocalEnvFile } from '../../../../src/db/config.js';

loadLocalEnvFile();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  TRUST_PROXY: z.string().default('1'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  STUDENT_EMAIL_DOMAINS: z.string().default('unimed.ac.id,mhs.unimed.ac.id').transform((v) => v.split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean)),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  SMTP_HOST: z.string().trim().optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SMTP_USER: z.string().trim().optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  SMTP_PASS: z.string().optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  SMTP_FROM: z.string().trim().default('SINTAKS <no-reply@sintaks.local>'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Konfigurasi environment tidak valid: ${details}`);
}

export const env = parsed.data;
