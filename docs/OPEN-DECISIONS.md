# Register Keputusan Terbuka dan Change Request — LMS PTIK

> **Kewenangan project owner / project-owner delegation:** Project owner has fully delegated management and decision-making for this project to the student team. The team may make internal scope, technical, review, and Sprint acceptance decisions; no additional project-owner permission or sign-off is a gate. Ini proyek pembelajaran mahasiswa; tim tidak dibayar sebagai pekerja untuk proyek ini. Review dan quality gates adalah praktik belajar dan menjaga mutu, bukan indikasi ketidakprofesionalan atau hubungan kerja.

Dokumen ini mencatat keputusan dan pertanyaan yang masih terbuka. Baseline internal Sprint 1 ditetapkan oleh pemilik proyek pada 2026-11-01; keputusan tersebut bukan klaim persetujuan formal sponsor/dosen.

| ID | Topik | Konflik/ketidakpastian | Dampak jika diputuskan sepihak | Tindakan sebelum implementasi |
|---|---|---|---|---|
| CR-01 | Hash password | Baseline kerja Sprint 1 menetapkan Argon2id. | Implementasi memerlukan dependency dan parameter yang diverifikasi. | **DECIDED — Owner decision, 2026-11-01.** Gunakan Argon2id; parameter dicatat setelah kompatibilitas teruji. |
| CR-02 | Pembuatan akun dosen | Baseline kerja Sprint 1 menetapkan provisioning oleh Admin. | Dokumen turunan harus mengikuti alur tersebut. | **DECIDED — Owner decision, 2026-11-01.** Dosen tidak mendaftar sendiri. |
| CR-03 | Keanggotaan kelas | Tahap B memberi opsi kode kelas atau penambahan manual; rekomendasi desain MVP adalah kode kelas. | Memengaruhi use case dan hak akses Admin/Dosen. | **DECIDED — DEC-S2-01, keputusan internal tim 2026-11-06.** Dosen membuat/mengelola kelas miliknya; Mahasiswa ACTIVE bergabung ke kelas OPEN memakai kode undangan acak. Penambahan manual Admin/Dosen di luar MVP Sprint 2. Kode di-hash, dapat dirotasi pemilik kelas, dan tidak dicatat di log. |
| CR-04 | Notifikasi FR-38 | FR-38 tetap di luar implementasi Sprint 1. | Tidak memengaruhi irisan autentikasi Sprint 1. | **RESOLVED — Implemented in Sprint 4.** Notifikasi dalam aplikasi (`notifications` + `NotificationBell`) aktif untuk tugas baru, kuis baru, pengumuman, dan rilis nilai. |
| CR-05 | Pengumpulan tugas FR-40 | FR-40 tetap di luar implementasi Sprint 1. | Tidak memengaruhi irisan autentikasi Sprint 1. | **RESOLVED — Implemented in Sprint 3.** Pengumpulan teks/lampiran transaksional dengan versi dan status keterlambatan aktif pada `learning.ts`. |
| CR-06 | Durasi sprint | Tahap C tidak konsisten dengan ketentuan tugas MPTI tentang minimal tiga sprint dua minggu. | Baseline jadwal dan estimasi tidak dapat diaudit. | Konfirmasi aturan akademik dan revisi jadwal baseline. |
| CR-07 | Batas unggah | Baseline kerja menetapkan 4 MB per berkas, tetapi upload tidak termasuk Sprint 1. | Perlu implementasi dan verifikasi pada sprint upload. | **RESOLVED — Implemented in Sprint 3.** Validasi batas 4 MB per berkas diterapkan pada unggahan materi dan pengumpulan tugas. |
| CR-08 | Sumber roster mahasiswa | Roster resmi tersedia sebagai `Book1.csv`; format aktual sudah dianalisis. | Parser dan pencocokan identitas harus mengikuti format file, bukan asumsi. | **RESOLVED — Owner supplied CSV, 2026-11-01.** Impor Admin memvalidasi kolom `nim`, `nama`, `email`, `status`; status `layak` memetakan ke `registration_eligible`. |
| CR-09 | Domain email kampus | Domain awal `unimed.ac.id`; file memakai subdomain `mhs.unimed.ac.id`. | Allowlist harus menerima domain data resmi tanpa hardcode business logic. | **DECIDED — Owner decision, 2026-11-01.** Allowlist configurable default `unimed.ac.id,mhs.unimed.ac.id`. |
| CR-10 | Registrasi Mahasiswa | Kelayakan roster tidak sama dengan status akun. | Satu entri roster hanya boleh diklaim sekali; akun baru tidak boleh otomatis aktif. | **DECIDED — Owner decision, 2026-11-01.** `layak`→`registration_eligible`; claim satu kali; akun dibuat PENDING sampai Admin mengaktifkan. Status CSV yang tak dikenal ditolak. |

## Aturan pengendalian
1. Item undecided tetap OPEN dan bukan persetujuan desain.
2. Implementasi yang bergantung pada item OPEN harus ditahan atau diberi feature flag/prototipe yang tidak dianggap baseline.
3. Setiap keputusan harus mencatat pemilik keputusan, tanggal, alasan, dampak pada dokumen, dan versi artefak yang diperbarui.
4. Setelah disetujui, perbarui SRS/kebutuhan, use case, activity/sequence diagram, ERD, backlog, dan test case yang terdampak.

## Pembaruan arsitektur Sprint 3–4 (2026-11-16)
- Implementasi aktif menggunakan React + TypeScript + Vite (**SINTAKS**), Express + TypeScript, PostgreSQL (Cloud SQL `asia-southeast1`) + **Drizzle ORM** (`src/db/schema.ts`), dan Firebase Auth (Google Sign-In).
- Skema penuh Sprint 1–4 mencakup identitas/sesi, kelas/keanggotaan, topik/materi/tugas/pengumpulan, kuis daring, pengumuman, forum, dan notifikasi.

## Sumber keputusan Sprint 1

Untuk keputusan Sprint 1 gunakan `Decision Source: Owner decision, 2026-11-01`. Pemilik proyek menyatakan memiliki delegasi penuh untuk keputusan internal; sponsor/dosen ingin melihat hasil akhir. Tidak ada persetujuan formal sponsor/dosen yang diklaim di sini.
