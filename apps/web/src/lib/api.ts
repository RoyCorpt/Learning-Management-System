export type Role = 'ADMIN' | 'DOSEN' | 'MAHASISWA';

export type User = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  mustChangePassword?: boolean;
};

export type ClassSummary = {
  id: string;
  name: string;
  description: string | null;
  status: 'OPEN' | 'CLOSED';
  ownerId: string;
  createdAt: string;
};

export type Topic = {
  id: string;
  classId: string;
  title: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Material = {
  id: string;
  classId: string;
  topicId: string | null;
  title: string;
  type: 'TEXT' | 'LINK' | 'FILE';
  content: string | null;
  externalUrl: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentSize: number | null;
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type SubmissionRecord = {
  id: string;
  assignmentId: string;
  studentId?: string;
  textAnswer: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentSize: number | null;
  version: number;
  isLate: boolean;
  score?: string | null;
  feedback?: string | null;
  gradeStatus?: 'DRAFT' | 'PUBLISHED' | null;
  gradedAt?: string | null;
  submittedAt: string;
  updatedAt: string;
};

export type Assignment = {
  id: string;
  classId: string;
  title: string;
  instructions: string;
  dueAt: string | null;
  status: 'OPEN' | 'CLOSED';
  allowLate: boolean;
  createdAt: string;
  updatedAt: string;
  mySubmission?: SubmissionRecord | null;
  submissionCount?: number;
};

export type RosterSubmissionItem = {
  student: { userId: string; fullName: string; email: string };
  submission: SubmissionRecord | null;
};

export type QuizOption = {
  id: string;
  questionId: string;
  label: string;
  position: number;
  isCorrect?: boolean;
};

export type QuizQuestion = {
  id: string;
  quizId: string;
  type: 'MULTIPLE_CHOICE' | 'ESSAY';
  prompt: string;
  points: string;
  position: number;
  options: QuizOption[];
};

export type QuizAttempt = {
  id: string;
  quizId: string;
  studentId: string;
  studentName?: string;
  studentEmail?: string;
  attemptNumber: number;
  startedAt: string;
  submittedAt: string | null;
  autoScore: string;
  manualScore: string;
  finalScore: string | null;
  status: 'IN_PROGRESS' | 'PROVISIONAL' | 'FINAL';
};

export type Quiz = {
  id: string;
  classId: string;
  title: string;
  description: string | null;
  timeLimitMinutes: number;
  maxAttempts: number;
  opensAt: string | null;
  closesAt: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  questionCount?: number;
  totalPoints?: string;
  attemptCount?: number;
  myAttempts?: QuizAttempt[];
};

export type AttemptAnswer = {
  id?: string;
  attemptId?: string;
  questionId: string;
  selectedOptionId: string | null;
  textAnswer: string | null;
  pointsAwarded?: string | null;
  feedback?: string | null;
  updatedAt?: string;
};

export type Announcement = {
  id: string;
  classId: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  title: string;
  body: string;
  createdAt: string;
};

export type ForumReply = {
  id: string;
  topicId: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ForumTopic = {
  id: string;
  classId: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  replies: ForumReply[];
};

export type NotificationItem = {
  id: string;
  userId: string;
  classId: string | null;
  type: 'ASSIGNMENT_NEW' | 'QUIZ_NEW' | 'ANNOUNCEMENT_NEW' | 'GRADE_PUBLISHED' | 'MATERIAL_NEW';
  title: string;
  message: string;
  targetUrl: string;
  isRead: boolean;
  createdAt: string;
};

export type UpcomingDeadline = {
  kind: 'ASSIGNMENT' | 'QUIZ';
  id: string;
  classId: string;
  className: string;
  title: string;
  deadlineAt: string | null;
  targetUrl: string;
};

export type DashboardSummary =
  | {
      role: 'MAHASISWA';
      activeClassesCount: number;
      upcomingDeadlines: UpcomingDeadline[];
      recentGrades: Array<{
        kind: 'ASSIGNMENT' | 'QUIZ';
        id: string;
        classId: string;
        className: string;
        title: string;
        score: string;
        feedback: string | null;
        statusLabel: string;
        dateAt: string;
      }>;
      recentAnnouncements?: Array<{
        id: string;
        classId: string;
        className: string;
        authorName: string;
        title: string;
        body: string;
        createdAt: string;
      }>;
    }
  | {
      role: 'DOSEN';
      classSummaries: Array<{
        classId: string;
        className: string;
        status: 'OPEN' | 'CLOSED';
        studentCount: number;
        assignmentCount: number;
        quizCount: number;
        actualSubmissions: number;
        expectedSubmissions: number;
        submissionRatio: number;
        averageScore: string | null;
        recentActivityCount: number;
      }>;
    }
  | {
      role: 'ADMIN';
      totalActiveUsers: number;
      totalActiveClasses: number;
      pendingStudentCount: number;
      pendingStudents: Array<{
        id: string;
        fullName: string;
        email: string;
        createdAt: string;
      }>;
    };

export type AttachmentPayload = { name: string; mimeType: string; dataBase64: string };

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const rawApiUrl = (import.meta.env.VITE_API_URL ?? '').trim();
export const API = typeof window !== 'undefined' && window.location.port !== '5173' ? '' : rawApiUrl.replace(/\/$/, '');

let memorySessionToken: string | null = null;
let memoryCsrfToken: string | null = null;

export function clearAuthMemory() {
  memorySessionToken = null;
  memoryCsrfToken = null;
}

function csrf() {
  return document.cookie.split('; ').find((v) => v.startsWith('lms_csrf='))?.split('=').slice(1).join('=') ?? '';
}

export async function request(path: string, body?: unknown, method = 'POST') {
  const csrfHeader = decodeURIComponent(csrf()) || memoryCsrfToken || '';
  const authHeaders: Record<string, string> = memorySessionToken
    ? { Authorization: `Session ${memorySessionToken}` }
    : {};
  const response = await fetch(`${API}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(method !== 'GET' ? { 'X-CSRF-Token': csrfHeader } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const errMsg = typeof data?.error === 'string'
      ? data.error
      : data?.error?.message ?? data?.message ?? 'Permintaan gagal. Coba kembali.';
    throw new Error(errMsg);
  }
  if (data && typeof data === 'object' && path === '/auth/login') {
    if (typeof data.sessionToken === 'string') memorySessionToken = data.sessionToken;
    if (typeof data.csrfToken === 'string') memoryCsrfToken = data.csrfToken;
  }
  return data;
}

export function formatFileSize(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function inferMimeType(file: File) {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.zip')) return 'application/zip';
  return 'application/octet-stream';
}

export function readFileAsAttachment(file: File): Promise<AttachmentPayload> {
  if (file.size === 0) {
    return Promise.reject(new Error('Berkas tidak boleh kosong.'));
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return Promise.reject(new Error('Ukuran berkas melebihi batas maksimal 4 MB.'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIndex = result.indexOf(',');
      const dataBase64 = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
      if (!dataBase64) {
        reject(new Error('Gagal membaca berkas lampiran.'));
        return;
      }
      resolve({
        name: file.name,
        mimeType: inferMimeType(file),
        dataBase64,
      });
    };
    reader.onerror = () => reject(new Error('Gagal membaca berkas lampiran.'));
    reader.readAsDataURL(file);
  });
}

export async function downloadFile(path: string, fallbackName: string) {
  const authHeaders: Record<string, string> = memorySessionToken
    ? { Authorization: `Session ${memorySessionToken}` }
    : {};
  const response = await fetch(`${API}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: authHeaders,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error?.message ?? data?.message ?? 'Gagal mengunduh berkas.');
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/i);
  const fileName = match?.[1] || fallbackName || 'lampiran';
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
