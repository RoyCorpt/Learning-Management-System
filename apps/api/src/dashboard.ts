import { Algorithm, hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../../../src/db/index.js';
import {
  announcements,
  assignments,
  auditEvents,
  classes,
  forumTopics,
  memberships,
  quizAttempts,
  quizzes,
  submissions,
  users,
  type AccountStatus,
  type Role,
} from '../../../src/db/schema.js';
import { authenticate, csrf, requireRole } from './auth.js';

type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  status: AccountStatus;
  mustChangePassword: boolean;
};

type DashboardRequest = Request & { auth?: AuthUser };

const passwordOptions = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(150).optional(),
  currentPassword: z.string().min(1).max(200).optional(),
  newPassword: z.string().min(12).max(200).optional(),
}).strict().refine((v) => v.fullName !== undefined || v.newPassword !== undefined, {
  message: 'Tidak ada perubahan yang dikirimkan.',
});

export type UpcomingDeadlineItem = {
  kind: 'ASSIGNMENT' | 'QUIZ';
  id: string;
  classId: string;
  className: string;
  title: string;
  deadlineAt: string | null;
  targetUrl: string;
};

async function getUpcomingDeadlinesForStudent(studentId: string): Promise<UpcomingDeadlineItem[]> {
  const enrolledClasses = await db
    .select({
      id: classes.id,
      name: classes.name,
    })
    .from(classes)
    .innerJoin(memberships, and(eq(memberships.classId, classes.id), eq(memberships.userId, studentId)))
    .where(eq(classes.status, 'OPEN'));

  if (enrolledClasses.length === 0) return [];
  const classIds = enrolledClasses.map((c) => c.id);
  const classNameMap = new Map(enrolledClasses.map((c) => [c.id, c.name]));
  const now = new Date();

  const openAssignments = await db
    .select()
    .from(assignments)
    .where(and(inArray(assignments.classId, classIds), eq(assignments.status, 'OPEN')));

  const mySubmissions = openAssignments.length > 0
    ? await db
        .select({ assignmentId: submissions.assignmentId })
        .from(submissions)
        .where(
          and(
            eq(submissions.studentId, studentId),
            inArray(submissions.assignmentId, openAssignments.map((a) => a.id)),
          ),
        )
    : [];
  const submittedIds = new Set(mySubmissions.map((s) => s.assignmentId));

  const items: UpcomingDeadlineItem[] = [];
  for (const a of openAssignments) {
    if (submittedIds.has(a.id)) continue;
    if (a.dueAt && now > a.dueAt && !a.allowLate) continue;
    items.push({
      kind: 'ASSIGNMENT',
      id: a.id,
      classId: a.classId,
      className: classNameMap.get(a.classId) ?? '',
      title: a.title,
      deadlineAt: a.dueAt ? a.dueAt.toISOString() : null,
      targetUrl: `/classes/${a.classId}/assignments`,
    });
  }

  const publishedQuizzes = await db
    .select()
    .from(quizzes)
    .where(and(inArray(quizzes.classId, classIds), eq(quizzes.status, 'PUBLISHED')));

  const myAttempts = publishedQuizzes.length > 0
    ? await db
        .select({
          quizId: quizAttempts.quizId,
          status: quizAttempts.status,
        })
        .from(quizAttempts)
        .where(
          and(
            eq(quizAttempts.studentId, studentId),
            inArray(quizAttempts.quizId, publishedQuizzes.map((q) => q.id)),
          ),
        )
    : [];

  const attemptCountMap = new Map<string, number>();
  for (const att of myAttempts) {
    attemptCountMap.set(att.quizId, (attemptCountMap.get(att.quizId) ?? 0) + 1);
  }

  for (const q of publishedQuizzes) {
    if (q.closesAt && now > q.closesAt) continue;
    const count = attemptCountMap.get(q.id) ?? 0;
    if (count >= q.maxAttempts) continue;
    items.push({
      kind: 'QUIZ',
      id: q.id,
      classId: q.classId,
      className: classNameMap.get(q.classId) ?? '',
      title: q.title,
      deadlineAt: q.closesAt ? q.closesAt.toISOString() : null,
      targetUrl: `/classes/${q.classId}/quizzes`,
    });
  }

  items.sort((a, b) => {
    if (a.deadlineAt && b.deadlineAt) return a.deadlineAt.localeCompare(b.deadlineAt);
    if (a.deadlineAt) return -1;
    if (b.deadlineAt) return 1;
    return a.title.localeCompare(b.title);
  });

  return items;
}

