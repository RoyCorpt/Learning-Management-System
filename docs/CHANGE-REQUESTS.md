# Register Terpadu Change Request & Keputusan — SINTAKS (LMS PTIK)

> **Kewenangan project owner / project-owner delegation:** Project owner has fully delegated management and decision-making for this project to the student team. The team may make internal scope, technical, review, and Sprint acceptance decisions; no additional project-owner permission or sign-off is a gate. Ini proyek pembelajaran mahasiswa; tim tidak dibayar sebagai pekerja untuk proyek ini.

Dokumen ini menjadi **satu daftar kanonik (single source of truth)** untuk seluruh **Change Request (`CR-01`…`CR-10`)** beserta pemetaannya terhadap **Open Decisions (`OD-01`…`OD-10`)** di [OPEN-DECISIONS.md](OPEN-DECISIONS.md) dan **Decision Log (`DEC-S1-*`, `DEC-S2-*`)** di [DECISION-LOG.md](DECISION-LOG.md).

---

## 1. Resolusi Bentrok Penomoran (`OD-*` vs `CR-*`)

Sebelumnya, ID `CR-01`…`CR-10` pada `docs/OPEN-DECISIONS.md` berbenturan dengan daftar `CR-01`…`CR-08` pada dokumen laporan (**Tahap G §5** dan **Laporan Akhir §8.4**), khususnya pada `CR-05`, `CR-06`, `CR-07` (`4 MB` di repo vs `3×10 MB` di laporan), dan `CR-08` (`roster CSV` di repo vs `migrasi Railway` di laporan).

Aturan penomoran resmi mulai **2026-11-24**:
- **`OD-01`…`OD-10` (Open Decisions):** Keputusan rekonsiliasi baseline Sprint 1–4 pada `docs/OPEN-DECISIONS.md`.
- **`DEC-S1-01`…`DEC-S1-10` & `DEC-S2-01`:** Keputusan teknis/desain pada `docs/DECISION-LOG.md`.
- **`CR-01`…`CR-10` (Change Requests):** Perubahan formal ruang lingkup, jadwal, kebijakan sistem, dan infrastruktur yang disinkronkan antara repositori, *Tahap G §5*, *Laporan Akhir §8.4*, dan GitHub Issues berlabel `change-request`.

### Pemetaan ID Lama Repo → ID Baru (`OD-*`)

| ID Lama di Repo | ID Baru | Topik | Status & Rujukan CR Terkait |
|---|---|---|---|
| `CR-01` (lama) | **`OD-01`** | Hash password Argon2id | `DECIDED` (`DEC-S1-01`) |
| `CR-02` (lama) | **`OD-02`** | Pembuatan akun dosen oleh Admin | `DECIDED` (`DEC-S1-02`) |
| `CR-03` (lama) | **`OD-03`** | Keanggotaan kelas via kode undangan | `DECIDED` (`DEC-S2-01`) |
| `CR-04` (lama) | **`OD-04`** | Notifikasi dalam aplikasi (`FR-38`) | `RESOLVED` (Sprint 4) |
| `CR-05` (lama) | **`OD-05`** | Pengumpulan tugas transaksional (`FR-40`) | `RESOLVED` (Sprint 3) |
| `CR-06` (lama) | **`OD-06`** | Durasi sprint & aturan jadwal akademik | Direkonsiliasi ke **`CR-09`** |
| `CR-07` (lama) | **`OD-07`** | Batas unggah 4 MB per berkas | Direkonsiliasi ke **`CR-10`** |
| `CR-08` (lama) | **`OD-08`** | Sumber roster mahasiswa (`Book1.csv`) | `RESOLVED` (`DEC-S1-05`, `DEC-S1-10`) |
| `CR-09` (lama) | **`OD-09`** | Allowlist domain email kampus | `DECIDED` (`DEC-S1-04`) |
| `CR-10` (lama) | **`OD-10`** | Alur registrasi klaim satu kali (`PENDING`) | `DECIDED` (`DEC-S1-06`, `DEC-S1-10`) |

---

