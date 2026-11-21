# Changelog

> **Kewenangan project owner / project-owner delegation:** Project owner has fully delegated management and decision-making for this project to the student team. The team may make internal scope, technical, review, and Sprint acceptance decisions; no additional project-owner permission or sign-off is a gate. Ini proyek pembelajaran mahasiswa; tim tidak dibayar sebagai pekerja untuk proyek ini. Review dan quality gates adalah praktik belajar dan menjaga mutu, bukan indikasi ketidakprofesionalan atau hubungan kerja.

## 2026-11-21 — Perluasan tata letak penuh kiri-kanan untuk mode laptop & desktop (`SINTAKS`)

- **Kontainer & Gutter Adaptif (`apps/web/src/tokens.css`, `apps/web/src/styles.css`):** Mengubah `--container` menjadi `100%` dan `--gutter` menjadi `clamp(20px, 2.2vw, 36px)` (menggantikan batas tetap `1440px` + margin `64px`) agar header `.topbar-inner`, konten `.page-main`, layar masuk `.auth-layout` (editorial kiri & kartu masuk rata kanan), serta `.footer` merentang sejajar penuh dari sisi kiri ke kanan pada layar laptop dan PC tanpa ruang kosong berlebih.
- **Tata Letak Multi-Kolom & Formulir Horizontal (`apps/web/src/classes.css`, `apps/web/src/workspace.css`, `apps/web/src/App.tsx`, `apps/web/src/components/CommunicationSection.tsx`):** Menambahkan baris horizontal `.class-create-row` dan `.class-join-row` pada formulir buat/gabung kelas, kisi 4 kolom `.class-list` pada layar lebar (`>= 1560px`), kisi materi 2 kolom per topik, tata letak pisah `.workspace-split-layout` (formulir lekat kiri + umpan kanan) pada tab Pengumuman Dosen & Forum Diskusi, kisi 2 kolom `.announcements-grid` untuk Pengumuman Mahasiswa, serta perentangan penuh input unggah roster admin (`.admin-full-span`) sambil tetap mempertahankan perilaku responsif tablet/seluler.

## 2026-11-21 — Finalisasi pasca-penghapusan FCM: migrasi tes Drizzle, proteksi objek warisan DB & konsistensi dokumen (`SINTAKS`)

- **Migrasi Tes Integrasi ke Drizzle ORM (`apps/api/src/classes.test.ts`, `apps/api/src/classes-audit-rollback.test.ts`, `apps/api/src/password-change.test.ts`, `apps/api/src/index.test.ts`):** Memigrasikan seluruh impor dan kueri usang `./lib/prisma.js` ke Drizzle ORM (`src/db/index.ts`, `src/db/schema.ts`, `drizzle-orm`) dengan koneksi `admin` terpisah untuk pembuatan trigger PostgreSQL sementara pada uji *fault-injection rollback*, sehingga seluruh cakupan pengujian asli tetap terjaga tanpa mengembalikan Prisma.
- **Proteksi Objek Database Warisan FCM (`src/db/legacy-fcm-schema.ts`, `src/db/drizzle.config.ts`, `docs/DATABASE-SCHEMA.md`):** Mengisolasi definisi `@deprecated` untuk `fcm_device_tokens`, `fcm_dispatch_jobs`, dan enum `FcmJobStatus` ke `src/db/legacy-fcm-schema.ts` (hanya dirujuk oleh `drizzle.config.ts`, tidak pernah diimpor oleh runtime aplikasi maupun `src/db/schema.ts`) agar `npm run db:push` menghasilkan `No changes detected` dan tidak menjatuhkan tabel/enum historis maupun gagal akibat ketergantungan enum.
- **Sinkronisasi Dokumentasi (`README.md`, `docs/DATABASE-SCHEMA.md`, `docs/CHANGELOG.md`):** Memverifikasi konsistensi versi minimum Node.js (`20.12+`), ketiadaan prasyarat FCM/VAPID, keberlanjutan Firebase Auth dan notifikasi dalam aplikasi PostgreSQL, ketersediaan skrip `db:push`/`db:generate`/`db:bootstrap-admin`, serta penandaan objek warisan Cloud SQL sebagai data historis tertahan.
- **Pemuatan `.env` Root pada Skrip Workspace (`src/db/config.ts`, `src/db/index.ts`, `apps/api/src/config/env.ts`):** Memastikan `loadLocalEnvFile()` dipanggil sebelum inisialisasi `pg.Pool` dan validasi `env` API agar `npm run dev` (yang berjalan dengan `cwd` di `apps/api/` via `start-lms.ps1`) maupun `npm start` tetap membaca berkas `.env` di root repositori tanpa menimpa variabel environment proses.