// ---------- STUDENT UPCOMING DEADLINES (/api/students) ----------

const studentRouter = Router();
studentRouter.use(authenticate);

studentRouter.get('/upcoming-deadlines', requireRole('MAHASISWA'), async (req: DashboardRequest, res: Response, next: NextFunction) => {
  try {
    const deadlines = await getUpcomingDeadlinesForStudent(req.auth!.id);
    return res.json({ deadlines });
  } catch (error) {
    next(error);
  }
});

// ---------- ROLE SUMMARY DASHBOARD (/api/dashboard) ----------

const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get('/summary', async (req: DashboardRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.auth!;

    if (user.role === 'MAHASISWA') {
      const activeClasses = await db
        .select({ id: classes.id })
        .from(classes)
        .innerJoin(memberships, and(eq(memberships.classId, classes.id), eq(memberships.userId, user.id)))
        .where(eq(classes.status, 'OPEN'));
      const classIds = activeClasses.map((c) => c.id);

      const upcomingDeadlines = (await getUpcomingDeadlinesForStudent(user.id)).slice(0, 6);

      const assignmentGrades = await db
        .select({
          id: submissions.id,
          classId: classes.id,
          className: classes.name,
          title: assignments.title,
          score: submissions.score,
          feedback: submissions.feedback,
          publishedAt: submissions.gradedAt,
        })
        .from(submissions)
        .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
        .innerJoin(classes, eq(assignments.classId, classes.id))
        .where(and(eq(submissions.studentId, user.id), eq(submissions.gradeStatus, 'PUBLISHED')))
        .orderBy(desc(submissions.gradedAt))
        .limit(5);

      const quizGrades = await db
        .select({
          id: quizAttempts.id,
          classId: classes.id,
          className: classes.name,
          title: quizzes.title,
          score: quizAttempts.finalScore,
          autoScore: quizAttempts.autoScore,
          status: quizAttempts.status,
          publishedAt: quizAttempts.submittedAt,
        })
        .from(quizAttempts)
        .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
        .innerJoin(classes, eq(quizzes.classId, classes.id))
        .where(and(eq(quizAttempts.studentId, user.id), sql`${quizAttempts.status} <> 'IN_PROGRESS'`))
        .orderBy(desc(quizAttempts.submittedAt))
        .limit(5);

      const recentGrades = [
        ...assignmentGrades.map((g) => ({
          kind: 'ASSIGNMENT' as const,
          id: g.id,
          classId: g.classId,
          className: g.className,
          title: g.title,
          score: g.score ?? '0.00',
          feedback: g.feedback,
          statusLabel: 'Nilai Tugas',
          dateAt: (g.publishedAt ?? new Date()).toISOString(),
        })),
        ...quizGrades.map((q) => ({
          kind: 'QUIZ' as const,
          id: q.id,
          classId: q.classId,
          className: q.className,
          title: q.title,
          score: q.status === 'FINAL' ? (q.score ?? q.autoScore) : q.autoScore,
          feedback: null,
          statusLabel: q.status === 'FINAL' ? 'Skor Final Kuis' : 'Skor Sementara Kuis',
          dateAt: (q.publishedAt ?? new Date()).toISOString(),
        })),
      ]
        .sort((a, b) => b.dateAt.localeCompare(a.dateAt))
        .slice(0, 5);

      const recentAnnouncements = classIds.length > 0
        ? await db
            .select({
              id: announcements.id,
              classId: announcements.classId,
              className: classes.name,
              authorName: users.fullName,
              title: announcements.title,
              body: announcements.body,
              createdAt: announcements.createdAt,
            })
            .from(announcements)
            .innerJoin(classes, eq(announcements.classId, classes.id))
            .innerJoin(users, eq(announcements.authorId, users.id))
            .where(inArray(announcements.classId, classIds))
            .orderBy(desc(announcements.createdAt))
            .limit(3)
        : [];

      return res.json({
        role: 'MAHASISWA',
        activeClassesCount: activeClasses.length,
        upcomingDeadlines,
        recentGrades,
        recentAnnouncements: recentAnnouncements.map((a) => ({
          id: a.id,
          classId: a.classId,
          className: a.className,
          authorName: a.authorName,
          title: a.title,
          body: a.body,
          createdAt: a.createdAt.toISOString(),
        })),
      });
    }

    if (user.role === 'DOSEN') {
      const ownedClasses = await db
        .select()
        .from(classes)
        .where(eq(classes.ownerId, user.id))
        .orderBy(desc(classes.createdAt));

      if (ownedClasses.length === 0) {
        return res.json({ role: 'DOSEN', classSummaries: [] });
      }

      const classIds = ownedClasses.map((c) => c.id);

      const memberCounts = await db
        .select({
          classId: memberships.classId,
          count: sql<number>`count(*)::int`,
        })
        .from(memberships)
        .where(inArray(memberships.classId, classIds))
        .groupBy(memberships.classId);

      const assignmentRows = await db
        .select({
          id: assignments.id,
          classId: assignments.classId,
        })
        .from(assignments)
        .where(inArray(assignments.classId, classIds));

      const quizRows = await db
        .select({
          id: quizzes.id,
          classId: quizzes.classId,
        })
        .from(quizzes)
        .where(inArray(quizzes.classId, classIds));

      const submissionRows = await db
        .select({
          classId: assignments.classId,
          score: submissions.score,
        })
        .from(submissions)
        .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
        .where(inArray(assignments.classId, classIds));

      const recentSince = new Date(Date.now() - 7 * 24 * 3600_000);
      const announcementCounts = await db
        .select({
          classId: announcements.classId,
          count: sql<number>`count(*)::int`,
        })
        .from(announcements)
        .where(and(inArray(announcements.classId, classIds), sql`${announcements.createdAt} >= ${recentSince}`))
        .groupBy(announcements.classId);

      const forumCounts = await db
        .select({
          classId: forumTopics.classId,
          count: sql<number>`count(*)::int`,
        })
        .from(forumTopics)
        .where(and(inArray(forumTopics.classId, classIds), sql`${forumTopics.createdAt} >= ${recentSince}`))
        .groupBy(forumTopics.classId);

      const studentCountMap = new Map(memberCounts.map((m) => [m.classId, m.count]));
      const assignmentCountMap = new Map<string, number>();
      for (const a of assignmentRows) {
        assignmentCountMap.set(a.classId, (assignmentCountMap.get(a.classId) ?? 0) + 1);
      }
      const quizCountMap = new Map<string, number>();
      for (const q of quizRows) {
        quizCountMap.set(q.classId, (quizCountMap.get(q.classId) ?? 0) + 1);
      }

      const subCountMap = new Map<string, number>();
      const scoreSumCentsMap = new Map<string, { sumCents: number; count: number }>();
      for (const s of submissionRows) {
        subCountMap.set(s.classId, (subCountMap.get(s.classId) ?? 0) + 1);
        if (s.score !== null) {
          const bucket = scoreSumCentsMap.get(s.classId) ?? { sumCents: 0, count: 0 };
          bucket.sumCents += Math.round(Number(s.score) * 100);
          bucket.count += 1;
          scoreSumCentsMap.set(s.classId, bucket);
        }
      }

      const annMap = new Map(announcementCounts.map((a) => [a.classId, a.count]));
      const forumMap = new Map(forumCounts.map((f) => [f.classId, f.count]));

      const classSummaries = ownedClasses.map((c) => {
        const studentCount = studentCountMap.get(c.id) ?? 0;
        const assignmentCount = assignmentCountMap.get(c.id) ?? 0;
        const expectedSubmissions = studentCount * assignmentCount;
        const actualSubmissions = subCountMap.get(c.id) ?? 0;
        const submissionRatio = expectedSubmissions > 0
          ? Math.min(100, Math.round((actualSubmissions / expectedSubmissions) * 100))
          : 0;
        const scoreBucket = scoreSumCentsMap.get(c.id);
        const averageScore = scoreBucket && scoreBucket.count > 0
          ? (Math.round(scoreBucket.sumCents / scoreBucket.count) / 100).toFixed(2)
          : null;

        return {
          classId: c.id,
          className: c.name,
          status: c.status,
          studentCount,
          assignmentCount,
          quizCount: quizCountMap.get(c.id) ?? 0,
          actualSubmissions,
          expectedSubmissions,
          submissionRatio,
          averageScore,
          recentActivityCount: (annMap.get(c.id) ?? 0) + (forumMap.get(c.id) ?? 0),
        };
      });

      return res.json({ role: 'DOSEN', classSummaries });
    }

    // ADMIN summary (FR-35)
    const activeUserRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.status, 'ACTIVE'));

    const activeClassRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(classes)
      .where(eq(classes.status, 'OPEN'));

    const pendingStudents = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.role, 'MAHASISWA'), eq(users.status, 'PENDING')))
      .orderBy(desc(users.createdAt));

    return res.json({
      role: 'ADMIN',
      totalActiveUsers: activeUserRows[0]?.count ?? 0,
      totalActiveClasses: activeClassRows[0]?.count ?? 0,
      pendingStudentCount: pendingStudents.length,
      pendingStudents,
    });
  } catch (error) {
    next(error);
  }
});