## 2. Daftar Change Request Terpadu (`CR-01`–`CR-10`)

| ID CR | Judul / Perubahan | Sumber & Referensi | Status | Ringkasan Dampak & Keselarasan Aktual Repo |
|---|---|---|---|---|
| **CR-01** | Perubahan tercatat pada baseline laporan | Tahap G §5 & Laporan Akhir §8.4 | **Tercatat di Laporan** *(sinkronkan naskah eksternal)* | Slot CR laporan resmi #1. Tidak lagi bentrok dengan `OD-01` (Argon2id). |
| **CR-02** | Perubahan tercatat pada baseline laporan | Tahap G §5 & Laporan Akhir §8.4 | **Tercatat di Laporan** *(sinkronkan naskah eksternal)* | Slot CR laporan resmi #2. Tidak lagi bentrok dengan `OD-02` (provisioning Dosen). |
| **CR-03** | Perubahan tercatat pada baseline laporan | Tahap G §5 & Laporan Akhir §8.4 | **Tercatat di Laporan** *(sinkronkan naskah eksternal)* | Slot CR laporan resmi #3. Tidak lagi bentrok dengan `OD-03` (`DEC-S2-01`). |
| **CR-04** | Perubahan tercatat pada baseline laporan | Tahap G §5 & Laporan Akhir §8.4 | **Tercatat di Laporan** *(sinkronkan naskah eksternal)* | Slot CR laporan resmi #4. Tidak lagi bentrok dengan `OD-04` (`FR-38`). |
| **CR-05** | Perubahan tercatat pada laporan *(berbeda dari pengumpulan `FR-40`)* | Tahap G §5 & Laporan Akhir §8.4 | **Tercatat di Laporan** *(sinkronkan naskah eksternal)* | Slot CR laporan resmi #5. `FR-40` di repo kini memakai ID `OD-05`. |
| **CR-06** | Perubahan tercatat pada laporan *(berbeda dari durasi sprint)* | Tahap G §5 & Laporan Akhir §8.4 | **Tercatat di Laporan** *(sinkronkan naskah eksternal)* | Slot CR laporan resmi #6. Isu durasi sprint di repo kini memakai `OD-06` dan `CR-09`. |
| **CR-07** | Kebijakan batas unggah versi laporan (`3×10 MB`) | Tahap G §5 & Laporan Akhir §8.4 | **Perlu Sinkronisasi (`CR-10`)** | Laporan mencantumkan `3×10 MB`, sementara implementasi aktif membatasi **4 MB per berkas** (`OD-07`). Lihat rekonsiliasi pada **CR-10**. |
| **CR-08** | Migrasi infrastruktur ke Railway | Tahap G §5 & Laporan Akhir §8.4 | **Tercatat di Laporan** *(deployment aktual: Cloud Run + Cloud SQL)* | Laporan mencatat rencana/perubahan migrasi Railway. Implementasi repositori saat ini berjalan pada Google Cloud Run + PostgreSQL Cloud SQL (`asia-southeast1`) dengan Drizzle ORM (`src/db/`). |
| **CR-09** | **Pemadatan Jadwal Pelaksanaan Sprint** | `OD-06`, `SPRINT-1-PLAN.md`, `SPRINT-2-PLAN.md`, `SPRINT-3-AND-4-PLAN-TO-IMPLEMENTATION.md`, GitHub Issue (`change-request`) | **Disetujui / Terlaksana (perlu terbit GitHub Issue)** | Menyesuaikan baseline jadwal proyek agar pelaksanaan Sprint 1–4 beserta penguatan pasca-Sprint 4 selesai dalam rentang `2026-11-01` s.d. `2026-11-23` tanpa mengurangi cakupan `UC-01`–`UC-18`. |
| **CR-10** | **Kebijakan Lampiran (`4 MB` per berkas vs `3×10 MB` laporan)** | `OD-07`, `CR-07` laporan, `apps/api/src/lib/attachments.ts`, GitHub Issue (`change-request`) | **Open — Menunggu Sinkronisasi Laporan & Penerbitan GitHub Issue** | Menetapkan kebijakan tunggal unggahan/unduhan lampiran untuk Materi, Tugas, Pengumpulan, Kuis, dan Soal Kuis (batas 4 MB base64/byte per berkas atau penyesuaian bila bermigrasi ke object storage `3×10 MB`). |