## 2026-11-21 — Penghapusan Firebase Cloud Messaging (FCM) & push peramban (`SINTAKS`)

- **Frontend (`apps/web/src/lib/firebase.ts`, `apps/web/src/components/DashboardAndProfile.tsx`):** Menghapus seluruh inisialisasi `firebase/messaging`, registrasi token perangkat (`getToken`), listener pesan foreground (`onMessage`), permintaan izin notifikasi peramban, registrasi `/firebase-messaging-sw.js`, dan panel aktivasi push pada lonceng notifikasi sambil mempertahankan Firebase Authentication (Google Sign-In) serta seluruh sistem notifikasi dalam aplikasi (`GET /api/notifications`, penghitung belum dibaca, tandai dibaca, riwayat).
- **Backend & Service Worker (`apps/api/src/notifications-service.ts`, `apps/api/src/learning.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/lib/firebase-admin.ts`, `apps/api/src/config/env.ts`, hapus `apps/api/src/fcm-jobs.ts`):** Menghapus worker pengiriman FCM, endpoint `/api/notifications/push-config`, `/api/notifications/fcm-token`, `/api/notifications/fcm-jobs`, rute `/firebase-messaging-sw.js` dan `/vendor/firebase-*-compat.js`, `adminMessaging`, serta variabel lingkungan `FIREBASE_VAPID_KEY` dan `VITE_FIREBASE_VAPID_KEY` (`.env.example`).
- **Skema Database (`src/db/schema.ts`, `docs/DATABASE-SCHEMA.md`):** Menghapus definisi ORM untuk `fcmDeviceTokens`, `fcmDispatchJobs`, dan `fcmJobStatusEnum` dari kode runtime tanpa menghapus tabel `notifications` maupun melakukan penghapusan tabel destruktif pada Cloud SQL (strategi migrasi aman didokumentasikan di `docs/DATABASE-SCHEMA.md`).

## 2026-11-21 — Perbaikan konfigurasi database, skrip startup, resolusi Vite, dan dokumentasi (`SINTAKS`)

- **Konfigurasi Database & Skrip Drizzle (`src/db/config.ts`, `src/db/index.ts`, `src/db/drizzle.config.ts`, `.env.example`, `package.json`):** Menambahkan skrip `db:push` dan `db:generate` di `package.json`, melengkapi variabel `SQL_*` serta opsi `DATABASE_URL`/`DB_SSL` di `.env.example`, menyatukan dukungan `DATABASE_URL` + `SQL_*` + SSL/TLS di runtime pool dan konfigurasi Drizzle Kit, serta menambahkan fallback parser `.env` bagi Node.js `20.0–20.11` (dengan `engines.node >=20.12.0`).
- **Skrip Startup & Integrasi Frontend (`start-lms.ps1`, `apps/api/src/server.ts`, `README.md`):** Mengganti perintah Prisma di `start-lms.ps1` dengan `npm run db:push`, menambahkan mode `-ExternalDb` (beserta deteksi otomatis `DATABASE_URL`/host non-lokal) untuk melewati Docker, menyinkronkan dependensi berdasarkan hash manifes/lockfile, dan memvalidasi port efektif (`PORT`/`API_PORT`/3000). Memperbarui `createDevViteServer()` di `apps/api/src/server.ts` agar mencari `vite` melalui resolusi modul standar (mendukung workspace hoisting) serta menghentikan startup dengan galat jelas bila frontend dev/prod gagal dimuat.

## 2026-11-21 — Sinkronisasi skema FCM Cloud SQL & ketahanan koneksi pool PostgreSQL (`SINTAKS`)

