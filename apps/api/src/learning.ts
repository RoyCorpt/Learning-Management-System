import path from 'node:path';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../../../src/db/index.js';
import {
  assignments,
  auditEvents,
  classes,
  materials,
  memberships,
  quizAttempts,
  quizzes,
  submissions,
  topics,
  users,
  type Role,
} from '../../../src/db/schema.js';
import { csrf, requireRole } from './auth.js';
import { createClassNotifications } from './notifications-service.js';

type Principal = { id: string; role: Role };
type LearningRequest = Request & { auth?: Principal };

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
]);

const router = Router({ mergeParams: true });
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return csrf(req, res, next);
});
const uuid = z.string().uuid();

const gradeSubmissionSchema = z.object({
  score: z.number().min(0).max(100),
  feedback: z.string().trim().max(10_000).nullable().optional(),
  gradeStatus: z.enum(['DRAFT', 'PUBLISHED']),
}).strict();

function toNumericString(value: number): string {
  const clamped = Math.max(0, Math.min(100, Math.round(value * 100) / 100));
  return clamped.toFixed(2);
}

function toCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  dataBase64: z.string().min(1).max(6_000_000),
}).strict();

const createTopicSchema = z.object({
  title: z.string().trim().min(1).max(150),
  sortOrder: z.number().int().min(0).max(10000).optional(),
}).strict();

const patchTopicSchema = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
}).strict().refine((v) => Object.keys(v).length > 0);

const createMaterialSchema = z.object({
  topicId: uuid.nullable().optional(),
  title: z.string().trim().min(1).max(160),
  type: z.enum(['TEXT', 'LINK', 'FILE']),
  content: z.string().trim().max(20_000).nullable().optional(),
  externalUrl: z.string().trim().url().max(1000).nullable().optional(),
  attachment: attachmentSchema.nullable().optional(),
  isPublished: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
}).strict();

const patchMaterialSchema = z.object({
  topicId: uuid.nullable().optional(),
  title: z.string().trim().min(1).max(160).optional(),
  content: z.string().trim().max(20_000).nullable().optional(),
  externalUrl: z.string().trim().url().max(1000).nullable().optional(),
  attachment: attachmentSchema.nullable().optional(),
  isPublished: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
}).strict().refine((v) => Object.keys(v).length > 0);

const createAssignmentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  instructions: z.string().trim().min(1).max(20_000),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  allowLate: z.boolean().optional(),
}).strict();

const patchAssignmentSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  instructions: z.string().trim().min(1).max(20_000).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
  allowLate: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0);

const submitAssignmentSchema = z.object({
  textAnswer: z.string().trim().max(20_000).nullable().optional(),
  attachment: attachmentSchema.nullable().optional(),
}).strict();

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

function actor(req: LearningRequest): Principal {
  if (!req.auth) throw fail(401, 'UNAUTHENTICATED', 'Autentikasi diperlukan.');
  return req.auth;
}

function validateSafeUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw fail(400, 'INVALID_URL', 'Tautan materi harus menggunakan protokol http atau https.');
  }
  return parsed.toString();
}

function parseAttachment(att: z.infer<typeof attachmentSchema> | null | undefined) {
  if (!att) return null;
  const normalizedMime = att.mimeType.toLowerCase().split(';')[0]!.trim();
  const safeName = path.basename(att.name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255) || 'lampiran';
  const effectiveMime = normalizedMime === '' && safeName.endsWith('.md') ? 'text/markdown' : normalizedMime;
  if (!ALLOWED_MIME_TYPES.has(effectiveMime)) {
    throw fail(400, 'UNSUPPORTED_FILE_TYPE', 'Jenis berkas tidak didukung. Gunakan PDF, TXT, MD, CSV, PNG, JPG, DOCX, atau ZIP.');
  }
  const cleanBase64 = att.dataBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  const decoded = Buffer.from(cleanBase64, 'base64');
  if (decoded.byteLength === 0) {
    throw fail(400, 'EMPTY_FILE', 'Berkas tidak boleh kosong.');
  }
  if (decoded.byteLength > MAX_ATTACHMENT_BYTES) {
    throw fail(400, 'FILE_TOO_LARGE', 'Ukuran berkas melebihi batas maksimal 4 MB.');
  }
  return {
    name: safeName,
    mime: effectiveMime,
    size: decoded.byteLength,
    data: decoded.toString('base64'),
  };
}

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

// ---------- TOPICS (UC-07 / UC-08) ----------

