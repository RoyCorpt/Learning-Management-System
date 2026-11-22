# Status Use Case dan Roadmap SINTAKS (LMS Kampus PTIK)

**Tanggal pembaruan:** 2026-11-22  
**Status dokumen:** Status terkini setelah selesainya **Sprint 1–4** dan pembaruan antarmuka **SINTAKS**.

Dokumen ini memetakan seluruh 18 use case (`UC-01`–`UC-18`) terhadap implementasi aktif di repositori saat ini beserta keputusan desain tim yang berlaku.

## Ringkasan status saat ini

- **Selesai:** 15 use case (`UC-02`, `UC-05`, `UC-06`, `UC-07`, `UC-08`, `UC-09`, `UC-10`, `UC-11`, `UC-12`, `UC-13`, `UC-14`, `UC-15`, `UC-16`, `UC-17`, `UC-18`).
- **Diselaraskan dengan keputusan tim (`CR-02`, `DEC-S2-01`) / Selesai sesuai kebijakan:** 2 use case (`UC-01`, `UC-04`).
- **Sebagian (tersisa `FR-05` backlog):** 1 use case (`UC-03` — ubah profil & ganti kata sandi saat login selesai; reset kata sandi publik tanpa login `FR-05` tetap di backlog).
- **Belum dimulai:** 0 use case.

## Pemetaan 18 use case

