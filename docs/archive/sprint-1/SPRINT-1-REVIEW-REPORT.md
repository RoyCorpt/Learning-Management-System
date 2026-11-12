# Sprint 1 Independent Code Review

> **Kewenangan project owner / project-owner delegation:** Project owner has fully delegated management and decision-making for this project to the student team. The team may make internal scope, technical, review, and Sprint acceptance decisions; no additional project-owner permission or sign-off is a gate. Ini proyek pembelajaran mahasiswa; tim tidak dibayar sebagai pekerja untuk proyek ini. Review dan quality gates adalah praktik belajar dan menjaga mutu, bukan indikasi ketidakprofesionalan atau hubungan kerja.

**Reviewer:** Codex (GPT-6), independent code reviewer  
**Tanggal pemeriksaan awal:** 2026-11-04  
**Branch:** `codex/sprint-1-auth`  
**Baseline:** `4bd8740` (`4bd874007726dd34d8c40d9ac876edf204fb88fd`)  
**Hasil review awal:** PASS WITH FINDINGS  
**Disposisi awal:** F-01 telah diimplementasikan; pada tanggal review awal verifikasi rollback terhalang database lokal yang tidak tersedia. Review ini bukan acceptance Sprint 1 oleh project owner.
**Hasil akhir reviewer:** PASS — F-02 ditutup dengan transaksi dan rollback PostgreSQL; F-03 diperbaiki pada launcher. Tim menyuplai hasil Node 20.20.2: 3 berkas, 19 lulus, 0 gagal, 0 skip, termasuk roster resmi dan alur API Argon2. **Disposisi:** Sprint 1 COMPLETE di bawah delegasi tim. Launcher Windows belum dijalankan end-to-end dan menjadi pemeriksaan operator opsional.

## Ruang lingkup

Review membandingkan `SPRINT-1-REVIEW.patch` dan working tree saat ini terhadap baseline, membaca `SPRINT-1-REVIEW-HANDOFF.md`, checklist reviewer, source/API, schema dan migrasi Prisma, konfigurasi, dependency manifest/lockfile, dokumentasi pengujian, serta hasil eksekusi aktual yang dapat dilakukan pada lingkungan review.

Area yang diperiksa meliputi authentication/session/CSRF/logout; RBAC dan proteksi Admin; Argon2id dan kredensial; roster import, eligibility, dan klaim registrasi sekali pakai; transaksi, rollback, dan konkurensi; audit/log redaction; perubahan Vitest; serta konfigurasi dan regresi terkait.

## Hasil eksekusi aktual

- `npm test` pertama terhalang izin membuat direktori cache sementara Vitest di `apps/api/node_modules/.vite-temp`.
- Setelah eksekusi dengan izin yang memadai, Vitest 4.1.12 mulai berjalan: 6 test lulus, 6 test opt-in diskip, dan 1 test gagal (`protects the profile endpoint without a valid session`) karena Prisma Client belum ter-generate di lingkungan ini.
- `npm run db:generate` dicoba untuk memenuhi prasyarat tersebut, tetapi gagal saat mengubah timestamp file query engine di cache Prisma (`EPERM`). Karena itu, hasil test ini bukan bukti suite lulus. Integrasi DB, migrasi, dan CSV resmi tidak berhasil dijalankan dalam sesi review.
- Handoff melaporkan suite lengkap sebelumnya 13/13, namun laporan tersebut tidak menggantikan eksekusi independen yang gagal di lingkungan ini.

## Temuan

### F-01 — Perubahan kata sandi, revokasi sesi, dan audit tidak atomik

**Severity:** Medium (P2)  
**Lokasi:** `apps/api/src/auth.ts:133-135`  
**Dampak:** Jika update user berhasil lalu pembaruan sesi atau insert audit gagal, endpoint mengembalikan 500 meskipun password sudah berubah. Jika insert audit gagal setelah revokasi, tindakan keamanan berlaku tetapi tidak tercatat. Keadaan parsial ini merusak konsistensi audit dan membuat klien tidak dapat mengetahui apakah perubahan kredensial berhasil; pengguna dapat terkunci dari password lama tanpa respons sukses.