> **Catatan keterbukaan data:** Dokumen *Tahap G §5* dan *Laporan Akhir §8.4* tidak tersimpan di dalam repositori kode ini. Karena itu ringkasan spesifik `CR-01`–`CR-06` pada tabel di atas dijaga agar disalin langsung dari naskah laporan tim saat melakukan finalisasi dokumen.

---

## 3. Ringkasan Keputusan Terpadu di Repositori (`OD` & `DEC`)

Untuk memudahkan audit dari satu dokumen, berikut rangkuman seluruh keputusan internal yang berlaku di codebase aktif (`apps/api`, `apps/web`, `src/db`):

1. **Autentikasi, Sesi & Keamanan (`OD-01`, `OD-02`, `OD-08`–`OD-10`, `DEC-S1-01`–`DEC-S1-10`):**
   - Hashing Argon2id (`19456 KiB`, `timeCost=2`, `parallelism=1`), sesi opaque DB + cookie `HttpOnly` (`COOKIE_SAME_SITE=lax` default, `COOKIE_SECURE=true` wajib di produksi) + proteksi CSRF.
   - Pembuatan akun Dosen hanya oleh Admin; registrasi Mahasiswa memakai klaim satu kali atas CSV roster resmi (`layak` → `registration_eligible`) dengan domain default `unimed.ac.id,mhs.unimed.ac.id` dan status awal `PENDING`.
   - Pemulihan kata sandi (`FR-05`) menggunakan token CSPRNG terhash SHA-256 di `password_reset_tokens` dengan URL fragment `#resetToken=`, rate limit atomik PostgreSQL (`rate_limit_buckets`), dan email SMTP `nodemailer` (tanpa Firebase/Google Sign-In).
2. **Kelas, Pembelajaran & Komunikasi (`OD-03`, `OD-04`, `OD-05`, `DEC-S2-01`):**
   - Pendaftaran kelas Mahasiswa memakai kode undangan 43 karakter sekali tampil milik Dosen (`OPEN`/`CLOSED`).
   - Topik, materi (`TEXT`/`LINK`/`FILE`), tugas & pengumpulan transaksional `Serializable` berversi (`Versi ke-N`), penilaian tugas `DRAFT`/`PUBLISHED`, kuis daring PG/Esai berwaktu dengan autosave, pengumuman, forum diskusi (jendela sunting 15 menit), notifikasi dalam aplikasi (`FR-38`), dan rendering matematika LaTeX/KaTeX luring.
3. **Jadwal & Lampiran (`OD-06`, `OD-07` → `CR-09`, `CR-10`):**
   - Lihat spesifikasi CR resmi di bawah ini.

---

## 4. Spesifikasi GitHub Issue Resmi (`change-request`)

Templat issue tersedia di [`.github/ISSUE_TEMPLATE/change-request.md`](../.github/ISSUE_TEMPLATE/change-request.md). Karena lingkungan build ini tidak terhubung ke remote GitHub atau `gh` CLI, gunakan kedua draf dan perintah di bawah untuk menerbitkan Issue berlabel `change-request` di repositori GitHub proyek.

### CR-09 — Pemadatan Jadwal Pelaksanaan Sprint

- **Judul Issue:** `[CR-09] Pemadatan Jadwal Pelaksanaan Sprint 1–4 dan Rekonsiliasi Baseline Tahap C`
- **Label:** `change-request`

