import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import './classes.css';

type User = { id: string; email: string; fullName: string; role: 'ADMIN' | 'DOSEN' | 'MAHASISWA'; mustChangePassword?: boolean };
type ClassSummary = { id: string; name: string; description: string | null; status: 'OPEN' | 'CLOSED'; ownerId: string; createdAt: string };
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
function csrf() { return document.cookie.split('; ').find((v) => v.startsWith('lms_csrf='))?.split('=').slice(1).join('=') ?? ''; }
async function request(path: string, body?: unknown, method = 'POST') {
  const response = await fetch(`${API}${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(method !== 'GET' ? { 'X-CSRF-Token': decodeURIComponent(csrf()) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? data?.message ?? 'Permintaan gagal. Coba kembali.');
  return data;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch(`${API}/auth/me`, { credentials: 'include' }).then(async (r) => r.ok ? (await r.json()).user as User : null).then(setUser).catch(() => setUser(null)); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = Object.fromEntries(form.entries());
    try {
      if (mode === 'register') {
        const result = await request('/auth/register', body);
        setMessage(result.message); setMode('login'); formElement.reset();
      } else {
        const result = await request('/auth/login', body);
        setUser(result.user); formElement.reset();
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Permintaan gagal.'); }
    finally { setBusy(false); }
  }
  async function logout() { try { await request('/auth/logout', {}); setUser(null); setMessage('Anda telah keluar.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal keluar.'); } }
  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark" aria-hidden="true">P</span><span>LMS PTIK</span></a><span className="top-note">PORTAL PEMBELAJARAN</span></header>
    <section className={user ? 'auth-layout dashboard-layout' : 'auth-layout'}>
      {!user && <div className="welcome"><div className="eyebrow"><span /> RUANG BELAJAR PTIK</div><h1>Belajar dengan<br/><em>arah dan tujuan.</em></h1><p>Masuk untuk melanjutkan aktivitas pembelajaran Anda di Program Studi Pendidikan Teknik Informatika dan Komputer.</p><div className="welcome-rule"/><span className="welcome-caption">SATU RUANG UNTUK BERTUMBUH</span></div>}
      <section className="auth-card" aria-labelledby="form-title">
        <div className="card-kicker">AKUN LMS PTIK</div>
        {user ? <><h2 id="form-title">Selamat datang</h2><p className="card-intro">Anda masuk sebagai {user.role.toLowerCase()}.</p><div className="profile"><span className="avatar" aria-hidden="true">{user.fullName.slice(0,1).toUpperCase()}</span><div><strong>{user.fullName}</strong><span>{user.email}</span></div></div>{user.mustChangePassword && <ChangePassword email={user.email} onDone={(u) => setUser(u)} />}{!user.mustChangePassword && (user.role === 'DOSEN' || user.role === 'MAHASISWA') && <ClassManagement role={user.role} />}{user.role === 'ADMIN' && <AccountManagement /> }<button className="button secondary" onClick={logout}>Keluar dari akun</button></> : <>
          <div className="form-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setMessage(''); }}>Masuk</button><button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setMessage(''); }}>Daftar Mahasiswa</button></div>
          <h2 id="form-title">{mode === 'login' ? 'Masuk ke akun' : 'Buat akun mahasiswa'}</h2><p className="card-intro">{mode === 'login' ? 'Gunakan email kampus dan kata sandi Anda.' : 'Pendaftaran memerlukan data yang sesuai dengan roster kampus.'}</p>
          <form onSubmit={submit}>
            {mode === 'register' && <label>Nomor Induk Mahasiswa<input name="nim" autoComplete="off" required maxLength={30} /></label>}
            <label>Email kampus<input name="email" type="email" autoComplete="email" required maxLength={255} /></label>
            <label>Kata sandi<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 12 : 1} maxLength={200} /></label>
            {message && <div className="feedback" role="status">{message}</div>}
            <button className="button primary" disabled={busy}>{busy ? 'Memproses…' : mode === 'login' ? 'Masuk' : 'Kirim pendaftaran'}<span aria-hidden="true">→</span></button>
          </form>
          {mode === 'login' && <p className="help-note">Belum memiliki akses? Hubungi Admin LMS PTIK.</p>}
        </>}
        {user && message && <div className="feedback" role="status">{message}</div>}
      </section>
    </section>
    <footer className="footer"><span>LMS PTIK · Sistem pembelajaran kampus</span><span>© 2026</span></footer>
  </main>;
}

function ClassManagement({ role }: { role: 'DOSEN' | 'MAHASISWA' }) {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const statusRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [issuedCode, setIssuedCode] = useState<{ classId: string; code: string } | null>(null);
  const [memberLists, setMemberLists] = useState<Record<string, Array<{ userId: string; fullName: string; createdAt: string }>>>({});

  async function load(reset = true) {
    setLoading(true);
    try {
      const offset = reset ? 0 : classes.length;
      const result = await request(`/api/classes?limit=50&offset=${offset}`, undefined, 'GET') as { classes: ClassSummary[]; page: { hasMore: boolean } };
      setClasses((current) => reset ? result.classes : [...current, ...result.classes]);
      setHasMore(result.page.hasMore);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Daftar kelas gagal dimuat.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (message) statusRef.current?.focus(); }, [message]);

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); const formElement = event.currentTarget; const form = new FormData(formElement);
    try {
      await request('/api/classes', { name: form.get('name'), description: String(form.get('description') ?? '').trim() || null });
      formElement.reset(); setMessage('Kelas berhasil dibuat.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Kelas gagal dibuat.'); }
    finally { setBusy(false); }
  }
  async function joinClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); const formElement = event.currentTarget; const code = new FormData(formElement).get('invitationCode');
    try {
      await request('/api/classes/join', { invitationCode: code }); formElement.reset(); setMessage('Anda berhasil bergabung ke kelas.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Tidak dapat bergabung ke kelas.'); }
    finally { setBusy(false); }
  }
  async function saveClass(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault(); setBusy(true); setMessage(''); const form = new FormData(event.currentTarget);
    try {
      await request(`/api/classes/${id}`, { name: form.get('name'), description: String(form.get('description') ?? '').trim() || null }, 'PATCH');
      setEditingId(null); setMessage('Informasi kelas diperbarui.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Perubahan kelas gagal disimpan.'); }
    finally { setBusy(false); }
  }
  async function closeClass(id: string) {
    setBusy(true); setMessage('');
    try { await request(`/api/classes/${id}/close`, {}); setIssuedCode(null); setMessage('Kelas ditutup.'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Kelas gagal ditutup.'); }
    finally { setBusy(false); }
  }
  async function rotateCode(id: string) {
    setBusy(true); setMessage(''); setIssuedCode(null);
    try {
      const result = await request(`/api/classes/${id}/invitation-code`, {});
      setIssuedCode({ classId: id, code: result.invitationCode }); setMessage('Kode undangan baru hanya ditampilkan di sesi ini. Simpan di tempat aman.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Kode undangan gagal diterbitkan.'); }
    finally { setBusy(false); }
  }
  async function toggleMembers(id: string, button: HTMLButtonElement) {
    if (memberLists[id]) { setMemberLists((current) => { const next = { ...current }; delete next[id]; return next; }); requestAnimationFrame(() => button.focus()); return; }
    setBusy(true); setMessage('');
    try { const result = await request(`/api/classes/${id}/members?limit=100&offset=0`, undefined, 'GET'); setMemberLists((current) => ({ ...current, [id]: result.members })); requestAnimationFrame(() => button.focus()); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Daftar anggota gagal dimuat.'); }
    finally { setBusy(false); }
  }

  return <section className="class-panel" aria-labelledby="classes-title">
    <div className="class-panel-heading"><h3 id="classes-title">{role === 'DOSEN' ? 'Kelas yang Anda kelola' : 'Kelas saya'}</h3><button type="button" className="text-button" onClick={() => void load()} disabled={loading}>Muat ulang</button></div>
    {role === 'DOSEN' ? <form className="class-form" onSubmit={createClass}>
      <h4>Buat kelas</h4><label>Nama kelas<input name="name" minLength={1} required /></label><label>Deskripsi <span className="optional">(opsional)</span><textarea name="description" rows={2} /></label><button className="button primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Buat kelas'}</button>
    </form> : <form className="class-form" onSubmit={joinClass}>
      <h4>Gabung ke kelas</h4><label>Kode undangan<input name="invitationCode" autoComplete="off" minLength={43} maxLength={43} required /></label><button className="button primary" disabled={busy}>{busy ? 'Memproses…' : 'Gabung kelas'}</button>
    </form>}
    {message && <div ref={statusRef} tabIndex={-1} className="feedback" role="status" aria-live="polite">{message}</div>}
    {loading && classes.length === 0 ? <p className="class-empty" role="status">Memuat kelas…</p> : classes.length === 0 ? <p className="class-empty">{role === 'DOSEN' ? 'Belum ada kelas. Buat kelas pertama Anda.' : 'Belum ada kelas yang diikuti.'}</p> : <div className="class-list">
      {classes.map((item) => <article className="class-card" key={item.id}>
        <div className="class-card-heading"><div><h4>{item.name}</h4><p>{item.description || 'Tidak ada deskripsi.'}</p></div><span className={`class-status ${item.status.toLowerCase()}`}>{item.status === 'OPEN' ? 'Terbuka' : 'Ditutup'}</span></div>
        <p className="class-date">Dibuat {new Date(item.createdAt).toLocaleDateString('id-ID')}</p>
        {role === 'DOSEN' && <div className="class-actions">
          <button type="button" className="text-button" onClick={() => setEditingId(editingId === item.id ? null : item.id)}>Edit</button>
          {item.status === 'OPEN' && <><button type="button" className="text-button" disabled={busy} onClick={() => void rotateCode(item.id)}>{issuedCode?.classId === item.id ? 'Rotasi kode' : 'Buat kode'}</button><button type="button" className="text-button" disabled={busy} onClick={() => void closeClass(item.id)}>Tutup kelas</button></>}
          <button type="button" className="text-button" disabled={busy} onClick={(event) => void toggleMembers(item.id, event.currentTarget)}>{memberLists[item.id] ? 'Sembunyikan anggota' : 'Lihat anggota'}</button>
        </div>}
        {editingId === item.id && role === 'DOSEN' && <form className="class-form edit-class-form" onSubmit={(event) => void saveClass(event, item.id)}><label>Nama kelas<input name="name" defaultValue={item.name} required /></label><label>Deskripsi<textarea name="description" defaultValue={item.description ?? ''} rows={2} /></label><button className="button primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan perubahan'}</button></form>}
        {issuedCode?.classId === item.id && <div className="invitation-code"><span>Kode undangan · tampil satu kali</span><code>{issuedCode.code}</code></div>}
        {memberLists[item.id] && <ul className="member-list" aria-label={`Anggota ${item.name}`}>{memberLists[item.id].map((member) => <li key={member.userId}><span>{member.fullName}</span><time dateTime={member.createdAt}>{new Date(member.createdAt).toLocaleDateString('id-ID')}</time></li>)}</ul>}
      </article>)}
    </div>}
    {hasMore && <button type="button" className="button secondary load-more" disabled={loading} onClick={() => void load(false)}>{loading ? 'Memuat…' : 'Muat kelas lainnya'}</button>}
  </section>;
}

function ChangePassword({ email, onDone }: { email: string; onDone: (user: User) => void }) {
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); const formElement = event.currentTarget; const form = new FormData(formElement);
    try { const newPassword = String(form.get('newPassword')); await request('/auth/change-password', { currentPassword: form.get('currentPassword'), newPassword }); formElement.reset(); const result = await request('/auth/login', { email, password: newPassword }); onDone(result.user); setMessage('Kata sandi diperbarui. Silakan lanjutkan.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal mengganti kata sandi.'); }
    finally { setBusy(false); }
  }
  return <form className="change-form" onSubmit={submit}><h3>Perbarui kata sandi sementara</h3><label>Kata sandi sementara<input name="currentPassword" type="password" required /></label><label>Kata sandi baru<input name="newPassword" type="password" minLength={12} maxLength={200} required /></label>{message && <div className="feedback" role="status">{message}</div>}<button className="button primary" disabled={busy}>Simpan kata sandi</button></form>;
}

function AccountManagement() {
  const [users, setUsers] = useState<Array<User & { status: string }>>([]); const [message, setMessage] = useState('');
  const [section, setSection] = useState<'create' | 'roster' | 'accounts'>('create');
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [busy, setBusy] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  async function load() { try { const result = await request('/auth/admin/users', undefined, 'GET'); setUsers(result.users); } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal memuat akun.'); } }
  useEffect(() => { void load(); }, []);
  const sections = [
    { id: 'create', label: 'Buat akun Dosen' },
    { id: 'roster', label: 'Impor roster' },
    { id: 'accounts', label: 'Akun aktif' },
  ] as const;
  const visibleUsers = showAllAccounts ? users : users.filter((u) => u.status === 'ACTIVE');
  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % sections.length
      : event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); setSection(sections[next].id); tabRefs.current[next]?.focus();
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const formElement = event.currentTarget; const form = new FormData(formElement);
    try { const result = await request('/auth/admin/instructors', Object.fromEntries(form.entries())); formElement.reset(); setMessage(`Akun dibuat. Kata sandi awal (tampilkan sekali): ${result.temporaryPassword}. Berikan melalui saluran aman.`); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal membuat akun.'); }
    finally { setBusy(false); }
  }
  async function importRoster(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const formElement = event.currentTarget; const file = new FormData(formElement).get('roster');
    if (!(file instanceof File) || file.size === 0) { setMessage('Pilih file roster CSV terlebih dahulu.'); setBusy(false); return; }
    try { const result = await request('/auth/admin/roster/import', { csv: await file.text() }); formElement.reset(); setMessage(`Impor roster selesai: ${result.summary.rows} baris, ${result.summary.created} baru, ${result.summary.updated} diperbarui.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Impor roster gagal.'); }
    finally { setBusy(false); }
  }
  async function update(id: string, path: 'status'|'role', value: string) {
    try { const result = await request(`/auth/admin/users/${id}/${path}`, { [path]: value }, 'PATCH'); setMessage(result.temporaryPassword ? `Perubahan tersimpan. Kata sandi awal (tampilkan sekali): ${result.temporaryPassword}. Berikan melalui saluran aman.` : 'Perubahan akun tersimpan.'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal memperbarui akun.'); }
  }
  return <section className="admin-panel" aria-labelledby="admin-title">
    <div className="admin-panel-heading"><div><p className="section-kicker">ADMINISTRASI</p><h3 id="admin-title">Kelola akun kampus</h3></div><span className="admin-account-count">{users.length} akun</span></div>
    <div className="admin-tabs" role="tablist" aria-label="Navigasi administrasi akun">
      {sections.map((item, index) => <button key={item.id} ref={(element) => { tabRefs.current[index] = element; }} id={`admin-tab-${item.id}`} type="button" role="tab" aria-selected={section === item.id} aria-controls="admin-tabpanel" tabIndex={section === item.id ? 0 : -1} className="admin-tab" onClick={() => setSection(item.id)} onKeyDown={(event) => moveTab(event, index)}>{item.label}</button>)}
    </div>
    <div id="admin-tabpanel" className="admin-tabpanel" role="tabpanel" aria-labelledby={`admin-tab-${section}`} tabIndex={0}>
      {section === 'create' && <form className="admin-section-form" onSubmit={create}>
        <div><h4>Buat akun Dosen</h4><p>Admin membuat akun Dosen dan membagikan kata sandi awal melalui saluran aman.</p></div>
        <label>Nama lengkap<input name="fullName" required maxLength={150} /></label><label>Email<input name="email" type="email" required maxLength={255} /></label>
        <button className="button primary" disabled={busy}>{busy ? 'Membuat…' : 'Buat akun Dosen'}</button>
      </form>}
      {section === 'roster' && <form className="admin-section-form" onSubmit={importRoster}>
        <div><h4>Impor roster Mahasiswa</h4><p>Gunakan CSV roster kampus dengan kolom NIM, nama, email, dan status kelayakan.</p></div>
        <label>File roster<input name="roster" type="file" accept=".csv,text/csv" required /></label>
        <button className="button primary" disabled={busy}>{busy ? 'Mengimpor…' : 'Impor roster'}</button>
      </form>}
      {section === 'accounts' && <div className="admin-accounts">
        <div className="admin-accounts-toolbar"><div><h4>Akun aktif</h4><p>{visibleUsers.length} akun ditampilkan</p></div><label className="filter-option"><input type="checkbox" checked={showAllAccounts} onChange={(event) => setShowAllAccounts(event.target.checked)} /> Tampilkan semua status</label></div>
        <div className="account-table-scroll" role="region" aria-label={showAllAccounts ? 'Daftar akun semua status' : 'Daftar akun aktif'} tabIndex={0}>
          <table className="account-table"><caption className="visually-hidden">{showAllAccounts ? 'Semua akun beserta pengaturan peran dan status' : 'Akun aktif beserta pengaturan peran dan status'}</caption><thead><tr><th scope="col">Nama</th><th scope="col">Email</th><th scope="col">Peran</th><th scope="col">Status</th></tr></thead><tbody>
            {visibleUsers.map((u) => <tr key={u.id}><td className="account-name">{u.fullName}</td><td className="account-email">{u.email}</td><td><select id={`role-${u.id}`} aria-label={`Peran ${u.email}`} value={u.role} onChange={(event) => void update(u.id, 'role', event.target.value)}><option value="ADMIN">Admin</option><option value="DOSEN">Dosen</option><option value="MAHASISWA">Mahasiswa</option></select></td><td><select id={`status-${u.id}`} aria-label={`Status ${u.email}`} value={u.status} onChange={(event) => void update(u.id, 'status', event.target.value)}><option value="ACTIVE">Aktif</option><option value="INACTIVE">Nonaktif</option><option value="PENDING">Menunggu</option></select></td></tr>)}
          </tbody></table>
          {visibleUsers.length === 0 && <p className="class-empty">Belum ada akun aktif.</p>}
        </div>
      </div>}
    </div>
    {message && <div className="feedback admin-feedback" role="status" aria-live="polite">{message}</div>}
  </section>;
}
