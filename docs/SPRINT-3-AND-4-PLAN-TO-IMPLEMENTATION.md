# Sprint 3 & Sprint 4 — Perencanaan hingga Pelaksanaan (SINTAKS)

**Tanggal dokumen:** 2026-11-16  
**Platform:** **SINTAKS** (sebelumnya *LMS Kampus PTIK*)  
**Status:** Implementasi MVP Sprint 1–4 beserta pembaruan UI/UX **SINTAKS** selesai dan terverifikasi pada build lokal/Cloud SQL (`asia-southeast1`).

Dokumen ini merangkum perjalanan perencanaan (*planning*), keputusan desain, skema data, kontrak API, hingga pelaksanaan (*implementation*) untuk **Sprint 3**, **Sprint 4**, serta penyempurnaan antarmuka pasca-Sprint 4.

---

## 1. Konteks Awal & Transisi Infrastruktur

Setelah Sprint 1 (Identitas, Autentikasi & Roster) dan Sprint 2 (Kelas & Keanggotaan) diterima pada `2026-11-12`, sistem melanjutkan ke fase persiapan infrastruktur dan fitur pembelajaran inti:

1. **Provisioning Cloud SQL (`asia-southeast1`):** Database PostgreSQL dikelola pada Cloud SQL region `asia-southeast1`.
2. **Migrasi ke Drizzle ORM (`src/db/`):** Skema dan kueri database dipusatkan di `src/db/schema.ts`, `src/db/index.ts`, dan `src/db/drizzle.config.ts` dengan penamaan kolom `snake_case`.
3. **Autentikasi Ganda:** Mempertahankan login email/kata sandi berbasis Argon2id + sesi opaque di PostgreSQL + CSRF cookie, serta menambahkan masuk dengan Google melalui Firebase Authentication (`POST /auth/firebase` dan `users.uid`).
4. **Rekonsiliasi Keputusan Terbuka:**
   - **Batas unggahan berkas (`OD-07`, terkait `CR-10`):** Ditetapkan **4 MB per berkas** (`PDF, JPG, PNG, TXT, MD, CSV, DOCX, ZIP`).
   - **Pengumpulan tugas (`OD-05` / `FR-40`) & Notifikasi (`OD-04` / `FR-38`):** Dijadwalkan masuk ke Sprint 3 dan Sprint 4.

---

## 2. Sprint 3 — Ruang Kelas, Topik, Materi & Pengumpulan Tugas

### 2.1 Tahap Perencanaan (Planning)

**Tujuan:** Memberikan ruang kerja pembelajaran di dalam setiap kelas (`ClassWorkspace`) agar dosen dapat menyusun topik, materi, dan tugas, sementara mahasiswa aktif dapat mengakses materi dan mengumpulkan tugas dengan jaminan integritas versi.

**Cakupan Use Case & Kebutuhan Fungsional:**
- `UC-07` — Mengelola topik dan materi (`FR-14`, `FR-15`, `FR-16`)
- `UC-08` — Mengakses materi (`FR-17`)
- `UC-09` — Membuat tugas dan melihat status pengumpulan (`FR-18`, `FR-21`)
- `UC-10` — Mengumpulkan tugas (`FR-19`, `FR-20`, `FR-40`)

**Rancangan Teknis & Aturan Bisnis:**
1. **Skema Data:** Menambahkan tabel `topics`, `materials` (enum `MaterialType`: `'TEXT' | 'LINK' | 'FILE'`), `assignments` (enum `AssignmentStatus`: `'OPEN' | 'CLOSED'`), dan `submissions`.
2. **Kontrol Akses & Kelas Tertutup:**
   - Hanya pemilik kelas (`DOSEN`) yang dapat membuat/mengubah/menghapus topik, materi, dan tugas.
   - Materi berstatus draf (`isPublished = false`) disembunyikan dari mahasiswa.
   - Mahasiswa terdaftar tetap dapat membaca materi dan melihat riwayat pengumpulan ketika kelas berstatus `CLOSED` (baca-saja), tetapi pengiriman atau pengiriman ulang tugas ditolak.
