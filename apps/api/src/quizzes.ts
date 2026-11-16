import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../../../src/db/index.js';
import {
  attemptAnswers,
  auditEvents,
  classes,
  memberships,
  questionOptions,
  questions,
  quizAttempts,
  quizzes,
  users,
  type Role,
} from '../../../src/db/schema.js';
import { authenticate, csrf, requireRole } from './auth.js';
import { createClassNotifications } from './notifications-service.js';

type Principal = { id: string; role: Role };
type QuizRequest = Request & { auth?: Principal };
type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

function actor(req: QuizRequest): Principal {
  if (!req.auth) throw fail(401, 'UNAUTHENTICATED', 'Autentikasi diperlukan.');
  return req.auth;
}

const uuid = z.string().uuid();

function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

function formatCents(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2);
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

const optionInputSchema = z.object({
  label: z.string().trim().min(1).max(1000),
  isCorrect: z.boolean(),
}).strict();

const questionInputSchema = z.object({
  type: z.enum(['MULTIPLE_CHOICE', 'ESSAY']),
  prompt: z.string().trim().min(1).max(10_000),
  points: z.number().positive().max(100),
  position: z.number().int().min(0).max(1000).optional(),
  options: z.array(optionInputSchema).max(10).optional(),
}).strict();

const createQuizSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).nullable().optional(),
  timeLimitMinutes: z.number().int().min(1).max(300).default(30),
  maxAttempts: z.number().int().min(1).max(3).default(1),
  opensAt: z.string().datetime({ offset: true }).nullable().optional(),
  closesAt: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  questions: z.array(questionInputSchema).max(100).optional(),
}).strict();

const patchQuizSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  timeLimitMinutes: z.number().int().min(1).max(300).optional(),
  maxAttempts: z.number().int().min(1).max(3).optional(),
  opensAt: z.string().datetime({ offset: true }).nullable().optional(),
  closesAt: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).optional(),
}).strict().refine((v) => Object.keys(v).length > 0);

const answerItemSchema = z.object({
  questionId: uuid,
  selectedOptionId: uuid.nullable().optional(),
  textAnswer: z.string().max(20_000).nullable().optional(),
}).strict();

const autosaveAnswersSchema = z.object({
  answers: z.array(answerItemSchema).min(1).max(200),
}).strict();

const submitAttemptSchema = z.object({
  answers: z.array(answerItemSchema).max(200).optional(),
}).strict();

const gradeEssaySchema = z.object({
  grades: z.array(
    z.object({
      questionId: uuid,
      pointsAwarded: z.number().min(0).max(100),
      feedback: z.string().trim().max(5000).nullable().optional(),
    }).strict(),
  ).min(1).max(100),
}).strict();

function validateQuestionPayload(q: z.infer<typeof questionInputSchema>) {
  if (q.type === 'MULTIPLE_CHOICE') {
    const opts = q.options ?? [];
    if (opts.length < 2) {
      throw fail(400, 'INVALID_QUESTION', 'Pertanyaan pilihan ganda harus memiliki minimal 2 opsi jawaban.');
    }
    const correctCount = opts.filter((o) => o.isCorrect).length;
    if (correctCount !== 1) {
      throw fail(400, 'INVALID_QUESTION', 'Pertanyaan pilihan ganda harus memiliki tepat 1 jawaban benar.');
    }
  }
}

async function loadQuizQuestions(quizId: string, includeAnswerKey: boolean, txOrDb: TxClient | typeof db = db) {
  const questionRows = await txOrDb
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizId))
    .orderBy(asc(questions.position), asc(questions.id));

  const questionIds = questionRows.map((q) => q.id);
  const optionRows = questionIds.length > 0
    ? await txOrDb
        .select()
        .from(questionOptions)
        .where(inArray(questionOptions.questionId, questionIds))
        .orderBy(asc(questionOptions.position), asc(questionOptions.id))
    : [];

  const optionsByQuestion = new Map<string, typeof optionRows>();
  for (const opt of optionRows) {
    const list = optionsByQuestion.get(opt.questionId) ?? [];
    list.push(opt);
    optionsByQuestion.set(opt.questionId, list);
  }

  return questionRows.map((q) => ({
    id: q.id,
    quizId: q.quizId,
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    position: q.position,
    options: (optionsByQuestion.get(q.id) ?? []).map((o) => ({
      id: o.id,
      questionId: o.questionId,
      label: o.label,
      position: o.position,
      ...(includeAnswerKey ? { isCorrect: o.isCorrect } : {}),
    })),
  }));
}

