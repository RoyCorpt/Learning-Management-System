# Database Schema SINTAKS (Sprint 1–4)

**Versi:** 2.0 · **Tanggal:** 2026-11-16 · **Status:** Aktif di Cloud SQL PostgreSQL (`asia-southeast1`)

Skema PostgreSQL dikelola menggunakan **Drizzle ORM** pada `src/db/schema.ts` (koneksi `src/db/index.ts`, konfigurasi `src/db/drizzle.config.ts`) dengan konvensi penamaan tabel dan kolom `snake_case`.

## Daftar Enum PostgreSQL

- `Role`: `'ADMIN' | 'DOSEN' | 'MAHASISWA'`
- `AccountStatus`: `'ACTIVE' | 'INACTIVE' | 'PENDING'`
- `ClassStatus`: `'OPEN' | 'CLOSED'`
- `MaterialType`: `'TEXT' | 'LINK' | 'FILE'`
- `AssignmentStatus`: `'OPEN' | 'CLOSED'`
- `GradeStatus`: `'DRAFT' | 'PUBLISHED'`
- `QuizStatus`: `'DRAFT' | 'PUBLISHED' | 'CLOSED'`
- `QuestionType`: `'MULTIPLE_CHOICE' | 'ESSAY'`
- `AttemptStatus`: `'IN_PROGRESS' | 'PROVISIONAL' | 'FINAL'`
- `NotificationType`: `'ASSIGNMENT_NEW' | 'QUIZ_NEW' | 'ANNOUNCEMENT_NEW' | 'GRADE_PUBLISHED' | 'MATERIAL_NEW'`

## Tabel Berdasarkan Domain

### 1. Identitas, Sesi & Audit (Sprint 1 + Firebase Auth)

| Tabel | Tujuan dan pengamanan utama |
|---|---|
| `users` | Email ternormalisasi unik, `uid` opsional untuk Firebase Auth, `password_hash` Argon2id (dikecualikan dari respons API), `full_name`, `role`, `status`, `auth_version`, dan `must_change_password`. |
| `student_roster` | `nim` dan `email` unik, `full_name`, `registration_eligible`, `registered_at`, dan `registered_user_id` untuk klaim pendaftaran mahasiswa satu kali. |
| `sessions` | FK `user_id` (cascade delete), `token_hash` dan `csrf_hash` SHA-256, `expires_at`, `revoked_at`. Token mentah tidak disimpan di database. |
| `audit_events` | `actor_id`, `action`, `subject_id`, `details` (JSONB), `created_at` untuk jejak autentikasi, tata kelola akun, kelas, serta koreksi nilai. |

### 2. Kelas & Keanggotaan (Sprint 2)

| Tabel | Tujuan dan pengamanan utama |
|---|---|
| `classes` | `owner_id` (FK ke `users`), `name`, `description`, `status` (`OPEN`/`CLOSED`), `invitation_code_hash` SHA-256 (kode mentah tidak disimpan), dan `invitation_code_version`. |
| `memberships` | Relasi unik `(class_id, user_id)` untuk mahasiswa anggota kelas dengan indeks pencarian per kelas dan per mahasiswa. |

### 3. Topik, Materi, Tugas & Pengumpulan/Penilaian (Sprint 3 & Sprint 4)

| Tabel | Tujuan dan pengamanan utama |
|---|---|
| `topics` | Pengelompokan materi per `class_id` dengan `title` dan `sort_order`. |
| `materials` | Materi kelas (`TEXT`, `LINK`, `FILE`), relasi opsional ke `topic_id`, metadata/data lampiran privat (batas 4 MB), dan flag `is_published`. |
| `assignments` | Daftar tugas per `class_id` dengan `instructions`, `due_at` opsional, `status` (`OPEN`/`CLOSED`), dan `allow_late`. |
| `submissions` | Unik per `(assignment_id, student_id)`; menyimpan jawaban teks, lampiran privat (maks. 4 MB), `version` (`Versi ke-N`), `is_late`, serta kolom penilaian Sprint 4 (`score` `NUMERIC(5,2)`, `feedback`, `grade_status`, `graded_by`, `graded_at`). |

### 4. Kuis Daring & Evaluasi (Sprint 4)

| Tabel | Tujuan dan pengamanan utama |
|---|---|
| `quizzes` | Konfigurasi kuis per `class_id` (`title`, `description`, `time_limit_minutes`, `max_attempts`, `opens_at`, `closes_at`, `status`). |
| `questions` | Soal per `quiz_id` bertipe `MULTIPLE_CHOICE` atau `ESSAY`, `prompt`, `points` (`NUMERIC(5,2)`), dan `position`. |
| `question_options` | Opsi jawaban pilihan ganda (`label`, `is_correct`, `position`). Field `is_correct` tidak pernah dikirim dalam payload peserta mahasiswa. |
| `quiz_attempts` | Percobaan per `(quiz_id, student_id, attempt_number)` dengan `started_at`, `submitted_at`, `auto_score`, `manual_score`, `final_score` (`NUMERIC(5,2)`), dan `status` (`IN_PROGRESS`/`PROVISIONAL`/`FINAL`). |
| `attempt_answers` | Jawaban per `(attempt_id, question_id)` (`selected_option_id`, `text_answer`, `points_awarded`, `feedback`, `updated_at`) untuk autosave dan penilaian esai. |

### 5. Komunikasi & Notifikasi (Sprint 4)

| Tabel | Tujuan dan pengamanan utama |
|---|---|
| `announcements` | Pengumuman kelas oleh dosen (`class_id`, `author_id`, `title`, `body`, `created_at`). |
| `forum_topics` | Topik diskusi kelas (`class_id`, `author_id`, `title`, `body`, `created_at`, `updated_at`). |
| `forum_replies` | Balasan topik diskusi (`topic_id`, `author_id`, `body`, `created_at`, `updated_at`). |
| `notifications` | Notifikasi dalam aplikasi per `user_id` (`class_id`, `type`, `title`, `message`, `target_url`, `is_read`, `created_at`). |

### 6. Catatan Retensi & Migrasi Aman Tabel Warisan FCM

Fitur notifikasi push peramban (Firebase Cloud Messaging) telah dihapus dari kode aplikasi (`src/db/schema.ts`, `apps/api`, `apps/web`). Demi mencegah penghapusan data tanpa otorisasi, tabel warisan `fcm_device_tokens`, `fcm_dispatch_jobs`, dan enum `FcmJobStatus` tidak dihapus otomatis dari database produksi. Bila siap membersihkan database secara aman setelah rilis stabil:
1. Buat cadangan snapshot Cloud SQL terlebih dahulu.
2. Verifikasi tidak ada layanan aktif yang membaca kedua tabel tersebut.
3. Jalankan migrasi eksplisit terotorisasi: `DROP TABLE IF EXISTS fcm_dispatch_jobs; DROP TABLE IF EXISTS fcm_device_tokens; DROP TYPE IF EXISTS "FcmJobStatus";` (tanpa menyentuh tabel `notifications`).
