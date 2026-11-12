# Sprint 2 Plan — Kelas dan Keanggotaan

> **Kewenangan project owner / project-owner delegation:** Project owner has fully delegated management and decision-making for this project to the student team. The team may make internal scope, technical, review, and Sprint acceptance decisions; no additional project-owner permission or sign-off is a gate. Ini proyek pembelajaran mahasiswa; tim tidak dibayar sebagai pekerja untuk proyek ini. Review dan quality gates adalah praktik belajar dan menjaga mutu, bukan indikasi ketidakprofesionalan atau hubungan kerja.

**Versi:** 1.0 · **Tanggal rencana:** 2026-11-06 · **Status rencana:** Proposed (historis; jadwal dan kapasitas belum committed)<br>
**Periode usulan:** 2026-11-15–2026-11-28 (dua minggu kalender; jadwal belum committed)<br>
**Dependensi awal:** Rekam perubahan Sprint 1 dalam commit lokal sebelum perubahan kode Sprint 2 dimulai. Branch saat ini masih berisi perubahan Sprint 1 yang belum di-commit dan di-push.

> **Status implementasi per 2026-11-12: Selesai/Diterima.** Tim menerima implementasi dan bukti verifikasi sesuai [SPRINT-2-ACCEPTANCE.md](SPRINT-2-ACCEPTANCE.md), termasuk hasil uji UI untuk saat ini. Upgrade migrasi diuji pada baseline Sprint 1 hasil replay dengan fixture sintetis, bukan salinan database Sprint 1 berisi milik tim. Audio pembaca layar tidak diuji. Shared rate-limit store tetap prasyarat deployment multi-instance. Status rencana/periode di atas tetap historis dan tidak committed.

## Tujuan Sprint

Menyediakan alur akademik pertama yang aman: Dosen membuat dan mengelola kelasnya, lalu Mahasiswa aktif dapat bergabung dengan kode undangan. Otorisasi harus memastikan Dosen hanya mengelola kelas miliknya, sedangkan mahasiswa hanya dapat melihat keanggotaan sendiri.

Sprint ini tidak mencoba membangun seluruh LMS. Ruang lingkup berhenti pada kelas dan pendaftaran keanggotaan; materi, tugas, pengumpulan, penilaian, notifikasi, dan unggah berkas menjadi kandidat sprint berikutnya setelah desain dan kapasitasnya ditinjau.

## Evaluasi backlog dan kesiapan

| Area belum dikerjakan | Status / dependensi | Keputusan untuk Sprint 2 |
|---|---|---|
| Kelas dan keanggotaan | CR-03 diselesaikan untuk perencanaan Sprint 2 oleh DEC-S2-01. Belum ada model kelas atau membership pada schema Prisma. | Fokus terpilih; desain kode dan otorisasi dicatat di bawah sebelum implementasi. |
| Materi pembelajaran | Belum ada schema atau API. Penyimpanan file privat, batas unggah, dan perilaku penghapusan perlu dirancang. Dokumen berbeda antara batas 4 MB dan 10 MB. | Ditunda; selesaikan keputusan batas dan pilihan penyimpanan sebelum sprint implementasi materi/file. |
| Tugas, pengumpulan, dan penilaian (FR-40) | Belum ada model tugas/submission, aturan tenggat, revisi, format file, atau kebijakan penilaian. Bergantung pada model kelas/keanggotaan. | Ditunda setidaknya sampai alur kelas tersedia dan aturan akademik dicatat. |
| Notifikasi (FR-38) | Belum ada kanal, pemicu, preferensi, atau penyedia email yang ditetapkan; bergantung pada peristiwa akademik. | Ditunda; mulai dengan keputusan kanal dan daftar peristiwa setelah fitur akademik tersedia. |
| Reset kata sandi (FR-05) | Ditunda dari Sprint 1; membutuhkan kanal pemulihan yang aman, token sekali pakai, masa berlaku, dan mitigasi enumerasi akun. | Tidak masuk scope; desain email/pemulihan harus ditetapkan sebelum implementasi. |
| Deployment dan operasi produksi | HTTPS/origin/proxy, rate-limit store bersama, secret injection, backup/restore, object storage, dan observability belum diuji/ditetapkan. | Bukan fitur Sprint 2; tetap menjadi risiko rilis. Hindari mengklaim sistem production-ready. |
| Sumber kebutuhan dan kapasitas | Revisi kebutuhan A–F/master index dan daftar anggota/kapasitas Tahap E tidak ada dalam file inventory yang diperiksa. | Estimasi di bawah adalah ukuran awal dalam person-days; nama pemilik tugas dan komitmen tanggal belum dapat ditetapkan. |

### Keputusan desain internal yang dipakai

