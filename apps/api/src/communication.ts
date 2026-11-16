import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../../../src/db/index.js';
import {
  announcements,
  auditEvents,
  classes,
  forumReplies,
  forumTopics,
  memberships,
  users,
  type Role,
} from '../../../src/db/schema.js';
import { csrf, requireRole } from './auth.js';
import { createClassNotifications } from './notifications-service.js';

type Principal = { id: string; role: Role };
type CommRequest = Request & { auth?: Principal };

class DomainError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const fail = (status: number, code: string, message: string) => new DomainError(status, code, message);

function handle(next: NextFunction, res: Response, error: unknown) {
  if (error instanceof DomainError) {
    const requestId = res.locals.requestId as string | undefined;
    return res.status(error.status).json({
      error: { code: error.code, message: error.message, ...(requestId ? { requestId } : {}) },
    });
  }
  next(error);
}

function actor(req: CommRequest): Principal {
  if (!req.auth) throw fail(401, 'UNAUTHENTICATED', 'Autentikasi diperlukan.');
  return req.auth;
}

const EDIT_WINDOW_MS = 15 * 60_000;
const uuid = z.string().uuid();

const createAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(15_000),
}).strict();

const createForumTopicSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(15_000),
}).strict();

const editForumTopicSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  body: z.string().trim().min(1).max(15_000).optional(),
}).strict().refine((v) => Object.keys(v).length > 0);

const replyForumSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
}).strict();

async function assertClassAccess(classId: string, user: Principal) {
  if (user.role === 'ADMIN') throw fail(403, 'FORBIDDEN', 'Akses tidak diizinkan.');
  if (user.role === 'DOSEN') {
    const owned = await db
      .select()
      .from(classes)
      .where(and(eq(classes.id, classId), eq(classes.ownerId, user.id)))
      .limit(1);
    if (!owned[0]) throw fail(404, 'NOT_FOUND', 'Kelas tidak ditemukan.');
    return owned[0];
  }
  const enrolled = await db
    .select({ classRecord: classes })
    .from(classes)
    .innerJoin(memberships, and(eq(memberships.classId, classes.id), eq(memberships.userId, user.id)))
    .where(eq(classes.id, classId))
    .limit(1);
  if (!enrolled[0]) throw fail(404, 'NOT_FOUND', 'Kelas tidak ditemukan.');
  return enrolled[0].classRecord;
}

async function assertClassOwner(classId: string, user: Principal) {
  if (user.role !== 'DOSEN') throw fail(403, 'FORBIDDEN', 'Akses tidak diizinkan.');
  const owned = await db
    .select()
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.ownerId, user.id)))
    .limit(1);
  if (!owned[0]) throw fail(404, 'NOT_FOUND', 'Kelas tidak ditemukan.');
  return owned[0];
}

const router = Router({ mergeParams: true });
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return csrf(req, res, next);
});

// ---------- ANNOUNCEMENTS (UC-15) ----------

router.get('/announcements', async (req: CommRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    await assertClassAccess(classId, user);

    const rows = await db
      .select({
        id: announcements.id,
        classId: announcements.classId,
        authorId: announcements.authorId,
        authorName: users.fullName,
        authorRole: users.role,
        title: announcements.title,
        body: announcements.body,
        createdAt: announcements.createdAt,
      })
      .from(announcements)
      .innerJoin(users, eq(announcements.authorId, users.id))
      .where(eq(announcements.classId, classId))
      .orderBy(desc(announcements.createdAt));

    return res.json({ announcements: rows });
  } catch (error) {
    handle(next, res, error);
  }
});

router.post('/announcements', requireRole('DOSEN'), async (req: CommRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const classRecord = await assertClassOwner(classId, user);
    const input = createAnnouncementSchema.parse(req.body);

    const created = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(announcements)
        .values({
          classId,
          authorId: user.id,
          title: input.title,
          body: input.body,
        })
        .returning();
      const record = inserted[0]!;

      await tx.insert(auditEvents).values({
        action: 'ANNOUNCEMENT_CREATED',
        actorId: user.id,
        subjectId: record.id,
        details: { classId },
      });

      await createClassNotifications(tx, classId, {
        type: 'ANNOUNCEMENT_NEW',
        title: `Pengumuman: ${record.title}`,
        message: `Pengumuman baru di kelas ${classRecord.name}: ${record.body.slice(0, 120)}`,
        targetUrl: `/classes/${classId}/announcements`,
      });

      return record;
    });

    const authorRows = await db
      .select({ fullName: users.fullName, role: users.role })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    return res.status(201).json({
      announcement: {
        ...created,
        authorName: authorRows[0]?.fullName ?? 'Dosen',
        authorRole: authorRows[0]?.role ?? 'DOSEN',
      },
    });
  } catch (error) {
    handle(next, res, error);
  }
});

// ---------- DISCUSSION FORUM (UC-16) ----------