**Bukti:** Handler mengirim tiga operasi Prisma terpisah berurutan: `user.update` pada baris 133, `session.updateMany` pada 134, dan `audit('AUTH_PASSWORD_CHANGED', ...)` pada 135. Tidak ada `$transaction` yang membungkus ketiganya. Error dari operasi mana pun diteruskan ke error handler sebagai 500. Ini berbeda dari handler perubahan status/peran Admin dan pembuatan instruktur yang menggabungkan mutasi, revokasi, dan audit dalam transaksi.

**Rekomendasi:** Bungkus update password/flag, revokasi seluruh sesi aktif, dan pencatatan audit dalam satu transaksi database. Tambahkan pengujian kegagalan audit/revokasi yang memastikan rollback penuh atau perilaku sukses yang eksplisit dan terdokumentasi.

**Disposisi:** IMPLEMENTED — NOT VERIFIED. Implementasi dan fault-injection tests telah ditambahkan; test runtime belum mencapai handler karena PostgreSQL tidak dapat dihubungi di `localhost:5432`. Jangan tutup F-01 sebelum seluruh test baru lulus pada PostgreSQL.

## Tindak lanjut F-01 — 2026-11-04

### Akar masalah dan dampak

Handler `/auth/change-password` semula menjalankan `user.update`, `session.updateMany`, lalu helper `audit()` melalui tiga request Prisma terpisah. Kegagalan di tahap kedua atau ketiga dapat meninggalkan password berubah atau sesi tercabut tanpa seluruh efek samping dan audit yang sesuai. Hash Argon2id dibuat sebelum write; perubahan tersebut tidak perlu menjadi bagian transaksi.

### Perubahan implementasi

- `apps/api/src/auth.ts`: hash baru dihitung sebelum transaksi; `user.updateMany`, pencabutan semua sesi belum dicabut, dan `AUTH_PASSWORD_CHANGED` audit insert sekarang berjalan lewat satu interactive `$transaction` Prisma. Audit ditulis menggunakan transaction client, bukan root client.
- Update password mensyaratkan hash lama yang sebelumnya diverifikasi. Jika request bersamaan sudah mengubah password, jumlah row yang diperbarui nol dan handler mengembalikan 409 `PASSWORD_CHANGE_CONFLICT`; transaksi tidak menulis revokasi/audit.
- Otorisasi, CSRF, Argon2id, response sukses 204, penghapusan cookie, dan redaksi error tidak berubah. Password asli/hash tidak dikirim ke audit.
- `apps/api/src/password-change.test.ts`: satu happy-path menguji dua sesi lama, audit, autentikasi password lama/baru, dan kebocoran log/audit. Tiga test fault injection memakai PostgreSQL trigger untuk menggagalkan update user, revokasi sesi, atau insert audit; tiap test memeriksa password/flag/version, semua sesi, audit, dan sesi lama setelah respons gagal.

### Verifikasi dan batasnya

- Prisma Client berhasil dibuat di Node 20.20.2/Prisma 6.19.3 dengan `PRISMA_QUERY_ENGINE_LIBRARY` diarahkan ke `node_modules/@prisma/engines/query_engine-windows.dll.node`. Perintah Prisma biasa gagal karena `EPERM` saat mengubah waktu akses file di `apps/api/node_modules/.cache/prisma/.../libquery-engine`; dependency tidak dihapus atau cache dibersihkan. Client hasil generate dapat dimuat oleh typecheck/build.
- Akar masalah izin belum dapat dipastikan pada level OS: file cache bukan read-only, ACL memberi `Authenticated Users` hak Modify, dan tidak ada proses `node.exe` aktif saat pemeriksaan; operasi `utime` tetap menerima `EPERM`. Workaround eksplisit memakai engine yang sudah ada, bukan melewati checksum atau mengunduh versi lain:

  ```powershell
  $env:PRISMA_QUERY_ENGINE_LIBRARY = (Resolve-Path 'node_modules/@prisma/engines/query_engine-windows.dll.node').Path
  npm run db:generate
  Remove-Item Env:PRISMA_QUERY_ENGINE_LIBRARY
  ```

  Perintah tersebut berhasil dijalankan pada Node 20.20.2 dan Prisma 6.19.3.