- **Sinkronisasi Skema Cloud SQL (`src/db/schema.ts` -> Cloud SQL):** Menerapkan pembaruan skema ke basis data Cloud SQL sehingga tabel `fcm_device_tokens` dan `fcm_dispatch_jobs`, enum `FcmJobStatus`, serta nilai enum `MATERIAL_NEW` pada `NotificationType` tersedia penuh bagi API dan worker notifikasi.
- **Ketahanan Pool Koneksi & Retry Worker FCM (`src/db/index.ts`, `apps/api/src/fcm-jobs.ts`):** Mengaktifkan TCP `keepAlive` serta `idleTimeoutMillis: 15_000` dan `allowExitOnIdle: true` pada `pg.Pool`, mengubah log kesalahan klien *idle* menjadi JSON satu baris terstruktur, menyelaraskan interval polling ke `30_000 ms`, dan menambahkan percobaan ulang satu kali pada `claimNextDueFcmJob` saat terjadi pemutusan koneksi sementara PostgreSQL.

## 2026-11-20 — Ringkasan jawaban mahasiswa 30 kata & pop-up jawaban lengkap (`SINTAKS`)

- **Pratinjau Jawaban 30 Kata, Indikator 'Lihat selengkapnya' & Pop-up Area Luas (`apps/web/src/components/ExpandableAnswerText.tsx`, `apps/web/src/App.tsx`, `apps/web/src/components/QuizzesSection.tsx`, `apps/web/src/workspace.css`):** Memperkenalkan komponen `ExpandableAnswerText` yang secara bawaan meringkas jawaban mahasiswa menjadi 30 kata pertama (`…`) ketika dosen membuka daftar pengumpulan tugas, panel pratinjau penilaian tugas, atau evaluasi esai kuis. Menambahkan animasi transisi `0.2s` pada `.workspace-roster-answer-text` serta indikator visual ikon perluas dan label `Lihat selengkapnya` (beserta `aria-label` jumlah kata) yang saat diklik membuka jendela pop-up lebar (`role="dialog"`, `aria-modal="true"`, menampilkan total kata dan tombol `Tutup`/`Escape`/klik latar belakang) agar dosen dapat membaca teks asli mahasiswa secara utuh dan nyaman.

## 2026-11-20 — Pemisahan halaman Kelola Kelas & paginasi Ringkasan Kelas pada dasbor Dosen (`SINTAKS`)

- **Navigasi Halaman Dasbor Dosen (`apps/web/src/App.tsx`, `apps/web/src/workspace.css`):** Memisahkan tampilan **Kelola Kelas** dan **Ringkasan Kelas** untuk peran `DOSEN` melalui tab navigasi `.dosen-view-tabs` (mendukung navigasi papan ketik `ArrowLeft`/`ArrowRight`/`Home`/`End`) serta tombol cepat `Ringkasan kelas` dan `Kelola semua kelas`. Dosen kini mendarat langsung pada halaman pengelolaan kelas (`Buat kelas baru`, pencarian/pengurutan, dan tombol `Buat kode`/`Rotasi kode`) tanpa harus menggulir ratusan kartu ringkasan, sementara panel `ClassManagement` tetap terpasang (`hidden`) agar daftar kelas yang termuat dan kode undangan satu kali tetap terjaga saat berpindah tab.
- **Ringkasan Kelas Terskala (`apps/web/src/components/DashboardAndProfile.tsx`, `apps/web/src/workspace.css`):** Menambahkan kartu metrik ringkas (total kelas dikelola, total mahasiswa terdaftar, dan rata-rata nilai tugas), pencarian nama kelas, filter status (`Semua status`, `Terbuka`, `Ditutup`), serta paginasi 9 kartu per halaman (`Sebelumnya` / `Berikutnya`) pada tampilan `Ringkasan Kelas`, lengkap dengan pembukaan langsung ke `ClassWorkspace` saat memilih `Buka ruang kelas` atau mengeklik notifikasi.

## 2026-11-20 — Audit UI Hallmark & redesain tipografi/antarmuka referensi tema Dose (`SINTAKS`)