async function finalizeAttemptInTx(
  tx: TxClient,
  attemptId: string,
  quizRecord: typeof quizzes.$inferSelect,
  submittedAt: Date,
) {
  const questionRows = await tx
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizRecord.id))
    .orderBy(asc(questions.position));

  const questionIds = questionRows.map((q) => q.id);
  const optionRows = questionIds.length > 0
    ? await tx
        .select()
        .from(questionOptions)
        .where(inArray(questionOptions.questionId, questionIds))
    : [];

  const answerRows = await tx
    .select()
    .from(attemptAnswers)
    .where(eq(attemptAnswers.attemptId, attemptId));

  const correctOptionByQuestion = new Map<string, string>();
  for (const opt of optionRows) {
    if (opt.isCorrect) correctOptionByQuestion.set(opt.questionId, opt.id);
  }

  const answerByQuestion = new Map(answerRows.map((a) => [a.questionId, a]));

  let autoScoreCents = 0;
  let hasEssay = false;

  for (const q of questionRows) {
    if (q.type === 'ESSAY') {
      hasEssay = true;
      continue;
    }

    const ans = answerByQuestion.get(q.id);
    const correctOptionId = correctOptionByQuestion.get(q.id);
    const isCorrect = Boolean(ans?.selectedOptionId && correctOptionId && ans.selectedOptionId === correctOptionId);
    const awardedCents = isCorrect ? toCents(q.points) : 0;
    autoScoreCents += awardedCents;

    await tx
      .insert(attemptAnswers)
      .values({
        attemptId,
        questionId: q.id,
        selectedOptionId: ans?.selectedOptionId ?? null,
        textAnswer: ans?.textAnswer ?? null,
        pointsAwarded: formatCents(awardedCents),
        updatedAt: submittedAt,
      })
      .onConflictDoUpdate({
        target: [attemptAnswers.attemptId, attemptAnswers.questionId],
        set: {
          pointsAwarded: formatCents(awardedCents),
          updatedAt: submittedAt,
        },
      });
  }

  const autoScore = formatCents(autoScoreCents);
  const status = hasEssay ? 'PROVISIONAL' : 'FINAL';
  const finalScore = hasEssay ? null : autoScore;

  const updatedRows = await tx
    .update(quizAttempts)
    .set({
      submittedAt,
      autoScore,
      manualScore: '0.00',
      finalScore,
      status,
    })
    .where(eq(quizAttempts.id, attemptId))
    .returning();

  return updatedRows[0]!;
}

// ---------- CLASS-SCOPED QUIZZES ROUTER (/api/classes/:classId/quizzes) ----------

const classQuizzesRouter = Router({ mergeParams: true });
classQuizzesRouter.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return csrf(req, res, next);
});

classQuizzesRouter.get('/', async (req: QuizRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    await assertClassAccess(classId, user);

    const condition = user.role === 'DOSEN'
      ? eq(quizzes.classId, classId)
      : and(eq(quizzes.classId, classId), sql`${quizzes.status} <> 'DRAFT'`);

    const list = await db
      .select()
      .from(quizzes)
      .where(condition)
      .orderBy(desc(quizzes.createdAt));

    const quizIds = list.map((q) => q.id);
    const questionStats = quizIds.length > 0
      ? await db
          .select({
            quizId: questions.quizId,
            questionCount: sql<number>`count(*)::int`,
            totalPoints: sql<string>`coalesce(sum(${questions.points}), 0)::numeric(7,2)::text`,
          })
          .from(questions)
          .where(inArray(questions.quizId, quizIds))
          .groupBy(questions.quizId)
      : [];

    const statsMap = new Map(questionStats.map((s) => [s.quizId, s]));

    if (user.role === 'MAHASISWA') {
      const myAttempts = quizIds.length > 0
        ? await db
            .select()
            .from(quizAttempts)
            .where(and(inArray(quizAttempts.quizId, quizIds), eq(quizAttempts.studentId, user.id)))
            .orderBy(asc(quizAttempts.attemptNumber))
        : [];

      const attemptsByQuiz = new Map<string, typeof myAttempts>();
      for (const att of myAttempts) {
        const arr = attemptsByQuiz.get(att.quizId) ?? [];
        arr.push(att);
        attemptsByQuiz.set(att.quizId, arr);
      }

      return res.json({
        quizzes: list.map((q) => {
          const stat = statsMap.get(q.id);
          return {
            ...q,
            questionCount: stat?.questionCount ?? 0,
            totalPoints: stat?.totalPoints ?? '0.00',
            myAttempts: attemptsByQuiz.get(q.id) ?? [],
          };
        }),
      });
    }

    const attemptCounts = quizIds.length > 0
      ? await db
          .select({
            quizId: quizAttempts.quizId,
            count: sql<number>`count(*)::int`,
          })
          .from(quizAttempts)
          .where(inArray(quizAttempts.quizId, quizIds))
          .groupBy(quizAttempts.quizId)
      : [];

    const attemptMap = new Map(attemptCounts.map((a) => [a.quizId, a.count]));

    return res.json({
      quizzes: list.map((q) => {
        const stat = statsMap.get(q.id);
        return {
          ...q,
          questionCount: stat?.questionCount ?? 0,
          totalPoints: stat?.totalPoints ?? '0.00',
          attemptCount: attemptMap.get(q.id) ?? 0,
        };
      }),
    });
  } catch (error) {
    handle(next, res, error);
  }
});