**DEC-S2-01 — Kelas dan pendaftaran dengan kode (2026-11-06):** Dosen membuat kelas dan menjadi pemiliknya; Mahasiswa berstatus ACTIVE dapat bergabung ke kelas OPEN menggunakan kode undangan. Penambahan anggota secara manual oleh Admin/Dosen tidak termasuk MVP Sprint 2. Satu Mahasiswa hanya memiliki satu membership per kelas. Dosen dapat menutup kelas; kelas tertutup menolak pendaftaran baru. Kode dibuat acak berentropi tinggi, hanya ditampilkan saat dibuat atau diputar ulang, disimpan sebagai hash, tidak dikembalikan pada daftar kelas, dan tidak boleh masuk log. Pemilik kelas dapat membuat kode baru untuk mencabut kode lama. Keputusan ini berlaku untuk ruang lingkup Sprint 2 dan dapat ditinjau kembali dengan bukti uji/pemakaian.

## Backlog Sprint 2 terpilih

Estimasi adalah person-days kerja, bukan durasi kalender. Perkiraan total **10 person-days**. Pemilik ditentukan dengan peran; nama anggota `TBD` karena daftar anggota/kapasitas belum tersedia. Pekerjaan boleh dikerjakan lintas peran oleh anggota yang sama.

| ID | Pekerjaan | Prioritas | Dependensi | Estimasi | Pemilik peran | Acceptance criteria |
|---|---|---:|---|---:|---|---|
| S2-01 | Kunci kontrak domain dan schema kelas | P0 | DEC-S2-01; tangkap baseline Sprint 1 ke commit lokal | 1.0 | Product/design + backend, nama TBD | ERD/Prisma memuat kelas dengan owner Dosen, status OPEN/CLOSED, kode undangan tersimpan sebagai hash unik, dan membership dengan unique `(classId,userId)`; migrasi tidak mengubah data auth/roster yang sudah ada. Definisi status, operasi tutup kelas, dan regenerasi kode terdokumentasi. |
| S2-02 | API create/list/update/close kelas untuk Dosen | P0 | S2-01 | 2.0 | Backend, nama TBD | Hanya Dosen ACTIVE dapat membuat kelas; setiap query dan mutasi mengikat `ownerId` ke sesi; Dosen lain, Mahasiswa, dan akun nonaktif ditolak; input divalidasi; operasi perubahan diaudit tanpa kode mentah; response tidak membocorkan hash/token. |
| S2-03 | Kode undangan dan API join Mahasiswa | P0 | S2-01, S2-02 | 2.0 | Backend/security, nama TBD | Hanya Mahasiswa ACTIVE dapat join kelas OPEN dengan kode valid; akun PENDING/INACTIVE dan role lain ditolak; kode salah, kelas tertutup, dan join duplikat memberi respons aman/konsisten; kode berentropi tinggi di-hash sebelum simpan; regenerate mencabut kode lama; percobaan dibatasi dan kode tidak tercatat dalam log/audit. |
| S2-04 | API daftar kelas dan anggota menurut hak akses | P1 | S2-02, S2-03 | 1.0 | Backend, nama TBD | Dosen hanya melihat kelas dan anggota kelas miliknya; Mahasiswa hanya melihat kelas yang diikutinya; tidak ada akses lintas kelas dengan menebak ID; daftar tidak mengandung kode undangan. |
| S2-05 | UI minimal pengelolaan kelas dan join | P1 | S2-02–S2-04; API contract | 2.0 | Frontend, nama TBD | Dosen dapat membuat, melihat, mengedit, menutup kelas dan menampilkan/merotasi kode secara aman. Mahasiswa dapat memasukkan kode dan melihat kelas yang diikuti. Loading, kosong, validasi, sukses, dan gagal ditampilkan jelas; form dapat dipakai keyboard/screen reader dan layout mendukung lebar 360px+. |
| S2-06 | Uji integrasi PostgreSQL, akses kontrol, migrasi, dan dokumentasi | P0 | S2-01–S2-05 | 2.0 | QA + backend/docs, nama TBD | Tes mencakup happy path, role/status, ownership, IDOR lintas kelas, duplicate join, kode salah/rotasi, kelas tutup, logging redaction, dan cleanup fixture. Migrasi diuji pada DB kosong dan upgrade; hasil aktual dan API/schema docs diperbarui. |

### Status implementasi dan penerimaan

Semua item S2-01–S2-06 selesai dan diterima tim per 2026-11-12 berdasarkan bukti di catatan penerimaan. Hasil tes yang dilewati tetap berstatus dilewati. Penerimaan upgrade migrasi memiliki batas fixture sintetis yang disepakati; tidak menyatakan database aktual tim telah diuji. Hasil UI diterima tim untuk saat ini; review UI independen tambahan bukan blocker penerimaan menurut keputusan terbaru.

## Tidak masuk Sprint 2

- Materi dan penyimpanan/unggah berkas; nilai 4 MB vs 10 MB harus direkonsiliasi dahulu.
- Pembuatan tugas, pengumpulan (FR-40), penilaian, re-grade, dan tenggat.
- Notifikasi (FR-38), email transaksional, reset kata sandi (FR-05), dan profil lanjutan.
- Import/sinkronisasi akademik lain di luar roster mahasiswa yang sudah ada.
- Deployment produksi, shared rate-limit store, backup/restore, object storage, dan observability.
- Perubahan besar pada autentikasi Sprint 1 kecuali bug yang menghalangi fitur atau keamanan.