- **Audit UI Baseline (`/.hallmark/before.txt`):** Menjalankan audit `sloplint` pada codebase frontend `apps/web/src` dan menemukan `74 FAIL`, `80 REFLEX`, dan `9 WARN` (termasuk hilangnya `tokens.css` & `base.css`, kontras beberapa state gelap/lencana, pengulangan resep kotak `F7`, animasi non-kompositor, struktur kartu bertingkat, `em-dash`/titik tengah pada salinan, serta label/kicker huruf kapital berlebih di atas judul).
- **Sistem Tipografi & Komponen Teks Referensi Dose (`index.html`, `tokens.css`, `styles.css`, `classes.css`, `workspace.css`):**
  - Menerapkan pasangan 3 huruf Dose dengan hierarki 3 bobot (`400`, `500`, `700`): **Schibsted Grotesk** `700` untuk judul tampilan (`letter-spacing: -0.03em`, `text-wrap: balance`), **Instrument Sans** `400`/`500` untuk prosa (`max-width: 65ch`) dan label kalimat biasa tanpa huruf kapital penuh, serta **DM Mono** (`tabular-nums`) untuk waktu, versi pengumpulan, kode undangan, penghitung soal, dan nilai.
  - Menghapus elemen `.eyebrow`, `.card-kicker`, `.section-kicker`, `.welcome-caption`, penekanan `<em>` dalam `<h1>`, garis pisah panjang (`—`/`–`), pemisah titik tengah (`·`), dan seluruh `style={...}` sebaris di `App.tsx`, `DashboardAndProfile.tsx`, `CommunicationSection.tsx`, `GradesSection.tsx`, dan `QuizzesSection.tsx`.
- **Permukaan Kertas, Kontrol Taktil & Resi Farmasi Dose:**
  - Membangun token OKLCH mode terang (`white`) dan mode gelap (`night`) pada `apps/web/src/tokens.css`, aturan dasar pada `apps/web/src/base.css`, tekstur serat kertas SVG `feTurbulence` pada `.app-shell`, cahaya jendela melayang `90s` pada layar autentikasi (patuh `prefers-reduced-motion: reduce`), serta satu aksen hijau farmasi (`#277954`) dengan status terlambat/draf berabu netral tenang.
  - Menerapkan tombol primer/sekunder cetakan taktil 3px (`translateY(3px)` saat ditekan), meratakan kedalaman kartu (`grading-preview-pane`, `forum-reply-item`), menambahkan stempel konfirmasi dua cincin `.stamp-seal` pada resi tugas dan hasil kuis, serta menjaga keterbacaan logo `.brand-mark` di mode gelap (`--color-brand-mark`) dan fallback `prefers-color-scheme` pada pengalih tema header (`index.html`, `App.tsx`, `tokens.css`, `styles.css`).
- **Verifikasi:** `sloplint --kept` bersih (`0 FAIL`, `0 REFLEX`, `0 WARN`; 2/2 tautan, 30/30 field, 112/112 handler tetap terjaga), pengecekan kontras OKLCH terukur (`6.06:1` hingga `17.25:1`), nol simbol panah, `npm run typecheck`, `compile_applet`, dan `lint_applet`. (*Catatan:* pemeriksaan screenshot/render otomatis `puppeteer-core` tidak berjalan karena biner peramban tidak tersedia di kontainer.)

## 2026-11-20 — Perbaikan startup dev server & integrasi Vite middleware (`SINTAKS`)

- **Startup Dev Server Instan (`package.json`, `apps/api/package.json`):** Menghapus blokade build produksi berulang (`@lms/shared` dan `@lms/web`) sebelum startup di skrip `dev` serta mengganti `tsx watch` menjadi `tsx src/server.ts` agar proses server pengembangan langsung mendengarkan port `3000` tanpa latensi atau mati mendadak saat *pre-warming*.
- **Vite Middleware & Graceful Shutdown (`apps/api/src/app.ts`, `apps/api/src/server.ts`):** Memasang `vite.middlewares` (`hmr: false`) di mode pengembangan dengan *fallback* aman ke `apps/web/dist` pada mode produksi, menambahkan penanganan event `error` pada HTTP server, dan memanggil `server.closeAllConnections?.()` saat `SIGINT`/`SIGTERM` agar koneksi *keep-alive* langsung tertutup saat restart.

## 2026-11-17 — Ekspor CSV roster Admin & pengalih tema Terang/Gelap (`SINTAKS`)