classQuizzesRouter.post('/', requireRole('DOSEN'), async (req: QuizRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const classRecord = await assertClassOwner(classId, user);
    const input = createQuizSchema.parse(req.body);

    const opensAt = input.opensAt ? new Date(input.opensAt) : null;
    const closesAt = input.closesAt ? new Date(input.closesAt) : null;
    if (opensAt && closesAt && opensAt >= closesAt) {
      throw fail(400, 'INVALID_DATES', 'Waktu buka kuis harus lebih awal daripada waktu tutup.');
    }

    const initialQuestions = input.questions ?? [];
    for (const q of initialQuestions) {
      validateQuestionPayload(q);
    }
    if (input.status === 'PUBLISHED' && initialQuestions.length === 0) {
      throw fail(400, 'EMPTY_QUIZ', 'Kuis harus memiliki minimal 1 pertanyaan sebelum dipublikasikan.');
    }

    const created = await db.transaction(async (tx) => {
      const insertedQuiz = await tx
        .insert(quizzes)
        .values({
          classId,
          title: input.title,
          description: input.description?.trim() || null,
          timeLimitMinutes: input.timeLimitMinutes,
          maxAttempts: input.maxAttempts,
          opensAt,
          closesAt,
          status: input.status,
        })
        .returning();
      const quiz = insertedQuiz[0]!;

      for (let i = 0; i < initialQuestions.length; i++) {
        const q = initialQuestions[i]!;
        const insertedQ = await tx
          .insert(questions)
          .values({
            quizId: quiz.id,
            type: q.type,
            prompt: q.prompt,
            points: formatCents(toCents(q.points)),
            position: q.position ?? i,
          })
          .returning();
        const createdQ = insertedQ[0]!;
        if (q.type === 'MULTIPLE_CHOICE' && q.options) {
          await tx.insert(questionOptions).values(
            q.options.map((opt, idx) => ({
              questionId: createdQ.id,
              label: opt.label,
              isCorrect: opt.isCorrect,
              position: idx,
            })),
          );
        }
      }

      await tx.insert(auditEvents).values({
        action: 'QUIZ_CREATED',
        actorId: user.id,
        subjectId: quiz.id,
        details: { classId, status: quiz.status, questionCount: initialQuestions.length },
      });

      if (quiz.status === 'PUBLISHED') {
        await createClassNotifications(tx, classId, {
          type: 'QUIZ_NEW',
          title: `Kuis Baru: ${quiz.title}`,
          message: `Kuis baru telah dipublikasikan pada kelas ${classRecord.name} (${quiz.timeLimitMinutes} menit).`,
          targetUrl: `/classes/${classId}/quizzes`,
        });
      }

      return quiz;
    });

    const quizQuestions = await loadQuizQuestions(created.id, true);
    return res.status(201).json({ quiz: { ...created, questions: quizQuestions } });
  } catch (error) {
    handle(next, res, error);
  }
});

classQuizzesRouter.get('/:quizId', async (req: QuizRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const quizId = uuid.parse(req.params.quizId);
    await assertClassAccess(classId, user);

    const rows = await db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.id, quizId), eq(quizzes.classId, classId)))
      .limit(1);
    const quiz = rows[0];
    if (!quiz || (user.role === 'MAHASISWA' && quiz.status === 'DRAFT')) {
      throw fail(404, 'NOT_FOUND', 'Kuis tidak ditemukan.');
    }

    // Answer key security: NEVER expose isCorrect to MAHASISWA
    const includeAnswerKey = user.role === 'DOSEN';
    const quizQuestions = await loadQuizQuestions(quiz.id, includeAnswerKey);

    if (user.role === 'DOSEN') {
      const attemptRows = await db
        .select({
          id: quizAttempts.id,
          quizId: quizAttempts.quizId,
          studentId: quizAttempts.studentId,
          studentName: users.fullName,
          studentEmail: users.email,
          attemptNumber: quizAttempts.attemptNumber,
          startedAt: quizAttempts.startedAt,
          submittedAt: quizAttempts.submittedAt,
          autoScore: quizAttempts.autoScore,
          manualScore: quizAttempts.manualScore,
          finalScore: quizAttempts.finalScore,
          status: quizAttempts.status,
        })
        .from(quizAttempts)
        .innerJoin(users, eq(quizAttempts.studentId, users.id))
        .where(eq(quizAttempts.quizId, quiz.id))
        .orderBy(asc(users.fullName), asc(quizAttempts.attemptNumber));

      return res.json({ quiz, questions: quizQuestions, attempts: attemptRows });
    }

    const myAttempts = await db
      .select()
      .from(quizAttempts)
      .where(and(eq(quizAttempts.quizId, quiz.id), eq(quizAttempts.studentId, user.id)))
      .orderBy(asc(quizAttempts.attemptNumber));

    return res.json({ quiz, questions: quizQuestions, myAttempts });
  } catch (error) {
    handle(next, res, error);
  }
});