router.get('/topics', async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    await assertClassAccess(classId, user);
    const rows = await db
      .select({
        id: topics.id,
        classId: topics.classId,
        title: topics.title,
        sortOrder: topics.sortOrder,
        createdAt: topics.createdAt,
        updatedAt: topics.updatedAt,
      })
      .from(topics)
      .where(eq(topics.classId, classId))
      .orderBy(asc(topics.sortOrder), asc(topics.createdAt));
    return res.json({ topics: rows });
  } catch (error) {
    handle(next, res, error);
  }
});

router.post('/topics', requireRole('DOSEN'), async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    await assertClassOwner(classId, user);
    const input = createTopicSchema.parse(req.body);
    const created = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(topics)
        .values({
          classId,
          title: input.title,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning();
      const topic = inserted[0]!;
      await tx.insert(auditEvents).values({
        action: 'TOPIC_CREATED',
        actorId: user.id,
        subjectId: topic.id,
        details: { classId },
      });
      return topic;
    });
    return res.status(201).json({ topic: created });
  } catch (error) {
    handle(next, res, error);
  }
});

router.patch('/topics/:topicId', requireRole('DOSEN'), async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const topicId = uuid.parse(req.params.topicId);
    await assertClassOwner(classId, user);
    const input = patchTopicSchema.parse(req.body);
    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(topics)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(topics.id, topicId), eq(topics.classId, classId)))
        .returning();
      if (!rows[0]) throw fail(404, 'NOT_FOUND', 'Topik tidak ditemukan.');
      await tx.insert(auditEvents).values({
        action: 'TOPIC_UPDATED',
        actorId: user.id,
        subjectId: topicId,
        details: { classId },
      });
      return rows[0];
    });
    return res.json({ topic: updated });
  } catch (error) {
    handle(next, res, error);
  }
});

router.delete('/topics/:topicId', requireRole('DOSEN'), async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const topicId = uuid.parse(req.params.topicId);
    await assertClassOwner(classId, user);
    await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(topics)
        .where(and(eq(topics.id, topicId), eq(topics.classId, classId)))
        .returning({ id: topics.id });
      if (!deleted[0]) throw fail(404, 'NOT_FOUND', 'Topik tidak ditemukan.');
      await tx.insert(auditEvents).values({
        action: 'TOPIC_DELETED',
        actorId: user.id,
        subjectId: topicId,
        details: { classId },
      });
    });
    return res.status(204).end();
  } catch (error) {
    handle(next, res, error);
  }
});

// ---------- MATERIALS (UC-07 / UC-08) ----------

const materialSummarySelect = {
  id: materials.id,
  classId: materials.classId,
  topicId: materials.topicId,
  title: materials.title,
  type: materials.type,
  content: materials.content,
  externalUrl: materials.externalUrl,
  attachmentName: materials.attachmentName,
  attachmentMime: materials.attachmentMime,
  attachmentSize: materials.attachmentSize,
  isPublished: materials.isPublished,
  sortOrder: materials.sortOrder,
  createdAt: materials.createdAt,
  updatedAt: materials.updatedAt,
};

router.get('/materials', async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    await assertClassAccess(classId, user);
    const condition = user.role === 'DOSEN'
      ? eq(materials.classId, classId)
      : and(eq(materials.classId, classId), eq(materials.isPublished, true));

    const rows = await db
      .select(materialSummarySelect)
      .from(materials)
      .where(condition)
      .orderBy(asc(materials.sortOrder), asc(materials.createdAt));

    return res.json({ materials: rows });
  } catch (error) {
    handle(next, res, error);
  }
});

router.post('/materials', requireRole('DOSEN'), async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const classRecord = await assertClassOwner(classId, user);
    const input = createMaterialSchema.parse(req.body);

    if (input.topicId) {
      const topicRows = await db
        .select({ id: topics.id })
        .from(topics)
        .where(and(eq(topics.id, input.topicId), eq(topics.classId, classId)))
        .limit(1);
      if (!topicRows[0]) throw fail(400, 'INVALID_TOPIC', 'Topik tidak ditemukan di kelas ini.');
    }

    const safeUrl = input.type === 'LINK' ? validateSafeUrl(input.externalUrl) : null;
    if (input.type === 'LINK' && !safeUrl) {
      throw fail(400, 'INVALID_INPUT', 'Tautan wajib diisi untuk materi tipe tautan.');
    }
    if (input.type === 'TEXT' && !input.content?.trim()) {
      throw fail(400, 'INVALID_INPUT', 'Isi teks wajib diisi untuk materi tipe teks.');
    }
    const parsedFile = input.type === 'FILE' ? parseAttachment(input.attachment) : null;
    if (input.type === 'FILE' && !parsedFile) {
      throw fail(400, 'INVALID_INPUT', 'Berkas wajib diunggah untuk materi tipe berkas.');
    }

    const created = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(materials)
        .values({
          classId,
          topicId: input.topicId ?? null,
          title: input.title,
          type: input.type,
          content: input.content?.trim() || null,
          externalUrl: safeUrl,
          attachmentName: parsedFile?.name ?? null,
          attachmentMime: parsedFile?.mime ?? null,
          attachmentSize: parsedFile?.size ?? null,
          attachmentData: parsedFile?.data ?? null,
          isPublished: input.isPublished ?? true,
          sortOrder: input.sortOrder ?? 0,
        })
        .returning(materialSummarySelect);
      const record = inserted[0]!;
      await tx.insert(auditEvents).values({
        action: 'MATERIAL_CREATED',
        actorId: user.id,
        subjectId: record.id,
        details: { classId, type: record.type },
      });
      if (record.isPublished) {
        await createClassNotifications(tx, classId, {
          type: 'MATERIAL_NEW',
          title: `Materi Baru: ${record.title}`,
          message: `Materi baru telah dipublikasikan pada kelas ${classRecord.name}.`,
          targetUrl: `/classes/${classId}/materials`,
        });
      }
      return record;
    });

    return res.status(201).json({ material: created });
  } catch (error) {
    handle(next, res, error);
  }
});

