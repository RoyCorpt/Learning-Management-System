# Status Use Case dan Usulan Planning LMS PTIK

**Tanggal:** 2026-11-13  
**Status dokumen:** Usulan untuk dibahas tim; bukan jadwal atau komitmen Sprint 3.

Dokumen ini memetakan tabel 18 use case yang diberikan pengguna ke implementasi starter dan keputusan tim yang tercatat. Status “Selesai” berarti alur use case didukung dalam batas ruang lingkup yang diterima tim. “Sebagian” berarti ada bagian yang belum dibuat atau alur implementasi berbeda dari aktor/tujuan pada tabel. “Belum dimulai” berarti implementasi use case belum tersedia.

## Ringkasan

- **Selesai:** 3 use case (UC-02, UC-05, UC-06).
- **Sebagian:** 4 use case (UC-01, UC-03, UC-04, UC-17).
- **Belum dimulai:** 11 use case (UC-07–UC-16 dan UC-18).

Sprint 1 dan Sprint 2 diterima tim. Sprint 3 baru memiliki handoff kontrak dan belum dimulai. Hasil uji Sprint 2, batas migrasi, dan risiko operasional ada di [SPRINT-2-ACCEPTANCE.md](SPRINT-2-ACCEPTANCE.md). Status dan kebijakan yang sudah diputuskan tidak dibuka kembali di sini.

## Pemetaan use case

| ID | Use case / FR | Status | Yang sudah tersedia dan yang masih kurang |
|---|---|---|---|
| UC-01 | Mendaftar akun — FR-01, FR-02 | **Sebagian** | Mahasiswa dapat mendaftar dengan NIM dan klaim satu kali pada entri roster yang layak; akun baru berstatus PENDING. Akun Dosen dibuat oleh Admin dengan kredensial sementara, sesuai keputusan CR-02. Jika use case mengharuskan Dosen mendaftar sendiri, alur itu belum ada; tabel use case perlu diselaraskan dengan keputusan tersebut. |
| UC-02 | Login dan logout — FR-03 | **Selesai** | Login/logout, sesi database, CSRF, pemeriksaan status akun, serta pembatasan percobaan tersedia untuk akun yang didukung. |
| UC-03 | Mengelola profil dan memulihkan kata sandi — FR-04, FR-05 | **Sebagian** | Profil dasar ditampilkan. Pengguna dengan kata sandi sementara wajib menggantinya. Edit profil dan reset/pemulihan kata sandi belum tersedia; perubahan kata sandi saat login bukan reset. |
| UC-04 | Menyetujui/menonaktifkan akun dan menugaskan Dosen ke kelas — FR-07, FR-12 | **Sebagian** | Admin dapat membuat akun Dosen serta mengubah role/status dan aktivasi akun. Penugasan Dosen ke kelas oleh Admin tidak tersedia: keputusan Sprint 2 menetapkan Dosen membuat dan memiliki kelasnya sendiri. Selaraskan langkah “menugaskan” dengan keputusan itu atau bawa perubahan sebagai keputusan produk baru. |
| UC-05 | Mengelola kelas dan keanggotaan — FR-09, FR-11 | **Selesai** | Dosen dapat membuat, melihat, mengedit, dan menutup kelas; membuat/merotasi kode; serta melihat anggota. Keanggotaan mahasiswa terjadi melalui kode. Penambahan manual Admin/Dosen berada di luar MVP Sprint 2 yang diterima tim. |
| UC-06 | Bergabung ke kelas dengan kode — FR-10 | **Selesai** | Mahasiswa ACTIVE dapat bergabung ke kelas OPEN dengan kode undangan; kelas tertutup menolak join dan membership dapat dilihat oleh pemiliknya. |
| UC-07 | Mengelola topik dan materi — FR-14, FR-15, FR-16 | **Belum dimulai** | Belum ada model atau alur untuk topik/materi. |
| UC-08 | Mengakses materi — FR-17 | **Belum dimulai** | Belum ada penyajian atau otorisasi materi kelas. |
| UC-09 | Membuat tugas dan melihat status pengumpulan — FR-18, FR-21 | **Belum dimulai** | Belum ada tugas, tenggat, atau daftar/status pengumpulan. |
| UC-10 | Mengumpulkan tugas — FR-19, FR-20, FR-40 | **Belum dimulai** | Belum ada submission, tanda terima, versi/resubmission, atau aturan keterlambatan. |
| UC-11 | Membuat kuis — FR-22 | **Belum dimulai** | Belum ada model atau alur pembuatan kuis. |
| UC-12 | Mengerjakan kuis — FR-23, FR-25, FR-26 | **Belum dimulai** | Belum ada pengerjaan, attempt, timer, atau penyimpanan jawaban kuis. |
| UC-13 | Menilai tugas/esai dan melihat rekap nilai — FR-24, FR-27, FR-29 | **Belum dimulai** | Belum ada penilaian, feedback, atau rekap nilai. Bergantung pada kontrak tugas/submission. |
| UC-14 | Melihat nilai dan komentar — FR-28 | **Belum dimulai** | Belum ada tampilan nilai atau komentar bagi mahasiswa. |
| UC-15 | Membuat pengumuman — FR-30 | **Belum dimulai** | Belum ada pengumuman kelas. |
| UC-16 | Berdiskusi di forum — FR-31 | **Belum dimulai** | Belum ada forum, moderasi, atau aturan retensi diskusi. |
| UC-17 | Melihat dasbor — FR-33, FR-34, FR-35 | **Sebagian** | Beranda menyediakan informasi akun, kelas terkait, dan fungsi Admin sesuai role. Dasbor ringkasan/rekap aktivitas akademik belum tersedia; isi, metrik, dan hak aksesnya perlu ditentukan. |
| UC-18 | Menerima notifikasi dan melihat daftar tenggat — FR-38 | **Belum dimulai** | Belum ada notifikasi atau daftar tenggat. Kanal notifikasi dan pemicu belum diputuskan. |