- Typecheck lulus pada Node 20.20.2; build lulus pada Node 20.20.2. `npm audit` melaporkan nol kerentanan.
- `npm run db:deploy` tidak dapat mencapai PostgreSQL di `localhost:5432`. Tidak ada Docker/Podman, PostgreSQL executable, atau layanan PostgreSQL terpasang/aktif yang ditemukan.
- Eksekusi targeted F-01: 4 test dijalankan, 4 gagal saat fixture mencoba koneksi database, sebelum assertion transaksi atau trigger dijalankan. Default suite sesudah perubahan: 6 lulus, 10 diskip, 1 gagal (`/ready` mengharapkan DB 200 tetapi DB tidak ada). Kegagalan tersebut adalah blocker lingkungan, bukan bukti pass/fail logika rollback.
- Karena itu belum ada bukti rollback aktual dari PostgreSQL. F-01 tetap OPEN untuk review closure sampai PostgreSQL tersedia dan happy-path serta ketiga fault-injection test lulus; jalankan juga seluruh suite Sprint 1.

## Disposisi review setelah perubahan

Perbaikan menunggu re-review independen. Checklist dan diff terbaru tersedia di `SPRINT-1-REVIEW-HANDOFF.md` dan `SPRINT-1-REVIEW.patch`. Tidak ada persetujuan reviewer baru atau acceptance project owner yang dicatat.

## Area tanpa temuan pada pemeriksaan ini

Tidak ditemukan temuan tambahan dalam pemeriksaan source terhadap opaque session token yang disimpan sebagai hash, validasi expiry/revocation/status saat autentikasi, cookie HttpOnly/SameSite dan CSRF per route mutasi, pemeriksaan role Admin deny-by-default, guard Admin aktif terakhir dengan isolation Serializable, hashing Argon2id, kebijakan bootstrap satu kali pada alur normal, parser status roster fail-closed, klaim registrasi unik dan transaksi pendaftaran, rollback import roster dan audit sukses dalam transaksinya, serta redaksi error log.

> Catatan: pernyataan di atas berarti tidak ditemukan masalah pada inspeksi yang dilakukan, bukan jaminan ketiadaan kerentanan. Jalur kegagalan dan kondisi DB tidak dapat dikonfirmasi lewat integrasi aktual pada sesi ini.

## Dependency Vitest

Perubahan dari Vitest 5.0.5 ke 4.1.12 tampak disengaja dan konsisten dengan alasan kompatibilitas Node 20 yang dicatat handoff; tidak ada temuan keamanan spesifik dari inspeksi manifest/lockfile. Test aktual menggunakan Vitest 4.1.12. Klaim audit nol kerentanan dan suite Node 20/13 dari handoff tidak direproduksi di sesi ini.

## Disposisi review

Hasil review awal: **PASS WITH FINDINGS**. Hasil ini bukan acceptance Sprint 1 atau persetujuan project owner. Lihat addendum 2026-11-05 untuk bukti verifikasi F-01 setelah finding diperbaiki.

## Addendum verifikasi F-01 — 2026-11-05