router.patch('/materials/:materialId', requireRole('DOSEN'), async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const materialId = uuid.parse(req.params.materialId);
    const classRecord = await assertClassOwner(classId, user);
    const input = patchMaterialSchema.parse(req.body);

    if (input.topicId) {
      const topicRows = await db
        .select({ id: topics.id })
        .from(topics)
        .where(and(eq(topics.id, input.topicId), eq(topics.classId, classId)))
        .limit(1);
      if (!topicRows[0]) throw fail(400, 'INVALID_TOPIC', 'Topik tidak ditemukan di kelas ini.');
    }

    const safeUrl = input.externalUrl !== undefined ? validateSafeUrl(input.externalUrl) : undefined;
    const parsedFile = input.attachment !== undefined ? parseAttachment(input.attachment) : undefined;

    const updated = await db.transaction(async (tx) => {
      const existingRows = await tx
        .select({ id: materials.id, isPublished: materials.isPublished })
        .from(materials)
        .where(and(eq(materials.id, materialId), eq(materials.classId, classId)))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) throw fail(404, 'NOT_FOUND', 'Materi tidak ditemukan.');

      const rows = await tx
        .update(materials)
        .set({
          ...(input.topicId !== undefined ? { topicId: input.topicId } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.content !== undefined ? { content: input.content?.trim() || null } : {}),
          ...(safeUrl !== undefined ? { externalUrl: safeUrl } : {}),
          ...(parsedFile !== undefined
            ? {
                attachmentName: parsedFile?.name ?? null,
                attachmentMime: parsedFile?.mime ?? null,
                attachmentSize: parsedFile?.size ?? null,
                attachmentData: parsedFile?.data ?? null,
              }
            : {}),
          ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(materials.id, materialId), eq(materials.classId, classId)))
        .returning(materialSummarySelect);
      const record = rows[0];
      if (!record) throw fail(404, 'NOT_FOUND', 'Materi tidak ditemukan.');

      await tx.insert(auditEvents).values({
        action: 'MATERIAL_UPDATED',
        actorId: user.id,
        subjectId: materialId,
        details: { classId },
      });

      const publishedNow = !existing.isPublished && record.isPublished;
      if (publishedNow) {
        await createClassNotifications(tx, classId, {
          type: 'MATERIAL_NEW',
          title: `Materi Baru: ${record.title}`,
          message: `Materi baru telah dipublikasikan pada kelas ${classRecord.name}.`,
          targetUrl: `/classes/${classId}/materials`,
        });
      }

      return record;
    });

    return res.json({ material: updated });
  } catch (error) {
    handle(next, res, error);
  }
});

router.delete('/materials/:materialId', requireRole('DOSEN'), async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const materialId = uuid.parse(req.params.materialId);
    await assertClassOwner(classId, user);
    await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(materials)
        .where(and(eq(materials.id, materialId), eq(materials.classId, classId)))
        .returning({ id: materials.id });
      if (!deleted[0]) throw fail(404, 'NOT_FOUND', 'Materi tidak ditemukan.');
      await tx.insert(auditEvents).values({
        action: 'MATERIAL_DELETED',
        actorId: user.id,
        subjectId: materialId,
        details: { classId },
      });
    });
    return res.status(204).end();
  } catch (error) {
    handle(next, res, error);
  }
});

