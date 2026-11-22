import { createHmac } from 'node:crypto';
import { lt, sql } from 'drizzle-orm';
import { db } from '../../../../src/db/index.js';
import { rateLimitBuckets } from '../../../../src/db/schema.js';
import { env } from '../config/env.js';

export type RateLimitResult = {
  allowed: boolean;
  hits: number;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

function getRateLimitHmacKey(): string {
  return env.RATE_LIMIT_SECRET ?? 'sintaks-pg-rate-limit-v1';
}

export function normalizeEmailForRateLimit(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeIpForRateLimit(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice('::ffff:'.length);
  }
  return trimmed || 'unknown';
}

export function deriveAccountRateLimitKey(scope: string, normalizedEmail: string): string {
  const digest = createHmac('sha256', getRateLimitHmacKey())
    .update(`${scope}:account:${normalizedEmail}`)
    .digest('hex');
  return `${scope}:acct:${digest}`;
}

export function deriveIpRateLimitKey(scope: string, ip: string): string {
  const normalizedIp = normalizeIpForRateLimit(ip);
  const digest = createHmac('sha256', getRateLimitHmacKey())
    .update(`${scope}:ip:${normalizedIp}`)
    .digest('hex');
  return `${scope}:ip:${digest}`;
}

/**
 * Atomically increments a PostgreSQL fixed-window rate-limit counter.
 * Uses a single INSERT ... ON CONFLICT DO UPDATE statement so concurrent
 * requests across one or more Node processes cannot bypass the limit.
 */
export async function consumeRateLimit(params: {
  bucketKey: string;
  limit: number;
  windowMs: number;
  now?: Date;
}): Promise<RateLimitResult> {
  const now = params.now ?? new Date();
  const nextResetAt = new Date(now.getTime() + params.windowMs);

  const [row] = await db
    .insert(rateLimitBuckets)
    .values({
      bucketKey: params.bucketKey,
      hits: 1,
      resetAt: nextResetAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: rateLimitBuckets.bucketKey,
      set: {
        hits: sql`CASE WHEN ${rateLimitBuckets.resetAt} <= ${now} THEN 1 ELSE ${rateLimitBuckets.hits} + 1 END`,
        resetAt: sql`CASE WHEN ${rateLimitBuckets.resetAt} <= ${now} THEN ${nextResetAt} ELSE ${rateLimitBuckets.resetAt} END`,
        updatedAt: now,
      },
    })
    .returning({
      hits: rateLimitBuckets.hits,
      resetAt: rateLimitBuckets.resetAt,
    });

  // Opportunistic background cleanup for windows expired over 1 hour ago.
  if (Math.random() < 0.02) {
    const cutoff = new Date(now.getTime() - 60 * 60_000);
    void db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.resetAt, cutoff)).catch(() => undefined);
  }

  const hits = row?.hits ?? 1;
  const resetAt = row?.resetAt ?? nextResetAt;
  const remaining = Math.max(0, params.limit - hits);
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000));

  return {
    allowed: hits <= params.limit,
    hits,
    limit: params.limit,
    remaining,
    resetAt,
    retryAfterSeconds,
  };
}

export async function purgeExpiredRateLimitBuckets(before: Date = new Date()): Promise<void> {
  await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.resetAt, before));
}