classQuizzesRouter.patch('/:quizId', requireRole('DOSEN'), async (req: QuizRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const quizId = uuid.parse(req.params.quizId);
    const classRecord = await assertClassOwner(classId, user);
    const input = patchQuizSchema.parse(req.body);

    const updated = await db.transaction(async (tx) => {
      const existingRows = await tx
        .select()
        .from(quizzes)
        .where(and(eq(quizzes.id, quizId), eq(quizzes.classId, classId)))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) throw fail(404, 'NOT_FOUND', 'Kuis tidak ditemukan.');

      const opensAt = input.opensAt !== undefined ? (input.opensAt ? new Date(input.opensAt) : null) : existing.opensAt;
      const closesAt = input.closesAt !== undefined ? (input.closesAt ? new Date(input.closesAt) : null) : existing.closesAt;
      if (opensAt && closesAt && opensAt >= closesAt) {
        throw fail(400, 'INVALID_DATES', 'Waktu buka kuis harus lebih awal daripada waktu tutup.');
      }

      const publishing = existing.status === 'DRAFT' && input.status === 'PUBLISHED';
      if (publishing) {
        const qs = await loadQuizQuestions(quizId, true, tx);
        if (qs.length === 0) {
          throw fail(400, 'EMPTY_QUIZ', 'Tambahkan minimal 1 pertanyaan sebelum mempublikasikan kuis.');
        }
        for (const q of qs) {
          if (q.type === 'MULTIPLE_CHOICE') {
            if (q.options.length < 2 || q.options.filter((o) => o.isCorrect).length !== 1) {
              throw fail(400, 'INVALID_QUESTION', 'Setiap soal pilihan ganda harus memiliki minimal 2 opsi dan tepat 1 jawaban benar.');
            }
          }
        }
      }

      const rows = await tx
        .update(quizzes)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
          ...(input.timeLimitMinutes !== undefined ? { timeLimitMinutes: input.timeLimitMinutes } : {}),
          ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
          ...(input.opensAt !== undefined ? { opensAt } : {}),
          ...(input.closesAt !== undefined ? { closesAt } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(quizzes.id, quizId))
        .returning();
      const saved = rows[0]!;

      await tx.insert(auditEvents).values({
        action: publishing ? 'QUIZ_PUBLISHED' : 'QUIZ_UPDATED',
        actorId: user.id,
        subjectId: quizId,
        details: { classId, status: saved.status },
      });

      if (publishing) {
        await createClassNotifications(tx, classId, {
          type: 'QUIZ_NEW',
          title: `Kuis Baru: ${saved.title}`,
          message: `Kuis ${saved.title} pada kelas ${classRecord.name} sekarang tersedia (${saved.timeLimitMinutes} menit).`,
          targetUrl: `/classes/${classId}/quizzes`,
        });
      }

      return saved;
    });

    return res.json({ quiz: updated });
  } catch (error) {
    handle(next, res, error);
  }
});

classQuizzesRouter.delete('/:quizId', requireRole('DOSEN'), async (req: QuizRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const quizId = uuid.parse(req.params.quizId);
    await assertClassOwner(classId, user);

    await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(quizzes)
        .where(and(eq(quizzes.id, quizId), eq(quizzes.classId, classId)))
        .returning({ id: quizzes.id });
      if (!deleted[0]) throw fail(404, 'NOT_FOUND', 'Kuis tidak ditemukan.');
      await tx.insert(auditEvents).values({
        action: 'QUIZ_DELETED',
        actorId: user.id,
        subjectId: quizId,
        details: { classId },
      });
    });

    return res.status(204).end();
  } catch (error) {
    handle(next, res, error);
  }
});

classQuizzesRouter.post('/:quizId/questions', requireRole('DOSEN'), async (req: QuizRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const quizId = uuid.parse(req.params.quizId);
    await assertClassOwner(classId, user);
    const input = questionInputSchema.parse(req.body);
    validateQuestionPayload(input);

    const createdQuestion = await db.transaction(async (tx) => {
      const quizRows = await tx
        .select()
        .from(quizzes)
        .where(and(eq(quizzes.id, quizId), eq(quizzes.classId, classId)))
        .limit(1);
      const quiz = quizRows[0];
      if (!quiz) throw fail(404, 'NOT_FOUND', 'Kuis tidak ditemukan.');

      const existingCountRows = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(questions)
        .where(eq(questions.quizId, quizId));
      const nextPos = input.position ?? (existingCountRows[0]?.count ?? 0);

      const inserted = await tx
        .insert(questions)
        .values({
          quizId,
          type: input.type,
          prompt: input.prompt,
          points: formatCents(toCents(input.points)),
          position: nextPos,
        })
        .returning();
      const q = inserted[0]!;

      let options: Array<typeof questionOptions.$inferSelect> = [];
      if (input.type === 'MULTIPLE_CHOICE' && input.options) {
        options = await tx
          .insert(questionOptions)
          .values(
            input.options.map((opt, idx) => ({
              questionId: q.id,
              label: opt.label,
              isCorrect: opt.isCorrect,
              position: idx,
            })),
          )
          .returning();
      }

      await tx.insert(auditEvents).values({
        action: 'QUIZ_QUESTION_ADDED',
        actorId: user.id,
        subjectId: q.id,
        details: { classId, quizId, type: q.type },
      });

      return { ...q, options };
    });

    return res.status(201).json({ question: createdQuestion });
  } catch (error) {
    handle(next, res, error);
  }
});