router.get('/forum/topics', async (req: CommRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    await assertClassAccess(classId, user);

    const topicRows = await db
      .select({
        id: forumTopics.id,
        classId: forumTopics.classId,
        authorId: forumTopics.authorId,
        authorName: users.fullName,
        authorRole: users.role,
        title: forumTopics.title,
        body: forumTopics.body,
        createdAt: forumTopics.createdAt,
        updatedAt: forumTopics.updatedAt,
      })
      .from(forumTopics)
      .innerJoin(users, eq(forumTopics.authorId, users.id))
      .where(eq(forumTopics.classId, classId))
      .orderBy(desc(forumTopics.createdAt));

    const topicIds = topicRows.map((t) => t.id);
    const replyRows = topicIds.length > 0
      ? await db
          .select({
            id: forumReplies.id,
            topicId: forumReplies.topicId,
            authorId: forumReplies.authorId,
            authorName: users.fullName,
            authorRole: users.role,
            body: forumReplies.body,
            createdAt: forumReplies.createdAt,
            updatedAt: forumReplies.updatedAt,
          })
          .from(forumReplies)
          .innerJoin(users, eq(forumReplies.authorId, users.id))
          .where(inArray(forumReplies.topicId, topicIds))
          .orderBy(asc(forumReplies.createdAt))
      : [];

    const repliesByTopic = new Map<string, typeof replyRows>();
    for (const r of replyRows) {
      const list = repliesByTopic.get(r.topicId) ?? [];
      list.push(r);
      repliesByTopic.set(r.topicId, list);
    }

    return res.json({
      topics: topicRows.map((t) => ({
        ...t,
        replies: repliesByTopic.get(t.id) ?? [],
      })),
    });
  } catch (error) {
    handle(next, res, error);
  }
});

router.post('/forum/topics', async (req: CommRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    await assertClassAccess(classId, user);
    const input = createForumTopicSchema.parse(req.body);

    const created = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(forumTopics)
        .values({
          classId,
          authorId: user.id,
          title: input.title,
          body: input.body,
        })
        .returning();
      const record = inserted[0]!;
      await tx.insert(auditEvents).values({
        action: 'FORUM_TOPIC_CREATED',
        actorId: user.id,
        subjectId: record.id,
        details: { classId },
      });
      return record;
    });

    const authorRows = await db
      .select({ fullName: users.fullName, role: users.role })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    return res.status(201).json({
      topic: {
        ...created,
        authorName: authorRows[0]?.fullName ?? 'Pengguna',
        authorRole: authorRows[0]?.role ?? user.role,
        replies: [],
      },
    });
  } catch (error) {
    handle(next, res, error);
  }
});

router.patch('/forum/topics/:topicId', async (req: CommRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const topicId = uuid.parse(req.params.topicId);
    await assertClassAccess(classId, user);
    const input = editForumTopicSchema.parse(req.body);

    const rows = await db
      .select()
      .from(forumTopics)
      .where(and(eq(forumTopics.id, topicId), eq(forumTopics.classId, classId)))
      .limit(1);
    const topic = rows[0];
    if (!topic) throw fail(404, 'NOT_FOUND', 'Topik diskusi tidak ditemukan.');
    if (topic.authorId !== user.id) throw fail(403, 'FORBIDDEN', 'Anda hanya dapat mengedit topik Anda sendiri.');
    if (Date.now() - topic.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw fail(409, 'EDIT_WINDOW_EXPIRED', 'Batas waktu edit (15 menit) telah berakhir.');
    }

    const updated = await db
      .update(forumTopics)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        updatedAt: new Date(),
      })
      .where(eq(forumTopics.id, topicId))
      .returning();

    return res.json({ topic: updated[0] });
  } catch (error) {
    handle(next, res, error);
  }
});

router.post('/forum/topics/:topicId/replies', async (req: CommRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const topicId = uuid.parse(req.params.topicId);
    await assertClassAccess(classId, user);
    const input = replyForumSchema.parse(req.body);

    const topicRows = await db
      .select({ id: forumTopics.id })
      .from(forumTopics)
      .where(and(eq(forumTopics.id, topicId), eq(forumTopics.classId, classId)))
      .limit(1);
    if (!topicRows[0]) throw fail(404, 'NOT_FOUND', 'Topik diskusi tidak ditemukan.');

    const created = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(forumReplies)
        .values({
          topicId,
          authorId: user.id,
          body: input.body,
        })
        .returning();
      const record = inserted[0]!;
      await tx.insert(auditEvents).values({
        action: 'FORUM_REPLY_CREATED',
        actorId: user.id,
        subjectId: record.id,
        details: { classId, topicId },
      });
      return record;
    });

    const authorRows = await db
      .select({ fullName: users.fullName, role: users.role })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    return res.status(201).json({
      reply: {
        ...created,
        authorName: authorRows[0]?.fullName ?? 'Pengguna',
        authorRole: authorRows[0]?.role ?? user.role,
      },
    });
  } catch (error) {
    handle(next, res, error);
  }
});

router.patch('/forum/topics/:topicId/replies/:replyId', async (req: CommRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const topicId = uuid.parse(req.params.topicId);
    const replyId = uuid.parse(req.params.replyId);
    await assertClassAccess(classId, user);
    const input = replyForumSchema.parse(req.body);

    const rows = await db
      .select({ reply: forumReplies })
      .from(forumReplies)
      .innerJoin(forumTopics, eq(forumReplies.topicId, forumTopics.id))
      .where(
        and(
          eq(forumReplies.id, replyId),
          eq(forumReplies.topicId, topicId),
          eq(forumTopics.classId, classId),
        ),
      )
      .limit(1);
    const reply = rows[0]?.reply;
    if (!reply) throw fail(404, 'NOT_FOUND', 'Balasan diskusi tidak ditemukan.');
    if (reply.authorId !== user.id) throw fail(403, 'FORBIDDEN', 'Anda hanya dapat mengedit balasan Anda sendiri.');
    if (Date.now() - reply.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw fail(409, 'EDIT_WINDOW_EXPIRED', 'Batas waktu edit (15 menit) telah berakhir.');
    }

    const updated = await db
      .update(forumReplies)
      .set({
        body: input.body,
        updatedAt: new Date(),
      })
      .where(eq(forumReplies.id, replyId))
      .returning();

    return res.json({ reply: updated[0] });
  } catch (error) {
    handle(next, res, error);
  }
});

export const communicationRouter = router;
