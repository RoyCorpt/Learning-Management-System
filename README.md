# SINTAKS (LMS Kampus PTIK)

> **Kewenangan project owner / project-owner delegation:** Project owner has fully delegated management and decision-making for this project to the student team. The team may make internal scope, technical, review, and Sprint acceptance decisions; no additional project-owner permission or sign-off is a gate. Ini proyek pembelajaran mahasiswa; tim tidak dibayar sebagai pekerja untuk proyek ini. Review dan quality gates adalah praktik belajar dan menjaga mutu, bukan indikasi ketidakprofesionalan atau hubungan kerja.

Portal pembelajaran kampus (**SINTAKS**, sebelumnya *LMS Kampus PTIK*) yang dibangun dengan arsitektur monorepo TypeScript. Implementasi saat ini mencakup seluruh ruang lingkup MVP **Sprint 1–4** beserta redesain antarmuka editorial terang **SINTAKS** dan berjalan pada database PostgreSQL (Cloud SQL `asia-southeast1`).

## Stack
- **Frontend:** React + TypeScript + Vite (`apps/web`), responsif `360px–1920px`, antarmuka Bahasa Indonesia, tipografi Schibsted Grotesk, Instrument Sans, dan DM Mono.
- **Backend:** Node.js + Express + TypeScript (`apps/api`), autentikasi email & kata sandi Argon2id + sesi opaque berbasis database + proteksi CSRF & RBAC (`ADMIN`, `DOSEN`, `MAHASISWA`).
- **Database & ORM:** PostgreSQL (Cloud SQL `asia-southeast1`) dengan **Drizzle ORM** (`src/db/`).
- **Validasi & Shared Types:** Zod + `packages/shared`.

## Requirements
- Node.js 20.12+ (direkomendasikan Node.js 22 LTS)
- PostgreSQL 15+ (lokal via Docker Compose dengan variabel `SQL_*` dari `.env.example`, atau eksternal / Cloud SQL melalui `DATABASE_URL` atau `SQL_*` beserta `DB_SSL`)

## Quick start
```bash
cp .env.example .env
npm ci
npm run db:push
npm run dev
```

Pada Windows (PowerShell):
- Mode lokal (menyalakan PostgreSQL via Docker Compose): `.\start-lms.ps1`
- Mode database eksternal / Cloud SQL (melewati Docker): `.\start-lms.ps1 -ExternalDb`

Konfigurasi koneksi PostgreSQL pada `.env` mendukung dua pola:
1. **Variabel terpisah (`SQL_*`):** `SQL_HOST`, `SQL_PORT`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD` (bawaan `.env.example` selaras dengan `docker-compose.yml`, dan diprioritaskan bila terisi lengkap).
2. **URI tunggal (`DATABASE_URL`):** Digunakan sebagai fallback saat variabel `SQL_*` tidak disetel lengkap. Atur `DB_SSL=true` (atau `DB_SSL=no-verify` bila sertifikat self-signed) serta parameter `?sslmode=...` saat terhubung ke database eksternal/Cloud SQL yang mewajibkan TLS.

Build produksi & start server terpadu (menyajikan API dan bundel web `apps/web/dist` pada port `3000`):
```bash
npm run build
npm start
```

Untuk menyiapkan akun Admin awal melalui CLI (hanya berjalan jika belum ada Admin di database), atur `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, dan `BOOTSTRAP_ADMIN_PASSWORD`, lalu jalankan:
```bash
npm run db:bootstrap-admin -w @lms/api
```

- **Aplikasi & API (dev/prod terpadu):** `http://localhost:3000` (atau port dari `PORT` / `API_PORT`)
- **API liveness:** `GET /health`
- **API readiness (cek koneksi PostgreSQL):** `GET /ready`

## Workspace
- `apps/web` — aplikasi web React + TypeScript + Vite (**SINTAKS**)
- `apps/api` — layanan API Express + TypeScript
- `src/db` — skema Drizzle ORM aktif (`schema.ts`), koneksi database (`index.ts`, `config.ts`), konfigurasi Drizzle (`drizzle.config.ts`), dan definisi retensi objek historis warisan (`legacy-fcm-schema.ts` khusus `db:push`)
- `drizzle` — berkas migrasi Drizzle SQL (`0000_smiling_doorman.sql`)
- `packages/shared` — tipe bersama antar workspace
- `public` — aset statis termasuk logo resmi SINTAKS (`/assets/Logo_Website_SINTAKS_fix_07745e85.png`) dan latar kampus halaman masuk (`/assets/hero-section-background_11499e54.jpg`)
- `docs` — dokumentasi baseline, skema, roadmap use case, changelog, dan laporan Sprint 0–4

