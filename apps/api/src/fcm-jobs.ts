import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { BatchResponse, MulticastMessage } from 'firebase-admin/messaging';
import { db } from '../../../src/db/index.js';
import {
  fcmDeviceTokens,
  fcmDispatchJobs,
  type NotificationType,
} from '../../../src/db/schema.js';
import { adminMessaging } from './lib/firebase-admin.js';

type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EnqueueFcmJobInput = {
  classId: string;
  type: NotificationType;
  title: string;
  body: string;
  targetUrl: string;
  recipientUserIds: string[];
};

const MAX_TOKENS_PER_MULTICAST = 500;
const POLL_INTERVAL_MS = 30_000;
const INITIAL_SWEEP_DELAY_MS = 2_000;

const PERMANENT_INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

const NON_RETRYABLE_AUTH_CODES = new Set([
  'messaging/third-party-auth-error',
  'messaging/authentication-error',
  'messaging/mismatched-credential',
  'app/invalid-credential',
]);

const TRANSIENT_PG_CODES = new Set(['57P01', '57P02', '57P03', '08003', '08006', '08001']);

function isTransientDbConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; message?: unknown; cause?: unknown };
  const code = typeof record.code === 'string' ? record.code : undefined;
  if (code && TRANSIENT_PG_CODES.has(code)) return true;
  const msg = typeof record.message === 'string' ? record.message : '';
  if (/Connection terminated|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up/i.test(msg)) return true;
  if (record.cause && record.cause !== error) return isTransientDbConnectionError(record.cause);
  return false;
}

function chunkTokens<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function isPermanentAuthFailure(code: string | undefined, message: string): boolean {
  if (code && NON_RETRYABLE_AUTH_CODES.has(code)) return true;
  const upper = message.toUpperCase();
  return upper.includes('PERMISSION_DENIED') || upper.includes('403') || upper.includes('UNAUTHENTICATED');
}

export async function enqueueFcmDispatchJob(tx: TxClient, input: EnqueueFcmJobInput) {
  const uniqueRecipients = Array.from(new Set(input.recipientUserIds));
  if (uniqueRecipients.length === 0) return null;

  const inserted = await tx
    .insert(fcmDispatchJobs)
    .values({
      classId: input.classId,
      notificationType: input.type,
      title: input.title.slice(0, 200),
      body: input.body,
      targetUrl: input.targetUrl.slice(0, 500),
      recipientUserIds: uniqueRecipients,
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
      sentCount: 0,
      failedCount: 0,
      nextRunAt: new Date(),
    })
    .returning();

  return inserted[0] ?? null;
}

async function claimNextDueFcmJobOnce() {
  return db.transaction(async (tx) => {
    const now = new Date();
    const candidates = await tx
      .select()
      .from(fcmDispatchJobs)
      .where(and(eq(fcmDispatchJobs.status, 'PENDING'), lte(fcmDispatchJobs.nextRunAt, now)))
      .orderBy(asc(fcmDispatchJobs.createdAt))
      .limit(1)
      .for('update', { skipLocked: true });

    const job = candidates[0];
    if (!job) return null;

    const updated = await tx
      .update(fcmDispatchJobs)
      .set({
        status: 'PROCESSING',
        attempts: sql`${fcmDispatchJobs.attempts} + 1`,
        updatedAt: now,
      })
      .where(eq(fcmDispatchJobs.id, job.id))
      .returning();

    return updated[0] ?? null;
  });
}

async function claimNextDueFcmJob() {
  try {
    return await claimNextDueFcmJobOnce();
  } catch (error) {
    if (isTransientDbConnectionError(error)) {
      return await claimNextDueFcmJobOnce();
    }
    throw error;
  }
}

export type FcmSender = (message: MulticastMessage) => Promise<BatchResponse>;

const defaultSendMulticast: FcmSender = (message) => adminMessaging.sendEachForMulticast(message);