classQuizzesRouter.delete('/:quizId/questions/:questionId', requireRole('DOSEN'), async (req: QuizRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const quizId = uuid.parse(req.params.quizId);
    const questionId = uuid.parse(req.params.questionId);
    await assertClassOwner(classId, user);

    await db.transaction(async (tx) => {
      const quizRows = await tx
        .select()
        .from(quizzes)
        .where(and(eq(quizzes.id, quizId), eq(quizzes.classId, classId)))
        .limit(1);
      const quiz = quizRows[0];
      if (!quiz) throw fail(404, 'NOT_FOUND', 'Kuis tidak ditemukan.');
      if (quiz.status !== 'DRAFT') {
        throw fail(409, 'QUIZ_NOT_DRAFT', 'Pertanyaan hanya dapat dihapus saat kuis berstatus draf.');
      }
      const deleted = await tx
        .delete(questions)
        .where(and(eq(questions.id, questionId), eq(questions.quizId, quizId)))
        .returning({ id: questions.id });
      if (!deleted[0]) throw fail(404, 'NOT_FOUND', 'Pertanyaan tidak ditemukan.');
    });

    return res.status(204).end();
  } catch (error) {
    handle(next, res, error);
  }
});

classQuizzesRouter.get('/:quizId/attempts', requireRole('DOSEN'), async (req: QuizRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const quizId = uuid.parse(req.params.quizId);
    await assertClassOwner(classId, user);

    const quizRows = await db
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.id, quizId), eq(quizzes.classId, classId)))
      .limit(1);
    const quiz = quizRows[0];
    if (!quiz) throw fail(404, 'NOT_FOUND', 'Kuis tidak ditemukan.');

    const attemptRows = await db
      .select({
        id: quizAttempts.id,
        quizId: quizAttempts.quizId,
        studentId: quizAttempts.studentId,
        studentName: users.fullName,
        studentEmail: users.email,
        attemptNumber: quizAttempts.attemptNumber,
        startedAt: quizAttempts.startedAt,
        submittedAt: quizAttempts.submittedAt,
        autoScore: quizAttempts.autoScore,
        manualScore: quizAttempts.manualScore,
        finalScore: quizAttempts.finalScore,
        status: quizAttempts.status,
      })
      .from(quizAttempts)
      .innerJoin(users, eq(quizAttempts.studentId, users.id))
      .where(eq(quizAttempts.quizId, quizId))
      .orderBy(asc(users.fullName), asc(quizAttempts.attemptNumber));

    return res.json({ quiz, attempts: attemptRows });
  } catch (error) {
    handle(next, res, error);
  }
});

classQuizzesRouter.post('/:quizId/attempts', requireRole('MAHASISWA'), async (req: QuizRequest, res, next) => {
  try {
    const user = actor(req);
    const classId = uuid.parse(req.params.classId);
    const quizId = uuid.parse(req.params.quizId);
    const classRecord = await assertClassAccess(classId, user);

    if (classRecord.status === 'CLOSED') {
      throw fail(409, 'CLASS_CLOSED', 'Kelas sudah ditutup sehingga kuis tidak dapat dikerjakan.');
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
      const quizRows = await tx
        .select()
        .from(quizzes)
        .where(and(eq(quizzes.id, quizId), eq(quizzes.classId, classId)))
        .limit(1);
      const quiz = quizRows[0];
      if (!quiz || quiz.status === 'DRAFT') {
        throw fail(404, 'NOT_FOUND', 'Kuis tidak ditemukan.');
      }
      if (quiz.status !== 'PUBLISHED') {
        throw fail(409, 'QUIZ_CLOSED', 'Kuis ini sudah ditutup.');
      }

      const now = new Date();
      if (quiz.opensAt && now < quiz.opensAt) {
        throw fail(409, 'QUIZ_NOT_OPEN', 'Kuis belum dibuka.');
      }
      if (quiz.closesAt && now > quiz.closesAt) {
        throw fail(409, 'QUIZ_EXPIRED', 'Batas waktu pelaksanaan kuis telah berakhir.');
      }

      const existingAttempts = await tx
        .select()
        .from(quizAttempts)
        .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.studentId, user.id)))
        .orderBy(asc(quizAttempts.attemptNumber));

      const inProgress = existingAttempts.find((a) => a.status === 'IN_PROGRESS');
      if (inProgress) {
        const expiresAt = new Date(inProgress.startedAt.getTime() + quiz.timeLimitMinutes * 60_000);
        if (now <= expiresAt) {
          const qs = await loadQuizQuestions(quiz.id, false, tx);
          const savedAnswers = await tx
            .select({
              questionId: attemptAnswers.questionId,
              selectedOptionId: attemptAnswers.selectedOptionId,
              textAnswer: attemptAnswers.textAnswer,
              updatedAt: attemptAnswers.updatedAt,
            })
            .from(attemptAnswers)
            .where(eq(attemptAnswers.attemptId, inProgress.id));
          return {
            attempt: inProgress,
            quiz,
            questions: qs,
            answers: savedAnswers,
            expiresAt,
          };
        }
        // Auto-submit expired in-progress attempt before counting attempts
        await finalizeAttemptInTx(tx, inProgress.id, quiz, expiresAt);
      }

      if (existingAttempts.length >= quiz.maxAttempts) {
        throw fail(409, 'MAX_ATTEMPTS_REACHED', 'Anda telah mencapai batas maksimal percobaan kuis.');
      }

      const inserted = await tx
        .insert(quizAttempts)
        .values({
          quizId,
          studentId: user.id,
          attemptNumber: existingAttempts.length + 1,
          startedAt: now,
          status: 'IN_PROGRESS',
        })
        .returning();
      const attempt = inserted[0]!;

      await tx.insert(auditEvents).values({
        action: 'QUIZ_ATTEMPT_STARTED',
        actorId: user.id,
        subjectId: attempt.id,
        details: { classId, quizId, attemptNumber: attempt.attemptNumber },
      });

      const qs = await loadQuizQuestions(quiz.id, false, tx);
      const expiresAt = new Date(attempt.startedAt.getTime() + quiz.timeLimitMinutes * 60_000);

      return {
        attempt,
        quiz,
        questions: qs,
        answers: [],
        expiresAt,
      };
    });

    return res.status(201).json(result);
  } catch (error) {
    handle(next, res, error);
  }
});