## Usulan urutan planning

Urutan di bawah mengikuti dependensi dan merupakan bahan perencanaan, bukan penetapan prioritas, ukuran sprint, tanggal, atau scope Sprint 3. Kapasitas tim dan kalender akademik belum dikonfirmasi; CR-06 masih perlu ditinjau.

| Tahap usulan | Use case terkait | Hasil yang perlu disepakati sebelum implementasi | Dependensi utama |
|---|---|---|---|
| 0. Kontrak dan rekonsiliasi | Semua | Selaraskan aktor/alur UC-01 dan UC-04 dengan keputusan yang sudah berlaku; definisikan sisa UC-03 dan cakupan UC-17; pilih scope berikut, owner, estimasi, DoD, dan kapasitas. Perbarui FR, diagram use case, backlog, dan acceptance tests. | Keputusan tim dan kapasitas; jangan mulai coding Sprint 3 sebelum kontrak disepakati. |
| 1. Tutup celah parsial akun/Admin | UC-01, UC-03, UC-04; definisi UC-17 | Selaraskan aktor/alur dengan keputusan berlaku. Tentukan apakah edit profil dan reset kata sandi masuk backlog; rencanakan penugasan Dosen ke kelas hanya bila tim mengubah keputusan pemilik kelas. Definisikan kebutuhan dasbor, tetapi bangun ringkasannya setelah peristiwa akademik dipilih. | Keputusan eksplisit tim; reset kata sandi membutuhkan kanal pemulihan aman. |
| 2. Materi dan akses | UC-07, UC-08 | Tetapkan tipe materi, penerbitan/perubahan/penghapusan, akses untuk anggota kelas CLOSED, penyimpanan privat, kuota, retensi, dan perilaku gagal. Rekonsiliasi dokumen batas berkas 4 MB dan 10 MB; CR-07 mencatat keputusan 4 MB, tetapi handoff menandai konflik dokumen yang perlu dibereskan. | Kelas/keanggotaan Sprint 2; keputusan storage dan akses. |
| 3. Tugas dan pengumpulan | UC-09, UC-10 | Tetapkan jenis submission, tenggat dan zona waktu, bukti penerimaan, status, keterlambatan, resubmission/versi, pembatalan, batas berkas, dan akses mahasiswa/dosen. | Materi/kelas bila dipilih; aturan akademik dan storage bila memakai berkas. |
| 4. Penilaian dan hasil | UC-13, UC-14 | Tetapkan skala/rubrik, draft vs dirilis, komentar, revisi nilai, rekap, hak baca, audit, dan jalur koreksi/banding. | Kontrak tugas/submission dan kebijakan akademik. |
| 5. Kuis | UC-11, UC-12 | Tetapkan format soal, attempt, timer, acak soal, penyimpanan jawaban, penilaian, feedback, dan aturan retake. | Kelas/keanggotaan; keputusan evaluasi akademik. Dapat dijadwalkan sebagai irisan terpisah setelah kontraknya disetujui. |
| 6. Komunikasi dan ringkasan | UC-15, UC-16, UC-18; penyelesaian UC-17 | Tetapkan pengumuman dan moderasi forum; kanal/pemicu/preferensi notifikasi; aturan tenggat dan zona waktu; serta metrik/akses dasbor per role. | Peristiwa kelas, tugas, submission, dan kuis yang dipilih; kebijakan privasi dan retensi. |

Urutan tahap 1–6 dapat ditukar atau dipangkas oleh tim setelah menimbang nilai dan kapasitas. Tabel ini tidak menetapkan Sprint 3 harus mengambil tahap tertentu.

## Definition of Done untuk use case berikutnya

Sebelum sebuah use case diberi status selesai:

1. Alur normal, gagal, status, aktor, izin, dan data yang disimpan disepakati dan konsisten dengan FR serta diagram.
2. Kontrak domain/schema/API dan batas privasi, audit, retensi, file, serta dependensi ditulis sebelum coding.
3. Acceptance test mencakup role/status, akses lintas kelas, concurrency yang relevan, dan fixture sintetis.
4. Build, typecheck, tes terkait, keyboard, accessibility tree, dan viewport diuji; keterbatasan pembaca layar audio tetap dinyatakan bila belum diperiksa.
5. Dokumen hasil mencatat jumlah pass/skip/fail secara terpisah. Skip tidak dihitung sebagai pass.
6. Risiko deployment tidak dinyatakan selesai hanya karena use case berfungsi lokal. Shared rate-limit store tetap prasyarat sebelum deployment multi-instance.

## Batas dan rujukan

- Sprint 2 diterima dengan batas upgrade migrasi: baseline Sprint 1 hasil replay memakai fixture sintetis, bukan salinan database berisi milik tim. Lihat [catatan penerimaan](SPRINT-2-ACCEPTANCE.md).
- Screen-reader audio belum diuji dan sistem belum production-ready.
- Sprint 3 belum dimulai. Handoff diskusi kontrak tersedia di [SPRINT-3-CONTRACT-HANDOFF.md](SPRINT-3-CONTRACT-HANDOFF.md).
