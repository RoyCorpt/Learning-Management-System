# Laporan Verifikasi Sprint 0

**Status: CONDITIONAL — belum layak produksi.** Build API, test Vitest, dan typecheck seluruh workspace lulus. PostgreSQL Docker kini dapat dijangkau di `localhost:5432`; `prisma migrate deploy` mendeteksi satu migrasi dan melaporkan tidak ada migrasi tertunda. Pembuatan Prisma Client gagal karena `EPERM` saat mengganti `query_engine-windows.dll.node`. Pemeriksaan endpoint belum berjalan karena proses API di lingkungan verifikasi gagal di `uv_os_get_passwd` sebelum startup. Audit registry juga belum berhasil.

## Perubahan fondasi

- Override `deepmerge-ts@^8` dihapus. Prisma `6.19.3` mendeklarasikan dependency langsung `deepmerge-ts@7.1.5`; memaksa major 8 melanggar dependency yang dinyatakan Prisma dan membuat `npm ls` menandai tree invalid. Gunakan pasangan versi yang dipatok Prisma sampai rilis Prisma yang kompatibel tersedia.
- Snapshot audit yang tersedia melaporkan advisory high pada `deepmerge-ts` melalui `@prisma/config` 6.19.3. Pemeriksaan `npm audit` saat finalisasi tidak dapat menghubungi endpoint registry, sehingga status advisory saat ini belum dapat dipastikan atau diselesaikan dengan upgrade aman. Ini adalah **blocker pra-produksi**: cek advisory terbaru dan upgrade Prisma dalam rentang kompatibel sebelum deployment; jangan override major secara paksa.
- Vitest hanya memasukkan `src/**/*.test.ts` dan `src/**/*.spec.ts`, serta mengecualikan `dist` dan `node_modules`.
- Build API mengecualikan file test dan spec agar tidak masuk ke `dist` produksi.
- `.gitignore` mengabaikan `.env`, semua `node_modules`, `dist`, log, dan `audit-report.json`, sambil tetap mengizinkan `.env.example`.

## Pemeriksaan tersisa

Laporan awal mencatat instalasi/registry gagal (`EAI_AGAIN`). Pada verifikasi lanjutan, `npm ping` gagal dengan `EACCES`. Build API, test API (1 file, 1 test), dan typecheck workspace lulus. Port PostgreSQL `localhost:5432` dapat dijangkau dan `prisma migrate deploy` menyatakan tidak ada migrasi tertunda. `prisma generate` gagal mengganti binary engine (`EPERM`); API tidak dapat dijalankan dari lingkungan ini karena Node gagal membaca info user OS (`uv_os_get_passwd`, `ENOMEM`), sehingga `/health` dan `/ready` belum disahkan. Selesaikan kedua kendala lingkungan tersebut sebelum menyatakan Sprint 0 PASS.

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
