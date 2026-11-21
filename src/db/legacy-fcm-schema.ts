import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { classes, notificationTypeEnum, users } from './schema.js';

/**
 * @deprecated Legacy retention-only definitions for historical Cloud SQL objects.
 *
 * Firebase Cloud Messaging (FCM) was removed from the SINTAKS application runtime,
 * so these definitions MUST NOT be imported by `src/db/schema.ts`, `src/db/index.ts`,
 * `apps/api`, or `apps/web`.
 *
 * Why this file exists and is referenced in `src/db/drizzle.config.ts`:
 * - `drizzle-kit` `tablesFilter` only excludes table names, not PostgreSQL enum types.
 *   Excluding `fcm_device_tokens` and `fcm_dispatch_jobs` via `tablesFilter` alone still
 *   causes `drizzle-kit push` to emit `DROP TYPE "public"."FcmJobStatus";`, which fails
 *   because `fcm_dispatch_jobs.status` depends on that enum.
 * - Without retention mapping, `drizzle-kit push` proposes dropping `fcm_device_tokens`,
 *   `fcm_dispatch_jobs`, and `FcmJobStatus`.
 * - Including this file solely in `drizzle.config.ts` keeps normal `npm run db:push`
 *   synchronization non-destructive until an explicitly authorized retirement migration
 *   drops these legacy objects after snapshot backup.
 */
export const legacyFcmJobStatusEnum = pgEnum('FcmJobStatus', [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);

/** @deprecated Retained historical table; not used by application runtime. */
export const legacyFcmDeviceTokens = pgTable(
  'fcm_device_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    userAgent: varchar('user_agent', { length: 300 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('fcm_device_tokens_user_id_idx').on(table.userId)],
);

/** @deprecated Retained historical table; not used by application runtime. */
export const legacyFcmDispatchJobs = pgTable(
  'fcm_dispatch_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    notificationType: notificationTypeEnum('notification_type').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    targetUrl: varchar('target_url', { length: 500 }).notNull(),
    recipientUserIds: jsonb('recipient_user_ids').$type<string[]>().default([]).notNull(),
    status: legacyFcmJobStatusEnum('status').default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    sentCount: integer('sent_count').default(0).notNull(),
    failedCount: integer('failed_count').default(0).notNull(),
    lastError: text('last_error'),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('fcm_dispatch_jobs_status_next_run_at_idx').on(table.status, table.nextRunAt, table.createdAt),
  ],
);
