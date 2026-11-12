# Catatan Penerimaan Sprint 2

**Tanggal catatan:** 2026-11-12<br>
**Keputusan tim:** Sprint 2 **selesai/diterima** berdasarkan implementasi dan bukti di bawah. Hasil uji UI diterima tim untuk saat ini. Penerimaan ini mempertahankan batas verifikasi database secara eksplisit dan bukan klaim kesiapan deployment multi-instance.

## Status sumber dokumentasi

- Di starter, `SPRINT-2-PLAN.md` tetap menjadi rencana historis dengan periode/kapasitas belum committed; status implementasi dan penerimaan terbaru ada di catatan ini.
- Repository review berisi baseline desain `docs/design/sprint-2/` yang berstatus proposal desain, bukan catatan implementasi. Baseline itu dipertahankan tanpa perubahan; tidak ada salinan database tim atau laporan eksekusi tambahan di sana.

## Bukti yang diterima

| Pemeriksaan | Hasil yang dicatat | Batas / keterangan |
|---|---|---|
| Migrasi pada database PostgreSQL kosong sementara | Lulus: seluruh migrasi diterapkan; enam tabel yang diperiksa kosong; tabel kelas/keanggotaan dan enum tersedia; status migrasi up-to-date. | Menggunakan database sementara terisolasi; database kerja tidak digunakan atau di-reset. |
| Migrasi upgrade dari baseline Sprint 1 yang direkonstruksi | Lulus: tiga migrasi Sprint 1 diterapkan terlebih dahulu, fixture sintetis dibuat, lalu migrasi Sprint 2 diterapkan; record sintetis auth/session/audit/roster yang diperiksa tetap ada; status migrasi up-to-date. | Ini salinan baseline yang dibangun ulang dari migrasi dengan fixture sintetis, **bukan salinan database Sprint 1 berisi milik tim**. Data aktual tim belum diuji. |
| Rollback audit Sprint 2 (terfokus) | Lulus: 1 tes; kegagalan insert audit membatalkan efek `CLASS_CREATED`, `CLASS_INVITATION_ROTATED`, `CLASS_JOIN_SUCCEEDED`, dan `CLASS_CLOSED`. | Tes opt-in dijalankan pada database terisolasi sementara. |
| Suite integrasi API Sprint 2 | 17 lulus, 2 dilewati, 0 kegagalan yang dilaporkan. | Tes yang dilewati tetap dihitung sebagai dilewati, bukan lulus. Hasil ini adalah laporan run integrasi yang diterima tim. |
| Suite tes standar | 7 lulus, 13 dilewati, 0 kegagalan yang dilaporkan. | Suite standar terpisah dari run integrasi API di atas; tes opt-in tetap dilewati dalam run standar. |
| Typecheck workspace (pemeriksaan lokal lanjutan) | Lulus untuk API, web, dan shared. | Dijalankan setelah UI S2-05 ditambahkan. |
| Build produksi web (pemeriksaan lokal lanjutan) | Lulus; Vite membangun 28 modul dan menghasilkan aset produksi. | Build menggunakan output sementara di bawah workspace. |
| Validasi OpenAPI Redocly | Spesifikasi valid; 1 peringatan `no-server-example-com` untuk `http://localhost:4000`. | Peringatan ini tidak membatalkan validasi; URL localhost dipertahankan untuk lingkungan development. |
| `git diff --check` | Lulus; tidak ditemukan whitespace error. | Git menampilkan pemberitahuan konversi LF/CRLF untuk sejumlah file Windows. |
| UI S2-05 pada viewport kecil | Dijalankan 2026-11-11 di browser in-app Codex (host Windows; engine/version browser tidak diekspos), ukuran emulasi 320×740 dan 360×780, dengan mock API lokal dan identitas/kelas/kode sintetis. Setelah koreksi lebar minimum, `scrollWidth == clientWidth` (320 px: 305/305 karena scrollbar vertikal; 360 px: 345/345); tidak ada scroll horizontal. Kelas panjang dan kode undangan membungkus; kontrol tetap terlihat dan dapat dioperasikan. Dosen: buat, edit, terbitkan kode (label berubah menjadi “Rotasi kode”), lihat/sembunyikan anggota, tutup kelas. Mahasiswa: join gagal lalu berhasil, kelas muncul pada daftar. | Ini verifikasi UI wiring dengan mock, bukan tes API/DB. Rotasi kode kedua dan perangkat fisik tidak diuji. Sebelum koreksi, body min-width 320 px menimbulkan overflow pada viewport 320; aturan minimum diperbaiki. |
| Keyboard/fokus | Tab/Shift+Tab diuji pada alur Dosen dan Mahasiswa; urutan kontrol logis dan dapat dibalik. Enter mengirim form buat/edit/join; Space membuka Edit, mengoperasikan penerbitan kode, daftar anggota, dan tutup kelas. Fokus terlihat pada kontrol dan status. Setelah pesan berhasil/gagal, fokus pindah ke status `role=status`/`aria-live=polite`; Tab berikutnya menuju kontrol berikutnya (Dosen: Edit; Mahasiswa: Keluar), sedangkan toggle anggota mempertahankan fokus pada tombol yang namanya berubah. | Browser AX tree diuji, bukan output audio pembaca layar. Temuan fokus hilang setelah submit dan toggle anggota diperbaiki, lalu diuji ulang. |
| Accessibility tree / label | Browser AX tree menampilkan heading H1–H4, field bernama “Nama kelas”, “Deskripsi”, “Kode undangan”, tombol dengan nama, dan pesan sukses/gagal. Status pesan terhubung ke live region `polite` dan menerima fokus programatik. | Narrator/NVDA/JAWS tidak tersedia/aktif di sesi ini; pengumuman suara belum diverifikasi. Checklist review manual tersedia di [SPRINT-2-UI-REVIEW-CHECKLIST.md](SPRINT-2-UI-REVIEW-CHECKLIST.md). |
| Re-run suite standar (2026-11-11) | Run ulang dengan gate integrasi di-set `0` gagal: 1 gagal, 6 lulus, 13 dilewati; `src/index.test.ts` timeout 5 detik pada uji `/ready`. | `/ready` menjalankan `SELECT 1` melalui `DATABASE_URL` dari konfigurasi dotenv. Karena larangan menggunakan database kerja, suite tidak diulang. Run ini tidak mengubah hasil standar 7 lulus/13 dilewati yang sudah diterima tim; tetapi run ulang ini mungkin telah mengirim query baca ke DB yang dikonfigurasi. Tidak ada migrasi, reset, atau write yang dijalankan. |
| Typecheck dan build setelah koreksi UI | Lulus: `npm run typecheck` untuk API/web/shared; Vite build produksi web menghasilkan 28 modul di direktori sementara terpisah. | Build output tidak ditulis ke `dist` yang telah ada atau `.tmp-build` proyek. |

