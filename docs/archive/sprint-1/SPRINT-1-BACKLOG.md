# Sprint 1 Backlog

> **Kewenangan project owner / project-owner delegation:** Project owner has fully delegated management and decision-making for this project to the student team. The team may make internal scope, technical, review, and Sprint acceptance decisions; no additional project-owner permission or sign-off is a gate. Ini proyek pembelajaran mahasiswa; tim tidak dibayar sebagai pekerja untuk proyek ini. Review dan quality gates adalah praktik belajar dan menjaga mutu, bukan indikasi ketidakprofesionalan atau hubungan kerja.

**Version:** 1.5 · **Tanggal:** 2026-11-06 · **Status:** COMPLETE — Sprint 1 DoD met; launcher end-to-end remains an optional operator check  
**Decision Source:** Owner decision, 2026-11-01. Estimasi adalah person-days awal; kapasitas tim belum dapat dihitung karena pembagian Tahap E tidak ditemukan.

| ID | Item / acceptance criteria | Prioritas | Dependensi | Owner | Est. | Test | DoD | Status |
|---|---|---|---|---|---:|---|---|---|
| S1-01 | Verifikasi tree, Git, toolchain, DB, dan regresi Sprint 0; rekam bukti dan blocker | P0 | — | UNASSIGNED — CONFIRM FROM TAHAP E | 1.5 | T00–T07 | Hasil aktual dicatat; perubahan pengguna aman | Done |
| S1-02 | Threat review ringan: cookie/session, CSRF, brute force, status akun, secret; catat mitigasi | P0 | S1-01 | UNASSIGNED — CONFIRM FROM TAHAP E | 0.5 | T08–T18 | Alur dan ancaman terdokumentasi | Done |
| S1-03 | Model akun, session revocation, API contract dan konfigurasi auth | P0 | S1-02 | UNASSIGNED — CONFIRM FROM TAHAP E | 1.0 | T03–T05 | Schema/API docs dan migration direview | Done |
| S1-04 | Argon2id, bootstrap Admin terkendali, login generik dan rate limit | P0 | S1-03 | UNASSIGNED — CONFIRM FROM TAHAP E | 2.0 | T04–T09,T14 | Tidak ada secret/hash bocor; hash terverifikasi | Done — bootstrap rehearsal and both rate-limit buckets passed |
| S1-05 | Session cookie, CSRF, logout/revocation, auth middleware dan expiry | P0 | S1-03,S1-04 | UNASSIGNED — CONFIRM FROM TAHAP E | 2.0 | T10,T12,T16,T24 | Token lama ditolak dan cookie aman sesuai env | Done — F-01/F-02 PostgreSQL rollback evidence and independent re-review recorded |
| S1-06 | RBAC deny-by-default dan pemeriksaan akun aktif di setiap request | P0 | S1-05 | UNASSIGNED — CONFIRM FROM TAHAP E | 1.5 | T11,T12 | Matriks lintas role dan status teruji | Done — Mahasiswa/Dosen denials, spoofed role and inactive sessions passed |
| S1-07 | Admin mengelola akun/status/role dan membuat akun Dosen; audit perubahan | P1 | S1-06 | UNASSIGNED — CONFIRM FROM TAHAP E | 2.0 | T15,T21 | Duplikasi/role privilege dicegah; audit tanpa secret | Done — provisioning, password change, role/status changes and revocation tested |
| S1-08 | Impor roster CSV oleh Admin dan registrasi Mahasiswa satu kali dari entri layak | P1 | S1-03,S1-06 | UNASSIGNED — CONFIRM FROM TAHAP E | 2.5 | T13,T19–T21 | Domain configurable; `layak` ≠ akun aktif; validasi, audit, dan claim satu kali | Done — official file, reimport, claim reuse and partial rollback tested |
| S1-09 | Profil dasar dan alur autentikasi web (login/register/status/error/loading) | P1 | S1-04–S1-08 | UNASSIGNED — CONFIRM FROM TAHAP E | 2.0 | T17,T33–T35 | Responsive 360px+, Canopy, aksesibel | Done — keyboard path/labels/focus/contrast verified on login, registration and Admin account views |
| S1-10 | Uji fungsional/security lintas role, regresi dan perbaikan | P0 | S1-04–S1-09 | UNASSIGNED — CONFIRM FROM TAHAP E | 2.0 | T01–T35 | Semua test dieksekusi; kegagalan dicatat | Done — supplied Node 20.20.2 full suite 19/19, no skips; F-01/F-02 PostgreSQL rollback evidence recorded |
| S1-11 | Dokumentasi konfigurasi, schema, API, risiko, changelog, results | P1 | S1-03–S1-10 | UNASSIGNED — CONFIRM FROM TAHAP E | 1.0 | T36 | Dokumentasi cocok dengan implementasi aktual | Done — updated with final local verification evidence |
| S1-12 | Sprint review dan retrospective | P1 | S1-10,S1-11 | UNASSIGNED — CONFIRM FROM TAHAP E | 0.5 | T37 | Hasil aktual, keputusan dan carry-over dicatat | Done — internal engineering review/retro recorded; sponsor/team review remains external |

**Remaining sprint work:** None for Sprint 1 DoD. F-01 and F-02 PostgreSQL rollback evidence is recorded; the supplied Node 20.20.2 full suite passed 19/19, including the official roster test. Independent re-review by Yeremia Christopel Sihotang is PASS. The project owner delegated internal decisions and Sprint acceptance; no owner sign-off is a gate. The Windows launcher end-to-end check is an optional operator smoke check.

**Sprint DoD versus release:** Sprint 1 DoD is met. Target HTTPS/origin/proxy/Secure-cookie verification and a shared rate-limit store before multi-process deployment are release/deployment prerequisites; neither is claimed complete or production-tested.

**Total awal:** 18.5 person-days. Kapasitas tidak diketahui; rencana belum dapat disebut committed. Prioritas implementasi: authentication, authorization, account lifecycle, security tests, dokumentasi. FR-05 password reset tetap di backlog dan tidak dikerjakan sprint ini. FR-38 dan FR-40 tetap di luar scope.
