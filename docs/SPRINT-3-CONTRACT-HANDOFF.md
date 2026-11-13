# Handoff: Memulai Kontrak Desain Sprint 3

**Status:** bahan awal diskusi kontrak saja. Sprint 3 belum dipilih, belum committed, dan bukan *In Progress*. Dokumen ini tidak memilih scope atau kebijakan produk.

## Baseline yang dibawa

- Sprint 1 menyediakan akun, autentikasi/session, status/role, roster, dan alur Admin.
- Sprint 2 selesai/diterima tim per 2026-11-12 dengan batas verifikasi DB dan risiko operasional yang tercatat di [SPRINT-2-ACCEPTANCE.md](SPRINT-2-ACCEPTANCE.md). Hasil UI diterima tim untuk saat ini; pemeriksaan audio pembaca layar tidak diklaim.
- Jangan menganggap database Sprint 1 berisi milik tim telah diuji. Migrasi upgrade yang tersedia memakai baseline replay dan fixture sintetis.
- Rate limiter join in-memory hanya berlaku pada satu proses. Shared store perlu sebelum deployment multi-instance; sistem belum diklaim production-ready.

## Kandidat scope untuk dibahas

Kandidat berikut bukan prioritas atau komitmen. Tim dapat memilih satu irisan kecil, kombinasi, atau menundanya setelah memeriksa dependensi dan kapasitas.

| Kandidat | Dependensi / pertanyaan kontrak |
|---|---|
| Materi pembelajaran | Apakah materi berupa teks, tautan, berkas, atau kombinasi? Siapa yang boleh membuat/mengubah/menghapus? Apakah anggota kelas tertutup tetap dapat membaca? Perlu urutan, publikasi terjadwal, atau arsip? |
| Unggah/unduh berkas | Tentukan jenis berkas, batas ukuran total/per file, kuota, storage privat, akses unduh, masa simpan, penghapusan, pemindaian, dan perilaku kegagalan. Dokumen bertentangan antara 4 MB dan 10 MB: CR-07 mencatat keputusan 4 MB, sementara `SPRINT-0-FOUNDATION.md` menyebut 10 MB dan rencana Sprint 2 meminta rekonsiliasi. Tim perlu menetapkan sumber keputusan yang berlaku dan memperbarui dokumen terkait sebelum implementasi upload. |
| Tugas dan tenggat | Siapa dapat membuat/mengubah/mempublikasikan? Status tugas apa yang diperlukan? Zona waktu, batas waktu, penutupan, keterlambatan, perpanjangan, dan perubahan tugas setelah submission perlu keputusan akademik. |
| Pengumpulan (FR-40) | Jenis submission (teks/berkas), bukti penerimaan, timestamp, resubmission, versi, pembatalan, dan aturan submission terlambat belum ditetapkan. |
| Penilaian/feedback | Rubrik atau poin, skala nilai, draft vs dirilis, siapa dapat melihat feedback, revisi nilai, audit, dan proses koreksi/banding memerlukan kebijakan eksplisit. |
| Notifikasi (FR-38) | Kanal (dalam aplikasi/email/lainnya), pemicu, preferensi, frekuensi, opt-out, status kegagalan, dan penyedia belum dipilih. |
| Reset kata sandi (FR-05) | Masih ditunda. Putuskan kanal verifikasi, masa berlaku dan penggunaan sekali token, perlakuan sesi lama, mitigasi enumerasi akun, audit, dan dukungan operasional. Perubahan kata sandi saat login bukan reset akun. |

## Pertanyaan lintas-scope sebelum kontrak

1. Scope mana yang paling bernilai dan dapat diselesaikan oleh kapasitas tim? Aturan akademik/jadwal apa berlaku (CR-06 masih terbuka)?
2. Peran dan batas akses apa yang berlaku untuk Dosen, Mahasiswa ACTIVE/PENDING/INACTIVE, Admin, kelas OPEN/CLOSED, dan data setelah kelas ditutup?
3. Apa alur normal, perubahan, pembatalan, kesalahan, dan konflik untuk tiap kandidat?
4. Data pribadi/akademik apa yang disimpan, siapa boleh membaca, berapa lama disimpan, dan bagaimana koreksinya?
5. Adakah dependency eksternal (email, storage, malware scanning, deployment) dan batas biaya/ukuran/retensi yang harus disepakati?
6. Apa kontrak domain/schema/API, audit, error, concurrency, serta acceptance tests sebelum implementasi?
7. Siapa reviewer dan pemilik pekerjaan; bagaimana scope dipangkas bila kapasitas atau dependensi tidak tersedia?

## Agenda sesi kontrak

1. Tinjau kebutuhan sumber dan keputusan yang masih OPEN; rekonsiliasi CR-06 serta konflik upload sebelum menentukan scope terkait berkas.
2. Pilih kandidat scope secara eksplisit bersama tim, atau catat alasan penundaan.
3. Petakan aktor, alur, status, aturan akses, data, dan kebijakan akademik.
4. Tulis kontrak domain, ERD/schema, API, audit/error, batas eksternal, ancaman keamanan, dan perilaku aksesibilitas.
5. Tulis skenario penerimaan dan test fixtures sintetis; pisahkan hasil lokal, integrasi, dan deployment.
6. Estimasikan kapasitas/owner, dependency, DoD, reviewer independen, dan kalender sebelum status sprint diubah.

## Artefak yang diharapkan dari kontrak

- Keputusan scope bertanggal dengan pemilik keputusan dan alasan.
- Domain contract, ERD/schema, API spec, threat/access rules, backlog dan estimasi yang saling konsisten.
- Test contract mencakup izin, perubahan status, kegagalan dependensi, data sintetis, aksesibilitas UI, dan migrasi yang benar-benar dapat dijalankan.
- Risiko dan deployment prerequisite diperbarui tanpa klaim production-ready.

Jangan mulai coding Sprint 3 atau mengubah status sprint ke *In Progress* sebelum kontrak dan keputusan produk ditinjau tim.