Database sementara dan direktori sementara tes dibersihkan setelah pemeriksaan. Tidak ada pemeriksaan di atas yang menggunakan atau mereset database kerja.

## Cakupan Sprint 2 dan pemenuhan kriteria

- S2-01–S2-04: schema/migrasi, API kelas, kode undangan/join, daftar kelas/anggota, dan pembatasan akses selesai dan diterima berdasarkan bukti migrasi dan suite integrasi yang dicatat di atas.
- S2-05: UI Dosen/Mahasiswa dan temuan tampilan Admin diterima tim. Hasil pemeriksaan laptop/tablet/ponsel, keyboard, serta accessibility tree tercatat pada bagian retest UI. Pengumuman audio pembaca layar tidak diperiksa dan tidak diklaim.
- S2-06: dokumentasi kontrak, schema, keputusan, tes, dan batas verifikasi tersedia. Migrasi upgrade menggunakan baseline Sprint 1 replay dengan fixture sintetis; tim menerima batas ini. Itu bukan hasil uji pada salinan database Sprint 1 berisi milik tim.
- Tidak ada pekerjaan P0/P1 Sprint 2 yang belum selesai pada backlog terpilih. UI diterima tim untuk saat ini; retest independen tambahan tidak menjadi blocker penerimaan Sprint 2 berdasarkan keputusan terbaru tim. Tidak ada identitas reviewer atau skenario review yang tidak tercatat yang diklaim.
- Hasil rerun suite standar yang timeout pada `/ready` tetap dicatat sebagai kegagalan lingkungan sebelumnya; hasil standar yang diterima tim tetap 7 lulus/13 dilewati. Tidak ada rerun terhadap database kerja.