router.get('/materials/:materialId/download', async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const materialId = uuid.parse(req.params.materialId);
    await assertClassAccess(classId, user);

    const rows = await db
      .select()
      .from(materials)
      .where(and(eq(materials.id, materialId), eq(materials.classId, classId)))
      .limit(1);
    const material = rows[0];
    if (!material || (user.role === 'MAHASISWA' && !material.isPublished)) {
      throw fail(404, 'NOT_FOUND', 'Materi tidak ditemukan.');
    }
    if (!material.attachmentData || !material.attachmentName) {
      throw fail(404, 'NOT_FOUND', 'Materi ini tidak memiliki berkas lampiran.');
    }

    const buffer = Buffer.from(material.attachmentData, 'base64');
    res.setHeader('Content-Type', material.attachmentMime || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${material.attachmentName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(buffer);
  } catch (error) {
    handle(next, res, error);
  }
});

// ---------- ASSIGNMENTS & SUBMISSIONS (UC-09 / UC-10) ----------

router.get('/assignments', async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    await assertClassAccess(classId, user);

    const list = await db
      .select()
      .from(assignments)
      .where(eq(assignments.classId, classId))
      .orderBy(desc(assignments.createdAt));

    if (user.role === 'MAHASISWA') {
      const myRows = await db
        .select({
          id: submissions.id,
          assignmentId: submissions.assignmentId,
          textAnswer: submissions.textAnswer,
          attachmentName: submissions.attachmentName,
          attachmentMime: submissions.attachmentMime,
          attachmentSize: submissions.attachmentSize,
          version: submissions.version,
          isLate: submissions.isLate,
          score: submissions.score,
          feedback: submissions.feedback,
          gradeStatus: submissions.gradeStatus,
          gradedAt: submissions.gradedAt,
          submittedAt: submissions.submittedAt,
          updatedAt: submissions.updatedAt,
        })
        .from(submissions)
        .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
        .where(and(eq(assignments.classId, classId), eq(submissions.studentId, user.id)));

      const byAssignment = new Map(
        myRows.map((row) => [
          row.assignmentId,
          {
            id: row.id,
            assignmentId: row.assignmentId,
            textAnswer: row.textAnswer,
            attachmentName: row.attachmentName,
            attachmentMime: row.attachmentMime,
            attachmentSize: row.attachmentSize,
            version: row.version,
            isLate: row.isLate,
            submittedAt: row.submittedAt,
            updatedAt: row.updatedAt,
            ...(row.gradeStatus === 'PUBLISHED'
              ? {
                  score: row.score,
                  feedback: row.feedback,
                  gradeStatus: row.gradeStatus,
                  gradedAt: row.gradedAt,
                }
              : {
                  score: null,
                  feedback: null,
                  gradeStatus: null,
                  gradedAt: null,
                }),
          },
        ]),
      );
      return res.json({
        assignments: list.map((item) => ({
          ...item,
          mySubmission: byAssignment.get(item.id) ?? null,
        })),
      });
    }

    const counts = await db
      .select({
        assignmentId: submissions.assignmentId,
        count: sql<number>`count(*)::int`,
      })
      .from(submissions)
      .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
      .where(eq(assignments.classId, classId))
      .groupBy(submissions.assignmentId);

    const countMap = new Map(counts.map((c) => [c.assignmentId, c.count]));
    return res.json({
      assignments: list.map((item) => ({
        ...item,
        submissionCount: countMap.get(item.id) ?? 0,
      })),
    });
  } catch (error) {
    handle(next, res, error);
  }
});

router.post('/assignments', requireRole('DOSEN'), async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const classRecord = await assertClassOwner(classId, user);
    const input = createAssignmentSchema.parse(req.body);
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;

    const created = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(assignments)
        .values({
          classId,
          title: input.title,
          instructions: input.instructions,
          dueAt,
          allowLate: input.allowLate ?? false,
        })
        .returning();
      const record = inserted[0]!;
      await tx.insert(auditEvents).values({
        action: 'ASSIGNMENT_CREATED',
        actorId: user.id,
        subjectId: record.id,
        details: { classId },
      });
      await createClassNotifications(tx, classId, {
        type: 'ASSIGNMENT_NEW',
        title: `Tugas Baru: ${record.title}`,
        message: dueAt
          ? `Tugas baru pada kelas ${classRecord.name} dengan tenggat ${dueAt.toLocaleString('id-ID')}.`
          : `Tugas baru telah ditambahkan pada kelas ${classRecord.name}.`,
        targetUrl: `/classes/${classId}/assignments`,
      });
      return record;
    });

    return res.status(201).json({ assignment: { ...created, submissionCount: 0 } });
  } catch (error) {
    handle(next, res, error);
  }
});

