import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../../../src/db/index.js';
import {
  classes,
  fcmDeviceTokens,
  fcmDispatchJobs,
  memberships,
  notifications,
  users,
  type NotificationType,
  type Role,
} from '../../../src/db/schema.js';
import { authenticate, csrf } from './auth.js';
import { env } from './config/env.js';
import { enqueueFcmDispatchJob } from './fcm-jobs.js';

type Principal = { id: string; role: Role };
type NotificationRequest = Request & { auth?: Principal };
type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ClassNotificationPayload = {
  type: NotificationType;
  title: string;
  message: string;
  targetUrl: string;
};

export async function createClassNotifications(
  tx: TxClient,
  classId: string,
  payload: ClassNotificationPayload,
  targetUserIds?: string[],
  options?: { enqueueFcm?: boolean },
): Promise<string[]> {
  let recipientIds: string[];
  if (targetUserIds && targetUserIds.length > 0) {
    const uniqueIds = Array.from(new Set(targetUserIds));
    const activeMembers = await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(
        and(
          eq(memberships.classId, classId),
          eq(users.status, 'ACTIVE'),
          inArray(memberships.userId, uniqueIds),
        ),
      );
    recipientIds = activeMembers.map((m) => m.userId);
  } else {
    const activeMembers = await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(
        and(
          eq(memberships.classId, classId),
          eq(users.status, 'ACTIVE'),
          eq(users.role, 'MAHASISWA'),
        ),
      );
    recipientIds = activeMembers.map((m) => m.userId);
  }

  if (recipientIds.length === 0) return [];

  await tx.insert(notifications).values(
    recipientIds.map((userId) => ({
      userId,
      classId,
      type: payload.type,
      title: payload.title.slice(0, 200),
      message: payload.message,
      targetUrl: payload.targetUrl.slice(0, 500),
      isRead: false,
    })),
  );

  const shouldEnqueueFcm =
    options?.enqueueFcm ??
    (payload.type === 'ASSIGNMENT_NEW' || payload.type === 'MATERIAL_NEW');

  if (shouldEnqueueFcm) {
    await enqueueFcmDispatchJob(tx, {
      classId,
      type: payload.type,
      title: payload.title,
      body: payload.message,
      targetUrl: payload.targetUrl,
      recipientUserIds: recipientIds,
    });
  }

  return recipientIds;
}

const router = Router();
const uuid = z.string().uuid();
const fcmTokenSchema = z.object({
  token: z.string().trim().min(20).max(4096),
}).strict();

router.use(authenticate);
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return csrf(req, res, next);
});

router.get('/', async (req: NotificationRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.id;
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    const unreadRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    return res.json({
      notifications: rows,
      unreadCount: unreadRows[0]?.count ?? 0,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/read-all', async (req: NotificationRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.id;
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    return res.json({ message: 'Semua notifikasi telah ditandai sudah dibaca.' });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/read', async (req: NotificationRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.id;
    const id = uuid.parse(req.params.id);
    const updated = await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();

    if (!updated[0]) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Notifikasi tidak ditemukan.' },
      });
    }

    return res.json({ notification: updated[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/push-config', async (req: NotificationRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.id;
    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(fcmDeviceTokens)
      .where(eq(fcmDeviceTokens.userId, userId));

    const tokenCount = countRows[0]?.count ?? 0;
    return res.json({
      vapidKey: env.FIREBASE_VAPID_KEY || null,
      hasRegisteredToken: tokenCount > 0,
      tokenCount,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/fcm-token', async (req: NotificationRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.id;
    const { token } = fcmTokenSchema.parse(req.body);
    const userAgent = String(req.get('user-agent') ?? '').slice(0, 300) || null;
    const now = new Date();

    await db
      .insert(fcmDeviceTokens)
      .values({
        userId,
        token,
        userAgent,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: fcmDeviceTokens.token,
        set: {
          userId,
          userAgent,
          updatedAt: now,
        },
      });

    return res.status(201).json({ registered: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/fcm-token', async (req: NotificationRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth!.id;
    const { token } = fcmTokenSchema.parse(req.body);
    await db
      .delete(fcmDeviceTokens)
      .where(and(eq(fcmDeviceTokens.userId, userId), eq(fcmDeviceTokens.token, token)));

    return res.json({ removed: true });
  } catch (error) {
    next(error);
  }
});

router.get('/fcm-jobs', async (req: NotificationRequest, res: Response, next: NextFunction) => {
  try {
    const principal = req.auth!;
    if (principal.role === 'MAHASISWA') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Akses tidak diizinkan.' },
      });
    }

    const rows =
      principal.role === 'ADMIN'
        ? await db
            .select()
            .from(fcmDispatchJobs)
            .orderBy(desc(fcmDispatchJobs.createdAt))
            .limit(20)
        : await db
            .select({
              id: fcmDispatchJobs.id,
              classId: fcmDispatchJobs.classId,
              notificationType: fcmDispatchJobs.notificationType,
              title: fcmDispatchJobs.title,
              body: fcmDispatchJobs.body,
              targetUrl: fcmDispatchJobs.targetUrl,
              status: fcmDispatchJobs.status,
              attempts: fcmDispatchJobs.attempts,
              maxAttempts: fcmDispatchJobs.maxAttempts,
              sentCount: fcmDispatchJobs.sentCount,
              failedCount: fcmDispatchJobs.failedCount,
              lastError: fcmDispatchJobs.lastError,
              processedAt: fcmDispatchJobs.processedAt,
              createdAt: fcmDispatchJobs.createdAt,
            })
            .from(fcmDispatchJobs)
            .innerJoin(classes, eq(fcmDispatchJobs.classId, classes.id))
            .where(eq(classes.ownerId, principal.id))
            .orderBy(desc(fcmDispatchJobs.createdAt))
            .limit(20);

    return res.json({ jobs: rows });
  } catch (error) {
    next(error);
  }
});

export const notificationsRouter = router;