## Risiko operasional

Join rate limiter saat ini memakai penyimpanan in-memory per proses. Ini hanya membatasi percobaan pada satu proses API. **Shared rate-limit store wajib dikonfigurasi sebelum deployment multi-instance** agar batas percobaan berlaku konsisten lintas replica. Deployment produksi, termasuk HTTPS/origin/proxy, tetap perlu verifikasi terpisah.

## Retest UI dan keputusan penerimaan tim (2026-11-12)

Empat temuan penguji ditangani pada UI web: gutter dikurangi dan ruang laptop digunakan lebih penuh; warna hijau menjadi dominan dengan panel/field putih sebagai kontras; ukuran teks utama dinaikkan; navigasi Admin berisi tab **Buat akun Dosen**, **Impor roster**, dan **Akun aktif**; akun ditampilkan dalam tabel semantik; kelas ditampilkan sebagai card grid responsif. Perubahan hanya pada UI dan stylesheet, tanpa perubahan API/schema/migrasi atau otorisasi/perilaku bisnis Sprint 2. Kritik estetika tambahan tetap berupa usulan dan tidak menjadi redesain di luar temuan tersebut.

| Pemeriksaan | Hasil aktual | Batas |
|---|---|---|
| Laptop, 1366×768 | Dosen: 9 kelas tampil dalam 3 kolom; nama/deskripsi panjang membungkus dan card tidak memiliki scroll internal. Admin: tabel muat tanpa scroll tabel. `documentElement.scrollWidth` sama dengan `clientWidth` (1351 px, selisih viewport karena scrollbar vertikal). | Browser in-app Codex pada host Windows; engine/version tidak diekspos. |
| Tablet, 768×1024 | Dosen: grid 2 kolom. Admin: tiga tab terlihat dan dapat dipilih. Lebar dokumen 753 px sama dengan `clientWidth` (15 px scrollbar vertikal); tidak ada overflow horizontal halaman. | Emulasi viewport, bukan perangkat fisik. |
| Ponsel, 360×800 | Dosen: 1 kolom; sembilan card memiliki `scrollWidth == clientWidth` (245 px) dan halaman 345/345 px setelah scrollbar vertikal. Admin: tabel 700 px berada dalam region scroll 245 px; halaman tetap 345/345 px, sehingga scroll tabel terbatas pada pembungkusnya. Tidak ada pemotongan horizontal halaman. | Emulasi viewport, bukan perangkat fisik. Tabel harus digeser horizontal untuk kolom berikutnya. |
| Keyboard Admin | ArrowLeft dari tab Akun aktif memindahkan fokus dan seleksi ke Impor roster; Enter/Space pada tab mengaktifkan tab yang fokus. Fokus tab memiliki outline 3 px. Tab/Shift+Tab menelusuri kontrol dan region tabel; kontrol select memakai nama aksesibel Peran/Status beserta email. | Pemeriksaan browser keyboard, bukan alat pembaca layar. |
| Keyboard kartu kelas | Enter pada tombol Edit membuka form edit; Space menutupnya kembali. Tab tetap mengoperasikan tombol aksi native dan gaya `:focus-visible` disediakan pada tombol aksi. | Tidak menguji seluruh urutan panjang ke-9 card; review retest independen masih diminta. |
| Accessibility tree | Tree browser mengenali group/tab/tabpanel Admin, heading, tabel/caption, heading card, label form, tombol, select bernama, status kelas Terbuka/Ditutup, dan region scroll tabel. | Narrator/NVDA/JAWS tidak diaktifkan/tersedia pada sesi ini. Pengumuman audio belum teruji; pesan sukses/gagal tidak dipicu ulang pada pemeriksaan visual ini. |

Pemeriksaan awal ponsel menemukan overflow halaman akibat label aksesibilitas tersembunyi pada select tabel; select sekarang memakai `aria-label` eksplisit dan halaman kembali tanpa overflow. Screenshot juga menunjukkan tautan aksi card terlalu pucat; warna teks aksi pada card putih diperbaiki. Ini perubahan kriteria keterbacaan/aksesibilitas, bukan redesain estetika tambahan.