router.patch('/assignments/:assignmentId', requireRole('DOSEN'), async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const assignmentId = uuid.parse(req.params.assignmentId);
    await assertClassOwner(classId, user);
    const input = patchAssignmentSchema.parse(req.body);

    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(assignments)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
          ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.allowLate !== undefined ? { allowLate: input.allowLate } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(assignments.id, assignmentId), eq(assignments.classId, classId)))
        .returning();
      if (!rows[0]) throw fail(404, 'NOT_FOUND', 'Tugas tidak ditemukan.');
      await tx.insert(auditEvents).values({
        action: 'ASSIGNMENT_UPDATED',
        actorId: user.id,
        subjectId: assignmentId,
        details: { classId },
      });
      return rows[0];
    });

    return res.json({ assignment: updated });
  } catch (error) {
    handle(next, res, error);
  }
});

router.get('/assignments/:assignmentId/submissions', requireRole('DOSEN'), async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const assignmentId = uuid.parse(req.params.assignmentId);
    await assertClassOwner(classId, user);

    const assignmentRows = await db
      .select()
      .from(assignments)
      .where(and(eq(assignments.id, assignmentId), eq(assignments.classId, classId)))
      .limit(1);
    const assignment = assignmentRows[0];
    if (!assignment) throw fail(404, 'NOT_FOUND', 'Tugas tidak ditemukan.');

    const enrolledStudents = await db
      .select({
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.classId, classId))
      .orderBy(asc(users.fullName));

    const submissionRows = await db
      .select({
        id: submissions.id,
        assignmentId: submissions.assignmentId,
        studentId: submissions.studentId,
        textAnswer: submissions.textAnswer,
        attachmentName: submissions.attachmentName,
        attachmentMime: submissions.attachmentMime,
        attachmentSize: submissions.attachmentSize,
        version: submissions.version,
        isLate: submissions.isLate,
        score: submissions.score,
        feedback: submissions.feedback,
        gradeStatus: submissions.gradeStatus,
        gradedAt: submissions.gradedAt,
        submittedAt: submissions.submittedAt,
        updatedAt: submissions.updatedAt,
      })
      .from(submissions)
      .where(eq(submissions.assignmentId, assignmentId));

    const subMap = new Map(submissionRows.map((row) => [row.studentId, row]));
    const rosterStatus = enrolledStudents.map((student) => ({
      student,
      submission: subMap.get(student.userId) ?? null,
    }));

    return res.json({ assignment, rosterStatus });
  } catch (error) {
    handle(next, res, error);
  }
});

router.post('/assignments/:assignmentId/submissions', requireRole('MAHASISWA'), async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const assignmentId = uuid.parse(req.params.assignmentId);
    const classRecord = await assertClassAccess(classId, user);

    if (classRecord.status === 'CLOSED') {
      throw fail(409, 'CLASS_CLOSED', 'Kelas sudah ditutup sehingga pengumpulan tugas dinonaktifkan.');
    }

    const input = submitAssignmentSchema.parse(req.body);
    const textAnswer = input.textAnswer?.trim() || null;
    const parsedFile = parseAttachment(input.attachment);
    if (!textAnswer && !parsedFile) {
      throw fail(400, 'INVALID_INPUT', 'Isi jawaban teks atau unggah berkas lampiran terlebih dahulu.');
    }

    const receipt = await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
      const assignmentRows = await tx
        .select()
        .from(assignments)
        .where(and(eq(assignments.id, assignmentId), eq(assignments.classId, classId)))
        .limit(1);
      const assignment = assignmentRows[0];
      if (!assignment) throw fail(404, 'NOT_FOUND', 'Tugas tidak ditemukan.');
      if (assignment.status === 'CLOSED') {
        throw fail(409, 'ASSIGNMENT_CLOSED', 'Tugas ini sudah ditutup oleh dosen.');
      }

      const now = new Date();
      const isLate = Boolean(assignment.dueAt && now > assignment.dueAt);
      if (isLate && !assignment.allowLate) {
        throw fail(409, 'DEADLINE_PASSED', 'Batas waktu pengumpulan tugas telah berakhir.');
      }

      const existingRows = await tx
        .select({ id: submissions.id, version: submissions.version })
        .from(submissions)
        .where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.studentId, user.id)))
        .limit(1);
      const existing = existingRows[0];

      const submissionSelect = {
        id: submissions.id,
        assignmentId: submissions.assignmentId,
        studentId: submissions.studentId,
        textAnswer: submissions.textAnswer,
        attachmentName: submissions.attachmentName,
        attachmentMime: submissions.attachmentMime,
        attachmentSize: submissions.attachmentSize,
        version: submissions.version,
        isLate: submissions.isLate,
        submittedAt: submissions.submittedAt,
        updatedAt: submissions.updatedAt,
      };

      const saved = existing
        ? (
            await tx
              .update(submissions)
              .set({
                textAnswer,
                ...(parsedFile
                  ? {
                      attachmentName: parsedFile.name,
                      attachmentMime: parsedFile.mime,
                      attachmentSize: parsedFile.size,
                      attachmentData: parsedFile.data,
                    }
                  : {}),
                version: existing.version + 1,
                isLate,
                submittedAt: now,
                updatedAt: now,
              })
              .where(eq(submissions.id, existing.id))
              .returning(submissionSelect)
          )[0]!
        : (
            await tx
              .insert(submissions)
              .values({
                assignmentId,
                studentId: user.id,
                textAnswer,
                attachmentName: parsedFile?.name ?? null,
                attachmentMime: parsedFile?.mime ?? null,
                attachmentSize: parsedFile?.size ?? null,
                attachmentData: parsedFile?.data ?? null,
                version: 1,
                isLate,
                submittedAt: now,
                updatedAt: now,
              })
              .returning(submissionSelect)
          )[0]!;

      await tx.insert(auditEvents).values({
        action: 'SUBMISSION_SUBMITTED',
        actorId: user.id,
        subjectId: saved.id,
        details: { classId, assignmentId, version: saved.version, isLate },
      });

      return saved;
    });

    return res.status(201).json({ submission: receipt });
  } catch (error) {
    handle(next, res, error);
  }
});