3. **Integritas Pengumpulan & Versi:**
   - Pengiriman tugas (`POST .../submissions`) dijalankan dalam transaksi PostgreSQL tingkat isolasi **Serializable**.
   - Pengiriman ulang menaikkan penghitung `version` (`Versi ke-N`) tanpa merusak catatan waktu dan menghitung status `is_late` berdasarkan `due_at` serta kebijakan `allow_late`.
4. **Keamanan Berkas (Maks. 4 MB):**
   - Validasi ukuran berkas maksimal 4 MB dan ekstensi/MIME yang diizinkan di server maupun klien; berkas diunduh melalui endpoint terotorisasi (`/download`), bukan tautan publik langsung.

### 2.2 Tahap Pelaksanaan (Implementation)

- **Database (`src/db/schema.ts`):** Penambahan tabel `topics`, `materials`, `assignments`, dan `submissions` beserta indeks relasional.
- **Backend (`apps/api/src/learning.ts`):**
  - Topik: `GET/POST /api/classes/:classId/topics`, `PATCH/DELETE /api/classes/:classId/topics/:topicId`.
  - Materi: `GET/POST /api/classes/:classId/materials`, `PATCH/DELETE /api/classes/:classId/materials/:materialId`, `GET /api/classes/:classId/materials/:materialId/download`.
  - Tugas & Pengumpulan: `GET/POST /api/classes/:classId/assignments`, `PATCH /api/classes/:classId/assignments/:assignmentId`, `GET /api/classes/:classId/assignments/:assignmentId/submissions` (roster pengumpulan per mahasiswa untuk dosen), `POST /api/classes/:classId/assignments/:assignmentId/submissions`, dan `GET /api/classes/:classId/assignments/:assignmentId/submissions/:submissionId/download`.
- **Frontend (`apps/web/src/App.tsx`):**
  - Menambahkan `ClassWorkspace` dengan tab **Materi & Topik** dan **Tugas**.
  - Dosen dapat membuat/menghapus topik, menambahkan materi teks/tautan/berkas, mengubah status publikasi materi, membuat tugas (dengan tenggat opsional dan toggle `allowLate`), menutup/membuka tugas, serta memeriksa daftar pengumpulan.
  - Mahasiswa melihat materi terkelompok per topik, mengunduh lampiran, dan mengirim/mengirim ulang tugas dengan bukti tanda terima (`Versi ke-N`, `Tepat waktu`/`Terlambat`, stempel waktu).

---

## 3. Sprint 4 — Penilaian, Kuis Daring, Komunikasi, Notifikasi & Dasbor

### 3.1 Tahap Perencanaan (Planning)

**Tujuan:** Menyelesaikan seluruh use case MVP yang belum dimulai (`UC-11`–`UC-16`, `UC-18`) dan menutup celah parsial (`UC-03`, `UC-17`) dalam empat modul berurutan:

| Modul | Use Case & FR | Fokus Perencanaan & Aturan Kritis |
|---|---|---|
| **Modul 1: Penilaian Tugas & Umpan Balik** | `UC-13`, `UC-14` (`FR-27`, `FR-28`, `FR-29`) | Skor `NUMERIC(5,2)` rentang `0.00–100.00`, status `DRAFT` vs `PUBLISHED`, audit setiap koreksi nilai tanpa menghapus histori versi, publikasi massal atomik dengan pemicu notifikasi, rekap nilai kelas (dosen), serta isolasi ketat agar nilai `DRAFT` tidak pernah bocor ke mahasiswa. |
| **Modul 2: Kuis Daring & Evaluasi** | `UC-11`, `UC-12` (`FR-22`–`FR-26`) | Builder kuis (`DRAFT`/`PUBLISHED`/`CLOSED`), soal Pilihan Ganda (min. 2 opsi, tepat 1 jawaban benar) & Esai, pembatasan percobaan (`max_attempts` 1–3) dan jendela waktu (`opens_at`–`closes_at`) di server, penyembunyian mutlak field `is_correct` dari respons mahasiswa, autosave idempoten, auto-grading PG, serta penilaian esai manual yang memindahkan status `PROVISIONAL` → `FINAL`. |
| **Modul 3: Komunikasi Kelas** | `UC-15`, `UC-16` (`FR-30`, `FR-31`) | Pengumuman kelas khusus dosen (atomik memicu notifikasi mahasiswa) serta Forum Diskusi bagi anggota aktif kelas dengan jendela sunting 15 menit bagi penulis topik/balasan dan dukungan moderasi/edit dosen. |
| **Modul 4: Notifikasi, Dasbor & Profil** | `UC-18`, `UC-17`, `UC-03` (`FR-38`, `FR-33`–`FR-35`, `FR-04`) | Tabel notifikasi dalam aplikasi dengan deep-link ke kelas/tab target, ringkasan dasbor spesifik peran (`ADMIN`, `DOSEN`, `MAHASISWA`), daftar tenggat waktu mendatang, serta halaman edit nama tampilan & ganti kata sandi mandiri saat login. *(Catatan: reset kata sandi publik tanpa login / `FR-05` tetap dicatat di luar MVP karena memerlukan kanal email verifikasi).* |

### 3.2 Tahap Pelaksanaan (Implementation)

1. **Skema Database (`src/db/schema.ts`):**
   - Menambahkan `score`, `feedback`, `grade_status`, `graded_by`, `graded_at` pada `submissions`.
   - Menambahkan tabel `quizzes`, `questions`, `question_options`, `quiz_attempts`, `attempt_answers`, `announcements`, `forum_topics`, `forum_replies`, dan `notifications` beserta enum `GradeStatus`, `QuizStatus`, `QuestionType`, `AttemptStatus`, dan `NotificationType`.

2. **Modul Backend (`apps/api/src/`):**
   - **Penilaian & Rekap (`learning.ts`):**
     - `PATCH /api/classes/:classId/assignments/:assignmentId/submissions/:submissionId/grade`
     - `POST /api/classes/:classId/assignments/:assignmentId/grades/publish`
     - `GET /api/classes/:classId/grades/recap`
     - `GET /api/classes/:classId/my-grades`
   - **Kuis Daring (`quizzes.ts`):**
     - `GET/POST /api/classes/:classId/quizzes`, `GET/PATCH/DELETE /api/classes/:classId/quizzes/:quizId`
     - `POST /api/classes/:classId/quizzes/:quizId/questions`, `DELETE /api/classes/:classId/quizzes/:quizId/questions/:questionId`
     - `GET/POST /api/classes/:classId/quizzes/:quizId/attempts`
     - `GET /api/quizzes/attempts/:attemptId`, `PUT /api/quizzes/attempts/:attemptId/answers`, `POST /api/quizzes/attempts/:attemptId/submit`, `PATCH /api/quizzes/attempts/:attemptId/grade-essay`
   - **Komunikasi (`communication.ts`):**
     - `GET/POST /api/classes/:classId/announcements`
     - `GET/POST /api/classes/:classId/forum/topics`, `PATCH /api/classes/:classId/forum/topics/:topicId`
     - `POST /api/classes/:classId/forum/topics/:topicId/replies`, `PATCH /api/classes/:classId/forum/topics/:topicId/replies/:replyId`
   - **Notifikasi, Dasbor & Profil (`notifications-service.ts`, `dashboard.ts`):**
     - `GET /api/notifications`, `PATCH /api/notifications/read-all`, `PATCH /api/notifications/:id/read`
     - `GET /api/students/upcoming-deadlines`, `GET /api/dashboard/summary`
     - `PATCH /api/users/me/profile`

