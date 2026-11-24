import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { inArray, like, or } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db } from '../../../src/db/index.js';
import {
  assignments,
  auditEvents,
  classes,
  memberships,
  questionOptions,
  questions,
  quizzes,
  sessions,
  users,
} from '../../../src/db/schema.js';
import { containsLatexMath, splitMathSegments } from '../../web/src/lib/math.ts';

const enabled = process.env.RUN_DB_INTEGRATION === '1' ? it : it.skip;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TINY_WEBP_BASE64 = 'UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
const TINY_PDF_BASE64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n').toString('base64');

async function cleanFixtures() {
  const prefixes = ['media-dosen-', 'media-student-', 'media-outsider-'];
  const matchedUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(or(...prefixes.map((prefix) => like(users.email, `${prefix}%`))));
  const userIds = matchedUsers.map((u) => u.id);
  if (userIds.length === 0) return;

  const ownedClasses = await db
    .select({ id: classes.id })
    .from(classes)
    .where(inArray(classes.ownerId, userIds));
  const classIds = ownedClasses.map((c) => c.id);

  if (classIds.length > 0) {
    const classQuizzes = await db
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(inArray(quizzes.classId, classIds));
    const quizIds = classQuizzes.map((q) => q.id);
    if (quizIds.length > 0) {
      const quizQuestions = await db
        .select({ id: questions.id })
        .from(questions)
        .where(inArray(questions.quizId, quizIds));
      const questionIds = quizQuestions.map((q) => q.id);
      if (questionIds.length > 0) {
        await db.delete(questionOptions).where(inArray(questionOptions.questionId, questionIds));
        await db.delete(questions).where(inArray(questions.id, questionIds));
      }
      await db.delete(quizzes).where(inArray(quizzes.id, quizIds));
    }
    await db.delete(assignments).where(inArray(assignments.classId, classIds));
    await db
      .delete(memberships)
      .where(or(inArray(memberships.userId, userIds), inArray(memberships.classId, classIds)));
    await db
      .delete(auditEvents)
      .where(or(inArray(auditEvents.actorId, userIds), inArray(auditEvents.subjectId, classIds)));
    await db.delete(classes).where(inArray(classes.id, classIds));
  } else {
    await db.delete(memberships).where(inArray(memberships.userId, userIds));
    await db.delete(auditEvents).where(inArray(auditEvents.actorId, userIds));
  }

  await db.delete(sessions).where(inArray(sessions.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
}

describe('LaTeX math segment parser', () => {
  it('parses inline, block, and backslash math delimiters accurately', () => {
    const segments = splitMathSegments('Hitung $x^2 + y^2$ dan $$\\int_0^1 f(x)\\,dx$$ lalu \\(a/b\\) dan \\[E=mc^2\\].');
    expect(segments).toEqual([
      { type: 'text', content: 'Hitung ' },
      { type: 'math', content: 'x^2 + y^2', display: false },
      { type: 'text', content: ' dan ' },
      { type: 'math', content: '\\int_0^1 f(x)\\,dx', display: true },
      { type: 'text', content: ' lalu ' },
      { type: 'math', content: 'a/b', display: false },
      { type: 'text', content: ' dan ' },
      { type: 'math', content: 'E=mc^2', display: true },
      { type: 'text', content: '.' },
    ]);
    expect(containsLatexMath('Rumus $E = mc^2$')).toBe(true);
  });

  it('does not treat currency or escaped dollars as LaTeX math', () => {
    const currency = splitMathSegments('Biaya lab sebesar \\$50 atau $ 25 per bulan.');
    expect(currency).toEqual([{ type: 'text', content: 'Biaya lab sebesar \\$50 atau $ 25 per bulan.' }]);
    expect(containsLatexMath('Harga buku $ 120.000')).toBe(false);
    expect(containsLatexMath('Tanpa rumus sama sekali')).toBe(false);
  });
});

describe('Assignment & quiz attachments, images, and external links', () => {
  enabled('supports secure file, image, and link attachments on assignments, quizzes, and quiz questions', async () => {
    const { createApp } = await import('./app.js');
    await cleanFixtures();

    const suffix = randomUUID();
    const [dosen] = await db
      .insert(users)
      .values({
        email: `media-dosen-${suffix}@example.invalid`,
        fullName: 'Media Test Dosen',
        role: 'DOSEN',
        status: 'ACTIVE',
        passwordHash: 'unused-test-hash',
      })
      .returning();
    const [student] = await db
      .insert(users)
      .values({
        email: `media-student-${suffix}@example.invalid`,
        fullName: 'Media Test Student',
        role: 'MAHASISWA',
        status: 'ACTIVE',
        passwordHash: 'unused-test-hash',
      })
      .returning();
    const [outsider] = await db
      .insert(users)
      .values({
        email: `media-outsider-${suffix}@example.invalid`,
        fullName: 'Media Test Outsider',
        role: 'MAHASISWA',
        status: 'ACTIVE',
        passwordHash: 'unused-test-hash',
      })
      .returning();

    const sessionTokens = new Map<string, { cookie: string; csrf: string }>();
    for (const u of [dosen!, student!, outsider!]) {
      const token = randomBytes(32).toString('base64url');
      const csrf = randomBytes(32).toString('base64url');
      await db.insert(sessions).values({
        userId: u.id,
        tokenHash: digest(token),
        csrfHash: digest(csrf),
        expiresAt: new Date(Date.now() + 120_000),
      });
      sessionTokens.set(u.id, { cookie: `lms_session=${token}; lms_csrf=${csrf}`, csrf });
    }

    let server: Server | undefined;
    try {
      server = createApp().listen(0);
      await new Promise<void>((resolve) => server!.once('listening', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Test server failed to bind');
      const origin = `http://127.0.0.1:${address.port}`;

      const req = (userId: string, path: string, init: RequestInit = {}) => {
        const sess = sessionTokens.get(userId)!;
        const headers = new Headers(init.headers);
        headers.set('Cookie', sess.cookie);
        if (init.method && init.method !== 'GET') headers.set('X-CSRF-Token', sess.csrf);
        if (init.body) headers.set('Content-Type', 'application/json');
        return fetch(`${origin}${path}`, { ...init, headers });
      };

      // Create class and enroll student
      const classRes = await req(dosen!.id, '/api/classes', {
        method: 'POST',
        body: JSON.stringify({ name: 'Matematika Diskrit LaTeX' }),
      });
      expect(classRes.status).toBe(201);
      const classId = ((await classRes.json()) as { class: { id: string } }).class.id;

      await db.insert(memberships).values({ classId, userId: student!.id });

      // Reject unsafe URL and unsupported MIME on assignment creation
      const badUrlRes = await req(dosen!.id, `/api/classes/${classId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          title: 'Tugas Bahaya',
          instructions: 'Test',
          externalUrl: 'javascript:alert(1)',
        }),
      });
      expect(badUrlRes.status).toBe(400);

      const badMimeRes = await req(dosen!.id, `/api/classes/${classId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          title: 'Tugas EXE',
          instructions: 'Test',
          attachment: {
            name: 'virus.exe',
            mimeType: 'application/x-msdownload',
            dataBase64: Buffer.from('MZ').toString('base64'),
          },
        }),
      });
      expect(badMimeRes.status).toBe(400);

      // Create assignment with WEBP image attachment & external link
      const assignImageRes = await req(dosen!.id, `/api/classes/${classId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          title: 'Tugas Integral $\\int_0^1 x^2 dx$',
          instructions: 'Selesaikan persamaan $$E = mc^2$$ berdasarkan diagram terlampir.',
          externalUrl: 'https://example.org/referensi-kalkulus',
          attachment: {
            name: 'diagram-integral.webp',
            mimeType: 'image/webp',
            dataBase64: TINY_WEBP_BASE64,
          },
        }),
      });
      expect(assignImageRes.status).toBe(201);
      const assignImageBody = (await assignImageRes.json()) as {
        assignment: Record<string, unknown> & {
          id: string;
          externalUrl: string;
          attachmentName: string;
          attachmentMime: string;
        };
      };
      expect(assignImageBody.assignment.externalUrl).toBe('https://example.org/referensi-kalkulus');
      expect(assignImageBody.assignment.attachmentName).toBe('diagram-integral.webp');
      expect(assignImageBody.assignment.attachmentMime).toBe('image/webp');
      expect(assignImageBody.assignment.attachmentData).toBeUndefined();

      // Assignment inline preview for student + nosniff + no-store
      const inlineImgRes = await req(
        student!.id,
        `/api/classes/${classId}/assignments/${assignImageBody.assignment.id}/download?inline=1`,
      );
      expect(inlineImgRes.status).toBe(200);
      expect(inlineImgRes.headers.get('content-type')).toContain('image/webp');
      expect(inlineImgRes.headers.get('content-disposition')).toContain('inline; filename="diagram-integral.webp"');
      expect(inlineImgRes.headers.get('x-content-type-options')).toBe('nosniff');
      expect(inlineImgRes.headers.get('cache-control')).toBe('private, no-store');

      // Default assignment download uses attachment disposition
      const downloadImgRes = await req(
        student!.id,
        `/api/classes/${classId}/assignments/${assignImageBody.assignment.id}/download`,
      );
      expect(downloadImgRes.status).toBe(200);
      expect(downloadImgRes.headers.get('content-disposition')).toContain('attachment; filename="diagram-integral.webp"');

      // Outsider student gets 404
      const outsiderAssignRes = await req(
        outsider!.id,
        `/api/classes/${classId}/assignments/${assignImageBody.assignment.id}/download`,
      );
      expect(outsiderAssignRes.status).toBe(404);

      // PDF assignment never serves inline even when ?inline=1
      const assignPdfRes = await req(dosen!.id, `/api/classes/${classId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          title: 'Tugas Modul PDF',
          instructions: 'Baca modul PDF terlampir.',
          attachment: {
            name: 'modul.pdf',
            mimeType: 'application/pdf',
            dataBase64: TINY_PDF_BASE64,
          },
        }),
      });
      expect(assignPdfRes.status).toBe(201);
      const pdfAssignmentId = ((await assignPdfRes.json()) as { assignment: { id: string } }).assignment.id;

      const pdfDownloadRes = await req(
        student!.id,
        `/api/classes/${classId}/assignments/${pdfAssignmentId}/download?inline=1`,
      );
      expect(pdfDownloadRes.status).toBe(200);
      expect(pdfDownloadRes.headers.get('content-disposition')).toBe('attachment; filename="modul.pdf"');

      // Create DRAFT quiz with PDF attachment & external link
      const quizRes = await req(dosen!.id, `/api/classes/${classId}/quizzes`, {
        method: 'POST',
        body: JSON.stringify({
          title: 'Kuis Aljabar $Ax = b$',
          description: 'Gunakan rumus $$\\det(A) \\neq 0$$',
          externalUrl: 'https://example.org/rumus-matriks',
          attachment: {
            name: 'lembar-rumus.pdf',
            mimeType: 'application/pdf',
            dataBase64: TINY_PDF_BASE64,
          },
          timeLimitMinutes: 20,
          maxAttempts: 1,
          status: 'DRAFT',
        }),
      });
      expect(quizRes.status).toBe(201);
      const quizPayload = (await quizRes.json()) as {
        quiz: Record<string, unknown> & { id: string; externalUrl: string; attachmentName: string };
      };
      expect(quizPayload.quiz.externalUrl).toBe('https://example.org/rumus-matriks');
      expect(quizPayload.quiz.attachmentName).toBe('lembar-rumus.pdf');
      expect(quizPayload.quiz.attachmentData).toBeUndefined();

      const quizId = quizPayload.quiz.id;

      // Add question with PNG image attachment & external link
      const qRes = await req(dosen!.id, `/api/classes/${classId}/quizzes/${quizId}/questions`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'MULTIPLE_CHOICE',
          prompt: 'Tentukan nilai $\\sum_{k=1}^3 k$ berdasarkan grafik.',
          externalUrl: 'https://example.org/grafik-soal',
          attachment: {
            name: 'grafik-soal.png',
            mimeType: 'image/png',
            dataBase64: TINY_PNG_BASE64,
          },
          points: 10,
          options: [
            { label: '$6$', isCorrect: true },
            { label: '$5$', isCorrect: false },
          ],
        }),
      });
      expect(qRes.status).toBe(201);
      const qPayload = (await qRes.json()) as {
        question: Record<string, unknown> & { id: string; attachmentName: string; externalUrl: string };
      };
      expect(qPayload.question.attachmentName).toBe('grafik-soal.png');
      expect(qPayload.question.externalUrl).toBe('https://example.org/grafik-soal');
      expect(qPayload.question.attachmentData).toBeUndefined();

      const questionId = qPayload.question.id;

      // Student cannot download DRAFT quiz or question attachments
      expect(
        (await req(student!.id, `/api/classes/${classId}/quizzes/${quizId}/download`)).status,
      ).toBe(404);
      expect(
        (
          await req(
            student!.id,
            `/api/classes/${classId}/quizzes/${quizId}/questions/${questionId}/download?inline=1`,
          )
        ).status,
      ).toBe(404);

      // Publish quiz
      const publishRes = await req(dosen!.id, `/api/classes/${classId}/quizzes/${quizId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'PUBLISHED' }),
      });
      expect(publishRes.status).toBe(200);

      // Student can download quiz PDF and view question PNG inline
      const studentQuizFile = await req(student!.id, `/api/classes/${classId}/quizzes/${quizId}/download`);
      expect(studentQuizFile.status).toBe(200);
      expect(studentQuizFile.headers.get('content-disposition')).toBe(
        'attachment; filename="lembar-rumus.pdf"',
      );

      const studentQuestionImg = await req(
        student!.id,
        `/api/classes/${classId}/quizzes/${quizId}/questions/${questionId}/download?inline=1`,
      );
      expect(studentQuestionImg.status).toBe(200);
      expect(studentQuestionImg.headers.get('content-type')).toContain('image/png');
      expect(studentQuestionImg.headers.get('content-disposition')).toBe(
        'inline; filename="grafik-soal.png"',
      );

      // Start attempt and ensure attachmentData is never present in attempt payload
      const attemptRes = await req(student!.id, `/api/classes/${classId}/quizzes/${quizId}/attempts`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(attemptRes.status).toBe(201);
      const attemptBody = (await attemptRes.json()) as {
        quiz: Record<string, unknown>;
        questions: Array<Record<string, unknown>>;
      };
      expect(attemptBody.quiz.attachmentData).toBeUndefined();
      expect(attemptBody.questions[0]?.attachmentData).toBeUndefined();
      expect(attemptBody.questions[0]?.attachmentName).toBe('grafik-soal.png');
    } finally {
      if (server) {
        server.closeAllConnections?.();
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
      await cleanFixtures();
    }
  });
});