| ID | Use case / FR | Status | Implementasi & catatan saat ini |
|---|---|---|---|
| UC-01 | Mendaftar akun — FR-01, FR-02 | **Selesai (sesuai CR-02)** | Mahasiswa mendaftar dengan NIM + email kampus melalui klaim satu kali pada roster CSV (`PENDING` → aktivasi Admin). Sesuai `CR-02`, akun Dosen dibuat Admin (tidak mendaftar sendiri). |
| UC-02 | Login dan logout — FR-03 | **Selesai** | Login email/sandi (Argon2id), sesi database opaque + cookie `HttpOnly`, CSRF cookie, rate limit, dan logout terimplementasi sebagai satu-satunya alur autentikasi. |
| UC-03 | Mengelola profil dan memulihkan kata sandi — FR-04, FR-05 | **Sebagian (`FR-04` selesai; `FR-05` backlog)** | Pengguna aktif dapat mengedit nama tampilan dan mengganti kata sandi secara mandiri melalui `PATCH /api/users/me/profile` dan banner profil (`ProfileBanner`). Reset kata sandi publik (`FR-05`) ditunda karena memerlukan kanal email verifikasi. |
| UC-04 | Menyetujui/menonaktifkan akun dan mengelola kelas — FR-07, FR-12 | **Selesai (sesuai DEC-S2-01)** | Admin membuat akun Dosen, mengimpor roster CSV, serta mengelola status (`ACTIVE`/`INACTIVE`/`PENDING`) dan peran dengan proteksi Admin aktif terakhir. Sesuai `DEC-S2-01`, Dosen membuat dan memiliki kelasnya sendiri (bukan penugasan manual oleh Admin). |
| UC-05 | Mengelola kelas dan keanggotaan — FR-09, FR-11 | **Selesai** | Dosen dapat membuat, mengedit, menutup kelas (`OPEN`/`CLOSED`), menerbitkan/merotasi kode undangan 43 karakter sekali tampil, melihat anggota, serta mencari/mengurutkan daftar kelas. |
| UC-06 | Bergabung ke kelas dengan kode — FR-10 | **Selesai** | Mahasiswa `ACTIVE` bergabung ke kelas `OPEN` memakai kode undangan; kelas `CLOSED` menolak pendaftaran baru. |
| UC-07 | Mengelola topik dan materi — FR-14, FR-15, FR-16 | **Selesai (Sprint 3)** | Dosen mengelola topik (`topics`) serta materi (`TEXT`, `LINK`, `FILE` maks. 4 MB) lengkap dengan kontrol draf/publikasi. |
| UC-08 | Mengakses materi — FR-17 | **Selesai (Sprint 3)** | Mahasiswa kelas aktif membaca materi terpublikasi dan mengunduh lampiran terotorisasi; anggota kelas `CLOSED` tetap memiliki akses baca. |
| UC-09 | Membuat tugas dan melihat status pengumpulan — FR-18, FR-21 | **Selesai (Sprint 3)** | Dosen membuat tugas (instruksi, tenggat opsional, kebijakan `allowLate`), toggle status `OPEN`/`CLOSED`, dan melihat roster status pengumpulan mahasiswa. |
| UC-10 | Mengumpulkan tugas — FR-19, FR-20, FR-40 | **Selesai (Sprint 3)** | Mahasiswa mengirim dan mengirim ulang jawaban teks/berkas (maks. 4 MB) dalam transaksi serializable dengan versi (`Versi ke-N`) dan status `Tepat waktu`/`Terlambat`. |
| UC-11 | Membuat kuis — FR-22 | **Selesai (Sprint 4)** | Dosen membuat, mengedit, mempublikasikan, dan menutup kuis serta menyusun soal Pilihan Ganda (min. 2 opsi, tepat 1 benar) dan Esai. |
| UC-12 | Mengerjakan kuis — FR-23, FR-25, FR-26 | **Selesai (Sprint 4)** | Mahasiswa mengerjakan kuis terpublikasi sesuai jendela waktu & batas percobaan, dengan kunci `is_correct` tersembunyi, timer real-time, autosave idempoten, navigasi soal, dan auto-grading PG. |
| UC-13 | Menilai tugas/esai dan melihat rekap nilai — FR-24, FR-27, FR-29 | **Selesai (Sprint 4)** | Dosen menilai pengumpulan tugas (`DRAFT`/`PUBLISHED`, `NUMERIC(5,2)`), publikasi massal dengan notifikasi, menilai jawaban esai kuis (`PROVISIONAL` → `FINAL`), dan melihat matriks **Rekap Nilai**. |
| UC-14 | Melihat nilai dan komentar — FR-28 | **Selesai (Sprint 4)** | Mahasiswa melihat nilai tugas dan kuis yang berstatus terpublikasi beserta komentar umpan balik dosen melalui tab **Nilai & Umpan Balik** (nilai draf tidak pernah bocor). |
| UC-15 | Membuat pengumuman — FR-30 | **Selesai (Sprint 4)** | Dosen menerbitkan pengumuman kelas yang atomik mengirim notifikasi ke mahasiswa terdaftar serta tampil pada feed **Pengumuman Terbaru** di dasbor mahasiswa. |
| UC-16 | Berdiskusi di forum — FR-31 | **Selesai (Sprint 4)** | Anggota kelas aktif membuat topik dan balasan diskusi dengan jendela sunting 15 menit bagi penulis serta dukungan moderasi dosen. |
| UC-17 | Melihat dasbor — FR-33, FR-34, FR-35 | **Selesai (Sprint 4)** | `RoleSummaryDashboard` menampilkan metrik dan aksi spesifik untuk `MAHASISWA` (kelas aktif, tenggat mendatang, nilai terbaru, pengumuman terbaru), `DOSEN` (ringkasan rasio & nilai per kelas), dan `ADMIN` (jumlah pengguna, kelas terbuka, antrean aktivasi mahasiswa pending). |
| UC-18 | Menerima notifikasi dan melihat daftar tenggat — FR-38 | **Selesai (Sprint 4)** | Lonceng notifikasi (`NotificationBell`) dengan daftar belum dibaca, tandai dibaca per item/semua, deep-link ke tab target, serta daftar tenggat mendatang (`GET /api/students/upcoming-deadlines`). |

## Langkah lanjutan & backlog pasca-MVP

1. **Reset kata sandi publik (`FR-05`):** Rancang token reset sekali pakai + integrasi layanan email apabila kebutuhan lupa sandi di luar sesi login diprioritaskan.
2. **Kesiapan produksi multi-instance:** Ganti penyimpanan rate limit in-memory dengan *shared store* (seperti Redis), verifikasi kebijakan origin/HTTPS/cookie pada deployment produksi, serta uji aksesibilitas audio *screen reader*.

Rujukan lengkap pelaksanaan Sprint 3 dan Sprint 4 tersedia di [SPRINT-3-AND-4-PLAN-TO-IMPLEMENTATION.md](SPRINT-3-AND-4-PLAN-TO-IMPLEMENTATION.md).
