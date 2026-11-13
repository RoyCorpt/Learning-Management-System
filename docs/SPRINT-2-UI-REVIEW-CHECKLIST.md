# Checklist Review UI Sprint 2

Status: **hasil UI diterima tim untuk saat ini (2026-11-12)**. Review UI independen tambahan bukan blocker Sprint 2 berdasarkan keputusan terbaru tim. Tidak ada identitas reviewer individual atau skenario tambahan yang diklaim. Checklist ini dapat dipakai untuk review lanjutan bila tim menghendakinya; pengisi harus mencatat hasil aktual dan tidak mengisi atas nama reviewer lain.

## Ringkasan UI yang diterima tim

- Gutter samping lebih rapat; warna hijau dominan dengan panel/field putih sebagai kontras; ukuran teks utama diperbesar.
- Admin memiliki navigasi keyboard tiga bagian: Buat akun Dosen, Impor roster, Akun aktif.
- Akun aktif berbentuk tabel dengan heading kolom dan pembungkus scroll internal pada ponsel.
- Kelas ditampilkan sebagai grid 3 kolom pada laptop, 2 kolom pada tablet, dan 1 kolom pada ponsel.
- Pemeriksaan yang tercatat memakai fixture sintetis. Hasil aktual laptop/tablet/ponsel 360 px, navigasi keyboard, dan accessibility tree ada pada [SPRINT-2-ACCEPTANCE.md](SPRINT-2-ACCEPTANCE.md). Checklist di bawah hanya untuk review lanjutan; belum ada hasil retest tambahan yang dicatat.

## Data review

- Reviewer (bukan penulis UI): ______________________________
- Tanggal: ____________________
- Browser/versi dan OS: ______________________________________
- Perangkat nyata atau emulasi/viewport: _____________________
- Metode pembaca layar (jika tersedia): _____________________
- Hasil: ☐ Diterima ☐ Perlu perbaikan ☐ Belum dapat dinilai

## Checklist

| Area | Pemeriksaan reviewer | Hasil / bukti |
|---|---|---|
| Laptop/tablet/ponsel 360 px | Periksa Dosen/Admin; catat gutter, scroll horizontal halaman, grid card (3/2/1 kolom), pemotongan teks/tombol/tanggal, dan scroll tabel di dalam region. | |
| Tema dan tipografi | Pastikan dominasi hijau tetap memiliki kontras memadai pada teks, status, tombol, fokus, error, dan background putih. | |
| Navigasi Admin | Pastikan tiga tab jelas, bagian aktif dikenali, Arrow/Home/End menavigasi, Enter/Space mengaktifkan, Tab/Shift+Tab urut dan fokus terlihat. | |
| Tabel akun Dosen | Periksa heading Nama/Email/Peran/Status, nama aksesibel kontrol, dan akses kolom terakhir melalui scroll tabel pada viewport kecil tanpa scroll halaman. | |
| Grid kelas | Pastikan jumlah kolom sesuai viewport, nama/deskripsi panjang membungkus, status/tanggal/aksi tidak saling menimpa, dan tombol dapat dioperasikan dengan keyboard. | |
| Dosen | Buat kelas, edit metadata, terbitkan/rotasi kode, tampil/sembunyikan anggota, tutup kelas. Gunakan hanya fixture sintetis. | |
| Mahasiswa | Uji kode tidak valid dan kode sintetis valid; pastikan pesan dan daftar kelas terlihat. | |
| Tab / Shift+Tab | Pastikan urutan maju/mundur logis dan tidak ada kontrol yang dilewati atau perangkap fokus. | |
| Fokus | Pastikan fokus selalu terlihat; periksa fokus setelah submit berhasil/gagal, toggle anggota, kode diterbitkan, dan kelas ditutup. | |
| Enter / Space | Uji submit form dengan Enter dan tombol aksi dengan Space; pastikan tidak ada aktivasi tak sengaja. | |
| Nama/semantik | Periksa heading, label setiap field, nama tombol, status OPEN/CLOSED, dan pesan berhasil/gagal di accessibility tree atau pembaca layar. | |
| Pembaca layar | Bila tersedia, dengarkan nama field/tombol dan pengumuman status join berhasil/gagal; catat pembaca layar/browser. Jika tidak tersedia, catat keterbatasannya. | |
| Scope | Batasi temuan pada kriteria penerimaan fungsional/aksesibilitas. Kritik estetika dicatat sebagai usulan terpisah, bukan perubahan otomatis. | |

Jika pembaca layar tidak aktif, reviewer dapat memakai Windows Narrator (Win+Ctrl+Enter) atau pembaca layar yang sudah tersedia; jangan instal software baru hanya untuk review ini. Dengan aplikasi mock/fixture sintetis, navigasikan heading dan field, pastikan nama “Nama kelas”, “Deskripsi”, dan “Kode undangan” dibacakan, lalu picu join gagal/berhasil dan dengarkan pengumuman status. Catat browser, pembaca layar, dan apakah fokus tetap terlihat.

## Temuan dan keputusan

| ID | Keparahan / blocker? | Langkah reproduksi dan hasil aktual | Keputusan reviewer | Tindak lanjut / pemilik |
|---|---|---|---|---|
| — | — | — | — | — |

Catatan reviewer:

________________________________________________________________________

________________________________________________________________________

Persetujuan reviewer atas hasil (nama/tanggal): ______________________________
