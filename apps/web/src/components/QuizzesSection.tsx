import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ATTACHMENT_ACCEPT,
  readFileAsAttachment,
  request,
  type AttachmentPayload,
  type AttemptAnswer,
  type ClassSummary,
  type Quiz,
  type QuizAttempt,
  type QuizQuestion,
  type Role,
} from '../lib/api.ts';
import { containsLatexMath } from '../lib/math.ts';
import { AttachmentViewer } from './AttachmentViewer.tsx';
import { ExpandableAnswerText } from './ExpandableAnswerText.tsx';
import { MathPreviewBox, MathText } from './MathText.tsx';

type QuizzesSectionProps = {
  classItem: ClassSummary;
  role: Extract<Role, 'DOSEN' | 'MAHASISWA'>;
  onStatusMessage: (msg: string) => void;
};

type ActiveAttemptSession = {
  attempt: QuizAttempt;
  quiz: Quiz;
  questions: QuizQuestion[];
  answers: Record<string, { selectedOptionId: string | null; textAnswer: string }>;
  expiresAt: string;
};

type AttemptReviewPayload = {
  attempt: QuizAttempt;
  quiz: Quiz;
  student: { fullName: string; email: string };
  questions: QuizQuestion[];
  answers: AttemptAnswer[];
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function QuizzesSection({ classItem, role, onStatusMessage }: QuizzesSectionProps) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // DOSEN states
  const [quizDescription, setQuizDescription] = useState('');
  const [managingQuizId, setManagingQuizId] = useState<string | null>(null);
  const [managedQuestions, setManagedQuestions] = useState<QuizQuestion[]>([]);
  const [questionType, setQuestionType] = useState<'MULTIPLE_CHOICE' | 'ESSAY'>('MULTIPLE_CHOICE');
  const [questionPrompt, setQuestionPrompt] = useState('');
  const [mcqOptions, setMcqOptions] = useState<string[]>(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState<number>(0);

  const [attemptsQuizId, setAttemptsQuizId] = useState<string | null>(null);
  const [quizAttemptsList, setQuizAttemptsList] = useState<QuizAttempt[]>([]);
  const [gradingAttempt, setGradingAttempt] = useState<AttemptReviewPayload | null>(null);
  const [essayScores, setEssayScores] = useState<Record<string, { points: string; feedback: string }>>({});

  // MAHASISWA states
  const [activeSession, setActiveSession] = useState<ActiveAttemptSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [autosaveStatus, setAutosaveStatus] = useState<string>('');
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [viewingResult, setViewingResult] = useState<AttemptReviewPayload | null>(null);

  const answersRef = useRef<ActiveAttemptSession['answers']>({});
  const activeSessionRef = useRef<ActiveAttemptSession | null>(null);
  answersRef.current = activeSession?.answers ?? {};
  activeSessionRef.current = activeSession;

  async function loadQuizzes() {
    setLoading(true);
    try {
      const res = (await request(`/api/classes/${classItem.id}/quizzes`, undefined, 'GET')) as {
        quizzes: Quiz[];
      };
      setQuizzes(res.quizzes);
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal memuat daftar kuis.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQuizzes();
  }, [classItem.id]);

  // Real-time countdown & auto-submit when time reaches zero
  useEffect(() => {
    if (!activeSession) return;
    const expiryMs = new Date(activeSession.expiresAt).getTime();

    const updateTick = () => {
      const remaining = Math.max(0, Math.floor((expiryMs - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        void submitAttempt(true);
      }
    };

    updateTick();
    const timerId = window.setInterval(updateTick, 1000);
    return () => window.clearInterval(timerId);
  }, [activeSession?.attempt.id, activeSession?.expiresAt]);

  // Periodic autosave every 15 seconds while in progress
  useEffect(() => {
    if (!activeSession) return;
    const intervalId = window.setInterval(() => {
      void saveAnswers(false);
    }, 15_000);
    return () => window.clearInterval(intervalId);
  }, [activeSession?.attempt.id]);

  // Debounced autosave on answer edits
  useEffect(() => {
    if (!activeSession) return;
    const timer = window.setTimeout(() => {
      const hasAny = Object.keys(answersRef.current).length > 0;
      if (hasAny) {
        void saveAnswers(false);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [activeSession?.answers]);

  async function saveAnswers(showErrors: boolean) {
    const session = activeSessionRef.current;
    if (!session) return;
    const payload = Object.entries(answersRef.current).map(([questionId, val]) => ({
      questionId,
      selectedOptionId: val.selectedOptionId,
      textAnswer: val.textAnswer || null,
    }));
    if (payload.length === 0) return;

    try {
      await request(`/api/quizzes/attempts/${session.attempt.id}/answers`, { answers: payload }, 'PUT');
      setAutosaveStatus(`Tersimpan otomatis, ${new Date().toLocaleTimeString('id-ID')}`);
    } catch (error) {
      if (showErrors) {
        onStatusMessage(error instanceof Error ? error.message : 'Gagal menyimpan jawaban.');
      }
    }
  }

  async function createQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onStatusMessage('');
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const opensRaw = String(form.get('opensAt') ?? '').trim();
    const closesRaw = String(form.get('closesAt') ?? '').trim();
    const externalUrl = String(form.get('externalUrl') ?? '').trim() || null;
    const file = form.get('attachment');

    try {
      const attachment: AttachmentPayload | null =
        file instanceof File && file.size > 0 ? await readFileAsAttachment(file) : null;
      const res = (await request(`/api/classes/${classItem.id}/quizzes`, {
        title: String(form.get('title') ?? '').trim(),
        description: quizDescription.trim() || null,
        externalUrl,
        attachment,
        timeLimitMinutes: Number(form.get('timeLimitMinutes') ?? 30),
        maxAttempts: Number(form.get('maxAttempts') ?? 1),
        opensAt: opensRaw ? new Date(opensRaw).toISOString() : null,
        closesAt: closesRaw ? new Date(closesRaw).toISOString() : null,
        status: 'DRAFT',
      })) as { quiz: Quiz };
      formEl.reset();
      setQuizDescription('');
      onStatusMessage('Draf kuis berhasil dibuat. Tambahkan pertanyaan sebelum mempublikasikan.');
      await loadQuizzes();
      await openManageQuestions(res.quiz.id);
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal membuat kuis.');
    } finally {
      setBusy(false);
    }
  }

  async function openManageQuestions(quizId: string) {
    if (managingQuizId === quizId) {
      setManagingQuizId(null);
      return;
    }
    setBusy(true);
    try {
      const res = (await request(`/api/classes/${classItem.id}/quizzes/${quizId}`, undefined, 'GET')) as {
        questions: QuizQuestion[];
      };
      setManagedQuestions(res.questions);
      setManagingQuizId(quizId);
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal memuat soal kuis.');
    } finally {
      setBusy(false);
    }
  }

  async function addQuestion(event: FormEvent<HTMLFormElement>, quizId: string) {
    event.preventDefault();
    setBusy(true);
    onStatusMessage('');
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const prompt = questionPrompt.trim();
    const points = Number(form.get('points') ?? 10);
    const externalUrl = String(form.get('externalUrl') ?? '').trim() || null;
    const file = form.get('attachment');

    try {
      const attachment: AttachmentPayload | null =
        file instanceof File && file.size > 0 ? await readFileAsAttachment(file) : null;
      const options =
        questionType === 'MULTIPLE_CHOICE'
          ? mcqOptions
              .map((label, idx) => ({ label: label.trim(), isCorrect: idx === correctIndex }))
              .filter((o) => o.label.length > 0)
          : undefined;

      if (questionType === 'MULTIPLE_CHOICE') {
        if (!options || options.length < 2) {
          throw new Error('Isi minimal 2 pilihan jawaban.');
        }
        if (options.filter((o) => o.isCorrect).length !== 1) {
          throw new Error('Pilih tepat 1 jawaban yang benar.');
        }
      }

      await request(`/api/classes/${classItem.id}/quizzes/${quizId}/questions`, {
        type: questionType,
        prompt,
        externalUrl,
        attachment,
        points,
        ...(options ? { options } : {}),
      });
      formEl.reset();
      setQuestionPrompt('');
      setMcqOptions(['', '', '', '']);
      setCorrectIndex(0);
      const res = (await request(`/api/classes/${classItem.id}/quizzes/${quizId}`, undefined, 'GET')) as {
        questions: QuizQuestion[];
      };
      setManagedQuestions(res.questions);
      onStatusMessage('Pertanyaan berhasil ditambahkan ke kuis.');
      await loadQuizzes();
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal menambahkan pertanyaan.');
    } finally {
      setBusy(false);
    }
  }

  async function removeQuestion(quizId: string, questionId: string) {
    setBusy(true);
    onStatusMessage('');
    try {
      await request(
        `/api/classes/${classItem.id}/quizzes/${quizId}/questions/${questionId}`,
        undefined,
        'DELETE',
      );
      const res = (await request(`/api/classes/${classItem.id}/quizzes/${quizId}`, undefined, 'GET')) as {
        questions: QuizQuestion[];
      };
      setManagedQuestions(res.questions);
      onStatusMessage('Pertanyaan dihapus.');
      await loadQuizzes();
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal menghapus pertanyaan.');
    } finally {
      setBusy(false);
    }
  }

  async function updateQuizStatus(quizId: string, status: 'PUBLISHED' | 'CLOSED') {
    setBusy(true);
    onStatusMessage('');
    try {
      await request(`/api/classes/${classItem.id}/quizzes/${quizId}`, { status }, 'PATCH');
      onStatusMessage(
        status === 'PUBLISHED'
          ? 'Kuis dipublikasikan dan notifikasi dikirim ke mahasiswa.'
          : 'Kuis ditutup.',
      );
      await loadQuizzes();
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal mengubah status kuis.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleAttemptsList(quizId: string) {
    if (attemptsQuizId === quizId) {
      setAttemptsQuizId(null);
      setGradingAttempt(null);
      return;
    }
    setBusy(true);
    try {
      const res = (await request(
        `/api/classes/${classItem.id}/quizzes/${quizId}/attempts`,
        undefined,
        'GET',
      )) as { attempts: QuizAttempt[] };
      setQuizAttemptsList(res.attempts);
      setAttemptsQuizId(quizId);
      setGradingAttempt(null);
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal memuat daftar percobaan kuis.');
    } finally {
      setBusy(false);
    }
  }

  async function openGradeAttempt(attemptId: string) {
    setBusy(true);
    try {
      const res = (await request(
        `/api/quizzes/attempts/${attemptId}`,
        undefined,
        'GET',
      )) as AttemptReviewPayload;
      setGradingAttempt(res);
      const initial: Record<string, { points: string; feedback: string }> = {};
      for (const q of res.questions) {
        if (q.type === 'ESSAY') {
          const ans = res.answers.find((a) => a.questionId === q.id);
          initial[q.id] = {
            points: ans?.pointsAwarded ?? '0',
            feedback: ans?.feedback ?? '',
          };
        }
      }
      setEssayScores(initial);
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal memuat jawaban mahasiswa.');
    } finally {
      setBusy(false);
    }
  }

  async function submitEssayGrades(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!gradingAttempt) return;
    setBusy(true);
    onStatusMessage('');
    try {
      const grades = gradingAttempt.questions
        .filter((q) => q.type === 'ESSAY')
        .map((q) => ({
          questionId: q.id,
          pointsAwarded: Number(essayScores[q.id]?.points ?? 0),
          feedback: essayScores[q.id]?.feedback.trim() || null,
        }));
      await request(`/api/quizzes/attempts/${gradingAttempt.attempt.id}/grade-essay`, { grades }, 'PATCH');
      onStatusMessage('Penilaian esai berhasil disimpan.');
      await openGradeAttempt(gradingAttempt.attempt.id);
      if (attemptsQuizId) {
        const res = (await request(
          `/api/classes/${classItem.id}/quizzes/${attemptsQuizId}/attempts`,
          undefined,
          'GET',
        )) as { attempts: QuizAttempt[] };
        setQuizAttemptsList(res.attempts);
      }
      await loadQuizzes();
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal menyimpan nilai esai.');
    } finally {
      setBusy(false);
    }
  }

  async function startOrResumeQuiz(quizId: string) {
    setBusy(true);
    onStatusMessage('');
    try {
      const res = (await request(`/api/classes/${classItem.id}/quizzes/${quizId}/attempts`, {})) as {
        attempt: QuizAttempt;
        quiz: Quiz;
        questions: QuizQuestion[];
        answers: AttemptAnswer[];
        expiresAt: string;
      };
      const initialMap: ActiveAttemptSession['answers'] = {};
      for (const a of res.answers) {
        initialMap[a.questionId] = {
          selectedOptionId: a.selectedOptionId ?? null,
          textAnswer: a.textAnswer ?? '',
        };
      }
      setActiveSession({
        attempt: res.attempt,
        quiz: res.quiz,
        questions: res.questions,
        answers: initialMap,
        expiresAt: res.expiresAt,
      });
      setCurrentQuestionIndex(0);
      setAutosaveStatus('Tersimpan otomatis');
      setViewingResult(null);
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal memulai kuis.');
    } finally {
      setBusy(false);
    }
  }

  async function submitAttempt(autoTriggered = false) {
    const session = activeSessionRef.current;
    if (!session || busy) return;
    setBusy(true);
    setConfirmSubmitOpen(false);
    try {
      const payload = Object.entries(answersRef.current).map(([questionId, val]) => ({
        questionId,
        selectedOptionId: val.selectedOptionId,
        textAnswer: val.textAnswer || null,
      }));
      const res = (await request(`/api/quizzes/attempts/${session.attempt.id}/submit`, {
        answers: payload,
      })) as { attempt: QuizAttempt };
      onStatusMessage(
        autoTriggered
          ? 'Waktu habis! Jawaban Anda telah dikumpulkan secara otomatis.'
          : res.attempt.status === 'FINAL'
            ? `Kuis selesai dikumpulkan. Skor Final: ${res.attempt.finalScore}.`
            : `Kuis dikumpulkan. Skor Sementara (Pilihan Ganda): ${res.attempt.autoScore}, menunggu penilaian esai oleh dosen.`,
      );
      setActiveSession(null);
      await openResult(res.attempt.id);
      await loadQuizzes();
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal mengumpulkan kuis.');
    } finally {
      setBusy(false);
    }
  }

  async function openResult(attemptId: string) {
    setBusy(true);
    try {
      const res = (await request(
        `/api/quizzes/attempts/${attemptId}`,
        undefined,
        'GET',
      )) as AttemptReviewPayload;
      setViewingResult(res);
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal memuat hasil kuis.');
    } finally {
      setBusy(false);
    }
  }

  const formattedTimer = useMemo(() => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [secondsLeft]);

  // Distraction-free student quiz-taking interface (Figma: Kuis berlangsung)
  if (role === 'MAHASISWA' && activeSession) {
    const currentQ = activeSession.questions[currentQuestionIndex];
    const currentAns = currentQ
      ? activeSession.answers[currentQ.id] ?? { selectedOptionId: null, textAnswer: '' }
      : null;

    const answeredCount = activeSession.questions.filter((q) => {
      const ans = activeSession.answers[q.id];
      return Boolean(ans?.selectedOptionId || ans?.textAnswer?.trim());
    }).length;
    const unansweredCount = activeSession.questions.length - answeredCount;
    const totalPoints = activeSession.questions.reduce((sum, q) => sum + Number(q.points || 0), 0);

    return (
      <div className="quiz-runner">
        <div className="quiz-runner-topbar">
          <div className="quiz-runner-identity">
            <strong>
              <MathText text={activeSession.quiz.title} />
            </strong>
            <span>
              {classItem.name}, Percobaan ke-{activeSession.attempt.attemptNumber}
            </span>
          </div>
          <div className="quiz-runner-status">
            {autosaveStatus && <span className="workspace-badge open">{autosaveStatus}</span>}
            <div className={`quiz-timer-pill ${secondsLeft <= 60 ? 'urgent' : ''}`}>
              <span>Sisa Waktu:</span>
              <strong>{formattedTimer}</strong>
            </div>
          </div>
        </div>

        <div className="quiz-intro-header">
          <h4>
            <MathText text={activeSession.quiz.title} />
          </h4>
          {activeSession.quiz.description && (
            <MathText text={activeSession.quiz.description} as="p" className="workspace-body-text" />
          )}
          <p className="workspace-muted">
            <span className="num">{activeSession.questions.length} soal</span>,{' '}
            <span className="num">{totalPoints} poin</span>
            {activeSession.quiz.closesAt
              ? `, batas waktu ${new Date(activeSession.quiz.closesAt).toLocaleString('id-ID')}`
              : ''}
          </p>
          <AttachmentViewer
            externalUrl={activeSession.quiz.externalUrl}
            attachmentName={activeSession.quiz.attachmentName}
            attachmentMime={activeSession.quiz.attachmentMime}
            attachmentSize={activeSession.quiz.attachmentSize}
            downloadPath={
              activeSession.quiz.attachmentName
                ? `/api/classes/${classItem.id}/quizzes/${activeSession.quiz.id}/download`
                : null
            }
            linkLabel="Buka tautan referensi kuis"
            compact
          />
        </div>

        <div className="quiz-runner-grid">
          {currentQ && currentAns && (
            <div key={currentQ.id} className="quiz-question-card">
              <div className="quiz-question-meta">
                <span className="quiz-question-counter">
                  Soal {currentQuestionIndex + 1} dari {activeSession.questions.length}
                </span>
                <div className="workspace-badges workspace-badges--tight">
                  <span className="workspace-badge">
                    {currentQ.type === 'MULTIPLE_CHOICE' ? 'Pilihan Ganda' : 'Esai'}
                  </span>
                  <span className="workspace-badge neutral">{currentQ.points} poin</span>
                </div>
              </div>

              <MathText text={currentQ.prompt} as="p" className="quiz-prompt" />

              <AttachmentViewer
                externalUrl={currentQ.externalUrl}
                attachmentName={currentQ.attachmentName}
                attachmentMime={currentQ.attachmentMime}
                attachmentSize={currentQ.attachmentSize}
                downloadPath={
                  currentQ.attachmentName
                    ? `/api/classes/${classItem.id}/quizzes/${activeSession.quiz.id}/questions/${currentQ.id}/download`
                    : null
                }
                linkLabel="Buka tautan referensi soal"
              />

              {currentQ.type === 'MULTIPLE_CHOICE' ? (
                <>
                  <p className="workspace-muted">Pilih satu jawaban.</p>
                  <div
                    className="quiz-options-list"
                    role="radiogroup"
                    aria-label={`Opsi Soal ${currentQuestionIndex + 1}`}
                  >
                    {currentQ.options.map((opt, idx) => {
                      const isSelected = currentAns.selectedOptionId === opt.id;
                      const letter = OPTION_LETTERS[idx] ?? String(idx + 1);
                      return (
                        <label
                          key={opt.id}
                          className={`quiz-option-choice ${isSelected ? 'selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name={`q-${currentQ.id}`}
                            checked={isSelected}
                            onChange={() => {
                              setActiveSession((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      answers: {
                                        ...prev.answers,
                                        [currentQ.id]: { selectedOptionId: opt.id, textAnswer: '' },
                                      },
                                    }
                                  : prev,
                              );
                            }}
                          />
                          <span className="quiz-option-letter">{letter}</span>
                          <span className="quiz-option-text">
                            <MathText text={opt.label} />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="quiz-essay-label">
                  <span>Jawaban Esai Anda</span>
                  <textarea
                    rows={6}
                    maxLength={20000}
                    placeholder="Tulis jawaban esai Anda (mendukung LaTeX $...$)"
                    value={currentAns.textAnswer}
                    onChange={(e) => {
                      const val = e.target.value;
                      setActiveSession((prev) =>
                        prev
                          ? {
                              ...prev,
                              answers: {
                                ...prev.answers,
                                [currentQ.id]: { selectedOptionId: null, textAnswer: val },
                              },
                            }
                          : prev,
                      );
                    }}
                  />
                  <MathPreviewBox
                    text={currentAns.textAnswer}
                    title="Pratinjau rumus jawaban esai"
                  />
                </div>
              )}

              <div className="quiz-stage-footer">
                <button
                  type="button"
                  className="button secondary inline-btn"
                  disabled={currentQuestionIndex === 0}
                  onClick={() => setCurrentQuestionIndex((i) => Math.max(0, i - 1))}
                >
                  Sebelumnya
                </button>
                <button
                  type="button"
                  className="button primary inline-btn"
                  disabled={currentQuestionIndex >= activeSession.questions.length - 1}
                  onClick={() =>
                    setCurrentQuestionIndex((i) => Math.min(activeSession.questions.length - 1, i + 1))
                  }
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}

          <aside className="quiz-nav-panel" aria-label="Navigasi soal kuis">
            <div>
              <h5>Navigasi Soal</h5>
              <p className="workspace-muted">
                {answeredCount} dari {activeSession.questions.length} soal sudah dijawab
              </p>
            </div>

            <div className="quiz-nav-grid" role="navigation" aria-label="Nomor soal kuis">
              {activeSession.questions.map((q, idx) => {
                const ans = activeSession.answers[q.id];
                const isAnswered = Boolean(ans?.selectedOptionId || ans?.textAnswer?.trim());
                return (
                  <button
                    key={q.id}
                    type="button"
                    className={`quiz-nav-btn ${idx === currentQuestionIndex ? 'current' : ''} ${
                      isAnswered ? 'answered' : ''
                    }`}
                    onClick={() => setCurrentQuestionIndex(idx)}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="quiz-nav-reminder">
              {unansweredCount > 0
                ? `Masih ada ${unansweredCount} soal yang belum dijawab. Periksa kembali sebelum mengumpulkan.`
                : 'Semua soal telah terjawab. Anda dapat meninjau ulang atau mengumpulkan sekarang.'}
            </div>

            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => setConfirmSubmitOpen(true)}
            >
              Kumpulkan Kuis
            </button>
          </aside>
        </div>

        {confirmSubmitOpen && (
          <div
            className="quiz-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-quiz-title"
          >
            <h5 id="confirm-quiz-title">Konfirmasi Pengumpulan Kuis</h5>
            <p className="workspace-body-text">
              Apakah Anda yakin ingin mengumpulkan jawaban sekarang? Setelah dikumpulkan, jawaban pada
              percobaan ini tidak dapat diubah lagi.
            </p>
            <div className="workspace-item-actions">
              <button
                type="button"
                className="button secondary inline-btn"
                onClick={() => setConfirmSubmitOpen(false)}
              >
                Periksa Lagi
              </button>
              <button
                type="button"
                className="button primary inline-btn"
                disabled={busy}
                onClick={() => void submitAttempt(false)}
              >
                {busy ? 'Mengumpulkan…' : 'Ya, Kumpulkan Sekarang'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="workspace-section">
      {role === 'DOSEN' && (
        <form className="class-form" onSubmit={createQuiz}>
          <h4>Buat kuis baru</h4>
          <label>
            Judul kuis
            <input name="title" minLength={1} maxLength={160} required />
          </label>
          <label>
            Deskripsi / Petunjuk <span className="optional">(opsional)</span>
            <textarea
              name="description"
              rows={2}
              maxLength={5000}
              placeholder="Tulis deskripsi atau petunjuk kuis (mendukung LaTeX $...$)"
              value={quizDescription}
              onChange={(e) => setQuizDescription(e.target.value)}
            />
          </label>
          <MathPreviewBox text={quizDescription} />
          <div className="workspace-two-col">
            <label>
              Tautan Referensi Kuis <span className="optional">(opsional)</span>
              <input name="externalUrl" type="url" maxLength={1000} placeholder="https://..." />
            </label>
            <label>
              Lampiran Berkas / Gambar Kuis{' '}
              <span className="optional">(PDF, PNG, JPG, WEBP, DOCX, ZIP, maks. 4 MB)</span>
              <input name="attachment" type="file" accept={ATTACHMENT_ACCEPT} />
            </label>
          </div>
          <div className="workspace-two-col">
            <label>
              Batas waktu (menit)
              <input name="timeLimitMinutes" type="number" min={1} max={300} defaultValue={30} required />
            </label>
            <label>
              Maksimal percobaan (1 hingga 3)
              <input name="maxAttempts" type="number" min={1} max={3} defaultValue={1} required />
            </label>
          </div>
          <div className="workspace-two-col">
            <label>
              Waktu buka <span className="optional">(opsional)</span>
              <input name="opensAt" type="datetime-local" />
            </label>
            <label>
              Waktu tutup <span className="optional">(opsional)</span>
              <input name="closesAt" type="datetime-local" />
            </label>
          </div>
          <div>
            <button className="button primary inline-btn" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Buat Draf Kuis'}
            </button>
          </div>
        </form>
      )}

      {role === 'MAHASISWA' && viewingResult && (
        <div className="workspace-item-card">
          <div className="workspace-item-header">
            <div>
              <h5>
                Hasil Kuis: <MathText text={viewingResult.quiz.title} /> (Percobaan ke-
                {viewingResult.attempt.attemptNumber})
              </h5>
              <div className="workspace-badges">
                <span
                  className={`workspace-badge ${
                    viewingResult.attempt.status === 'FINAL' ? 'open' : 'late'
                  }`}
                >
                  {viewingResult.attempt.status === 'FINAL'
                    ? `Skor Final: ${viewingResult.attempt.finalScore ?? viewingResult.attempt.autoScore}`
                    : `Skor Sementara: ${viewingResult.attempt.autoScore} (Esai sedang dinilai)`}
                </span>
                <span className="workspace-badge neutral">
                  Pilihan Ganda: {viewingResult.attempt.autoScore}
                </span>
                {Number(viewingResult.attempt.manualScore) > 0 && (
                  <span className="workspace-badge neutral">
                    Esai: {viewingResult.attempt.manualScore}
                  </span>
                )}
              </div>
            </div>
            <button type="button" className="text-button" onClick={() => setViewingResult(null)}>
              Tutup hasil
            </button>
          </div>
          <div className="workspace-items-stack">
            {viewingResult.questions.map((q, idx) => {
              const ans = viewingResult.answers.find((a) => a.questionId === q.id);
              const selectedOpt = q.options.find((o) => o.id === ans?.selectedOptionId);
              return (
                <div key={q.id} className="quiz-review-item">
                  <strong>
                    Soal {idx + 1} ({q.type === 'MULTIPLE_CHOICE' ? 'Pilihan Ganda' : 'Esai'}, maks.{' '}
                    {q.points} poin)
                  </strong>
                  <MathText text={q.prompt} as="p" className="workspace-body-text" />
                  <AttachmentViewer
                    externalUrl={q.externalUrl}
                    attachmentName={q.attachmentName}
                    attachmentMime={q.attachmentMime}
                    attachmentSize={q.attachmentSize}
                    downloadPath={
                      q.attachmentName
                        ? `/api/classes/${classItem.id}/quizzes/${viewingResult.quiz.id}/questions/${q.id}/download`
                        : null
                    }
                    linkLabel="Buka tautan referensi soal"
                    compact
                  />
                  {q.type === 'MULTIPLE_CHOICE' ? (
                    <p className="workspace-muted">
                      Jawaban Anda:{' '}
                      {selectedOpt ? <MathText text={selectedOpt.label} /> : 'Tidak dijawab'}. Nilai:{' '}
                      <span className="num">{ans?.pointsAwarded ?? '0.00'}</span>
                    </p>
                  ) : (
                    <>
                      <p className="workspace-muted">
                        Jawaban Anda:{' '}
                        {ans?.textAnswer ? <MathText text={ans.textAnswer} /> : 'Tidak dijawab'}
                      </p>
                      <p className="workspace-muted">
                        Nilai Esai:{' '}
                        {ans?.pointsAwarded !== null && ans?.pointsAwarded !== undefined
                          ? ans.pointsAwarded
                          : 'Menunggu penilaian dosen'}
                      </p>
                      {ans?.feedback && (
                        <p className="workspace-body-text">
                          Komentar Dosen: <MathText text={ans.feedback} />
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <p className="class-empty" role="status">
          Memuat daftar kuis…
        </p>
      ) : quizzes.length === 0 ? (
        <p className="class-empty">Belum ada kuis pada kelas ini.</p>
      ) : (
        <div className="workspace-items-stack">
          {quizzes.map((quiz) => {
            const myAttempts = quiz.myAttempts ?? [];
            const inProgress = myAttempts.find((a) => a.status === 'IN_PROGRESS');
            const now = new Date();
            const withinWindow =
              (!quiz.opensAt || now >= new Date(quiz.opensAt)) &&
              (!quiz.closesAt || now <= new Date(quiz.closesAt));
            const canStart =
              role === 'MAHASISWA' &&
              classItem.status === 'OPEN' &&
              quiz.status === 'PUBLISHED' &&
              withinWindow &&
              (Boolean(inProgress) || myAttempts.length < quiz.maxAttempts);

            return (
              <article className="workspace-item-card" key={quiz.id}>
                <div className="workspace-item-header">
                  <div>
                    <h5>
                      <MathText text={quiz.title} />
                    </h5>
                    <div className="workspace-badges">
                      <span
                        className={`workspace-badge ${
                          quiz.status === 'PUBLISHED'
                            ? 'open'
                            : quiz.status === 'CLOSED'
                              ? 'closed'
                              : 'late'
                        }`}
                      >
                        {quiz.status === 'DRAFT'
                          ? 'Draf'
                          : quiz.status === 'PUBLISHED'
                            ? 'Dipublikasikan'
                            : 'Ditutup'}
                      </span>
                      <span className="workspace-badge neutral">{quiz.timeLimitMinutes} menit</span>
                      <span className="workspace-badge neutral">
                        Maks. {quiz.maxAttempts} percobaan
                      </span>
                      <span className="workspace-badge">
                        {quiz.questionCount ?? 0} soal ({quiz.totalPoints ?? '0.00'} poin)
                      </span>
                      {role === 'DOSEN' && typeof quiz.attemptCount === 'number' && (
                        <span className="workspace-badge neutral">
                          {quiz.attemptCount} percobaan mahasiswa
                        </span>
                      )}
                    </div>
                  </div>
                  {role === 'DOSEN' && (
                    <div className="workspace-item-actions">
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() => void openManageQuestions(quiz.id)}
                      >
                        {managingQuizId === quiz.id ? 'Tutup Soal' : 'Kelola Soal'}
                      </button>
                      {quiz.status === 'DRAFT' && (
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy}
                          onClick={() => void updateQuizStatus(quiz.id, 'PUBLISHED')}
                        >
                          Publikasikan
                        </button>
                      )}
                      {quiz.status === 'PUBLISHED' && (
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy}
                          onClick={() => void updateQuizStatus(quiz.id, 'CLOSED')}
                        >
                          Tutup Kuis
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() => void toggleAttemptsList(quiz.id)}
                      >
                        {attemptsQuizId === quiz.id
                          ? 'Sembunyikan Percobaan'
                          : 'Lihat Percobaan & Nilai Esai'}
                      </button>
                    </div>
                  )}
                </div>

                {quiz.description && (
                  <MathText text={quiz.description} as="p" className="workspace-body-text" />
                )}
                <AttachmentViewer
                  externalUrl={quiz.externalUrl}
                  attachmentName={quiz.attachmentName}
                  attachmentMime={quiz.attachmentMime}
                  attachmentSize={quiz.attachmentSize}
                  downloadPath={
                    quiz.attachmentName
                      ? `/api/classes/${classItem.id}/quizzes/${quiz.id}/download`
                      : null
                  }
                  linkLabel="Buka tautan referensi kuis"
                />
                {(quiz.opensAt || quiz.closesAt) && (
                  <p className="workspace-muted">
                    Jadwal: {quiz.opensAt ? new Date(quiz.opensAt).toLocaleString('id-ID') : 'Sekarang'} s/d{' '}
                    {quiz.closesAt
                      ? new Date(quiz.closesAt).toLocaleString('id-ID')
                      : 'Tidak terbatas'}
                  </p>
                )}

                {role === 'MAHASISWA' && (
                  <div className="workspace-submission-box">
                    {myAttempts.length > 0 && (
                      <div className="workspace-items-stack">
                        {myAttempts.map((att) => (
                          <div key={att.id} className="workspace-receipt">
                            <div className="workspace-item-header">
                              <div className="workspace-badges workspace-badges--tight">
                                <span className="workspace-badge neutral receipt-version">
                                  Percobaan ke-{att.attemptNumber}
                                </span>
                                <span
                                  className={
                                    att.status === 'FINAL'
                                      ? 'stamp-seal'
                                      : att.status === 'IN_PROGRESS'
                                        ? 'workspace-badge late'
                                        : 'stamp-seal late'
                                  }
                                >
                                  {att.status === 'IN_PROGRESS'
                                    ? 'Sedang berlangsung'
                                    : att.status === 'FINAL'
                                      ? `Skor Final: ${att.finalScore ?? att.autoScore}`
                                      : `Skor Sementara: ${att.autoScore}`}
                                </span>
                              </div>
                              {att.status !== 'IN_PROGRESS' && (
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() => void openResult(att.id)}
                                >
                                  Lihat Detail Hasil
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {canStart ? (
                      <div>
                        <button
                          type="button"
                          className="button primary inline-btn"
                          disabled={busy}
                          onClick={() => void startOrResumeQuiz(quiz.id)}
                        >
                          {inProgress ? 'Lanjutkan Kuis' : 'Mulai Kuis'}
                        </button>
                      </div>
                    ) : (
                      <p className="workspace-muted">
                        {classItem.status === 'CLOSED'
                          ? 'Kelas sudah ditutup.'
                          : quiz.status !== 'PUBLISHED'
                            ? 'Kuis sudah ditutup.'
                            : !withinWindow
                              ? 'Di luar jadwal pengerjaan kuis.'
                              : 'Batas maksimal percobaan telah tercapai.'}
                      </p>
                    )}
                  </div>
                )}

                {role === 'DOSEN' && managingQuizId === quiz.id && (
                  <div className="workspace-roster-box">
                    <h6>Daftar Pertanyaan ({managedQuestions.length})</h6>
                    {managedQuestions.length === 0 ? (
                      <p className="workspace-muted">Belum ada soal pada kuis ini.</p>
                    ) : (
                      <div className="workspace-items-stack">
                        {managedQuestions.map((q, idx) => (
                          <div key={q.id} className="quiz-review-item">
                            <div className="workspace-item-header">
                              <div>
                                <strong>
                                  {idx + 1}. [{q.type === 'MULTIPLE_CHOICE' ? 'Pilihan Ganda' : 'Esai'}] (
                                  {q.points} poin)
                                </strong>
                                <MathText text={q.prompt} as="p" className="workspace-body-text" />
                                <AttachmentViewer
                                  externalUrl={q.externalUrl}
                                  attachmentName={q.attachmentName}
                                  attachmentMime={q.attachmentMime}
                                  attachmentSize={q.attachmentSize}
                                  downloadPath={
                                    q.attachmentName
                                      ? `/api/classes/${classItem.id}/quizzes/${quiz.id}/questions/${q.id}/download`
                                      : null
                                  }
                                  linkLabel="Buka tautan referensi soal"
                                  compact
                                />
                              </div>
                              {quiz.status === 'DRAFT' && (
                                <button
                                  type="button"
                                  className="text-button danger-link"
                                  disabled={busy}
                                  onClick={() => void removeQuestion(quiz.id, q.id)}
                                >
                                  Hapus Soal
                                </button>
                              )}
                            </div>
                            {q.type === 'MULTIPLE_CHOICE' && (
                              <ul className="quiz-builder-options-preview">
                                {q.options.map((opt) => (
                                  <li key={opt.id}>
                                    <MathText text={opt.label} />{' '}
                                    {opt.isCorrect && <strong>(Jawaban Benar)</strong>}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <form
                      className="workspace-submit-form"
                      onSubmit={(e) => void addQuestion(e, quiz.id)}
                    >
                      <h6>Tambah Pertanyaan Baru</h6>
                      <div className="workspace-two-col">
                        <label>
                          Jenis Pertanyaan
                          <select
                            value={questionType}
                            onChange={(e) =>
                              setQuestionType(e.target.value as 'MULTIPLE_CHOICE' | 'ESSAY')
                            }
                          >
                            <option value="MULTIPLE_CHOICE">Pilihan Ganda</option>
                            <option value="ESSAY">Esai</option>
                          </select>
                        </label>
                        <label>
                          Bobot Poin (maks. 100)
                          <input
                            name="points"
                            type="number"
                            step="0.01"
                            min="0.5"
                            max="100"
                            defaultValue="10"
                            required
                          />
                        </label>
                      </div>
                      <label>
                        Teks Pertanyaan
                        <textarea
                          name="prompt"
                          rows={2}
                          minLength={1}
                          maxLength={10000}
                          placeholder="Tulis pertanyaan kuis (mendukung LaTeX $...$)"
                          value={questionPrompt}
                          onChange={(e) => setQuestionPrompt(e.target.value)}
                          required
                        />
                      </label>
                      <MathPreviewBox text={questionPrompt} title="Pratinjau rumus pertanyaan" />

                      <div className="workspace-two-col">
                        <label>
                          Tautan Referensi Soal <span className="optional">(opsional)</span>
                          <input
                            name="externalUrl"
                            type="url"
                            maxLength={1000}
                            placeholder="https://..."
                          />
                        </label>
                        <label>
                          Lampiran Gambar / Berkas Soal{' '}
                          <span className="optional">
                            (PDF, PNG, JPG, WEBP, DOCX, ZIP, maks. 4 MB)
                          </span>
                          <input name="attachment" type="file" accept={ATTACHMENT_ACCEPT} />
                        </label>
                      </div>

                      {questionType === 'MULTIPLE_CHOICE' && (
                        <div className="quiz-mcq-builder">
                          <span className="quiz-mcq-hint">
                            Isi opsi jawaban dan pilih 1 jawaban benar:
                          </span>
                          {mcqOptions.map((optVal, idx) => (
                            <div key={idx} className="quiz-mcq-row">
                              <input
                                type="radio"
                                name="correctOption"
                                checked={correctIndex === idx}
                                aria-label={`Tandai opsi ${idx + 1} sebagai jawaban benar`}
                                onChange={() => setCorrectIndex(idx)}
                              />
                              <input
                                type="text"
                                placeholder={`Opsi ${idx + 1}${idx < 2 ? ' (wajib, mendukung LaTeX)' : ' (opsional, mendukung LaTeX)'}`}
                                value={optVal}
                                required={idx < 2}
                                onChange={(e) => {
                                  const next = [...mcqOptions];
                                  next[idx] = e.target.value;
                                  setMcqOptions(next);
                                }}
                              />
                            </div>
                          ))}
                          {mcqOptions.some((o) => containsLatexMath(o)) && (
                            <div className="math-preview-box" aria-live="polite">
                              <span className="math-preview-label">Pratinjau rumus opsi pilihan ganda</span>
                              <ul className="quiz-builder-options-preview">
                                {mcqOptions
                                  .map((o, idx) => ({ o: o.trim(), idx }))
                                  .filter((item) => item.o.length > 0)
                                  .map((item) => (
                                    <li key={item.idx}>
                                      {OPTION_LETTERS[item.idx] ?? item.idx + 1}.{' '}
                                      <MathText text={item.o} />
                                    </li>
                                  ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      <div>
                        <button className="button primary inline-btn" disabled={busy}>
                          {busy ? 'Menambahkan…' : 'Tambahkan Pertanyaan'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {role === 'DOSEN' && attemptsQuizId === quiz.id && (
                  <div className="workspace-roster-box">
                    <h6>Hasil &amp; Antrean Penilaian Esai</h6>
                    {quizAttemptsList.length === 0 ? (
                      <p className="workspace-muted">Belum ada mahasiswa yang mengerjakan kuis ini.</p>
                    ) : (
                      <div
                        className="account-table-scroll"
                        role="region"
                        aria-label={`Percobaan ${quiz.title}`}
                        tabIndex={0}
                      >
                        <table className="account-table workspace-submission-table">
                          <thead>
                            <tr>
                              <th scope="col">Mahasiswa</th>
                              <th scope="col">Percobaan</th>
                              <th scope="col">Status</th>
                              <th scope="col">PG</th>
                              <th scope="col">Esai</th>
                              <th scope="col">Skor Akhir</th>
                              <th scope="col">Aksi</th>
                            </tr>
                          </thead>
                          <tbody>
                            {quizAttemptsList.map((att) => (
                              <tr key={att.id}>
                                <td className="account-name">
                                  {att.studentName}
                                  <div className="workspace-sub-email">{att.studentEmail}</div>
                                </td>
                                <td>Ke-{att.attemptNumber}</td>
                                <td>
                                  <span
                                    className={`workspace-badge ${
                                      att.status === 'FINAL' ? 'open' : 'late'
                                    }`}
                                  >
                                    {att.status === 'IN_PROGRESS'
                                      ? 'Berlangsung'
                                      : att.status === 'FINAL'
                                        ? 'Final'
                                        : 'Sementara (Perlu Nilai Esai)'}
                                  </span>
                                </td>
                                <td className="num">{att.autoScore}</td>
                                <td className="num">{att.manualScore}</td>
                                <td>
                                  <strong className="num">{att.finalScore ?? '-'}</strong>
                                </td>
                                <td>
                                  {att.status !== 'IN_PROGRESS' && (
                                    <button
                                      type="button"
                                      className="text-button"
                                      onClick={() => void openGradeAttempt(att.id)}
                                    >
                                      Periksa / Nilai Esai
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {gradingAttempt && gradingAttempt.attempt.quizId === quiz.id && (
                      <form
                        className="workspace-submit-form"
                        onSubmit={(e) => void submitEssayGrades(e)}
                      >
                        <h6>
                          Penilaian Jawaban: {gradingAttempt.student.fullName} (Percobaan ke-
                          {gradingAttempt.attempt.attemptNumber})
                        </h6>
                        {gradingAttempt.questions.map((q, idx) => {
                          const ans = gradingAttempt.answers.find((a) => a.questionId === q.id);
                          if (q.type === 'MULTIPLE_CHOICE') {
                            const selectedOpt = q.options.find((o) => o.id === ans?.selectedOptionId);
                            return (
                              <div key={q.id} className="quiz-review-item">
                                <strong>
                                  {idx + 1}. [Pilihan Ganda] <MathText text={q.prompt} />
                                </strong>
                                <AttachmentViewer
                                  externalUrl={q.externalUrl}
                                  attachmentName={q.attachmentName}
                                  attachmentMime={q.attachmentMime}
                                  attachmentSize={q.attachmentSize}
                                  downloadPath={
                                    q.attachmentName
                                      ? `/api/classes/${classItem.id}/quizzes/${quiz.id}/questions/${q.id}/download`
                                      : null
                                  }
                                  linkLabel="Buka tautan referensi soal"
                                  compact
                                />
                                <p className="workspace-muted">
                                  Jawaban:{' '}
                                  {selectedOpt ? <MathText text={selectedOpt.label} /> : 'Tidak dijawab'}.
                                  Skor otomatis:{' '}
                                  <span className="num">{ans?.pointsAwarded ?? '0.00'}</span> /{' '}
                                  <span className="num">{q.points}</span>
                                </p>
                              </div>
                            );
                          }
                          const draft = essayScores[q.id] ?? { points: '0', feedback: '' };
                          return (
                            <div key={q.id} className="quiz-review-item">
                              <strong>
                                {idx + 1}. [Esai, maks. {q.points} poin] <MathText text={q.prompt} />
                              </strong>
                              <AttachmentViewer
                                externalUrl={q.externalUrl}
                                attachmentName={q.attachmentName}
                                attachmentMime={q.attachmentMime}
                                attachmentSize={q.attachmentSize}
                                downloadPath={
                                  q.attachmentName
                                    ? `/api/classes/${classItem.id}/quizzes/${quiz.id}/questions/${q.id}/download`
                                    : null
                                }
                                linkLabel="Buka tautan referensi soal"
                                compact
                              />
                              {ans?.textAnswer ? (
                                <ExpandableAnswerText
                                  key={`${gradingAttempt.attempt.id}-${q.id}`}
                                  text={ans.textAnswer}
                                  className="workspace-roster-answer-text"
                                  prefixLabel="Jawaban Mahasiswa:"
                                  studentName={gradingAttempt.student.fullName}
                                  contextLabel={`${quiz.title}, Soal ${idx + 1}`}
                                />
                              ) : (
                                <p className="workspace-body-text">
                                  <strong>Jawaban Mahasiswa:</strong> (Tidak diisi)
                                </p>
                              )}
                              <div className="workspace-two-col">
                                <label>
                                  Skor Esai (0 hingga {q.points})
                                  <input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    max={Number(q.points)}
                                    value={draft.points}
                                    required
                                    onChange={(e) =>
                                      setEssayScores((prev) => ({
                                        ...prev,
                                        [q.id]: { ...draft, points: e.target.value },
                                      }))
                                    }
                                  />
                                </label>
                                <label>
                                  Umpan Balik <span className="optional">(opsional)</span>
                                  <input
                                    type="text"
                                    value={draft.feedback}
                                    onChange={(e) =>
                                      setEssayScores((prev) => ({
                                        ...prev,
                                        [q.id]: { ...draft, feedback: e.target.value },
                                      }))
                                    }
                                  />
                                </label>
                              </div>
                            </div>
                          );
                        })}
                        {gradingAttempt.questions.some((q) => q.type === 'ESSAY') ? (
                          <div>
                            <button className="button primary inline-btn" disabled={busy}>
                              {busy ? 'Menyimpan…' : 'Simpan Nilai Esai'}
                            </button>
                          </div>
                        ) : (
                          <p className="workspace-muted">
                            Kuis ini hanya berisi soal pilihan ganda yang dinilai otomatis.
                          </p>
                        )}
                      </form>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
