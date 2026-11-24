# Register Keputusan Terbuka (Open Decisions) — SINTAKS (LMS PTIK)

> **Kewenangan project owner / project-owner delegation:** Project owner has fully delegated management and decision-making for this project to the student team. The team may make internal scope, technical, review, and Sprint acceptance decisions; no additional project-owner permission or sign-off is a gate. Ini proyek pembelajaran mahasiswa; tim tidak dibayar sebagai pekerja untuk proyek ini. Review dan quality gates adalah praktik belajar dan menjaga mutu, bukan indikasi ketidakprofesionalan atau hubungan kerja.

> **Pembaruan penomoran (2026-11-24):** Seluruh item pada dokumen ini sebelumnya memakai awalan `CR-01`…`CR-10` dan telah diganti menjadi **`OD-01`…`OD-10` (Open Decision)** agar tidak bentrok dengan penomoran **Change Request (`CR-01`…`CR-10`)** pada dokumen laporan (*Tahap G §5* dan *Laporan Akhir §8.4*). Daftar terpadu seluruh keputusan dan Change Request tersedia di [**`docs/CHANGE-REQUESTS.md`**](CHANGE-REQUESTS.md).

Dokumen ini mencatat keputusan terbuka dan hasil rekonsiliasinya sejak baseline Sprint 1 (`2026-11-01`). Keputusan di sini bukan klaim persetujuan formal sponsor/dosen.

