# Laporan Verifikasi Sprint 0

**Status: PASS untuk cakupan fondasi Sprint 0.** Ini bukan persetujuan produksi untuk LMS lengkap. Build, typecheck, test, audit dependency, generate Prisma, migrasi, serta health/readiness telah terverifikasi.

## Penyelesaian dan bukti

- `deepmerge-ts` dioverride ke `^8.0.2`, sedangkan `prisma` dan `@prisma/client` tetap `6.19.3`. Prisma 6.19.3 memakai export `deepmerge` dari dependency ini. Validasi kompatibilitas pada proyek: `npm ls prisma @prisma/config deepmerge-ts` menunjukkan versi tersebut terpasang; `prisma generate`, `prisma migrate deploy`, build, typecheck, dan test lulus. `npm audit` melaporkan **0 vulnerabilities**.
- `npm audit fix --dry-run` akan menurunkan Prisma 6.19.3 ke 6.12.0. Opsi itu tidak dipilih; override terarah menyelesaikan advisory tanpa downgrade Prisma.
- Vitest hanya mencari `src/**/*.test.ts` dan `src/**/*.spec.ts`, mengecualikan `dist` dan `node_modules`. TypeScript API mengecualikan test/spec sehingga file test tidak masuk ke artefak build.
- `npm run build` lulus untuk shared, API, dan web. `npm run typecheck` lulus untuk semua workspace. `npm test` lulus (1 file, 1 test).
- PostgreSQL Docker dapat dijangkau di `localhost:5432`; `prisma migrate deploy` melaporkan tidak ada migrasi tertunda. Prisma Client v6.19.3 berhasil digenerate.
- `/health` dan `/ready` telah diuji: keduanya HTTP 200; readiness menunjukkan database `ok`.
- `.gitignore` mengabaikan `.env`, `node_modules`, `dist`, audit report, diagnostic logs, dan `*.tsbuildinfo`; `.env.example` tetap dilacak.

## Risiko residual dan batas cakupan

- `OD-01` sampai `OD-09` tetap OPEN di `OPEN-DECISIONS.md` (sebelumnya memakai awalan `CR-`); fitur yang bergantung pada keputusan itu belum boleh dianggap disetujui.
- LMS bisnis belum dibangun: autentikasi/registrasi dan pemulihan akun, peran/otorisasi, kelas/keanggotaan, materi, tugas/pengumpulan, penilaian, notifikasi, unggah berkas, serta roster resmi/sinkronisasi.
- Rate limiting, alur CSRF, backup automation, deployment produksi, dan hardening operasional belum termasuk fondasi ini.
- Hasil audit berlaku pada dependency tree/lockfile yang diverifikasi saat laporan ini dibuat; ulangi audit saat dependency berubah dan sebelum deployment.

## Langkah Sprint 1

1. Tutup keputusan `OD` yang menghalangi alur identitas dan akademik; selaraskan kebutuhan, diagram, backlog, dan kriteria penerimaan.
2. Setelah `OD-01` dan `OD-02` disahkan, bangun irisan vertikal autentikasi/provisioning akun dengan algoritma hash dan alur yang telah diputuskan.
3. Tambahkan alur kelas dan akademik sesuai keputusan, lalu lengkapi pengujian, rate limiting/CSRF, backup, serta persiapan deployment pada sprint yang sesuai.

## Git

Perubahan Sprint 0 dan perbaikan dependency dicatat di history repository. `.env` dan artefak lokal tidak dilacak.