- **Ekspor Cadangan Roster Mahasiswa (`GET /auth/admin/roster/export`):** Menambahkan pembentuk CSV `formatStudentRosterCsv` di `apps/api/src/roster.ts` (UTF-8 BOM, pemisah `;`, header `nim;nama;email;status`, pelarian karakter CSV aman) serta endpoint `GET /auth/admin/roster/export` khusus `ADMIN` di `apps/api/src/auth.ts` dengan pencatatan audit `ADMIN_ROSTER_EXPORTED`.
- **Tombol Unduh Roster Admin (`apps/web/src/App.tsx`, `apps/web/src/workspace.css`):** Menambahkan tombol `Unduh CSV roster` pada tab **Impor roster** di panel administrasi akun untuk mengunduh berkas `roster-mahasiswa-sintaks.csv` langsung melalui `downloadFile`.
- **Pengalih Tema Terang/Gelap di Header (`index.html`, `App.tsx`, `styles.css`, `classes.css`, `workspace.css`):** Menambahkan tombol `Mode Gelap` / `Mode Terang` pada `.topbar-right` yang menyinkronkan atribut `data-theme`, kelas `.dark`, `meta[name="theme-color"]`, dan preferensi `localStorage` (`sintaks-theme`), lengkap dengan token variabel CSS tema gelap di `apps/web/src/styles.css` (`:root[data-theme='dark'], :root.dark`).

## 2026-11-16 — Pemutakhiran README, dokumen status & laporan Sprint 3–4

- Memperbarui `README.md` agar mencerminkan status website **SINTAKS** terkini (Sprint 1–4 MVP selesai, Cloud SQL `asia-southeast1` + Drizzle ORM, Firebase Auth, port terpadu `3000`, fitur UI/UX & pencarian/pengurutan kelas, serta batas operasional yang masih berlaku).
- Memperbarui dokumen status terkait di `docs/`: `USE-CASE-STATUS-AND-ROADMAP.md` (pemetaan `UC-01`–`UC-18`), `DATABASE-SCHEMA.md` (seluruh tabel & enum Drizzle ORM), `IMPLEMENTATION-BASELINE.md`, `OPEN-DECISIONS.md` (`CR-04`, `CR-05`, `CR-07`), dan `SPRINT-3-CONTRACT-HANDOFF.md`.
- Menambahkan `docs/SPRINT-3-AND-4-PLAN-TO-IMPLEMENTATION.md` yang mendokumentasikan perencanaan hingga pelaksanaan Sprint 3, Sprint 4, serta penyempurnaan antarmuka SINTAKS.

## 2026-11-16 — Pencatatan ulang & pemutakhiran Changelog

- Memperbarui `docs/CHANGELOG.md` untuk mendokumentasikan seluruh perubahan sejak Sprint 2 hingga pembaruan antarmuka terbaru pada platform **SINTAKS**.

## 2026-11-15 — Pencarian & pengurutan daftar kelas (`SINTAKS`)

- Menambahkan kolom pencarian waktu-nyata (`Cari kelas`) pada panel pengelolaan kelas di `apps/web/src/App.tsx` untuk memfilter kelas berdasarkan nama atau deskripsi, disertai penghitung hasil (`Menampilkan X dari Y kelas`) dan tombol `Reset pencarian` saat tidak ada hasil yang cocok.
- Menambahkan menu dropdown pengurutan (`Urutkan`) dengan pilihan **Terbaru dibuat**, **Nama (A–Z)**, dan **Status (Terbuka dulu)**.
- Menambahkan tata letak responsif `.class-toolbar` di `apps/web/src/classes.css` untuk desktop hingga mobile (`<= 680px`).
- Verifikasi: `npm run typecheck`, `compile_applet`, serta pengecekan aset CSS/JS langsung pada port `3000` lulus.

## 2026-11-15 — Integrasi logo SINTAKS, animasi interaktif & pembersihan tombol

