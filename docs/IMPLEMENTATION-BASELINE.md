# SINTAKS (LMS Kampus PTIK) — Implementation Baseline

> **Kewenangan project owner / project-owner delegation:** Project owner has fully delegated management and decision-making for this project to the student team. The team may make internal scope, technical, review, and Sprint acceptance decisions; no additional project-owner permission or sign-off is a gate. Ini proyek pembelajaran mahasiswa; tim tidak dibayar sebagai pekerja untuk proyek ini. Review dan quality gates adalah praktik belajar dan menjaga mutu, bukan indikasi ketidakprofesionalan atau hubungan kerja.

## Status
**Versi 0.2.0 — Pembaruan baseline per 2026-11-22.**  
Seluruh ruang lingkup MVP **Sprint 1 hingga Sprint 4**, pemulihan kata sandi (**Lupa Kata Sandi** `FR-05`), serta pembaruan antarmuka **SINTAKS** telah diimplementasikan pada database Cloud SQL PostgreSQL (`asia-southeast1`). Catatan kesiapan produksi (SMTP produksi, rate-limiter terdistribusi, dan uji *screen reader* audio) tetap tercantum sebagai tindak lanjut operasional.

## Architecture
- `apps/web`: Frontend React + TypeScript + Vite (**SINTAKS**, tema editorial Dose terang & gelap, responsif `360px–1920px`).
- `apps/api`: Backend Node.js + Express + TypeScript (menyajikan rute `/auth/*`, `/api/*`, `public/`, dan bundel `apps/web/dist` pada port `3000`).
- `src/db`: Skema PostgreSQL **Drizzle ORM** (`schema.ts`, `index.ts`, `drizzle.config.ts`) dengan migrasi/sinkronisasi menuju Cloud SQL (`asia-southeast1`).
- `packages/shared`: Tipe peran dan API bersama.
- `public`: Aset statis termasuk logo SINTAKS (`/assets/Logo_Website_SINTAKS_fix_07745e85.png`) dan latar kampus halaman masuk (`/assets/hero-section-background_11499e54.jpg`).

## Working assumptions & implemented baselines
- **Peran:** `ADMIN`, `DOSEN`, `MAHASISWA` dengan otorisasi *deny-by-default* berbasis sesi server-side dan kepemilikan/keanggotaan kelas.
- **Autentikasi:** Login email/kata sandi (Argon2id) sebagai satu-satunya mekanisme masuk, sesi opaque + cookie `HttpOnly` (`COOKIE_SAME_SITE` default `lax`, wajib `COOKIE_SECURE=true` di produksi) dengan CSRF cookie, registrasi mahasiswa berbasis klaim satu kali pada roster CSV yang diimpor Admin (`PENDING` → `ACTIVE`), pembuatan akun Dosen oleh Admin dengan kata sandi sementara, pemulihan **Lupa Kata Sandi** (`FR-05`) berbasis token CSPRNG terhash SHA-256 di PostgreSQL + tautan `#resetToken=` + `POST /auth/reset-password/verify` + SMTP (`nodemailer`, tanpa Firebase) dengan rate limiting atomik PostgreSQL (`rate_limit_buckets`: batas IP + pengenal akun lintas IP), serta manajemen **Akun aktif** Admin berpaginasi server (`page`, `limit`, `search`, `role`, `status`).
- **Pengelolaan Kelas & Pembelajaran:** Kelas `OPEN`/`CLOSED` milik Dosen dengan kode undangan 43 karakter sekali tampil, pencarian & pengurutan kelas, topik & materi (`TEXT`, `LINK`, `FILE` batas **4 MB** per berkas), tugas dengan pengumpulan transaksional `Serializable` berversi (`Versi ke-N`), penilaian tugas `DRAFT`/`PUBLISHED` (`NUMERIC(5,2)`) & rekap nilai, kuis daring berwaktu dengan autosave & penilaian esai manual, pengumuman kelas, forum diskusi (jendela sunting 15 menit), notifikasi dalam aplikasi, dasbor ringkasan per peran, dan edit profil/kata sandi saat login.
- **Keamanan & Konfigurasi Produksi:** Allowlist CORS ketat via `WEB_ORIGIN` + `CORS_ALLOWED_ORIGINS` (penolakan `403 CORS_ORIGIN_DENIED` untuk origin lintas situs tak tepercaya), `TRUST_PROXY` tervalidasi (default `loopback`, menolak `'true'`), validasi fail-closed `NODE_ENV=production`, `Referrer-Policy: no-referrer`, dan `Cache-Control: no-store`.
- **Domain Allowlist Mahasiswa:** Configurable via `STUDENT_EMAIL_DOMAINS` (default `unimed.ac.id,mhs.unimed.ac.id`).
- **Pengiriman Email Reset:** Dikonfigurasi via `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `PASSWORD_RESET_DEV_PREVIEW`, serta `PASSWORD_RESET_TTL_MINUTES` (default `30` menit).

## Important operational & production follow-up items
1. Ganti limiter in-memory yang tersisa pada rute login/registrasi/gabung kelas dengan *shared store* (seperti PostgreSQL `rate_limit_buckets` atau Redis) sebelum menjalankan banyak instance API secara paralel (rute reset kata sandi sudah berbasis PostgreSQL).
2. Verifikasi konfigurasi TLS/HTTPS proxy, `WEB_ORIGIN` (`https://`), `TRUST_PROXY`, `COOKIE_SECURE=true`, `RATE_LIMIT_SECRET`, kredensial SMTP, dan jadwal backup/restore sebelum deployment produksi penuh.
3. Lakukan pengujian audio *screen reader* penuh untuk validasi aksesibilitas lanjutan.

## Local setup
1. Pasang Node.js 20.12+ dan siapkan `DATABASE_URL` atau variabel `SQL_*` PostgreSQL 15+ (atau Cloud SQL) pada `.env`.
2. Jalankan `npm ci` (menggunakan `package-lock.json` root tersinkronisasi).
3. Sinkronkan skema dengan `npm run db:push` (dan jalankan `npm run db:bootstrap-admin -w @lms/api` satu kali bila Admin awal belum tersedia).
4. Jalankan `npm run dev` (atau `npm run build && npm start`), lalu buka `http://localhost:3000`.