// ---------- USER PROFILE EDITING (/api/users/me/profile) ----------

const userProfileRouter = Router();
userProfileRouter.use(authenticate);
userProfileRouter.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  return csrf(req, res, next);
});

userProfileRouter.patch('/me/profile', async (req: DashboardRequest, res: Response, next: NextFunction) => {
  try {
    const authUser = req.auth!;
    const input = updateProfileSchema.parse(req.body);

    const foundRows = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
    const currentUser = foundRows[0];
    if (!currentUser) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Akun tidak ditemukan.' } });
    }

    let nextPasswordHash: string | undefined;
    if (input.newPassword !== undefined) {
      if (!input.currentPassword) {
        return res.status(400).json({
          error: { code: 'INVALID_INPUT', message: 'Kata sandi saat ini wajib diisi.' },
        });
      }
      const valid = await argon2Verify(currentUser.passwordHash, input.currentPassword).catch(() => false);
      if (!valid) {
        return res.status(400).json({
          error: { code: 'INVALID_CREDENTIALS', message: 'Kata sandi saat ini tidak sesuai.' },
        });
      }
      nextPasswordHash = await argon2Hash(input.newPassword, passwordOptions);
    }

    const updated = await db.transaction(async (tx) => {
      const savedRows = await tx
        .update(users)
        .set({
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(nextPasswordHash !== undefined ? { passwordHash: nextPasswordHash, mustChangePassword: false } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, authUser.id))
        .returning({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          mustChangePassword: users.mustChangePassword,
        });

      await tx.insert(auditEvents).values({
        action: nextPasswordHash ? 'USER_PROFILE_AND_PASSWORD_UPDATED' : 'USER_PROFILE_UPDATED',
        actorId: authUser.id,
        subjectId: authUser.id,
        details: {
          updatedName: input.fullName !== undefined,
          updatedPassword: Boolean(nextPasswordHash),
        },
      });

      return savedRows[0]!;
    });

    return res.json({ user: updated, message: 'Profil berhasil diperbarui.' });
  } catch (error) {
    next(error);
  }
});

export { studentRouter, dashboardRouter, userProfileRouter };
