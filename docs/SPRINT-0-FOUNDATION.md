# Sprint 0 — Fondasi Teknis LMS PTIK

## Tujuan
Menyediakan fondasi aplikasi yang dapat dikonfigurasi, diamati, terhubung ke PostgreSQL, dan memiliki baseline migrasi awal. Sprint ini belum mengimplementasikan autentikasi atau alur akademik.

## Cakupan implementasi
- Validasi environment saat proses API dimulai (Zod).
- Middleware keamanan dasar (Helmet, CORS berbasis origin, batas JSON 1 MB, cookie parser).
- Request ID dan log HTTP terstruktur tanpa merekam payload, cookie, token, atau kredensial.
- `GET /health` untuk status proses dan `GET /ready` untuk pemeriksaan koneksi database.
- Prisma Client singleton dan graceful shutdown.
- Migrasi PostgreSQL awal untuk `users` dan `student_roster`.

## Menjalankan secara lokal
1. Salin `.env.example` menjadi `.env`, lalu ganti nilai rahasia dengan nilai acak lokal.
2. Jalankan `docker compose up -d postgres`.
3. Jalankan `npm install`.
4. Jalankan `npm run db:generate` dan `npm run db:deploy`.
5. Jalankan `npm run dev`.
6. Periksa `http://localhost:4000/health` dan `http://localhost:4000/ready`.

## Batasan dan keputusan yang belum disahkan
- Migrasi ini hanya mencakup identitas pengguna dan roster mahasiswa; belum merupakan model data LMS lengkap.
- Argon2id masih keputusan sementara karena dokumen kebutuhan menyebut bcrypt. Autentikasi tidak boleh dibangun sebelum konflik ini disahkan melalui change request/rekam keputusan.
- Sumber resmi roster NIM/email mahasiswa dan aturan domain email kampus belum ditentukan.
- Batas unggah berkas 10 MB harus diuji terhadap batas platform deployment; API JSON 1 MB bukan batas unggah berkas.
- `GET /ready` mengungkap status dependensi secara minimal, tanpa detail koneksi.
- Belum ada rate limiting, CSRF flow, autentikasi, RBAC, endpoint bisnis, backup automation, atau deployment production.

## Kriteria penerimaan
- API gagal startup dengan pesan validasi yang jelas jika environment wajib tidak valid.
- `/health` merespons 200 tanpa bergantung pada database.
- `/ready` merespons 200 saat PostgreSQL dapat diakses dan 500 saat koneksi database gagal.
- Semua respons memiliki `X-Request-Id`.
- Log tidak berisi header Authorization, cookie, request body, password, atau secret.
- Migrasi dapat diterapkan pada database kosong dan menghasilkan dua tabel beserta unique constraint yang didefinisikan.
- Build, typecheck, dan test harus dijalankan di lingkungan dengan dependency terpasang sebelum Sprint 0 dinyatakan lulus.
