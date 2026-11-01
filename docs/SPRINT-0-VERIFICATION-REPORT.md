# Laporan Verifikasi Sprint 0

**Status: CONDITIONAL — belum layak produksi.** Pada verifikasi lanjutan di Windows, build API dan test Vitest lulus. Test memerlukan izin menulis direktori sementara `.vite-temp` di `apps/api/node_modules`; percobaan awal diblokir (`EPERM`), lalu berhasil dengan izin yang sesuai. Docker CLI tidak tersedia di lingkungan ini. Typecheck, registry audit, migrasi PostgreSQL, dan pemeriksaan endpoint belum dapat disahkan.

## Perubahan fondasi

- Override `deepmerge-ts@^8` dihapus. Prisma `6.19.3` mendeklarasikan dependency langsung `deepmerge-ts@7.1.5`; memaksa major 8 melanggar dependency yang dinyatakan Prisma dan membuat `npm ls` menandai tree invalid. Gunakan pasangan versi yang dipatok Prisma sampai rilis Prisma yang kompatibel tersedia.
- Snapshot audit yang tersedia melaporkan advisory high pada `deepmerge-ts` melalui `@prisma/config` 6.19.3. Pemeriksaan `npm audit` saat finalisasi tidak dapat menghubungi endpoint registry, sehingga status advisory saat ini belum dapat dipastikan atau diselesaikan dengan upgrade aman. Ini adalah **blocker pra-produksi**: cek advisory terbaru dan upgrade Prisma dalam rentang kompatibel sebelum deployment; jangan override major secara paksa.
- Vitest hanya memasukkan `src/**/*.test.ts` dan `src/**/*.spec.ts`, serta mengecualikan `dist` dan `node_modules`.
- Build API mengecualikan file test dan spec agar tidak masuk ke `dist` produksi.
- `.gitignore` mengabaikan `.env`, semua `node_modules`, `dist`, log, dan `audit-report.json`, sambil tetap mengizinkan `.env.example`.

## Pemeriksaan tersisa

Laporan awal mencatat instalasi/registry gagal (`EAI_AGAIN`). Pada verifikasi lanjutan, `npm ping` gagal dengan `EACCES`, sedangkan Docker CLI tidak ditemukan. Build API berhasil dan test API lulus (1 file, 1 test) setelah izin direktori sementara diberikan. Typecheck, validasi/migrasi PostgreSQL, serta endpoint `/health` dan `/ready` belum disahkan. Jalankan rangkaian tersebut setelah akses registry dan PostgreSQL tersedia sebelum menyatakan Sprint 0 PASS.

## Risiko residual dan batas cakupan

- Advisory transitive Prisma di atas belum tertutup; dependency install lokal bukan bukti bahwa registry audit terbaru lulus.
- Database migration dan perilaku runtime belum diuji pada PostgreSQL.
- Item CR-01 sampai CR-09 tetap OPEN di `OPEN-DECISIONS.md`; jangan implementasikan fitur yang bergantung pada keputusan tersebut.
- Fitur yang belum dibangun: autentikasi/registrasi dan pemulihan akun, peran dan otorisasi, kelas/keanggotaan, materi, tugas dan pengumpulan, penilaian, notifikasi, unggah berkas, roster resmi/sinkronisasi, rate limiting dan alur CSRF, backup automation, serta deployment produksi.

## Langkah Sprint 1

1. Selesaikan keputusan CR yang menghalangi alur identitas dan akademik, lalu perbarui kebutuhan, diagram, backlog, dan kriteria penerimaan.
2. Verifikasi toolchain, build/typecheck/test, migrasi, dan health/readiness Sprint 0 pada lingkungan target; tutup advisory dependency menggunakan upgrade kompatibel yang tervalidasi.
3. Setelah CR-01/CR-02 disahkan, implementasikan irisan vertikal autentikasi dan provisioning akun dengan pengujian sesuai keputusan; jangan mengasumsikan algoritma hash atau alur akun.

## Git

Belum dibuat initial commit. Pemilik memberikan identitas `RoyCorpt <roymarthin454@gmail.com>`, tetapi penulisan `.git/config` ditolak izin filesystem pada lingkungan ini. Selain itu, direktori `diagnostics/` kini diabaikan agar log lingkungan tidak ikut commit. Initial commit dapat dibuat setelah izin Git tersedia dan berkas yang akan dilacak ditinjau.