3. **Antarmuka Frontend (`apps/web/src/components/` & `App.tsx`):**
   - `GradesSection.tsx`: Matriks rekap nilai dosen dan daftar nilai/komentar terpublikasi mahasiswa.
   - `QuizzesSection.tsx`: Builder soal PG/Esai, daftar percobaan dan antrean penilaian esai dosen, serta runner kuis berwaktu untuk mahasiswa dengan countdown waktu-nyata, indikator *Tersimpan otomatis*, peta nomor soal, dan label **Skor Sementara** / **Skor Final**.
   - `CommunicationSection.tsx`: Tab **Pengumuman** dan **Forum Diskusi** dengan kontrol sunting sesuai batas waktu 15 menit.
   - `DashboardAndProfile.tsx`: `NotificationBell` (polling + tandai dibaca + navigasi ke tab kelas), `RoleSummaryDashboard` (`ADMIN`, `DOSEN`, `MAHASISWA`), dan `ProfileBanner` dengan laci **Edit Profil & Kata Sandi**.

---

## 4. Penyempurnaan Pasca-Sprint 4 (SINTAKS UI/UX, Aset & Filter Kelas)

Setelah seluruh fungsionalitas Sprint 3 dan Sprint 4 berjalan, dilakukan beberapa iterasi penyempurnaan produk:

1. **Rebrand ke SINTAKS & Sistem Desain Editorial Terang (`2026-11-15`):**
   - Mengubah nama aplikasi menjadi **SINTAKS** (`Portal Pembelajaran`), merombak `styles.css`, `classes.css`, dan `workspace.css` ke tema terang (`#FFFFFF`, `#FAFBF9`, `#EAF1EA`, `#1F4D3A`), tipografi **Newsreader** + **Inter**, dan penyelarasan angka `tabular-nums`.
   - Menambahkan ringkasan `recentAnnouncements` di `GET /api/dashboard/summary` untuk mahasiswa, tampilan panel terpisah penilaian tugas dosen (`Pratinjau Jawaban` + tombol navigasi antar mahasiswa), serta tombol `Dasbor` di bilah navigasi atas.
2. **Integrasi Logo, Animasi Interaktif & Pembersihan Tombol (`2026-11-15`):**
   - Menjadikan `/assets/aistudio/Logo_Website_SINTAKS_fix_07745e85.png` sebagai favicon dan ikon utama header dengan penyajian statis `public/` di `apps/api/src/app.ts`.
   - Menambahkan animasi hover/tekan dan transisi tampilan berbasis GPU (`sintaksFadeSlide`) dengan dukungan `prefers-reduced-motion` serta menghapus seluruh simbol panah (`→`, `←`, `↓`, `↗`) pada tombol.
3. **Pencarian & Pengurutan Daftar Kelas (`2026-11-15`):**
   - Menambahkan input pencarian waktu-nyata (`Cari kelas`) berdasarkan nama/deskripsi dan dropdown pengurutan (`Urutkan`: **Terbaru dibuat**, **Nama (A–Z)**, **Status (Terbuka dulu)**) pada panel pengelolaan kelas.

---

## 5. Status Verifikasi & Catatan Operasional

- **Pemeriksaan Build & Tipe:** `npm run typecheck` (`@lms/api`, `@lms/web`, `@lms/shared`) dan build produksi `compile_applet` lulus tanpa galat.
- **Pemeriksaan Runtime Port `3000`:** Halaman `/`, aset bundel JS/CSS, logo PNG, `/health`, `POST /auth/login`, dan `GET /api/dashboard/summary` terverifikasi merespons `200 OK` terhadap instance Cloud SQL PostgreSQL (`asia-southeast1`).
- **Catatan Operasional Tersisa:**
  - `FR-05` (reset kata sandi publik lupa sandi via email) tetap di backlog karena memerlukan penyedia pengiriman email verifikasi terkonfigurasi.
  - Rate limiter autentikasi dan join kelas masih menggunakan penyimpanan in-memory per proses; *shared store* (seperti Redis) tetap diperlukan sebelum deployment multi-instance.
  - Pengujian audio *screen reader* secara menyeluruh belum diklaim pada dokumen penerimaan.