## Status website saat ini

**Per 2026-11-24:** Seluruh alur MVP **Sprint 1 hingga Sprint 4** serta penguatan kesiapan produksi dan keamanan **SINTAKS** telah diimplementasikan (autentikasi email & kata sandi Argon2id sebagai satu-satunya metode masuk serta notifikasi dalam aplikasi berbasis PostgreSQL; tanpa Google Sign-In/Firebase dan tanpa push browser FCM/VAPID):
- **Sprint 1 (Identitas & Tata Kelola Akun):** Login/logout email & kata sandi (Argon2id), sesi opaque + cookie `HttpOnly` (`COOKIE_SAME_SITE` default `lax`, wajib `COOKIE_SECURE=true` + `https://` saat produksi) dengan token CSRF, registrasi mahasiswa berbasis klaim satu kali terhadap roster CSV yang diimpor Admin (`PENDING` → `ACTIVE`), pembuatan akun Dosen dengan kata sandi sementara, **Lupa Kata Sandi** (`FR-05`) berbasis token CSPRNG terhash SHA-256 sekali pakai di PostgreSQL, tautan URL fragment (`/#resetToken=...`), verifikasi via `POST /auth/reset-password/verify`, rate limiting atomik PostgreSQL (`rate_limit_buckets`: limit per IP + per pengenal akun lintas IP), dan pengiriman email via REST API Brevo (`apps/api/src/services/email.ts`), perubahan kata sandi wajib/mandiri, serta manajemen akun Admin berpaginasi server (`GET /auth/admin/users` dengan pencarian `ILIKE` aman, filter peran & status, dan perlindungan Admin aktif terakhir).
- **Sprint 2 (Kelas & Keanggotaan):** Dosen membuat, mengubah, menutup kelas (`OPEN`/`CLOSED`), menerbitkan/merotasi kode undangan 43 karakter sekali tampil, dan melihat daftar anggota; mahasiswa `ACTIVE` bergabung ke kelas `OPEN` menggunakan kode undangan; dilengkapi pencarian (`Cari kelas`) dan pengurutan (`Terbaru dibuat`, `Nama (A–Z)`, `Status`).
- **Sprint 3 (Topik, Materi, Tugas & Pengumpulan):** Manajemen topik dan materi (`TEXT`, `LINK`, `FILE` maks. 4 MB), publikasi materi draf/terbit, pembuatan tugas dengan tenggat opsional dan kebijakan keterlambatan (`allowLate`), serta pengumpulan/pengiriman ulang tugas oleh mahasiswa di dalam transaksi serializable dengan pelacakan `Versi ke-N` dan status `Tepat waktu` / `Terlambat`.
- **Sprint 4 (Penilaian, Kuis, Komunikasi, Notifikasi & Dasbor):**
  - Penilaian tugas oleh dosen (`DRAFT` vs `PUBLISHED`) dengan `NUMERIC(5,2)`, publikasi massal nilai draf, rekap nilai kelas (`Rekap Nilai`), serta tampilan nilai terpublikasi mahasiswa (`Nilai & Umpan Balik`).
  - Kuis daring dengan builder soal Pilihan Ganda & Esai, aturan jendela waktu/batas percobaan di server, kunci jawaban tersembunyi dari mahasiswa, autosave jawaban idempoten, hitung mundur waktu-nyata, auto-grading PG, dan penilaian esai manual (`PROVISIONAL` → `FINAL`).
  - Pengumuman kelas oleh dosen, Forum Diskusi dengan jendela sunting 15 menit, notifikasi dalam aplikasi berbasis PostgreSQL (lonceng notifikasi, penghitung belum dibaca, tanda baca, riwayat), dasbor ringkasan per peran (`ADMIN`, `DOSEN`, `MAHASISWA`), serta edit profil dan kata sandi mandiri.
