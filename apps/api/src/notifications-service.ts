import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../../../src/db/index.js';
import {
  memberships,
  notifications,
  users,
  type NotificationType,
  type Role,
} from '../../../src/db/schema.js';
import { authenticate, csrf } from './auth.js';

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

  return recipientIds;
}

const router = Router();
const uuid = z.string().uuid();

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

export const notificationsRouter = router;
