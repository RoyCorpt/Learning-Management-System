# Sprint 1 Plan

> **Kewenangan project owner / project-owner delegation:** Project owner has fully delegated management and decision-making for this project to the student team. The team may make internal scope, technical, review, and Sprint acceptance decisions; no additional project-owner permission or sign-off is a gate. Ini proyek pembelajaran mahasiswa; tim tidak dibayar sebagai pekerja untuk proyek ini. Review dan quality gates adalah praktik belajar dan menjaga mutu, bukan indikasi ketidakprofesionalan atau hubungan kerja.

**Version:** 1.0 · **Tanggal aktual penyusunan:** 2026-11-01  
**Periode rencana:** 1–14 November 2026 · **Status:** Completed  
**Decision Source:** Owner decision, 2026-11-01

## Tujuan dan kapasitas

Bangun fondasi autentikasi dan pengelolaan akun LMS yang aman, dengan peran ADMIN, DOSEN, dan MAHASISWA, provisioning akun, otorisasi server-side, serta pemeriksaan status akun.

Pembagian peran Tahap E dan kapasitas tim belum ditemukan dalam repository. Karena itu owner setiap item ditandai `UNASSIGNED — CONFIRM FROM TAHAP E`; estimasi di bawah adalah ukuran kerja awal, bukan komitmen kapasitas tim. Sprint review dan retrospective belum dilakukan dan tidak dicatat sebagai selesai.

## Rencana fase

| Periode rencana | Fokus | Hasil yang diharapkan |
|---|---|---|
| 1–2 Nov | Verifikasi repository, regresi Sprint 0, threat review, desain akun/API | Baseline dan blocker terdokumentasi |
| 3–5 Nov | Hash, bootstrap Admin, login, session, logout, middleware | Irisan autentikasi dapat diuji |
| 6–8 Nov | RBAC, status akun, rate limit, akun Admin/Dosen | Siklus akun dan akses server-side |
| 9–10 Nov | Registrasi Mahasiswa, domain, roster, profil, audit | Registrasi tervalidasi roster |
| 11–12 Nov | Integrasi frontend dan uji lintas peran/keamanan | Alur UI dan regression teruji |
| 13–14 Nov | Perbaikan, dokumentasi, review, retrospective | Bukti penutupan atau item carry-over |

Tanggal adalah rencana. Pekerjaan aktual dicatat pada tanggal saat dilakukan.

## Definition of Done

Item dinyatakan Done hanya setelah acceptance criteria terpenuhi, implementasi berada pada branch kerja yang dapat direview, pengujian terkait benar-benar dieksekusi, dokumentasi diperbarui, dan tidak ada secret atau data roster nyata dalam artefak. Sprint hanya dapat dinyatakan selesai jika build, typecheck, test, generate Prisma, migrasi, autentikasi, otorisasi, revocation, rate limiting, registrasi roster, audit aman, API docs, review, dan retrospective memiliki bukti aktual. Item yang belum terverifikasi tetap In Progress atau Blocked.