// ---------- ATTEMPT-SCOPED ROUTER (/api/quizzes) ----------

const quizAttemptRouter = Router();
quizAttemptRouter.use(authenticate);
quizAttemptRouter.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return csrf(req, res, next);
});

quizAttemptRouter.get('/attempts/:attemptId', async (req: QuizRequest, res, next) => {
  try {
    const user = actor(req);
    const attemptId = uuid.parse(req.params.attemptId);

    const payload = await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          attempt: quizAttempts,
          quiz: quizzes,
          classRecord: classes,
          studentName: users.fullName,
          studentEmail: users.email,
        })
        .from(quizAttempts)
        .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
        .innerJoin(classes, eq(quizzes.classId, classes.id))
        .innerJoin(users, eq(quizAttempts.studentId, users.id))
        .where(eq(quizAttempts.id, attemptId))
        .limit(1);

      const found = rows[0];
      if (!found) throw fail(404, 'NOT_FOUND', 'Percobaan kuis tidak ditemukan.');

      if (user.role === 'MAHASISWA') {
        if (found.attempt.studentId !== user.id) throw fail(403, 'FORBIDDEN', 'Akses tidak diizinkan.');
      } else if (user.role === 'DOSEN') {
        if (found.classRecord.ownerId !== user.id) throw fail(404, 'NOT_FOUND', 'Percobaan kuis tidak ditemukan.');
      } else {
        throw fail(403, 'FORBIDDEN', 'Akses tidak diizinkan.');
      }

      let attempt = found.attempt;
      const expiresAt = new Date(attempt.startedAt.getTime() + found.quiz.timeLimitMinutes * 60_000);
      const now = new Date();
      if (attempt.status === 'IN_PROGRESS' && now > expiresAt) {
        attempt = await finalizeAttemptInTx(tx, attempt.id, found.quiz, expiresAt);
      }

      // Answer key security: NEVER expose isCorrect to MAHASISWA
      const qs = await loadQuizQuestions(found.quiz.id, user.role === 'DOSEN', tx);
      const ans = await tx
        .select()
        .from(attemptAnswers)
        .where(eq(attemptAnswers.attemptId, attempt.id));

      return {
        attempt,
        quiz: found.quiz,
        student: { fullName: found.studentName, email: found.studentEmail },
        questions: qs,
        answers: ans,
        expiresAt,
      };
    });

    return res.json(payload);
  } catch (error) {
    handle(next, res, error);
  }
});