router.get('/assignments/:assignmentId/submissions/:submissionId/download', async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const assignmentId = uuid.parse(req.params.assignmentId);
    const submissionId = uuid.parse(req.params.submissionId);
    await assertClassAccess(classId, user);

    const rows = await db
      .select({ submission: submissions })
      .from(submissions)
      .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
      .where(
        and(
          eq(submissions.id, submissionId),
          eq(submissions.assignmentId, assignmentId),
          eq(assignments.classId, classId),
        ),
      )
      .limit(1);

    const submission = rows[0]?.submission;
    if (!submission) throw fail(404, 'NOT_FOUND', 'Pengumpulan tidak ditemukan.');
    if (user.role === 'MAHASISWA' && submission.studentId !== user.id) {
      throw fail(403, 'FORBIDDEN', 'Akses tidak diizinkan.');
    }
    if (!submission.attachmentData || !submission.attachmentName) {
      throw fail(404, 'NOT_FOUND', 'Pengumpulan ini tidak memiliki berkas lampiran.');
    }

    const buffer = Buffer.from(submission.attachmentData, 'base64');
    res.setHeader('Content-Type', submission.attachmentMime || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${submission.attachmentName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(buffer);
  } catch (error) {
    handle(next, res, error);
  }
});

// ---------- ASSIGNMENT GRADING & RECAP (UC-13 / UC-14) ----------

router.patch(
  '/assignments/:assignmentId/submissions/:submissionId/grade',
  requireRole('DOSEN'),
  async (req: LearningRequest, res, next) => {
    try {
      const user = actor(req);
      const classId = uuid.parse(req.params.classId);
      const assignmentId = uuid.parse(req.params.assignmentId);
      const submissionId = uuid.parse(req.params.submissionId);
      const classRecord = await assertClassOwner(classId, user);
      const input = gradeSubmissionSchema.parse(req.body);
      const formattedScore = toNumericString(input.score);
      const feedback = input.feedback?.trim() || null;

      const updated = await db.transaction(async (tx) => {
        const rows = await tx
          .select({
            submission: submissions,
            assignmentTitle: assignments.title,
          })
          .from(submissions)
          .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
          .where(
            and(
              eq(submissions.id, submissionId),
              eq(submissions.assignmentId, assignmentId),
              eq(assignments.classId, classId),
            ),
          )
          .limit(1);

        const target = rows[0];
        if (!target) throw fail(404, 'NOT_FOUND', 'Pengumpulan tugas tidak ditemukan.');

        const prev = target.submission;
        const now = new Date();
        const savedRows = await tx
          .update(submissions)
          .set({
            score: formattedScore,
            feedback,
            gradeStatus: input.gradeStatus,
            gradedBy: user.id,
            gradedAt: now,
          })
          .where(eq(submissions.id, submissionId))
          .returning({
            id: submissions.id,
            assignmentId: submissions.assignmentId,
            studentId: submissions.studentId,
            version: submissions.version,
            isLate: submissions.isLate,
            score: submissions.score,
            feedback: submissions.feedback,
            gradeStatus: submissions.gradeStatus,
            gradedBy: submissions.gradedBy,
            gradedAt: submissions.gradedAt,
            submittedAt: submissions.submittedAt,
            updatedAt: submissions.updatedAt,
          });
        const saved = savedRows[0]!;

        const isCorrection = prev.gradeStatus === 'PUBLISHED';
        await tx.insert(auditEvents).values({
          action: isCorrection ? 'ASSIGNMENT_GRADE_CORRECTED' : 'ASSIGNMENT_SUBMISSION_GRADED',
          actorId: user.id,
          subjectId: submissionId,
          details: {
            classId,
            assignmentId,
            studentId: prev.studentId,
            submissionVersion: prev.version,
            previousScore: prev.score,
            newScore: saved.score,
            previousGradeStatus: prev.gradeStatus,
            newGradeStatus: saved.gradeStatus,
          },
        });

        if (input.gradeStatus === 'PUBLISHED') {
          await createClassNotifications(
            tx,
            classId,
            {
              type: 'GRADE_PUBLISHED',
              title: `Nilai Dirilis: ${target.assignmentTitle}`,
              message: `Nilai tugas Anda pada kelas ${classRecord.name} telah dipublikasikan (${saved.score}).`,
              targetUrl: `/classes/${classId}/grades`,
            },
            [prev.studentId],
          );
        }

        return saved;
      });

      return res.json({ submission: updated });
    } catch (error) {
      handle(next, res, error);
    }
  },
);