- **Keamanan & Infrastruktur API:** Allowlist CORS ketat berbasis `WEB_ORIGIN` + `CORS_ALLOWED_ORIGINS` (menolak origin tak dikenal dengan `403 CORS_ORIGIN_DENIED`), validasi `TRUST_PROXY` ketat (default `loopback`, menolak `'true'`), validasi fail-closed `NODE_ENV=production` pada startup, header `Cache-Control: no-store` & `Referrer-Policy: no-referrer`, serta `package-lock.json` sinkron untuk `npm ci`.
- **UI/UX SINTAKS:** Rebrand penuh ke **SINTAKS**, logo resmi sebagai favicon & ikon navigasi, desain editorial terang (`#FFFFFF` / `#FAFBF9` / `#1F4D3A`), animasi hover/transisi ringan ramah `prefers-reduced-motion`, dan tombol bebas ikon panah.

## Dokumentasi terkait
- [`docs/CHANGE-REQUESTS.md`](docs/CHANGE-REQUESTS.md) — daftar terpadu Change Request (`CR-01`–`CR-10`), pemetaan `OD-01`–`OD-10`, dan spesifikasi GitHub Issue `CR-09` & `CR-10`
- [`docs/OPEN-DECISIONS.md`](docs/OPEN-DECISIONS.md) — register Open Decisions (`OD-01`–`OD-10`)
- [`docs/SPRINT-3-AND-4-PLAN-TO-IMPLEMENTATION.md`](docs/SPRINT-3-AND-4-PLAN-TO-IMPLEMENTATION.md) — dokumentasi lengkap Sprint 3 dan Sprint 4 dari perencanaan hingga pelaksanaan
- [`docs/USE-CASE-STATUS-AND-ROADMAP.md`](docs/USE-CASE-STATUS-AND-ROADMAP.md) — pemetaan status 18 use case (`UC-01`–`UC-18`)
- [`docs/DATABASE-SCHEMA.md`](docs/DATABASE-SCHEMA.md) — ringkasan tabel dan enum PostgreSQL (Drizzle ORM)
- [`docs/IMPLEMENTATION-BASELINE.md`](docs/IMPLEMENTATION-BASELINE.md) — baseline arsitektur & asumsi kerja terkini
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — catatan riwayat perubahan proyek

## Catatan & batas operasional tersisa
- **Layanan email Brevo (`Lupa Kata Sandi`):** Pengiriman email transaksional memakai REST API Brevo (`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, opsional `BREVO_SENDER_NAME`). Jika salah satu diisi, keduanya wajib diisi berpasangan (pada Cloud Run produksi yang belum dikonfigurasi lengkap, pasangan parsial dibersihkan aman dengan peringatan startup). Dalam mode `development`, pratinjau konsol hanya aktif bila `PASSWORD_RESET_DEV_PREVIEW=true` dan kredensial Brevo kosong; jika `PASSWORD_RESET_DEV_PREVIEW=true` di produksi startup akan ditolak, dan jika Brevo belum dikonfigurasi atau gagal mengirim, token reset dibatalkan di DB dan API mengembalikan `503 EMAIL_DELIVERY_FAILED`.
- **Rate limiter:** Alur **Lupa Kata Sandi** (`forgot-password`, `reset-password/verify`, `reset-password`) sudah memakai penyimpanan PostgreSQL atomik lintas proses (`rate_limit_buckets`, limit IP + limit pengenal akun ter-HMAC lintas IP). Endpoint login, registrasi, dan gabung kelas masih memakai pembatas in-memory satu proses dan memerlukan store bersama bila dijalankan multi-instance.
- **Aksesibilitas pembaca layar:** Navigasi keyboard dan kontras antarmuka telah diperhatikan, namun pengujian audio *screen reader* secara penuh belum dilakukan.
- **Pengaturan produksi:** Verifikasi `WEB_ORIGIN` (`https://`), `TRUST_PROXY`, `COOKIE_SECURE=true`, `RATE_LIMIT_SECRET`, kredensial Brevo (`BREVO_API_KEY`, `BREVO_SENDER_EMAIL`), serta migrasi/backup Cloud SQL tetap wajib sebelum rilis produksi penuh.