quizAttemptRouter.put('/attempts/:attemptId/answers', requireRole('MAHASISWA'), async (req: QuizRequest, res, next) => {
  try {
    const user = actor(req);
    const attemptId = uuid.parse(req.params.attemptId);
    const input = autosaveAnswersSchema.parse(req.body);

    const savedAt = await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          attempt: quizAttempts,
          quiz: quizzes,
        })
        .from(quizAttempts)
        .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
        .where(eq(quizAttempts.id, attemptId))
        .limit(1);
      const found = rows[0];
      if (!found || found.attempt.studentId !== user.id) {
        throw fail(404, 'NOT_FOUND', 'Percobaan kuis tidak ditemukan.');
      }
      if (found.attempt.status !== 'IN_PROGRESS') {
        throw fail(409, 'ATTEMPT_LOCKED', 'Kuis sudah dikumpulkan dan tidak dapat diubah lagi.');
      }

      const now = new Date();
      const expiresAt = new Date(found.attempt.startedAt.getTime() + found.quiz.timeLimitMinutes * 60_000);
      if (now > expiresAt) {
        await finalizeAttemptInTx(tx, attemptId, found.quiz, expiresAt);
        throw fail(409, 'TIME_EXPIRED', 'Waktu pengerjaan kuis telah habis; jawaban tersimpan telah dikunci otomatis.');
      }

      const validQuestions = await tx
        .select()
        .from(questions)
        .where(eq(questions.quizId, found.quiz.id));
      const questionMap = new Map(validQuestions.map((q) => [q.id, q]));

      const validOptions = validQuestions.length > 0
        ? await tx
            .select({ id: questionOptions.id, questionId: questionOptions.questionId })
            .from(questionOptions)
            .where(inArray(questionOptions.questionId, validQuestions.map((q) => q.id)))
        : [];
      const optionMap = new Map(validOptions.map((o) => [o.id, o.questionId]));

      for (const item of input.answers) {
        const question = questionMap.get(item.questionId);
        if (!question) throw fail(400, 'INVALID_QUESTION', 'Pertanyaan tidak termasuk dalam kuis ini.');
        if (item.selectedOptionId && optionMap.get(item.selectedOptionId) !== item.questionId) {
          throw fail(400, 'INVALID_OPTION', 'Opsi jawaban tidak valid untuk pertanyaan ini.');
        }

        await tx
          .insert(attemptAnswers)
          .values({
            attemptId,
            questionId: item.questionId,
            selectedOptionId: question.type === 'MULTIPLE_CHOICE' ? (item.selectedOptionId ?? null) : null,
            textAnswer: question.type === 'ESSAY' ? (item.textAnswer ?? null) : null,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [attemptAnswers.attemptId, attemptAnswers.questionId],
            set: {
              selectedOptionId: question.type === 'MULTIPLE_CHOICE' ? (item.selectedOptionId ?? null) : null,
              textAnswer: question.type === 'ESSAY' ? (item.textAnswer ?? null) : null,
              updatedAt: now,
            },
          });
      }

      return now;
    });

    return res.json({ savedAt, message: 'Tersimpan otomatis.' });
  } catch (error) {
    handle(next, res, error);
  }
});

quizAttemptRouter.post('/attempts/:attemptId/submit', requireRole('MAHASISWA'), async (req: QuizRequest, res, next) => {
  try {
    const user = actor(req);
    const attemptId = uuid.parse(req.params.attemptId);
    const input = submitAttemptSchema.parse(req.body ?? {});

    const submitted = await db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
      const rows = await tx
        .select({
          attempt: quizAttempts,
          quiz: quizzes,
        })
        .from(quizAttempts)
        .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
        .where(eq(quizAttempts.id, attemptId))
        .limit(1);
      const found = rows[0];
      if (!found || found.attempt.studentId !== user.id) {
        throw fail(404, 'NOT_FOUND', 'Percobaan kuis tidak ditemukan.');
      }

      if (found.attempt.status !== 'IN_PROGRESS') {
        return found.attempt;
      }

      const now = new Date();
      const expiresAt = new Date(found.attempt.startedAt.getTime() + found.quiz.timeLimitMinutes * 60_000);
      const withinGrace = now.getTime() <= expiresAt.getTime() + 5_000;

      if (input.answers && input.answers.length > 0 && withinGrace) {
        const validQuestions = await tx
          .select()
          .from(questions)
          .where(eq(questions.quizId, found.quiz.id));
        const questionMap = new Map(validQuestions.map((q) => [q.id, q]));

        for (const item of input.answers) {
          const question = questionMap.get(item.questionId);
          if (!question) continue;
          await tx
            .insert(attemptAnswers)
            .values({
              attemptId,
              questionId: item.questionId,
              selectedOptionId: question.type === 'MULTIPLE_CHOICE' ? (item.selectedOptionId ?? null) : null,
              textAnswer: question.type === 'ESSAY' ? (item.textAnswer ?? null) : null,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [attemptAnswers.attemptId, attemptAnswers.questionId],
              set: {
                selectedOptionId: question.type === 'MULTIPLE_CHOICE' ? (item.selectedOptionId ?? null) : null,
                textAnswer: question.type === 'ESSAY' ? (item.textAnswer ?? null) : null,
                updatedAt: now,
              },
            });
        }
      }

      const finalized = await finalizeAttemptInTx(tx, attemptId, found.quiz, now > expiresAt ? expiresAt : now);

      await tx.insert(auditEvents).values({
        action: 'QUIZ_ATTEMPT_SUBMITTED',
        actorId: user.id,
        subjectId: attemptId,
        details: {
          classId: found.quiz.classId,
          quizId: found.quiz.id,
          status: finalized.status,
          autoScore: finalized.autoScore,
          finalScore: finalized.finalScore,
        },
      });

      return finalized;
    });

    return res.json({ attempt: submitted });
  } catch (error) {
    handle(next, res, error);
  }
});