router.post(
  '/assignments/:assignmentId/grades/publish',
  requireRole('DOSEN'),
  async (req: LearningRequest, res, next) => {
    try {
      const user = actor(req);
      const classId = uuid.parse(req.params.classId);
      const assignmentId = uuid.parse(req.params.assignmentId);
      const classRecord = await assertClassOwner(classId, user);

      const result = await db.transaction(async (tx) => {
        const assignmentRows = await tx
          .select()
          .from(assignments)
          .where(and(eq(assignments.id, assignmentId), eq(assignments.classId, classId)))
          .limit(1);
        const assignment = assignmentRows[0];
        if (!assignment) throw fail(404, 'NOT_FOUND', 'Tugas tidak ditemukan.');

        const draftRows = await tx
          .select({
            id: submissions.id,
            studentId: submissions.studentId,
            score: submissions.score,
          })
          .from(submissions)
          .where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.gradeStatus, 'DRAFT')));

        const publishable = draftRows.filter((row) => row.score !== null);
        if (publishable.length === 0) {
          return { publishedCount: 0 };
        }

        const now = new Date();
        await tx
          .update(submissions)
          .set({
            gradeStatus: 'PUBLISHED',
            gradedBy: user.id,
            gradedAt: now,
          })
          .where(and(eq(submissions.assignmentId, assignmentId), eq(submissions.gradeStatus, 'DRAFT')));

        await tx.insert(auditEvents).values({
          action: 'ASSIGNMENT_GRADES_BULK_PUBLISHED',
          actorId: user.id,
          subjectId: assignmentId,
          details: {
            classId,
            publishedCount: publishable.length,
            studentIds: publishable.map((r) => r.studentId),
          },
        });

        await createClassNotifications(
          tx,
          classId,
          {
            type: 'GRADE_PUBLISHED',
            title: `Nilai Dirilis: ${assignment.title}`,
            message: `Nilai tugas ${assignment.title} pada kelas ${classRecord.name} telah dipublikasikan.`,
            targetUrl: `/classes/${classId}/grades`,
          },
          publishable.map((r) => r.studentId),
        );

        return { publishedCount: publishable.length };
      });

      return res.json(result);
    } catch (error) {
      handle(next, res, error);
    }
  },
);