| ID | Topik | Konflik/ketidakpastian | Dampak jika diputuskan sepihak | Tindakan & status resolusi |
|---|---|---|---|---|
| OD-01 | Hash password | Baseline kerja Sprint 1 menetapkan Argon2id. | Implementasi memerlukan dependency dan parameter yang diverifikasi. | **DECIDED — Owner decision, 2026-11-01.** Gunakan Argon2id (`19456 KiB`, `timeCost=2`, `parallelism=1`); teruji pada runtime `@node-rs/argon2`. |
| OD-02 | Pembuatan akun dosen | Baseline kerja Sprint 1 menetapkan provisioning oleh Admin. | Dokumen turunan harus mengikuti alur tersebut. | **DECIDED — Owner decision, 2026-11-01.** Dosen tidak mendaftar sendiri; dibuat oleh Admin dengan kata sandi sementara wajib ganti. |
| OD-03 | Keanggotaan kelas | Tahap B memberi opsi kode kelas atau penambahan manual; rekomendasi desain MVP adalah kode kelas. | Memengaruhi use case dan hak akses Admin/Dosen. | **DECIDED — DEC-S2-01, keputusan internal tim 2026-11-06.** Dosen membuat/mengelola kelas miliknya; Mahasiswa ACTIVE bergabung ke kelas OPEN memakai kode undangan acak. Penambahan manual Admin/Dosen di luar MVP Sprint 2. Kode di-hash, dapat dirotasi pemilik kelas, dan tidak dicatat di log. |
| OD-04 | Notifikasi FR-38 | FR-38 tetap di luar implementasi Sprint 1. | Tidak memengaruhi irisan autentikasi Sprint 1. | **RESOLVED — Implemented in Sprint 4.** Notifikasi dalam aplikasi (`notifications` + `NotificationBell`) aktif untuk tugas baru, materi baru, kuis baru, pengumuman, dan rilis nilai. |
| OD-05 | Pengumpulan tugas FR-40 | FR-40 tetap di luar implementasi Sprint 1. | Tidak memengaruhi irisan autentikasi Sprint 1. | **RESOLVED — Implemented in Sprint 3.** Pengumpulan teks/lampiran transaksional (`Serializable`) dengan versi (`Versi ke-N`) dan status keterlambatan aktif pada `learning.ts`. |
| OD-06 | Durasi sprint & pemadatan jadwal | Tahap C tidak konsisten dengan ketentuan tugas MPTI tentang minimal tiga sprint dua minggu. | Baseline jadwal dan estimasi tidak dapat diaudit. | **MERGED TO CR-09 — Lihat [CHANGE-REQUESTS.md](CHANGE-REQUESTS.md#cr-09--pemadatan-jadwal-pelaksanaan-sprint).** Direkonsiliasi melalui **CR-09 (Pemadatan Jadwal)** seiring penyelesaian Sprint 1–4 pada rentang 2026-11-01 s.d. 2026-11-23. |
| OD-07 | Batas unggah & kebijakan lampiran | Baseline kerja menetapkan 4 MB per berkas, berbeda dari catatan awal 10 MB (`SPRINT-0-FOUNDATION.md`) dan `CR-07` (`3×10 MB` pada laporan Tahap G §5 / Laporan Akhir §8.4). | Ketidaksinkronan antara batas teknis API/database dan dokumen laporan. | **RESOLVED IN CODE — Linked to CR-10.** Implementasi aktual menerapkan batas **4 MB per berkas** pada materi, tugas, pengumpulan, kuis, dan soal kuis (`apps/api/src/lib/attachments.ts`); penyelarasan kebijakan laporan dicatat pada **CR-10** di [CHANGE-REQUESTS.md](CHANGE-REQUESTS.md#cr-10--kebijakan-lampiran-4-mb-per-berkas-vs-310-mb). |
| OD-08 | Sumber roster mahasiswa | Roster resmi tersedia sebagai `Book1.csv` (`roster_resmi.csv`); format aktual sudah dianalisis. *(Catatan: berbeda dari `CR-08` di laporan Tahap G §5 / Laporan Akhir §8.4 tentang migrasi Railway.)* | Parser dan pencocokan identitas harus mengikuti format file, bukan asumsi. | **RESOLVED — Owner supplied CSV, 2026-11-01.** Impor Admin memvalidasi kolom `nim`, `nama`, `email`, `status`; status `layak` memetakan ke `registration_eligible`. |
| OD-09 | Domain email kampus | Domain awal `unimed.ac.id`; file memakai subdomain `mhs.unimed.ac.id`. *(Catatan: berbeda dari `CR-09` Pemadatan Jadwal.)* | Allowlist harus menerima domain data resmi tanpa hardcode business logic. | **DECIDED — Owner decision, 2026-11-01.** Allowlist configurable `STUDENT_EMAIL_DOMAINS` default `unimed.ac.id,mhs.unimed.ac.id`. |
| OD-10 | Registrasi Mahasiswa | Kelayakan roster tidak sama dengan status akun. | Satu entri roster hanya boleh diklaim sekali; akun baru tidak boleh otomatis aktif. | **DECIDED — Owner decision, 2026-11-01.** `layak` → `registration_eligible`; claim satu kali; akun dibuat `PENDING` sampai Admin mengaktifkan. Status CSV yang tak dikenal ditolak. |

## Aturan pengendalian
1. Item undecided tetap `OPEN` dan bukan persetujuan desain.
2. Implementasi yang bergantung pada item `OPEN` harus ditahan atau diberi feature flag/prototipe yang tidak dianggap baseline.
3. Setiap perubahan lingkup, jadwal, batas kebijakan, atau infrastruktur dicatat pada register terpadu [**`docs/CHANGE-REQUESTS.md`**](CHANGE-REQUESTS.md) dengan ID **`CR-XX`** dan diterbitkan sebagai GitHub Issue berlabel `change-request`.
4. Setelah disetujui, perbarui SRS/kebutuhan, use case, activity/sequence diagram, ERD, backlog, dan test case yang terdampak.

## Pembaruan arsitektur terkini (2026-11-24)
- Implementasi aktif menggunakan React + TypeScript + Vite (**SINTAKS**), Express + TypeScript, PostgreSQL (Cloud SQL `asia-southeast1`) + **Drizzle ORM** (`src/db/schema.ts`), serta autentikasi email/kata sandi Argon2id + sesi database + pemulihan kata sandi non-Firebase (`nodemailer`), Workbox PWA Service Worker, unggahan lampiran Materi/Tugas/Kuis maks. **4 MB**, dan rendering matematika KaTeX/LaTeX.
- Catatan historis `docs/SPRINT-1-REVIEW.patch` dipertahankan apa adanya sebagai arsip snapshot diff Sprint 1 terhadap commit `4bd8740`.

## Sumber keputusan Sprint 1

Untuk keputusan Sprint 1 gunakan `Decision Source: Owner decision, 2026-11-01`. Pemilik proyek menyatakan memiliki delegasi penuh untuk keputusan internal; sponsor/dosen ingin melihat hasil akhir. Tidak ada persetujuan formal sponsor/dosen yang diklaim di sini.