quizAttemptRouter.patch('/attempts/:attemptId/grade-essay', requireRole('DOSEN'), async (req: QuizRequest, res, next) => {
  try {
    const user = actor(req);
    const attemptId = uuid.parse(req.params.attemptId);
    const input = gradeEssaySchema.parse(req.body);

    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          attempt: quizAttempts,
          quiz: quizzes,
          classRecord: classes,
        })
        .from(quizAttempts)
        .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
        .innerJoin(classes, eq(quizzes.classId, classes.id))
        .where(eq(quizAttempts.id, attemptId))
        .limit(1);

      const found = rows[0];
      if (!found || found.classRecord.ownerId !== user.id) {
        throw fail(404, 'NOT_FOUND', 'Percobaan kuis tidak ditemukan.');
      }

      let attempt = found.attempt;
      if (attempt.status === 'IN_PROGRESS') {
        const expiresAt = new Date(attempt.startedAt.getTime() + found.quiz.timeLimitMinutes * 60_000);
        if (new Date() > expiresAt) {
          attempt = await finalizeAttemptInTx(tx, attempt.id, found.quiz, expiresAt);
        } else {
          throw fail(409, 'ATTEMPT_IN_PROGRESS', 'Mahasiswa masih mengerjakan percobaan kuis ini.');
        }
      }

      const essayQuestions = await tx
        .select()
        .from(questions)
        .where(and(eq(questions.quizId, found.quiz.id), eq(questions.type, 'ESSAY')));

      const essayMap = new Map(essayQuestions.map((q) => [q.id, q]));
      const now = new Date();

      for (const gradeItem of input.grades) {
        const question = essayMap.get(gradeItem.questionId);
        if (!question) {
          throw fail(400, 'INVALID_QUESTION', 'Soal bukan merupakan soal esai pada kuis ini.');
        }
        const maxCents = toCents(question.points);
        const awardedCents = toCents(gradeItem.pointsAwarded);
        if (awardedCents < 0 || awardedCents > maxCents) {
          throw fail(400, 'INVALID_SCORE', `Nilai esai harus antara 0 hingga ${question.points}.`);
        }

        await tx
          .insert(attemptAnswers)
          .values({
            attemptId,
            questionId: gradeItem.questionId,
            pointsAwarded: formatCents(awardedCents),
            feedback: gradeItem.feedback?.trim() || null,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [attemptAnswers.attemptId, attemptAnswers.questionId],
            set: {
              pointsAwarded: formatCents(awardedCents),
              feedback: gradeItem.feedback?.trim() || null,
              updatedAt: now,
            },
          });
      }

      const updatedAnswers = await tx
        .select()
        .from(attemptAnswers)
        .where(eq(attemptAnswers.attemptId, attemptId));
      const answerMap = new Map(updatedAnswers.map((a) => [a.questionId, a]));

      let manualCents = 0;
      let allEssaysGraded = true;
      for (const eqItem of essayQuestions) {
        const ans = answerMap.get(eqItem.id);
        if (!ans || ans.pointsAwarded === null || ans.pointsAwarded === undefined) {
          allEssaysGraded = false;
        } else {
          manualCents += toCents(ans.pointsAwarded);
        }
      }

      const autoCents = toCents(attempt.autoScore);
      const manualScore = formatCents(manualCents);
      const finalScore = allEssaysGraded ? formatCents(autoCents + manualCents) : null;
      const nextStatus = allEssaysGraded ? 'FINAL' : 'PROVISIONAL';

      const savedAttemptRows = await tx
        .update(quizAttempts)
        .set({
          manualScore,
          finalScore,
          status: nextStatus,
        })
        .where(eq(quizAttempts.id, attemptId))
        .returning();
      const savedAttempt = savedAttemptRows[0]!;

      await tx.insert(auditEvents).values({
        action: 'QUIZ_ESSAY_GRADED',
        actorId: user.id,
        subjectId: attemptId,
        details: {
          classId: found.quiz.classId,
          quizId: found.quiz.id,
          studentId: attempt.studentId,
          manualScore,
          finalScore,
          status: nextStatus,
        },
      });

      if (nextStatus === 'FINAL') {
        await createClassNotifications(
          tx,
          found.quiz.classId,
          {
            type: 'GRADE_PUBLISHED',
            title: `Nilai Kuis Final: ${found.quiz.title}`,
            message: `Penilaian esai pada kuis ${found.quiz.title} telah selesai. Skor akhir Anda: ${finalScore}.`,
            targetUrl: `/classes/${found.quiz.classId}/grades`,
          },
          [attempt.studentId],
        );
      }

      return savedAttempt;
    });

    return res.json({ attempt: result });
  } catch (error) {
    handle(next, res, error);
  }
});

export { classQuizzesRouter, quizAttemptRouter };
