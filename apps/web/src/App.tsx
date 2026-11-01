const features = [
  { n: '01', title: 'Manajemen kelas', desc: 'Kelas ampuan, kode bergabung, dan keanggotaan mahasiswa.' },
  { n: '02', title: 'Materi pembelajaran', desc: 'Materi terstruktur berdasarkan kelas dan pertemuan.' },
  { n: '03', title: 'Tugas dan pengumpulan', desc: 'Distribusi tugas, tenggat, dan riwayat pengumpulan.' },
  { n: '04', title: 'Kuis dan penilaian', desc: 'Kuis pilihan ganda serta penilaian hasil belajar.' },
  { n: '05', title: 'Notifikasi dan agenda', desc: 'Pemberitahuan aktivitas dan daftar tenggat.' },
  { n: '06', title: 'Diskusi kelas', desc: 'Ruang diskusi sesuai hak akses kelas.' },
];

export default function App() {
  return <main className="shell">
    <nav className="nav"><div className="brand-mark">P</div><div className="brand">LMS <span>PTIK</span></div><div className="nav-note">LEARNING MANAGEMENT SYSTEM</div></nav>
    <section className="hero"><div className="eyebrow"><i /> PLATFORM PEMBELAJARAN TERPADU</div><h1>Belajar, mengajar,<br/><em>bertumbuh bersama.</em></h1><p className="intro">Satu ruang digital untuk mengelola kelas, materi, tugas, kuis, dan aktivitas akademik Program Studi PTIK.</p><div className="hero-actions"><a className="primary" href="#fitur">Jelajahi platform <span>↗</span></a><span className="status">Fondasi aplikasi · v0.2.0</span></div><div className="hero-art" aria-hidden="true"><div className="orb orb-one"/><div className="orb orb-two"/><div className="grid-lines"/><div className="art-label">LEARN / CREATE / GROW</div><div className="art-card"><div className="art-card-top"><span>RUANG BELAJAR</span><b>PTIK</b></div><div className="art-lines"><i/><i/><i/></div><div className="art-dot">✳</div></div></div></section>
    <section className="features" id="fitur"><div className="section-head"><div><div className="eyebrow">EKOSISTEM PEMBELAJARAN</div><h2>Semua proses,<br/><em>satu platform.</em></h2></div><p>Dirancang berdasarkan kebutuhan fungsional LMS Kampus PTIK. Fitur akan diimplementasikan bertahap sesuai prioritas MVP.</p></div><div className="feature-grid">{features.map(f=><article className="feature" key={f.n}><div className="feature-n">{f.n}</div><h3>{f.title}</h3><p>{f.desc}</p><span className="arrow">↗</span></article>)}</div></section>
    <footer><div className="brand">LMS <span>PTIK</span></div><span>Fondasi pengembangan · Belum terhubung ke layanan autentikasi atau database.</span><span>© 2026</span></footer>
  </main>;
}