```markdown
## Ringkasan Perubahan (CR-09)
Menyesuaikan jadwal pelaksanaan sprint agar seluruh ruang lingkup MVP Sprint 1–4 (`UC-01`–`UC-18`), pemulihan kata sandi (`FR-05`), dukungan lampiran Tugas/Kuis, rendering LaTeX/KaTeX, dan PWA Service Worker dapat diselesaikan secara bertahap pada periode terpadu **2026-11-01 hingga 2026-11-23**.

## Latar Belakang & Item Terkait
- Mengatasi ketidakkonsistenan jadwal pada `Tahap C` versus ketentuan akademik minimal tiga sprint dua minggu (`OD-06`, sebelumnya tertulis `CR-06` di `docs/OPEN-DECISIONS.md`).
- Penjadwalan awal Sprint 2 mengusulkan periode `2026-11-15–2026-11-28`, namun penyelesaian implementasi dan penerimaan Sprint 1–4 berlangsung lebih padat:
  - Sprint 1 (Autentikasi & Roster): selesai `2026-11-06`
  - Sprint 2 (Kelas & Keanggotaan): diterima `2026-11-12`
  - Sprint 3 & 4 (Materi, Tugas, Penilaian, Kuis, Komunikasi, Notifikasi, UI SINTAKS): selesai `2026-11-16`
  - Fitur Lupa Kata Sandi non-Firebase, penguatan produksi, lampiran Tugas/Kuis, LaTeX, dan PWA: selesai `2026-11-23`

## Keputusan yang Ditetapkan
1. Memadatkan kalender eksekusi Sprint 1–4 menjadi iterasi terfokus dengan mempertahankan seluruh gerbang mutu (`npm run typecheck`, uji integrasi PostgreSQL/Vitest, serta ulasan keamanan).
2. Memperbarui acuan jadwal di `docs/OPEN-DECISIONS.md` (`OD-06`), `docs/CHANGE-REQUESTS.md` (`CR-09`), `Tahap G §5`, dan `Laporan Akhir §8.4` agar konsisten.

## Dampak Dokumen
- `docs/OPEN-DECISIONS.md` (`OD-06`)
- `docs/CHANGE-REQUESTS.md` (`CR-09`)
- `docs/SPRINT-2-PLAN.md` & `docs/SPRINT-3-CONTRACT-HANDOFF.md`
- `Tahap G §5` & `Laporan Akhir §8.4`
```

Perintah `gh` siap salin:
```bash
gh issue create \
  --title "[CR-09] Pemadatan Jadwal Pelaksanaan Sprint 1-4 dan Rekonsiliasi Baseline Tahap C" \
  --label "change-request" \
  --body-file - <<'EOF'
## Ringkasan Perubahan (CR-09)
Menyesuaikan jadwal pelaksanaan sprint agar seluruh ruang lingkup MVP Sprint 1-4 (`UC-01`-`UC-18`), pemulihan kata sandi (`FR-05`), dukungan lampiran Tugas/Kuis, rendering LaTeX/KaTeX, dan PWA Service Worker dapat diselesaikan pada periode terpadu **2026-11-01 hingga 2026-11-23**.

## Latar Belakang
- Mengatasi konflik jadwal pada `Tahap C` vs ketentuan minimal tiga sprint dua minggu (`OD-06`).
- Timeline aktual: Sprint 1 (`2026-11-06`), Sprint 2 (`2026-11-12`), Sprint 3-4 (`2026-11-16`), serta fitur keamanan/luring/lampiran (`2026-11-22`-`2026-11-23`).

## Dampak Dokumen
- `docs/OPEN-DECISIONS.md` (`OD-06`), `docs/CHANGE-REQUESTS.md` (`CR-09`), `Tahap G §5`, dan `Laporan Akhir §8.4`.
EOF
```

---

### CR-10 — Kebijakan Lampiran (Rekonsiliasi `4 MB` Implementasi vs `3×10 MB` Laporan)

- **Judul Issue:** `[CR-10] Rekonsiliasi Kebijakan Lampiran: Batas 4 MB per Berkas (Codebase) vs 3×10 MB (Laporan CR-07)`
- **Label:** `change-request`