export async function processPendingFcmJobs(options?: {
  maxBatch?: number;
  sendMulticast?: FcmSender;
}): Promise<{ processed: number; sent: number; failed: number }> {
  const maxBatch = options?.maxBatch ?? 10;
  const sendMulticast = options?.sendMulticast ?? defaultSendMulticast;
  let processed = 0;
  let sentTotal = 0;
  let failedTotal = 0;

  for (let i = 0; i < maxBatch; i += 1) {
    const job = await claimNextDueFcmJob();
    if (!job) break;
    processed += 1;

    try {
      const recipientIds = Array.isArray(job.recipientUserIds) ? job.recipientUserIds : [];
      if (recipientIds.length === 0) {
        await db
          .update(fcmDispatchJobs)
          .set({
            status: 'COMPLETED',
            sentCount: 0,
            failedCount: 0,
            lastError: null,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(fcmDispatchJobs.id, job.id));
        continue;
      }

      const tokenRows = await db
        .select({ token: fcmDeviceTokens.token })
        .from(fcmDeviceTokens)
        .where(inArray(fcmDeviceTokens.userId, recipientIds));

      const tokens = Array.from(new Set(tokenRows.map((r) => r.token).filter(Boolean)));
      if (tokens.length === 0) {
        await db
          .update(fcmDispatchJobs)
          .set({
            status: 'COMPLETED',
            sentCount: 0,
            failedCount: 0,
            lastError: null,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(fcmDispatchJobs.id, job.id));
        continue;
      }

      let jobSent = 0;
      let jobFailed = 0;
      const invalidTokens: string[] = [];
      let lastErrorMessage: string | null = null;
      let hasRetryableFailure = false;

      for (const batchTokens of chunkTokens(tokens, MAX_TOKENS_PER_MULTICAST)) {
        const result = await sendMulticast({
          tokens: batchTokens,
          notification: {
            title: job.title,
            body: job.body,
          },
          data: {
            type: job.notificationType,
            classId: job.classId,
            targetUrl: job.targetUrl,
            jobId: job.id,
          },
          webpush: {
            notification: {
              title: job.title,
              body: job.body,
            },
            fcmOptions: {
              link: job.targetUrl,
            },
          },
        });

        jobSent += result.successCount;
        jobFailed += result.failureCount;

        for (const [idx, resp] of result.responses.entries()) {
          if (resp.success) continue;
          const token = batchTokens[idx];
          const code = resp.error?.code;
          const msg = resp.error?.message ?? 'FCM send failure';
          lastErrorMessage = code ? `${code}: ${msg}` : msg;

          if (token && code && PERMANENT_INVALID_TOKEN_CODES.has(code)) {
            invalidTokens.push(token);
          } else if (!isPermanentAuthFailure(code, msg)) {
            hasRetryableFailure = true;
          }
        }
      }

      if (invalidTokens.length > 0) {
        await db
          .delete(fcmDeviceTokens)
          .where(inArray(fcmDeviceTokens.token, Array.from(new Set(invalidTokens))));
      }

      sentTotal += jobSent;
      failedTotal += jobFailed;

      const shouldRetry = jobSent === 0 && hasRetryableFailure && job.attempts < job.maxAttempts;
      if (shouldRetry) {
        const backoffMs = 30_000 * Math.pow(2, Math.max(0, job.attempts - 1));
        await db
          .update(fcmDispatchJobs)
          .set({
            status: 'PENDING',
            sentCount: jobSent,
            failedCount: jobFailed,
            lastError: lastErrorMessage?.slice(0, 1000) ?? null,
            nextRunAt: new Date(Date.now() + backoffMs),
            updatedAt: new Date(),
          })
          .where(eq(fcmDispatchJobs.id, job.id));
      } else {
        await db
          .update(fcmDispatchJobs)
          .set({
            status: jobSent > 0 || jobFailed === 0 ? 'COMPLETED' : 'FAILED',
            sentCount: jobSent,
            failedCount: jobFailed,
            lastError: lastErrorMessage?.slice(0, 1000) ?? null,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(fcmDispatchJobs.id, job.id));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown FCM worker error';
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : undefined;
      const retryable = !isPermanentAuthFailure(code, msg) && job.attempts < job.maxAttempts;
      const backoffMs = 30_000 * Math.pow(2, Math.max(0, job.attempts - 1));

      await db
        .update(fcmDispatchJobs)
        .set({
          status: retryable ? 'PENDING' : 'FAILED',
          lastError: (code ? `${code}: ${msg}` : msg).slice(0, 1000),
          nextRunAt: retryable ? new Date(Date.now() + backoffMs) : job.nextRunAt,
          processedAt: retryable ? null : new Date(),
          updatedAt: new Date(),
        })
        .where(eq(fcmDispatchJobs.id, job.id));

      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'fcm_job_dispatch_error',
          jobId: job.id,
          attempts: job.attempts,
          retryable,
          message: msg,
        }),
      );
    }
  }

  return { processed, sent: sentTotal, failed: failedTotal };
}

let activeDrain: Promise<void> | null = null;
let rerunRequested = false;
let pollTimer: NodeJS.Timeout | null = null;
let startupTimer: NodeJS.Timeout | null = null;

function drainQueueLoop() {
  if (activeDrain) {
    rerunRequested = true;
    return;
  }

  activeDrain = (async () => {
    try {
      do {
        rerunRequested = false;
        const summary = await processPendingFcmJobs({ maxBatch: 10 });
        if (summary.processed >= 10) {
          rerunRequested = true;
        }
      } while (rerunRequested);
    } catch (error) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'fcm_worker_loop_error',
          message: error instanceof Error ? error.message : 'Unknown worker error',
        }),
      );
    } finally {
      activeDrain = null;
    }
  })();
}

export function triggerFcmJobWorker() {
  setImmediate(() => {
    drainQueueLoop();
  });
}

export function startFcmJobWorker() {
  if (pollTimer || startupTimer) return;

  startupTimer = setTimeout(() => {
    startupTimer = null;
    drainQueueLoop();
  }, INITIAL_SWEEP_DELAY_MS);
  startupTimer.unref?.();

  pollTimer = setInterval(() => {
    drainQueueLoop();
  }, POLL_INTERVAL_MS);
  pollTimer.unref?.();
}

export function stopFcmJobWorker() {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
