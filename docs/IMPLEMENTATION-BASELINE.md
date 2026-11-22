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
- **Autentikasi:** Login email/kata sandi (Argon2id) sebagai satu-satunya mekanisme masuk, sesi opaque + cookie `HttpOnly` dengan CSRF cookie, rate limit, registrasi mahasiswa berbasis klaim satu kali pada roster CSV yang diimpor Admin (`PENDING` → `ACTIVE`), pembuatan akun Dosen oleh Admin dengan kata sandi sementara, pemulihan **Lupa Kata Sandi** (`FR-05`) berbasis token CSPRNG terhash SHA-256 di PostgreSQL + SMTP (`nodemailer`, tanpa Firebase), serta pencarian dan filter peran pada menu **Akun aktif** Admin.
- **Pengelolaan Kelas & Pembelajaran:** Kelas `OPEN`/`CLOSED` milik Dosen dengan kode undangan 43 karakter sekali tampil, pencarian & pengurutan kelas, topik & materi (`TEXT`, `LINK`, `FILE` batas **4 MB** per berkas), tugas dengan pengumpulan transaksional `Serializable` berversi (`Versi ke-N`), penilaian tugas `DRAFT`/`PUBLISHED` (`NUMERIC(5,2)`) & rekap nilai, kuis daring berwaktu dengan autosave & penilaian esai manual, pengumuman kelas, forum diskusi (jendela sunting 15 menit), notifikasi dalam aplikasi, dasbor ringkasan per peran, dan edit profil/kata sandi saat login.
- **Domain Allowlist Mahasiswa:** Configurable via `STUDENT_EMAIL_DOMAINS` (default `unimed.ac.id,mhs.unimed.ac.id`).
- **Pengiriman Email Reset:** Dikonfigurasi via `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, dan `PASSWORD_RESET_TTL_MINUTES` (default `30` menit).

## Important operational & production follow-up items
1. Ganti store rate limiter in-memory dengan *shared store* (seperti Redis) sebelum menjalankan banyak instance API secara paralel.
2. Verifikasi konfigurasi TLS/HTTPS proxy, `WEB_ORIGIN`, `COOKIE_SECURE=true`, dan jadwal backup/restore sebelum deployment produksi penuh.
3. Lakukan pengujian audio *screen reader* penuh untuk validasi aksesibilitas lanjutan.

## Local setup
1. Pasang Node.js 20+ dan siapkan `DATABASE_URL` PostgreSQL 15+ (atau Cloud SQL) pada `.env`.
2. Jalankan `npm install`.
3. Sinkronkan skema dengan `npm run db:push` (dan jalankan `npm run db:bootstrap-admin -w @lms/api` satu kali bila Admin awal belum tersedia).
4. Jalankan `npm run dev` (atau `npm run build && npm start`), lalu buka `http://localhost:3000`.