## Risiko dan mitigasi

| Risiko | Dampak | Mitigasi / pemicu eskalasi |
|---|---|---|
| Implementasi Sprint 1 belum di-commit/push | Perubahan Sprint 2 tercampur dengan baseline besar dan sulit direview atau dipulihkan. | Buat commit lokal Sprint 1 dan verifikasi diff sebelum mulai mengedit kode Sprint 2. Push belum dapat dilakukan dari checkout ini karena remote tidak terkonfigurasi; simpan commit lokal dan jangan reset/checkout yang membuang perubahan. |
| Kapasitas anggota tidak diketahui | Estimasi 10 person-days mungkin melebihi kapasitas dua minggu. | Sebelum sprint dimulai, isi nama pemilik dan kapasitas tersedia; potong S2-04 atau UI menjadi read-only bila tidak muat. Jangan menandai rencana sebagai committed sebelum langkah ini. |
| Kode join dibocorkan atau ditebak | Keanggotaan kelas tanpa izin. | Kode acak berentropi tinggi, hash-at-rest, rotasi, rate limit, pesan error generik, redaksi log; uji brute-force/IDOR. |
| Keanggotaan dibuka untuk akun PENDING | Akses akademik sebelum Admin mengaktifkan akun. | Join hanya untuk Mahasiswa ACTIVE; test status PENDING dan INACTIVE. |
| Kebocoran kelas antar Dosen/Mahasiswa | Data dan daftar anggota lintas kelas dapat diakses. | Otorisasi server-side pada setiap query/mutasi dan tes akses negatif memakai dua kelas/dosen. |
| Jadwal akademik/ketentuan sprint tidak terkonfirmasi (CR-06) | Periode 15–28 Nov mungkin tidak cocok dengan kalender mata kuliah. | Periode bersifat usulan; sesuaikan bersama kalender tugas sebelum komitmen sprint. Scope/estimasi tidak bergantung pada tanggal tersebut. |
| Tes Node 20 atau launcher berbeda antar salinan kerja | Integrasi lokal gagal saat implementasi diuji di Windows. | Mulai dari clean dependency install Node 20 dan PostgreSQL yang diketahui; catat versi serta hasil dalam dokumen test Sprint 2. Launcher end-to-end Sprint 1 belum diverifikasi. |

## Definition of Done

Sprint 2 dinyatakan selesai bila seluruh kriteria berikut dibuktikan dan dicatat:

1. Semua item P0 selesai; item P1 yang belum selesai dipindahkan ke backlog dengan alasan dan dependensi.
2. Migrasi Prisma baru berhasil pada database kosong dan upgrade baseline Sprint 1 replay dengan fixture sintetis; record auth/roster sintetis yang diperiksa tetap utuh. Batas bahwa database aktual tim tidak diuji dicatat dan diterima tim.
3. Build, typecheck, dan suite terkait berjalan pada Node 20 di lingkungan proyek; tes integrasi berjalan dengan PostgreSQL. Tidak ada kegagalan yang tidak dijelaskan.
4. Tes membuktikan role/status gate, ownership dan isolasi kelas, perilaku join/duplicate/rotation/closed, serta tidak adanya kode mentah dalam log/respons yang tidak berhak.
5. UI utama dapat dinavigasi dengan keyboard, label/status dikenali accessibility tree, dan UI diuji pada viewport yang dicatat. Hasil uji UI diterima tim; pemeriksaan audio screen reader tidak diklaim.
6. API, schema/ERD, keputusan desain, backlog, risiko, serta hasil pengujian mencerminkan implementasi aktual.
7. Tidak ada secret, token join, atau data roster nyata dalam source, log, fixture, maupun artefak yang di-commit.
8. Implementasi/bukti diterima tim. Keputusan terbaru tim menerima hasil UI saat ini; tidak adanya retest UI independen terpisah bukan blocker. Tidak ada reviewer individual atau rincian review yang tidak tercatat yang diklaim; perubahan Sprint 2 dapat dipilah untuk ditinjau dari perubahan Sprint 1 sesuai usulan pengelompokan di catatan penerimaan.

Kriteria di atas dinyatakan terpenuhi/diterima tim per 2026-11-12 dengan batas verifikasi dan risiko operasional di catatan penerimaan. Status selesai tidak menyatakan production-ready.

## Kriteria mulai (Sprint entry)

- Commit lokal Sprint 1 tersedia sebagai titik pemulihan sebelum perubahan kode Sprint 2.
- Nama anggota, pemilik peran, dan kapasitas person-days diisi; scope dipangkas jika perkiraan melebihi kapasitas.
- Periode kalender disesuaikan dengan ketentuan akademik (CR-06).
- DEC-S2-01 dan ERD/API contract ditinjau tim sebelum migrasi dibuat.

Tidak ada persetujuan tambahan project owner sebagai gate. Keputusan dan review dilakukan tim di bawah delegasi yang sudah dicatat.