router.get('/grades/recap', requireRole('DOSEN'), async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    await assertClassOwner(classId, user);

    const enrolledStudents = await db
      .select({
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.classId, classId))
      .orderBy(asc(users.fullName));

    const classAssignments = await db
      .select({
        id: assignments.id,
        title: assignments.title,
        dueAt: assignments.dueAt,
      })
      .from(assignments)
      .where(eq(assignments.classId, classId))
      .orderBy(asc(assignments.createdAt));

    const classQuizzes = await db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        status: quizzes.status,
      })
      .from(quizzes)
      .where(eq(quizzes.classId, classId))
      .orderBy(asc(quizzes.createdAt));

    const assignmentSubmissions = await db
      .select({
        assignmentId: submissions.assignmentId,
        studentId: submissions.studentId,
        score: submissions.score,
        gradeStatus: submissions.gradeStatus,
        feedback: submissions.feedback,
      })
      .from(submissions)
      .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
      .where(eq(assignments.classId, classId));

    const attemptRows = await db
      .select({
        quizId: quizAttempts.quizId,
        studentId: quizAttempts.studentId,
        finalScore: quizAttempts.finalScore,
        autoScore: quizAttempts.autoScore,
        status: quizAttempts.status,
        attemptNumber: quizAttempts.attemptNumber,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .where(eq(quizzes.classId, classId));

    const subLookup = new Map(
      assignmentSubmissions.map((s) => [`${s.studentId}:${s.assignmentId}`, s]),
    );

    const bestQuizLookup = new Map<string, { score: string; status: string }>();
    for (const att of attemptRows) {
      if (att.status === 'IN_PROGRESS') continue;
      const key = `${att.studentId}:${att.quizId}`;
      const rawScore = att.status === 'FINAL' ? (att.finalScore ?? att.autoScore) : att.autoScore;
      const existing = bestQuizLookup.get(key);
      if (!existing || Number(rawScore) >= Number(existing.score)) {
        bestQuizLookup.set(key, { score: rawScore, status: att.status });
      }
    }

    const itemTotals = new Map<string, { sumCents: number; count: number }>();
    for (const a of classAssignments) itemTotals.set(`assignment:${a.id}`, { sumCents: 0, count: 0 });
    for (const q of classQuizzes) itemTotals.set(`quiz:${q.id}`, { sumCents: 0, count: 0 });

    let classSumCents = 0;
    let classScoreCount = 0;

    const rows = enrolledStudents.map((student) => {
      let studentSumCents = 0;
      let studentCount = 0;

      const assignmentScores: Record<string, { score: string | null; gradeStatus: string | null }> = {};
      for (const a of classAssignments) {
        const sub = subLookup.get(`${student.userId}:${a.id}`);
        const cents = toCents(sub?.score);
        assignmentScores[a.id] = {
          score: sub?.score ?? null,
          gradeStatus: sub?.gradeStatus ?? null,
        };
        if (cents !== null) {
          studentSumCents += cents;
          studentCount += 1;
          const bucket = itemTotals.get(`assignment:${a.id}`)!;
          bucket.sumCents += cents;
          bucket.count += 1;
          classSumCents += cents;
          classScoreCount += 1;
        }
      }

      const quizScores: Record<string, { score: string | null; status: string | null }> = {};
      for (const q of classQuizzes) {
        const best = bestQuizLookup.get(`${student.userId}:${q.id}`);
        const cents = toCents(best?.score);
        quizScores[q.id] = {
          score: best?.score ?? null,
          status: best?.status ?? null,
        };
        if (cents !== null) {
          studentSumCents += cents;
          studentCount += 1;
          const bucket = itemTotals.get(`quiz:${q.id}`)!;
          bucket.sumCents += cents;
          bucket.count += 1;
          classSumCents += cents;
          classScoreCount += 1;
        }
      }

      return {
        student,
        assignmentScores,
        quizScores,
        averageScore: studentCount > 0 ? (Math.round(studentSumCents / studentCount) / 100).toFixed(2) : null,
      };
    });

    const itemAverages: Record<string, string | null> = {};
    for (const [key, bucket] of itemTotals.entries()) {
      itemAverages[key] = bucket.count > 0 ? (Math.round(bucket.sumCents / bucket.count) / 100).toFixed(2) : null;
    }

    return res.json({
      assignments: classAssignments,
      quizzes: classQuizzes,
      students: rows,
      itemAverages,
      classAverage: classScoreCount > 0 ? (Math.round(classSumCents / classScoreCount) / 100).toFixed(2) : null,
    });
  } catch (error) {
    handle(next, res, error);
  }
});

router.get('/my-grades', requireRole('MAHASISWA'), async (req: LearningRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    await assertClassAccess(classId, user);

    const assignmentGrades = await db
      .select({
        assignmentId: assignments.id,
        assignmentTitle: assignments.title,
        dueAt: assignments.dueAt,
        submissionId: submissions.id,
        version: submissions.version,
        isLate: submissions.isLate,
        score: submissions.score,
        feedback: submissions.feedback,
        gradedAt: submissions.gradedAt,
      })
      .from(submissions)
      .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
      .where(
        and(
          eq(assignments.classId, classId),
          eq(submissions.studentId, user.id),
          eq(submissions.gradeStatus, 'PUBLISHED'),
        ),
      )
      .orderBy(desc(submissions.gradedAt));

    const quizRows = await db
      .select({
        quizId: quizzes.id,
        quizTitle: quizzes.title,
        attemptId: quizAttempts.id,
        attemptNumber: quizAttempts.attemptNumber,
        status: quizAttempts.status,
        autoScore: quizAttempts.autoScore,
        manualScore: quizAttempts.manualScore,
        finalScore: quizAttempts.finalScore,
        submittedAt: quizAttempts.submittedAt,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .where(
        and(
          eq(quizzes.classId, classId),
          eq(quizAttempts.studentId, user.id),
          sql`${quizAttempts.status} <> 'IN_PROGRESS'`,
        ),
      )
      .orderBy(desc(quizAttempts.submittedAt));

    return res.json({
      assignmentGrades,
      quizGrades: quizRows,
    });
  } catch (error) {
    handle(next, res, error);
  }
});

export const learningRouter = router;