- Menjadikan logo resmi SINTAKS (`/assets/aistudio/Logo_Website_SINTAKS_fix_07745e85.png`) sebagai favicon/apple-touch-icon di `apps/web/index.html` serta ikon merek di bilah navigasi atas (`apps/web/src/App.tsx`) lengkap dengan fallback teks `S` jika gambar gagal dimuat.
- Menambahkan penyajian folder statis `public/` (`rootPublicDir`) di `apps/api/src/app.ts` agar aset logo tersedia di lingkungan dev dan produksi.
- Menambahkan animasi hover/tekan berbasis GPU (`transform`, `opacity`, `box-shadow`) pada kartu kelas, kartu dasbor, tombol utama/sekunder/teks, kontrol notifikasi, opsi kuis, dan tombol navigasi soal, serta transisi pergantian tampilan/tab `sintaksFadeSlide` (`160ms–220ms`) di `styles.css`, `classes.css`, dan `workspace.css` dengan dukungan `@media (prefers-reduced-motion: reduce)`.
- Menghapus seluruh simbol panah (`→`, `←`, `↓`, `↗`) dari label tombol dan tautan aksi di `App.tsx`, `DashboardAndProfile.tsx`, dan `QuizzesSection.tsx`.
- Verifikasi: `npm run typecheck`, `compile_applet`, pemeriksaan nol simbol panah pada bundel JS terkompilasi, serta respons `200 OK` untuk logo PNG di port `3000`.

## 2026-11-15 — Rebrand ke SINTAKS & redesain UI/UX akademik terang

- Mengganti nama aplikasi dari **LMS Kampus PTIK** menjadi **SINTAKS** (`Portal Pembelajaran`) pada judul HTML, metadata OpenGraph, header merek, layar autentikasi, workspace kelas, dan footer.
- Merombak `styles.css`, `classes.css`, dan `workspace.css` ke sistem desain editorial terang (`#FFFFFF`, `#FAFBF9`, `#EAF1EA`, `#F3F6F2`, aksen `#1F4D3A` dan `#3F7D58`, garis batas `#E3E8E1`), tipografi **Newsreader** + **Inter**, dan penyelarasan `tabular-nums` untuk tampilan `360px–1920px`.
- Memperbarui `App.tsx`, `DashboardAndProfile.tsx`, `QuizzesSection.tsx`, `CommunicationSection.tsx`, dan `GradesSection.tsx`: banner profil dengan avatar inisial dan laci edit profil/kata sandi, tombol pintas `Dasbor` di bilah atas, tab workspace bergaris bawah, tampilan terpisah pengumpulan dan penilaian dosen (`Pratinjau Jawaban` + navigasi antar mahasiswa), serta runner kuis bebas-gangguan.
- Memperluas endpoint `GET /api/dashboard/summary` di `apps/api/src/dashboard.ts` dan tipe `DashboardSummary` di `apps/web/src/lib/api.ts` untuk menyertakan `recentAnnouncements` dari kelas terbuka yang diikuti mahasiswa.
- Verifikasi: `npm run typecheck`, `compile_applet`, serta uji langsung `/`, `/health`, `/auth/login`, dan `/api/dashboard/summary` di port `3000`.

## 2026-11-14 — Sprint 4: Penilaian, kuis daring, komunikasi, notifikasi & dasbor

- **Skema Database (`src/db/schema.ts`):** Menambahkan kolom penilaian `NUMERIC(5,2)` pada `submissions` (`score`, `feedback`, `grade_status`, `graded_by`, `graded_at`), tabel kuis (`quizzes`, `questions`, `question_options`, `quiz_attempts`, `attempt_answers`), tabel komunikasi (`announcements`, `forum_topics`, `forum_replies`), dan tabel `notifications`.
- **Penilaian Tugas & Rekap (`apps/api/src/learning.ts`, `GradesSection.tsx`):** Menambahkan penilaian tugas `DRAFT`/`PUBLISHED` dengan pencatatan audit, publikasi massal nilai draf beserta pemicu notifikasi, matriks rekap nilai kelas untuk dosen (`GET .../grades/recap`), serta tab **Nilai & Umpan Balik** khusus nilai terpublikasi untuk mahasiswa (`GET .../my-grades`).
- **Kuis Daring (`apps/api/src/quizzes.ts`, `QuizzesSection.tsx`):** Menambahkan CRUD & publikasi kuis, pembuat soal Pilihan Ganda dan Esai, pemeriksaan batas percobaan & jendela waktu server tanpa membocorkan kunci `is_correct` ke mahasiswa, autosave jawaban idempoten (`PUT /api/quizzes/attempts/:attemptId/answers`), penilaian otomatis pilihan ganda, penilaian esai manual oleh dosen (`PROVISIONAL` → `FINAL`), serta timer hitung mundur waktu-nyata.
- **Komunikasi, Notifikasi & Dasbor (`communication.ts`, `notifications-service.ts`, `dashboard.ts`):** Menambahkan pengumuman kelas, topik & balasan forum (dengan jendela sunting 15 menit bagi penulis), lonceng notifikasi dalam aplikasi dengan navigasi langsung ke target kelas, ringkasan dasbor per peran (`ADMIN`, `DOSEN`, `MAHASISWA`), serta pembaruan profil dan kata sandi mandiri (`PATCH /api/users/me/profile`).