```markdown
## Ringkasan Perubahan (CR-10)
Menetapkan kebijakan resmi ukuran, jumlah, format, penyimpanan, dan pengiriman lampiran berkas pada SINTAKS agar tidak lagi terjadi pertentangan antara implementasi aktual di repositori (`OD-07` = 4 MB per berkas) dan dokumen laporan (`CR-07` pada Tahap G §5 & Laporan Akhir §8.4 = `3×10 MB`).

## Kondisi Saat Ini di Codebase (`apps/api/src/lib/attachments.ts`)
- **Batas ukuran per berkas:** `MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024` (4 MB).
- **Batas payload JSON API:** `express.json({ limit: '6mb' })` (mengakomodasi encoding base64 untuk 1 berkas ≤ 4 MB).
- **Jumlah lampiran per entitas:** 1 berkas opsional (`attachment_name`, `attachment_mime`, `attachment_size`, `attachment_data` di PostgreSQL) + 1 `external_url` opsional (`http:`/`https:`) pada Materi, Tugas, Pengumpulan Tugas, Kuis, dan Soal Kuis.
- **Format diizinkan (`ALLOWED_MIME_TYPES`):** `PDF`, `TXT`, `MD`, `CSV`, `PNG`, `JPG`, `WEBP`, `DOCX`, `ZIP`.
- **Keamanan pengiriman:** Endpoint `/download` terautentikasi dengan `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, dan `?inline=1` hanya untuk gambar (`PNG`, `JPG`, `WEBP`).

## Opsi Keputusan yang Perlu Disepakati & Disinkronkan
- **Opsi A (Direkomendasikan untuk arsitektur PostgreSQL + Cloud Run saat ini):** Pertahankan batas **4 MB per berkas** (1 lampiran + tautan eksternal untuk berkas > 4 MB) pada aplikasi, dan perbarui keterangan teknis pada *Laporan Akhir §8.4* / *Tahap G §5* (`CR-07` → diselesaikan oleh `CR-10`) agar mencerminkan batasan penyimpanan bytea/base64 PostgreSQL dan batas payload Cloud Run.
- **Opsi B (Jika tetap mewajibkan `3×10 MB` di aplikasi):** Memerlukan perubahan arsitektur menuju object storage (GCS/S3) dengan *signed upload/download URL* serta pembaruan kolom relasi lampiran ganda sebelum batas 4 MB dinaikkan.

## Dampak Dokumen & Kode
- `apps/api/src/lib/attachments.ts`, `apps/api/src/app.ts`, `apps/web/src/lib/api.ts` (jika memilih Opsi B)
- `docs/OPEN-DECISIONS.md` (`OD-07`), `docs/CHANGE-REQUESTS.md` (`CR-10`), `docs/DATABASE-SCHEMA.md`
- `Tahap G §5` & `Laporan Akhir §8.4` (`CR-07`)
```

Perintah `gh` siap salin:
```bash
gh issue create \
  --title "[CR-10] Rekonsiliasi Kebijakan Lampiran: Batas 4 MB per Berkas vs 3x10 MB (Laporan CR-07)" \
  --label "change-request" \
  --body-file - <<'EOF'
## Ringkasan Perubahan (CR-10)
Menetapkan kebijakan tunggal lampiran SINTAKS dan merekonsiliasi konflik antara codebase (`OD-07` = maks. 4 MB per berkas di `apps/api/src/lib/attachments.ts`) dan laporan (`CR-07` = `3x10 MB` di Tahap G §5 & Laporan Akhir §8.4).

## Parameter Implementasi Aktif
- Batas per berkas: 4 MB (`MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024`), JSON limit 6 MB.
- Format: `PDF, TXT, MD, CSV, PNG, JPG, WEBP, DOCX, ZIP` + `external_url` (`http:`/`https:`).
- Penyimpanan saat ini: kolom lampiran pada PostgreSQL dengan unduhan terotorisasi `/download` (`nosniff`, `private, no-store`, `?inline=1` khusus gambar).

## Keputusan
- Pilih **Opsi A** (tetapkan 4 MB + tautan eksternal untuk arsitektur PostgreSQL/Cloud Run dan sinkronkan laporan) atau **Opsi B** (migrasi ke object storage + multi-lampiran `3x10 MB`).
EOF
```
