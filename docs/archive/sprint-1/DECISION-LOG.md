# Decision Log Sprint 1

> **Kewenangan project owner / project-owner delegation:** Project owner has fully delegated management and decision-making for this project to the student team. The team may make internal scope, technical, review, and Sprint acceptance decisions; no additional project-owner permission or sign-off is a gate. Ini proyek pembelajaran mahasiswa; tim tidak dibayar sebagai pekerja untuk proyek ini. Review dan quality gates adalah praktik belajar dan menjaga mutu, bukan indikasi ketidakprofesionalan atau hubungan kerja.

**Version:** 1.1 · **Tanggal:** 2026-11-06 · **Status:** Sprint 1 COMPLETE

| ID | Keputusan | Sumber | Alasan dan dampak | Status |
|---|---|---|---|---|
| DEC-S1-01 | Password hashing Argon2id | Owner decision, 2026-11-01 | Implementasi memakai library `argon2`, Argon2id memory 19,456 KiB, time 2, parallelism 1; hash length/salt mengikuti default library. | PASS — supplied Node 20.20.2 suite passed 19/19 including Argon2-dependent API flows; launcher not run end-to-end |
| DEC-S1-02 | Admin membuat akun Dosen | Owner decision, 2026-11-01 | Bootstrap password acak sekali tampil, diwajibkan ganti saat login pertama. | Implemented |
| DEC-S1-03 | Password reset FR-05 ditunda | Owner decision, 2026-11-01 | Tetap di backlog; ubah kata sandi saat login bukan reset. | Deferred |
| DEC-S1-04 | Registrasi Mahasiswa memakai allowlist configurable `unimed.ac.id` dan `mhs.unimed.ac.id` | Owner decision, 2026-11-01 | Email dinormalisasi lowercase; domain tidak menggantikan validasi roster. | Implemented |
| DEC-S1-05 | Roster dikelola Admin melalui impor CSV | Owner decision, 2026-11-01 | File resmi `roster_resmi.csv` diuji melalui alur impor dan registrasi. | PASS — supplied Node 20.20.2 suite includes official roster test (19/19 overall) |
| DEC-S1-06 | Akun Mahasiswa baru berstatus PENDING sampai aktivasi Admin | Technical decision Sprint 1, 2026-11-01 | Artefak sumber tidak menentukan status awal; mencegah akses sebelum aktivasi. Admin dapat mengubah status. | Implemented |
| DEC-S1-07 | Session opaque acak disimpan sebagai hash di PostgreSQL; cookie HttpOnly + CSRF cookie | Technical decision Sprint 1, 2026-11-01 | Menghindari JWT/localStorage; revocation per sesi, cookie SameSite Strict, secure wajib di production. | Implemented; needs deployed-origin/CSRF verification |
| DEC-S1-08 | Batas rate limit 10/IP+identifier dan 50/IP per 15 menit | Technical decision Sprint 1, 2026-11-01 | Menahan brute force tanpa permanent account lockout. Store masih in-memory satu proses. | Implemented; distributed deployment follow-up |
| DEC-S1-09 | Batasi percobaan registrasi menjadi 20 per IP per jam | Technical decision Sprint 1, 2026-11-01 | Membatasi biaya hash/abuse pada alur publik; bucket masih in-memory per proses. | Implemented |
| DEC-S1-10 | Status roster `layak` berarti memenuhi syarat registrasi, bukan akun aktif | Owner decision, 2026-11-01 | Disimpan pada `registration_eligible`; registrasi mengklaim baris satu kali lewat `registered_at`/`registered_user_id`; `users.status` tetap PENDING sampai Admin mengaktifkan. Status CSV tak dikenal ditolak. | Implemented and integration-tested |

Dokumen rekonsiliasi yang sudah ada (`Rekonsiliasi_Keputusan_Desain_Sprint_1_v1.0_20261101.docx`) menandai tiga keputusan awal sebagai usulan. Prompt eksekusi pemilik proyek yang lebih baru dan eksplisit menetapkan keputusan DEC-S1-01–19 sebagai baseline internal; perubahan ini mengikuti prioritas sumber yang ditentukan pemilik proyek. Dokumen rekonsiliasi dipertahankan tanpa perubahan. Tidak ada klaim persetujuan formal sponsor/dosen. Pemilik proyek menyatakan delegasi penuh untuk keputusan internal dan sponsor/dosen ingin meninjau hasil akhir.