- Docker Desktop menunjukkan kontainer `lms-ptik-postgres` berstatus `Up ... (healthy)` dan memublikasikan `0.0.0.0:5432->5432/tcp`. Prisma read-only migration status tersambung ke `lms_ptik`, menemukan 3 migrasi, dan melaporkan schema up to date. Tidak ada migrasi dijalankan.
- Node 26.13.0/npm 11.20.0, `RUN_DB_INTEGRATION=1`: `npm run test -w @lms/api -- src/password-change.test.ts` lulus 4/4. Ini mencakup happy path dan kegagalan paksa di update user, revokasi sesi, serta insert audit; seluruh assertion rollback berjalan.
- Node 26.13.0/npm 11.20.0, `RUN_DB_INTEGRATION=1`: `npm test` lulus 3 berkas, 15 passed, 2 skipped, 0 failed. Satu skip bootstrap karena database sudah memiliki Admin; satu skip file roster resmi karena `OFFICIAL_ROSTER_CSV_PATH` tidak disetel.
- Node 20.20.2/Vitest 4.1.12, dengan PostgreSQL tersedia: tes lengkap gagal sebelum eksekusi karena worker fork keluar tak terduga (serial F-01: 1 worker error, 0 tests). Karena itu kompatibilitas suite Node 20 belum terbukti; build/typecheck/generate Node 20 yang tercatat sebelumnya tetap lulus.
- Typecheck dan production build seluruh workspace dijalankan ulang pada Node 20.20.2/npm 11.20.0 pada 2026-11-05 dan keduanya lulus. `npm ci` tidak diulang pada follow-up ini.
- F-01 implementasi kini memiliki bukti DB sukses dan rollback, tetapi tetap memerlukan re-review reviewer kedua. Node 20 suite dan re-review independen masih menjadi kriteria Sprint DoD yang terbuka. Keputusan akhir Sprint: **BLOCKED**, rekomendasi acceptance: **HOLD**.
- Prasyarat deployment tetap terpisah dari Sprint DoD: HTTPS/TLS, exact trusted origin/proxy dan Secure cookie wajib diverifikasi pada environment target; shared rate-limit store wajib sebelum deployment multi-process. Tidak ada uji produksi yang diklaim.

## Re-review independen — 2026-11-06

**Reviewer:** Yeremia Christopel Sihotang (reviewer independen, bukan pembuat perbaikan F-01)  
**Baseline:** `4bd8740`  
**Hasil akhir:** PASS — tidak ada temuan yang menghalangi DoD Sprint 1  
**Rekomendasi:** Sprint 1 COMPLETE

### F-02 — Logout tidak atomik dengan audit

**Severity:** Medium (P2)  
**Lokasi:** `apps/api/src/auth.ts`, handler `POST /auth/logout`  
**Temuan:** Pencabutan sesi dan insert audit dijalankan terpisah. Kegagalan insert audit dapat membuat endpoint mengembalikan 500 setelah sesi tidak berlaku.  
**Disposisi:** Diperbaiki pada 2026-11-06 dengan membungkus kedua operasi dalam satu `$transaction`.  
**Verifikasi:** Lulus pada PostgreSQL di Node 24.22.1 setelah perubahan: tes API terkait lulus 7 dengan 1 skip, termasuk fault injection yang membuktikan rollback ketika audit gagal; suite penuh lulus 16 dengan 2 skip. Node 20 post-change belum terverifikasi: log instalasi bersih mencatat kegagalan setup native argon2 (`AssignProcessToJobObject`, kode 87). Dependency yang berhasil dipasang reviewer menggunakan Node 24; binary argon2-nya crash saat dipakai Node 20, dan rebuild Node 20 tidak tersedia karena toolset C++ Visual Studio tidak ditemukan. Kegagalan worker Vitest Node 20 pada 5 Nov tetap tercatat sebagai bukti sebelumnya, tetapi tidak berhasil direproduksi dengan instalasi native Node 20 yang valid di sini. F-02 tertutup berdasarkan verifikasi Node 24; kompatibilitas suite Node 20 masih terbuka.

Review ini memeriksa implementasi saat ini terhadap baseline `4bd8740`, checklist, dan hasil tes PostgreSQL. F-01 memiliki bukti 4/4 tes targeted dan suite Node 26 15 lulus/2 skip; F-02 memiliki rollback PostgreSQL dan suite Node 24.22.1 16 lulus/2 skip. Hasil Node 20.20.2 yang disuplai tim lulus 19/19 tanpa skip, termasuk roster resmi dan alur API Argon2. Hasil reviewer akhir **PASS** dan Sprint 1 **COMPLETE**. Launcher end-to-end belum dijalankan dan tidak menghalangi DoD. Project owner mendelegasikan keputusan internal serta penerimaan sprint kepada tim.