## 2026-11-13 — Sprint 3: Ruang kelas, topik, materi & pengumpulan tugas

- Menambahkan tabel `topics`, `materials` (`TEXT`, `LINK`, `FILE`), `assignments`, dan `submissions` di `src/db/schema.ts` beserta rute API di `apps/api/src/learning.ts`.
- Mendukung manajemen topik dan materi oleh dosen (termasuk unggahan berkas maks. 4 MB dan toggle draf/publikasi) serta manajemen tugas (instruksi, tenggat opsional, kebijakan keterlambatan `allowLate`, status `OPEN`/`CLOSED`, dan daftar status pengumpulan mahasiswa).
- Mendukung mahasiswa melihat/mengunduh materi serta mengirim/mengirim ulang tugas di dalam transaksi serializable dengan pelacakan versi (`Versi ke-N`) dan status `Tepat waktu` / `Terlambat`.

## 2026-11-13 — Cloud SQL (`asia-southeast1`), Drizzle ORM & Firebase Auth

- Mengaktifkan PostgreSQL Cloud SQL pada region `asia-southeast1` dan memigrasikan lapisan skema/query ke **Drizzle ORM** (`src/db/schema.ts`, `src/db/index.ts`, `src/db/drizzle.config.ts`) dengan tetap mempertahankan autentikasi Argon2id, sesi berbasis database, proteksi CSRF, dan otorisasi RBAC.
- Menambahkan dukungan masuk dengan Google melalui Firebase Authentication (`apps/api/src/auth.ts`, `apps/web/src/lib/firebase.ts`) bersama akun Bootstrap Admin untuk pengujian aplikasi.

## 2026-11-12 — Sprint 2 selesai/diterima

- Tim menerima implementasi Sprint 2 serta hasil UI yang diuji untuk saat ini; item S2-01–S2-06 dicatat selesai. Rincian hasil dan batas penerimaan ada di `SPRINT-2-ACCEPTANCE.md`.
- Upgrade migrasi yang diterima menggunakan baseline Sprint 1 hasil replay dengan fixture sintetis, bukan salinan database Sprint 1 berisi milik tim.
- Hasil UI diterima tim tanpa mengklaim ada retest independen atau pemeriksaan audio pembaca layar tambahan.
- Shared rate-limit store masih wajib sebelum deployment multi-instance; penerimaan Sprint 2 bukan klaim production-ready.

## 2026-11-01 — Sprint 1 auth slice (In Progress)

- Added Argon2id hashing, opaque DB-backed sessions, CSRF validation, login throttling, authentication and ADMIN middleware, student domain/roster checks, Admin provisioning/account controls, and an authentication UI.
- Added user password-change flag, sessions/audit schema and Prisma migration `20261101093445_auth_sessions_audit`.
- Added `csv-parse` based Admin roster import, `registration_eligible` plus one-time registration claim fields, and migration `20261101093446_student_roster_eligibility_claim`.
- Confirmed allowlist defaults to `unimed.ac.id,mhs.unimed.ac.id`; imported `layak` entries remain separate from PENDING user-account status.
- Added one-time Admin bootstrap command; an integration rehearsal created a temporary Admin, verified repeat refusal and no credential output, then removed the test user and audit row.
- Added API, schema, decision, planning, backlog, test-results and risk documentation.
- Rationale/source: Sprint 1 scope and owner baseline dated 2026-11-01, including the confirmed roster/domain decisions. Dependency changes: `argon2@0.45.1`, `express-rate-limit@8.7.2`, `csv-parse@7.0.3`; final audit reported zero vulnerabilities.
- Review fixes: auth mutation/audit/revocation paths now transact together; bootstrap and Admin last-account guards use serializable transactions; roster conflict is reported as 409 and partial-batch rollback is tested.
- Evidence: final typecheck/build/Prisma generation/deploy check pass; default test run 7 passed/6 skipped; full opt-in test run 13/13 passed, including official roster import, rollback, expiry, CSRF, both rate limits, one-time bootstrap and Dosen/Admin account lifecycle. Current npm audit reports 0 vulnerabilities across 339 dependencies. Test cleanup verified temporary and official-roster records were removed. Sprint remains In Progress pending Node 20, production deployment settings, keyboard/contrast and independent review.

