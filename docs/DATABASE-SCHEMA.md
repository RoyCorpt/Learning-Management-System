# Database Schema SINTAKS (Sprint 1–4)

**Versi:** 2.2 · **Tanggal:** 2026-11-22 · **Status:** Aktif di Cloud SQL PostgreSQL (`asia-southeast1`)

Skema aktif PostgreSQL dikelola menggunakan **Drizzle ORM** pada `src/db/schema.ts` (koneksi `src/db/index.ts`, konfigurasi `src/db/drizzle.config.ts`) dengan konvensi penamaan tabel dan kolom `snake_case`.

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

### 1. Identitas, Sesi & Audit (Sprint 1)

| Tabel | Tujuan dan pengamanan utama |
|---|---|
| `users` | Email ternormalisasi unik, kolom `uid` opsional (`@deprecated`, retensi non-destruktif pasca penghapusan Google Sign-In), `password_hash` Argon2id (dikecualikan dari respons API), `full_name`, `role`, `status`, `auth_version`, dan `must_change_password`. |
| `student_roster` | `nim` dan `email` unik, `full_name`, `registration_eligible`, `registered_at`, dan `registered_user_id` untuk klaim pendaftaran mahasiswa satu kali. |
| `sessions` | FK `user_id` (cascade delete), `token_hash` dan `csrf_hash` SHA-256, `expires_at`, `revoked_at`. Token mentah tidak disimpan di database. |
| `password_reset_tokens` | FK `user_id` (cascade delete), `token_hash` SHA-256 unik (token mentah tidak pernah disimpan), `expires_at`, `used_at` sekali pakai, dan indeks `(user_id, used_at, expires_at)` untuk fitur **Lupa Kata Sandi** tanpa Firebase. |
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

### 6. Catatan Retensi & Perlindungan Tabel Warisan FCM

Fitur notifikasi push peramban (Firebase Cloud Messaging) telah dihapus dari kode aplikasi (`src/db/schema.ts`, `src/db/index.ts`, `apps/api`, `apps/web`). Demi menjaga data historis dan mencegah penghapusan tanpa otorisasi, tabel warisan `fcm_device_tokens`, `fcm_dispatch_jobs`, dan enum `FcmJobStatus` dipertahankan di Cloud SQL sebagai objek historis pasif:
- **Mengapa perlindungan khusus diperlukan:** Pada Drizzle Kit (`0.31.x`), tanpa pemetaan retensi, `npm run db:push` mengusulkan `DROP TABLE "fcm_device_tokens" CASCADE`, `DROP TABLE "fcm_dispatch_jobs" CASCADE`, dan `DROP TYPE "public"."FcmJobStatus"`. Opsi `tablesFilter` saja hanya menyaring nama tabel dan tetap menghasilkan `DROP TYPE "public"."FcmJobStatus"`, yang gagal di PostgreSQL karena kolom `fcm_dispatch_jobs.status` masih bergantung pada enum tersebut.
- **Strategi retensi non-destruktif:** Definisi `@deprecated` untuk `fcm_device_tokens`, `fcm_dispatch_jobs`, dan `FcmJobStatus` dipisahkan ke berkas khusus `src/db/legacy-fcm-schema.ts` dan **hanya** dimuat oleh `src/db/drizzle.config.ts` (`schema: ['./src/db/schema.ts', './src/db/legacy-fcm-schema.ts']`). Kode runtime (`src/db/index.ts`, `src/db/schema.ts`, `apps/api`, `apps/web`) tidak mengimpor berkas tersebut, sehingga runtime sepenuhnya terbebas dari FCM sementara `npm run db:push` berjalan aman (`No changes detected`).

Bila siap melakukan migrasi pensiun (*retirement migration*) secara aman setelah rilis stabil:
1. Buat cadangan snapshot Cloud SQL terlebih dahulu.
2. Verifikasi tidak ada layanan aktif yang membaca atau menulis ke kedua tabel warisan tersebut.
3. Hapus `src/db/legacy-fcm-schema.ts` serta referensinya di `src/db/drizzle.config.ts`, lalu jalankan migrasi eksplisit terotorisasi: `DROP TABLE IF EXISTS fcm_dispatch_jobs; DROP TABLE IF EXISTS fcm_device_tokens; DROP TYPE IF EXISTS "FcmJobStatus";` (tanpa menyentuh tabel `notifications`).