### Status review UI

Tim menerima hasil uji UI untuk saat ini. Tidak ada rincian reviewer independen atau skenario tambahan yang dicatat, sehingga tidak diklaim ada retest independen terpisah. Sesuai keputusan terbaru tim, ketiadaan retest UI terpisah bukan blocker Sprint 2. Checklist [SPRINT-2-UI-REVIEW-CHECKLIST.md](SPRINT-2-UI-REVIEW-CHECKLIST.md) menyimpan hasil/kriteria yang dapat dipakai jika tim mengadakan review lanjutan. Browser accessibility tree telah diperiksa; pembaca layar audio tidak tersedia dan tidak diklaim telah diuji.

### Build dan tes setelah perbaikan UI

- `npm run typecheck` — lulus untuk API, web, dan shared.
- `npm exec --workspace @lms/web -- vite build --configLoader runner --outDir <direktori-temporer>` — lulus, Vite membangun 29 modul. Output ditempatkan di `%TEMP%` dan tidak mengubah `dist` proyek.
- UI tidak memiliki script tes otomatis di `apps/web/package.json`; verifikasi UI di atas dilakukan manual pada browser dengan mock sintetis. Hasil yang telah diterima tetap: integrasi API 17 lulus/2 dilewati; rollback audit terfokus 1 lulus; suite standar 7 lulus/13 dilewati; Redocly valid dengan 1 peringatan localhost.
- `git diff --check` — lulus; pemberitahuan LF/CRLF tetap muncul pada sejumlah file yang sudah berubah.

Perubahan UI belum menghapus risiko shared rate limiter: penyimpanan in-memory per proses tetap harus diganti/ditambah shared store sebelum deployment multi-instance.

## Status akhir Sprint 2

Sprint 2 **selesai dan diterima tim** per 2026-11-12. Bukti dan hasil yang diterima tercatat di dokumen ini; tes yang dilewati tetap dilaporkan sebagai dilewati. Penerimaan migrasi dibatasi pada database kosong sementara dan baseline Sprint 1 yang dibangun ulang dengan fixture sintetis, bukan database aktual tim. Pengumuman audio pembaca layar tidak diuji. Shared store rate limiter, hardening/deployment produksi, dan validasi terhadap database aktual tim tetap di luar klaim penerimaan ini; karena itu sistem belum dinyatakan siap untuk deployment multi-instance/production.

## Persiapan pengelompokan Git

- Usulan kelompok Sprint 1: migrasi `20261101093445_auth_sessions_audit` dan `20261101093446_student_roster_eligibility_claim`; auth/bootstrap/roster dan tesnya; dokumen baseline Sprint 1. Kelompok ini masih bercampur pada file bersama dan perlu staging per hunk.
- Usulan kelompok Sprint 2: migrasi `20261108090000_sprint_2_classes_memberships`; `classes.ts`/tes/rollback; UI kelas/Admin (`App.tsx`, `main.tsx`, `classes.css`, `workspace.css`); catatan penerimaan Sprint 2, checklist UI, changelog, dan handoff kontrak Sprint 3.
- File lintas-scope (`schema.prisma`, `app.ts`, `index.test.ts`, `App.tsx`, `package*.json`, README, env/config, dan sebagian dokumen keputusan) harus dipilah per hunk/isi sebelum staging. `.env.example` yang berubah hanya berisi konfigurasi dan contoh placeholder; `.env` aktual tetap diabaikan. Tidak ada staging/commit yang dilakukan.
- Usulan pesan (hanya setelah anggota tim meninjau staged diff): `feat(auth): add Sprint 1 session and roster workflows`; `feat(classes): implement Sprint 2 class and membership workflows`; `docs: record Sprint 2 acceptance and Sprint 3 contract handoff`.
- Jangan masukkan `.env`, kredensial, kode undangan, data mahasiswa, folder `.tmp-build/`, atau output build. `.env` ter-ignore oleh `.gitignore`; `.tmp-build/` dipertahankan dan terabaikan melalui `.git/info/exclude`. Tetap hindari `git add -A`.
- Branch saat pemeriksaan: `codex/sprint-1-auth`; remote tidak terkonfigurasi. Tidak ada commit atau push.