## 2026-11-02 — Sprint 1 finalization checks (In Progress)

- Keyboard-only review passed across login, registration and Admin account controls; input labels, focus sequence and focus visibility were verified. WCAG 2.1 AA text and interactive-boundary contrast ratios were measured and recorded in T17; low-contrast input and secondary-button borders were corrected.
- Admin UI review found authenticated `GET /auth/admin/users` was incorrectly behind CSRF middleware, causing the account list to show a token error. CSRF now applies only to state-changing Admin routes; the GET path works without a CSRF token and has an integration assertion.
- Added deployment requirements for HTTPS/TLS termination, exact `WEB_ORIGIN`, trusted proxy allowlist, `COOKIE_SECURE=true`, one-time secret injection and shared rate-limit storage before multi-process deployment. No production environment was tested.
- Final verification after these changes: `npm run db:generate`, `npm run db:deploy` (no pending migration), typecheck, build, `npm audit` (0 vulnerabilities/339 packages), full opt-in suite 13/13, and default suite 7 passed/6 skipped. Database fixtures were cleaned.
- Sprint remains In Progress pending independent reviewer findings and sign-off. Node 20 verification passed after updating the incompatible Vitest test-runner dependency, with the Node baseline preserved.

## 2026-11-02 — Node 20 verification and reviewer handoff (In Progress)

- Provisioned Node 20.20.2/npm 11.20.0 temporarily; changed only the test-runner dev dependency from Vitest 5.0.5 (engine excludes Node 20) to Vitest 4.1.12 (Node 20 supported). Node baseline unchanged.
- Clean `npm ci` in an isolated copy completed with zero vulnerabilities; Prisma generate/deploy, typecheck, build and full DB + supplied official-roster test suite passed (13/13).
- Created `SPRINT-1-REVIEW-HANDOFF.md` and `SPRINT-1-REVIEW.patch` against baseline `4bd8740`. Independent reviewer feedback is still pending and is not claimed.
- Sprint DoD remains In Progress until reviewer findings/disposition are recorded. HTTPS/origin/proxy/Secure-cookie target checks and shared rate-limit storage before multi-process deployment remain deployment prerequisites.

## 2026-11-04 — F-01 remediation (verification blocked)

- Password hash update, revocation of all active sessions, and `AUTH_PASSWORD_CHANGED` audit insert now use one Prisma transaction. Argon2id hashing remains outside the transaction; a conditional old-hash update returns 409 for stale concurrent password-change requests.
- Added one success integration test and three PostgreSQL-trigger fault-injection cases covering failures at password update, session revocation and audit insertion. The tests assert rollback state, old-session validity on failure, and absence of credentials/hash in logs and audit.
- Prisma Client generation succeeded on Node 20.20.2/Prisma 6.19.3 by setting `PRISMA_QUERY_ENGINE_LIBRARY` to the engine bundled in `@prisma/engines`. Plain generation hits `EPERM` updating the existing cache engine timestamp; no cache or dependency was removed.
- Node 20 typecheck/build and dependency audit passed (0 vulnerabilities). PostgreSQL at `localhost:5432` was unavailable: `db:deploy` could not connect, targeted F-01 tests failed during fixture setup (4/4), and default suite was 6 passed, 10 skipped, 1 DB-readiness failure. No rollback proof is claimed; Sprint remains BLOCKED pending PostgreSQL verification and independent re-review.
# 2026-11-05 — Sprint 1 final verification follow-up

- PostgreSQL Docker container was healthy; Prisma confirmed three migrations applied and schema up to date (read-only check).
- F-01 password-change happy path and all three injected PostgreSQL rollback cases passed (4/4); full opt-in suite passed under Node 26.13.0 (15 passed, 2 skipped).
- Node 20.20.2 full suite remains blocked by Vitest worker processes exiting before test execution. Independent reviewer re-review is still pending; Sprint 1 remains blocked and unaccepted.

