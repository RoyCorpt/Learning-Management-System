# Register Keputusan Terbuka dan Change Request — LMS PTIK

Dokumen ini mencegah keputusan teknis sementara berubah menjadi kebutuhan resmi tanpa persetujuan. Status awal seluruh item: **OPEN — perlu keputusan pemilik proyek/dosen pembimbing**.

| ID | Topik | Konflik/ketidakpastian | Dampak jika diputuskan sepihak | Tindakan sebelum implementasi |
|---|---|---|---|---|
| CR-01 | Hash password | Baseline kebutuhan menyebut bcrypt; rekomendasi audit menyebut Argon2id. | Perubahan NFR keamanan dan dependensi autentikasi. | Tetapkan algoritma, parameter, dan strategi migrasi hash secara tertulis. |
| CR-02 | Pembuatan akun dosen | Tahap B menyebut pendaftaran dosen menunggu admin; D-37–D-60 merekomendasikan akun dosen dibuat Admin. | Mengubah alur registrasi, use case, activity/sequence diagram, dan acceptance criteria. | Putuskan aktor yang membuat akun dosen dan status awal akun. |
| CR-03 | Keanggotaan kelas | Tahap B memberi opsi kode kelas atau penambahan manual; keputusan desain merekomendasikan kode kelas saja untuk MVP. | Mengubah use case dan hak akses Admin/Dosen. | Putuskan apakah Admin/Dosen boleh menambahkan mahasiswa secara manual. |
| CR-04 | Notifikasi FR-38 | Tahap B menandai notifikasi dalam aplikasi sebagai Must; catatan audit menunjukkan status belum konsisten di artefak turunan. | Risiko fitur Must tidak diuji atau terlewat. | Samakan FR, use case, backlog, dan test case. |
| CR-05 | Pengumpulan tugas FR-40 | Ada perbedaan penomoran/definisi bukti konfirmasi pengumpulan. | Pengumpulan dapat dianggap selesai tanpa bukti/status yang disyaratkan. | Tetapkan alur submit, timestamp, status, dan bukti penerimaan. |
| CR-06 | Durasi sprint | Tahap C tidak konsisten dengan ketentuan tugas MPTI tentang minimal tiga sprint dua minggu. | Baseline jadwal dan estimasi tidak dapat diaudit. | Konfirmasi aturan akademik dan revisi jadwal baseline. |
| CR-07 | Batas unggah | Kebutuhan menyebut berkas hingga 10 MB; batas request platform deployment perlu diverifikasi dan dapat lebih kecil. | Upload gagal di produksi meski lolos lokal. | Pilih object storage/private upload flow atau revisi batas; uji end-to-end. |
| CR-08 | Sumber roster mahasiswa | Sumber resmi NIM/email dan proses sinkronisasi belum ditentukan. | Validasi registrasi mahasiswa tidak dapat dijamin. | Tetapkan pemilik data, format impor, frekuensi pembaruan, dan prosedur koreksi. |
| CR-09 | Domain email kampus | Domain email resmi belum dikonfirmasi. | Verifikasi email dapat menolak pengguna sah atau menerima alamat yang tidak sah. | Konfirmasi domain resmi dari institusi; jangan hardcode tebakan. |

## Aturan pengendalian
1. Item OPEN bukan persetujuan desain.
2. Implementasi yang bergantung pada item OPEN harus ditahan atau diberi feature flag/prototipe yang tidak dianggap baseline.
3. Setiap keputusan harus mencatat pemilik keputusan, tanggal, alasan, dampak pada dokumen, dan versi artefak yang diperbarui.
4. Setelah disetujui, perbarui SRS/kebutuhan, use case, activity/sequence diagram, ERD, backlog, dan test case yang terdampak.

## Keputusan teknis lokal Sprint 0 (belum keputusan sponsor)
- Implementasi menggunakan React + TypeScript + Vite, Express + TypeScript, PostgreSQL + Prisma.
- CSS biasa dipertahankan pada scaffold; Tailwind tidak dikonfigurasi pada kode awal dan tidak boleh diasumsikan tersedia.
- Tabel awal hanya `users` dan `student_roster`; ini belum ERD final LMS.
