import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  API,
  clearAuthMemory,
  downloadFile,
  formatFileSize,
  readFileAsAttachment,
  request,
  type Assignment,
  type AttachmentPayload,
  type ClassSummary,
  type Material,
  type RosterSubmissionItem,
  type SubmissionRecord,
  type Topic,
  type User,
} from './lib/api.ts';
import { QuizzesSection } from './components/QuizzesSection.tsx';
import { GradesSection } from './components/GradesSection.tsx';
import { AnnouncementsPanel, ForumPanel } from './components/CommunicationSection.tsx';
import { NotificationBell, ProfileBanner, RoleSummaryDashboard } from './components/DashboardAndProfile.tsx';
import { ExpandableAnswerText } from './components/ExpandableAnswerText.tsx';
import './classes.css';

type WorkspaceTab = 'materials' | 'assignments' | 'quizzes' | 'announcements' | 'forum' | 'grades';
type NavigationTarget = { classId: string; tab: WorkspaceTab; nonce: number };

function parseTargetUrl(targetUrl: string): NavigationTarget | null {
  const match = targetUrl.match(/^\/classes\/([0-9a-f-]+)(?:\/([a-z-]+))?/i);
  if (!match) return null;
  const classId = match[1]!;
  const rawTab = (match[2] ?? 'materials').toLowerCase();
  const tab: WorkspaceTab =
    rawTab === 'assignments' ||
    rawTab === 'quizzes' ||
    rawTab === 'announcements' ||
    rawTab === 'forum' ||
    rawTab === 'grades'
      ? rawTab
      : 'materials';
  return { classId, tab, nonce: Date.now() };
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [navTarget, setNavTarget] = useState<NavigationTarget | null>(null);
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);
  const [adminRefreshKey, setAdminRefreshKey] = useState(0);
  const [inWorkspace, setInWorkspace] = useState(false);
  const [homeSignal, setHomeSignal] = useState(0);
  const [dosenView, setDosenView] = useState<'classes' | 'summary'>('classes');
  const dosenTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [logoFailed, setLogoFailed] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = window.localStorage.getItem('sintaks-theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem('sintaks-theme', theme);
    } catch {
      // ignore storage errors
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#131a17' : '#277954');
    }
  }, [theme]);

  useEffect(() => {
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then(async (r) => (r.ok ? ((await r.json()).user as User) : null))
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = Object.fromEntries(form.entries());
    try {
      if (mode === 'register') {
        const result = await request('/auth/register', body);
        setMessage(result.message);
        setMode('login');
        formElement.reset();
      } else {
        const result = await request('/auth/login', body);
        setUser(result.user);
        formElement.reset();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Permintaan gagal.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await request('/auth/logout', {});
      clearAuthMemory();
      setUser(null);
      setNavTarget(null);
      setInWorkspace(false);
      setDosenView('classes');
      setMessage('Anda telah keluar.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal keluar.');
    }
  }

  function handleNavigate(targetUrl: string) {
    const parsed = parseTargetUrl(targetUrl);
    if (parsed) {
      if (user?.role === 'DOSEN') {
        setDosenView('classes');
      }
      setNavTarget(parsed);
    }
  }

  function returnToDashboard() {
    setNavTarget(null);
    setHomeSignal((n) => n + 1);
  }

  function moveDosenTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const views: Array<'classes' | 'summary'> = ['classes', 'summary'];
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % views.length
        : event.key === 'ArrowLeft'
          ? (index + views.length - 1) % views.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? views.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    setDosenView(views[next]!);
    dosenTabRefs.current[next]?.focus();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a
            className="brand"
            href="/"
            onClick={(e) => {
              if (user) {
                e.preventDefault();
                returnToDashboard();
              }
            }}
          >
            <span className="brand-mark">
              {logoFailed ? (
                <span aria-hidden="true">S</span>
              ) : (
                <img
                  src="/assets/Logo_Website_SINTAKS_fix_07745e85.png"
                  alt="Logo SINTAKS"
                  className="brand-logo-img"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoFailed(true)}
                />
              )}
            </span>
            <span className="brand-text">
              <span className="brand-name">SINTAKS</span>
              <span className="brand-sub">Portal Pembelajaran</span>
            </span>
          </a>

          <div className="topbar-right">
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              aria-pressed={theme === 'dark'}
              aria-label={theme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
              title={theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
            >
              {theme === 'dark' ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              <span className="theme-toggle-label">{theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}</span>
            </button>
            {user && !user.mustChangePassword && <NotificationBell onNavigate={handleNavigate} />}
            {user && inWorkspace && (
              <button
                type="button"
                className="button secondary topbar-dash-btn"
                onClick={returnToDashboard}
              >
                Dasbor
              </button>
            )}
            {user && <span className="topbar-user-name">{user.fullName}</span>}
          </div>
        </div>
      </header>

      <main className={user ? 'page-main' : 'page-main page-main--auth'}>
        {!user ? (
          <section className="auth-layout">
            <div className="welcome">
              <h1>
                Belajar dengan
                <br />
                arah dan tujuan.
              </h1>
              <p>
                Masuk untuk melanjutkan aktivitas pembelajaran, tugas, kuis daring, dan diskusi kelas
                Anda di platform akademik SINTAKS.
              </p>
              <div className="welcome-rule" />
              <p className="welcome-statement">Satu ruang akademik untuk bertumbuh.</p>
            </div>

            <section className="auth-card" aria-labelledby="form-title">
              <div className="form-tabs">
                <button
                  type="button"
                  className={mode === 'login' ? 'active' : ''}
                  onClick={() => {
                    setMode('login');
                    setMessage('');
                  }}
                >
                  Masuk
                </button>
                <button
                  type="button"
                  className={mode === 'register' ? 'active' : ''}
                  onClick={() => {
                    setMode('register');
                    setMessage('');
                  }}
                >
                  Daftar Mahasiswa
                </button>
              </div>
              <h2 id="form-title">{mode === 'login' ? 'Masuk ke akun' : 'Buat akun mahasiswa'}</h2>
              <p className="card-intro">
                {mode === 'login'
                  ? 'Gunakan email kampus dan kata sandi Anda.'
                  : 'Pendaftaran memerlukan data yang sesuai dengan roster kampus.'}
              </p>
              <form onSubmit={submit}>
                {mode === 'register' && (
                  <label>
                    Nomor Induk Mahasiswa
                    <input name="nim" autoComplete="off" required maxLength={30} />
                  </label>
                )}
                <label>
                  Email kampus
                  <input name="email" type="email" autoComplete="email" required maxLength={255} />
                </label>
                <label>
                  Kata sandi
                  <input
                    name="password"
                    type="password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                    minLength={mode === 'register' ? 12 : 1}
                    maxLength={200}
                  />
                </label>
                {message && (
                  <div className="feedback" role="status">
                    {message}
                  </div>
                )}
                <button className="button primary" disabled={busy}>
                  {busy ? 'Memproses…' : mode === 'login' ? 'Masuk' : 'Kirim pendaftaran'}
                </button>
              </form>
              {mode === 'login' && (
                <p className="help-note">Belum memiliki akses? Hubungi Admin SINTAKS.</p>
              )}
            </section>
          </section>
        ) : (
          <div className="dashboard-stack">
            {!inWorkspace && (
              <ProfileBanner
                user={user}
                onUserUpdated={(updated) => setUser(updated)}
                onLogout={() => void logout()}
              />
            )}

            {message && (
              <div className="feedback" role="status">
                {message}
              </div>
            )}

            {user.mustChangePassword ? (
              <ChangePassword email={user.email} onDone={(u) => setUser(u)} />
            ) : (
              <>
                {!inWorkspace && user.role === 'DOSEN' && (
                  <div className="dosen-view-tabs" role="tablist" aria-label="Halaman dasbor dosen">
                    {(
                      [
                        { id: 'classes', label: 'Kelola Kelas' },
                        { id: 'summary', label: 'Ringkasan Kelas' },
                      ] as const
                    ).map((item, index) => (
                      <button
                        key={item.id}
                        ref={(el) => {
                          dosenTabRefs.current[index] = el;
                        }}
                        id={`dosen-tab-${item.id}`}
                        type="button"
                        role="tab"
                        aria-selected={dosenView === item.id}
                        aria-controls={`dosen-tabpanel-${item.id}`}
                        tabIndex={dosenView === item.id ? 0 : -1}
                        className="dosen-view-tab"
                        onClick={() => setDosenView(item.id)}
                        onKeyDown={(event) => moveDosenTab(event, index)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}

                {!inWorkspace && (user.role !== 'DOSEN' || dosenView === 'summary') && (
                  <div
                    id={user.role === 'DOSEN' ? 'dosen-tabpanel-summary' : undefined}
                    role={user.role === 'DOSEN' ? 'tabpanel' : undefined}
                    aria-labelledby={user.role === 'DOSEN' ? 'dosen-tab-summary' : undefined}
                    tabIndex={user.role === 'DOSEN' ? 0 : undefined}
                  >
                    <RoleSummaryDashboard
                      role={user.role}
                      userFullName={user.fullName}
                      refreshKey={summaryRefreshKey}
                      onNavigate={handleNavigate}
                      onOpenClass={(classId) => handleNavigate(`/classes/${classId}/materials`)}
                      onManageClasses={
                        user.role === 'DOSEN' ? () => setDosenView('classes') : undefined
                      }
                      onAccountUpdated={() => setAdminRefreshKey((k) => k + 1)}
                    />
                  </div>
                )}

                {(user.role === 'DOSEN' || user.role === 'MAHASISWA') && (
                  <div
                    id={user.role === 'DOSEN' && !inWorkspace ? 'dosen-tabpanel-classes' : undefined}
                    role={user.role === 'DOSEN' && !inWorkspace ? 'tabpanel' : undefined}
                    aria-labelledby={
                      user.role === 'DOSEN' && !inWorkspace ? 'dosen-tab-classes' : undefined
                    }
                    hidden={user.role === 'DOSEN' && !inWorkspace && dosenView !== 'classes'}
                  >
                    <ClassManagement
                      currentUser={user}
                      navTarget={navTarget}
                      homeSignal={homeSignal}
                      onClearNavTarget={() => setNavTarget(null)}
                      onWorkspaceActiveChange={setInWorkspace}
                      onWorkspaceChanged={() => setSummaryRefreshKey((k) => k + 1)}
                      onOpenSummary={
                        user.role === 'DOSEN' ? () => setDosenView('summary') : undefined
                      }
                    />
                  </div>
                )}

                {user.role === 'ADMIN' && (
                  <AccountManagement
                    refreshKey={adminRefreshKey}
                    onAccountsChanged={() => setSummaryRefreshKey((k) => k + 1)}
                  />
                )}
              </>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <div className="footer-meta">
          <span className="footer-brand">SINTAKS</span>
          <span>Sistem pembelajaran kampus</span>
        </div>
        <span className="num">© 2026</span>
      </footer>
    </div>
  );
}

function ClassManagement({
  currentUser,
  navTarget,
  homeSignal,
  onClearNavTarget,
  onWorkspaceActiveChange,
  onWorkspaceChanged,
  onOpenSummary,
}: {
  currentUser: User;
  navTarget: NavigationTarget | null;
  homeSignal: number;
  onClearNavTarget: () => void;
  onWorkspaceActiveChange: (active: boolean) => void;
  onWorkspaceChanged: () => void;
  onOpenSummary?: () => void;
}) {
  const role = currentUser.role as 'DOSEN' | 'MAHASISWA';
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const statusRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [issuedCode, setIssuedCode] = useState<{ classId: string; code: string } | null>(null);
  const [memberLists, setMemberLists] = useState<
    Record<string, Array<{ userId: string; fullName: string; createdAt: string }>>
  >({});
  const [selectedClass, setSelectedClass] = useState<ClassSummary | null>(null);
  const [requestedTab, setRequestedTab] = useState<{ tab: WorkspaceTab; nonce: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'status'>('newest');

  const visibleClasses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? classes.filter(
          (item) =>
            item.name.toLowerCase().includes(query) ||
            (item.description ?? '').toLowerCase().includes(query),
        )
      : classes;

    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, 'id', { sensitivity: 'base' });
      }
      if (sortBy === 'status') {
        if (a.status !== b.status) {
          return a.status === 'OPEN' ? -1 : 1;
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [classes, searchQuery, sortBy]);

  async function load(reset = true): Promise<ClassSummary[]> {
    setLoading(true);
    try {
      const offset = reset ? 0 : classes.length;
      const result = (await request(`/api/classes?limit=50&offset=${offset}`, undefined, 'GET')) as {
        classes: ClassSummary[];
        page: { hasMore: boolean };
      };
      setClasses((current) => (reset ? result.classes : [...current, ...result.classes]));
      setHasMore(result.page.hasMore);
      return result.classes;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Daftar kelas gagal dimuat.');
      return [];
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    onWorkspaceActiveChange(Boolean(selectedClass));
  }, [selectedClass, onWorkspaceActiveChange]);

  useEffect(() => {
    if (homeSignal > 0 && selectedClass) {
      setSelectedClass(null);
      setRequestedTab(null);
      void load();
    }
  }, [homeSignal]);

  useEffect(() => {
    if (message) statusRef.current?.focus();
  }, [message]);

  useEffect(() => {
    if (!navTarget) return;
    const found = classes.find((c) => c.id === navTarget.classId);
    if (found) {
      setSelectedClass(found);
      setRequestedTab({ tab: navTarget.tab, nonce: navTarget.nonce });
      onClearNavTarget();
    } else if (!loading) {
      void load(true).then((fresh) => {
        const match = fresh.find((c) => c.id === navTarget.classId);
        if (match) {
          setSelectedClass(match);
          setRequestedTab({ tab: navTarget.tab, nonce: navTarget.nonce });
        }
        onClearNavTarget();
      });
    }
  }, [navTarget?.nonce, classes.length]);

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await request('/api/classes', {
        name: form.get('name'),
        description: String(form.get('description') ?? '').trim() || null,
      });
      formElement.reset();
      setMessage('Kelas berhasil dibuat.');
      onWorkspaceChanged();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kelas gagal dibuat.');
    } finally {
      setBusy(false);
    }
  }

  async function joinClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const formElement = event.currentTarget;
    const code = new FormData(formElement).get('invitationCode');
    try {
      await request('/api/classes/join', { invitationCode: code });
      formElement.reset();
      setMessage('Anda berhasil bergabung ke kelas.');
      onWorkspaceChanged();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tidak dapat bergabung ke kelas.');
    } finally {
      setBusy(false);
    }
  }

  async function saveClass(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    try {
      await request(
        `/api/classes/${id}`,
        { name: form.get('name'), description: String(form.get('description') ?? '').trim() || null },
        'PATCH',
      );
      setEditingId(null);
      setMessage('Informasi kelas diperbarui.');
      onWorkspaceChanged();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Perubahan kelas gagal disimpan.');
    } finally {
      setBusy(false);
    }
  }

  async function closeClass(id: string) {
    setBusy(true);
    setMessage('');
    try {
      await request(`/api/classes/${id}/close`, {});
      setIssuedCode(null);
      setMessage('Kelas ditutup.');
      onWorkspaceChanged();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kelas gagal ditutup.');
    } finally {
      setBusy(false);
    }
  }

  async function rotateCode(id: string) {
    setBusy(true);
    setMessage('');
    setIssuedCode(null);
    try {
      const result = await request(`/api/classes/${id}/invitation-code`, {});
      setIssuedCode({ classId: id, code: result.invitationCode });
      setMessage('Kode undangan baru hanya ditampilkan di sesi ini. Simpan di tempat aman.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kode undangan gagal diterbitkan.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleMembers(id: string, button: HTMLButtonElement) {
    if (memberLists[id]) {
      setMemberLists((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      requestAnimationFrame(() => button.focus());
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const result = await request(`/api/classes/${id}/members?limit=100&offset=0`, undefined, 'GET');
      setMemberLists((current) => ({ ...current, [id]: result.members }));
      requestAnimationFrame(() => button.focus());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Daftar anggota gagal dimuat.');
    } finally {
      setBusy(false);
    }
  }

  if (selectedClass) {
    return (
      <ClassWorkspace
        classItem={selectedClass}
        currentUser={currentUser}
        requestedTab={requestedTab}
        onWorkspaceChanged={onWorkspaceChanged}
        onBack={() => {
          setSelectedClass(null);
          setRequestedTab(null);
          void load();
        }}
      />
    );
  }

  return (
    <section className="class-panel" aria-labelledby="classes-title">
      <div className="class-panel-heading">
        <div>
          <h3 id="classes-title">{role === 'DOSEN' ? 'Kelas yang Anda kelola' : 'Kelas yang Diikuti'}</h3>
          <p className="section-deck">
            {role === 'DOSEN'
              ? 'Kelola ruang kelas, kode undangan mahasiswa, dan materi perkuliahan aktif.'
              : 'Akses ruang kelas, materi kuliah, tugas, kuis, dan rekap nilai Anda.'}
          </p>
        </div>
        <div className="workspace-item-actions">
          {role === 'DOSEN' && onOpenSummary && (
            <button
              type="button"
              className="button secondary inline-btn"
              onClick={onOpenSummary}
            >
              Ringkasan kelas
            </button>
          )}
          <button
            type="button"
            className="button secondary inline-btn"
            onClick={() => void load()}
            disabled={loading}
          >
            Muat ulang
          </button>
        </div>
      </div>

      {role === 'DOSEN' ? (
        <form className="class-form subtle-form" onSubmit={createClass}>
          <h4>Buat kelas baru</h4>
          <div className="class-create-row">
            <label>
              Nama kelas
              <input name="name" minLength={1} required />
            </label>
            <label>
              Deskripsi <span className="optional">(opsional)</span>
              <input name="description" maxLength={500} />
            </label>
            <div className="class-create-action">
              <button className="button primary inline-btn" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Buat kelas'}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <form className="class-form subtle-form" onSubmit={joinClass}>
          <h4>Gabung ke kelas baru</h4>
          <div className="class-join-row">
            <label>
              Kode undangan (43 karakter dari dosen)
              <input name="invitationCode" autoComplete="off" minLength={43} maxLength={43} required />
            </label>
            <div className="class-join-action">
              <button className="button primary inline-btn" disabled={busy}>
                {busy ? 'Memproses…' : 'Gabung kelas'}
              </button>
            </div>
          </div>
        </form>
      )}

      {message && (
        <div ref={statusRef} tabIndex={-1} className="feedback" role="status" aria-live="polite">
          {message}
        </div>
      )}

      <div className="class-toolbar" role="search" aria-label="Pencarian dan pengurutan kelas">
        <label className="field-label class-search-field">
          Cari kelas
          <input
            type="search"
            className="sintaks-input"
            placeholder="Cari berdasarkan nama atau deskripsi kelas…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            maxLength={120}
          />
        </label>
        <label className="field-label class-sort-field">
          Urutkan
          <select
            className="sintaks-select"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as 'newest' | 'name' | 'status')}
          >
            <option value="newest">Terbaru dibuat</option>
            <option value="name">Nama (A hingga Z)</option>
            <option value="status">Status (Terbuka dulu)</option>
          </select>
        </label>
      </div>

      {searchQuery.trim() && classes.length > 0 && (
        <p className="class-filter-meta" aria-live="polite">
          Menampilkan {visibleClasses.length} dari {classes.length} kelas
        </p>
      )}

      {loading && classes.length === 0 ? (
        <p className="class-empty" role="status">
          Memuat kelas…
        </p>
      ) : classes.length === 0 ? (
        <p className="class-empty">
          {role === 'DOSEN' ? 'Belum ada kelas. Buat kelas pertama Anda.' : 'Belum ada kelas yang diikuti.'}
        </p>
      ) : visibleClasses.length === 0 ? (
        <div className="class-empty" role="status">
          Tidak ada kelas yang sesuai dengan pencarian &ldquo;{searchQuery.trim()}&rdquo;.
          <div className="class-empty-actions">
            <button
              type="button"
              className="button secondary inline-btn"
              onClick={() => setSearchQuery('')}
            >
              Reset pencarian
            </button>
          </div>
        </div>
      ) : (
        <div className="class-list">
          {visibleClasses.map((item) => (
            <article className="class-card" key={item.id}>
              <div className="class-card-top">
                <time className="class-date" dateTime={item.createdAt}>
                  Dibuat {new Date(item.createdAt).toLocaleDateString('id-ID')}
                </time>
                <span className={`class-status ${item.status.toLowerCase()}`}>
                  {item.status === 'OPEN' ? 'Terbuka' : 'Ditutup'}
                </span>
              </div>

              <div>
                <h4>{item.name}</h4>
                <p className="class-card-desc">{item.description || 'Tidak ada deskripsi.'}</p>
              </div>

              <div className="class-actions">
                <button
                  type="button"
                  className="text-button workspace-open-link"
                  onClick={() => setSelectedClass(item)}
                >
                  Buka ruang kelas
                </button>
                {role === 'DOSEN' && (
                  <>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                    >
                      Edit
                    </button>
                    {item.status === 'OPEN' && (
                      <>
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy}
                          onClick={() => void rotateCode(item.id)}
                        >
                          {issuedCode?.classId === item.id ? 'Rotasi kode' : 'Buat kode'}
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          disabled={busy}
                          onClick={() => void closeClass(item.id)}
                        >
                          Tutup kelas
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={(event) => void toggleMembers(item.id, event.currentTarget)}
                    >
                      {memberLists[item.id] ? 'Sembunyikan anggota' : 'Lihat anggota'}
                    </button>
                  </>
                )}
              </div>

              {editingId === item.id && role === 'DOSEN' && (
                <form
                  className="class-form subtle-form"
                  onSubmit={(event) => void saveClass(event, item.id)}
                >
                  <label>
                    Nama kelas
                    <input name="name" defaultValue={item.name} required />
                  </label>
                  <label>
                    Deskripsi
                    <textarea name="description" defaultValue={item.description ?? ''} rows={2} />
                  </label>
                  <button className="button primary inline-btn" disabled={busy}>
                    {busy ? 'Menyimpan…' : 'Simpan perubahan'}
                  </button>
                </form>
              )}

              {issuedCode?.classId === item.id && (
                <div className="invitation-code">
                  <span>Kode undangan (tampil satu kali)</span>
                  <code>{issuedCode.code}</code>
                </div>
              )}

              {memberLists[item.id] && (
                <ul className="member-list" aria-label={`Anggota ${item.name}`}>
                  {memberLists[item.id].map((member) => (
                    <li key={member.userId}>
                      <span>{member.fullName}</span>
                      <time dateTime={member.createdAt}>
                        {new Date(member.createdAt).toLocaleDateString('id-ID')}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          className="button secondary load-more"
          disabled={loading}
          onClick={() => void load(false)}
        >
          {loading ? 'Memuat…' : 'Muat kelas lainnya'}
        </button>
      )}
    </section>
  );
}

function ClassWorkspace({
  classItem,
  currentUser,
  requestedTab,
  onWorkspaceChanged,
  onBack,
}: {
  classItem: ClassSummary;
  currentUser: User;
  requestedTab: { tab: WorkspaceTab; nonce: number } | null;
  onWorkspaceChanged: () => void;
  onBack: () => void;
}) {
  const role = currentUser.role as 'DOSEN' | 'MAHASISWA';
  const [tab, setTab] = useState<WorkspaceTab>(requestedTab?.tab ?? 'materials');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [materialType, setMaterialType] = useState<'TEXT' | 'LINK' | 'FILE'>('TEXT');
  const [rosterByAssignment, setRosterByAssignment] = useState<Record<string, RosterSubmissionItem[]>>({});
  const [gradingTarget, setGradingTarget] = useState<{
    assignmentId: string;
    studentName: string;
    studentEmail: string;
    submission: SubmissionRecord;
  } | null>(null);
  const [gradeScore, setGradeScore] = useState('');
  const [gradeFeedback, setGradeFeedback] = useState('');

  const statusRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: 'materials', label: 'Materi & Topik' },
    { id: 'assignments', label: 'Tugas' },
    { id: 'quizzes', label: 'Kuis' },
    { id: 'announcements', label: 'Pengumuman' },
    { id: 'forum', label: 'Forum Diskusi' },
    { id: 'grades', label: role === 'DOSEN' ? 'Rekap Nilai' : 'Nilai & Umpan Balik' },
  ];

  useEffect(() => {
    if (requestedTab) {
      setTab(requestedTab.tab);
    }
  }, [requestedTab?.nonce]);

  async function loadWorkspace() {
    setLoading(true);
    try {
      const [topicsRes, materialsRes, assignmentsRes] = await Promise.all([
        request(`/api/classes/${classItem.id}/topics`, undefined, 'GET') as Promise<{ topics: Topic[] }>,
        request(`/api/classes/${classItem.id}/materials`, undefined, 'GET') as Promise<{
          materials: Material[];
        }>,
        request(`/api/classes/${classItem.id}/assignments`, undefined, 'GET') as Promise<{
          assignments: Assignment[];
        }>,
      ]);
      setTopics(topicsRes.topics);
      setMaterials(materialsRes.materials);
      setAssignments(assignmentsRes.assignments);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memuat ruang kelas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, [classItem.id]);

  useEffect(() => {
    if (message) statusRef.current?.focus();
  }, [message]);

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index + tabs.length - 1) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    setTab(tabs[next]!.id);
    tabRefs.current[next]?.focus();
  }

  async function createTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    try {
      await request(`/api/classes/${classItem.id}/topics`, {
        title: String(form.get('title') ?? '').trim(),
      });
      formEl.reset();
      setMessage('Topik berhasil ditambahkan.');
      await loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menambahkan topik.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteTopic(topicId: string) {
    setBusy(true);
    setMessage('');
    try {
      await request(`/api/classes/${classItem.id}/topics/${topicId}`, undefined, 'DELETE');
      setMessage('Topik dihapus.');
      await loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menghapus topik.');
    } finally {
      setBusy(false);
    }
  }

  async function createMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const topicIdRaw = String(form.get('topicId') ?? '').trim();
    const title = String(form.get('title') ?? '').trim();
    const content = String(form.get('content') ?? '').trim() || null;
    const externalUrl = String(form.get('externalUrl') ?? '').trim() || null;
    const isPublished = form.get('isPublished') === 'on';
    try {
      let attachment: AttachmentPayload | null = null;
      if (materialType === 'FILE') {
        const file = form.get('attachment');
        if (!(file instanceof File) || file.size === 0) {
          throw new Error('Pilih berkas lampiran terlebih dahulu.');
        }
        attachment = await readFileAsAttachment(file);
      }
      await request(`/api/classes/${classItem.id}/materials`, {
        topicId: topicIdRaw || null,
        title,
        type: materialType,
        content,
        externalUrl,
        attachment,
        isPublished,
      });
      formEl.reset();
      setMaterialType('TEXT');
      setMessage('Materi pembelajaran berhasil disimpan.');
      await loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menyimpan materi.');
    } finally {
      setBusy(false);
    }
  }

  async function togglePublishMaterial(item: Material) {
    setBusy(true);
    setMessage('');
    try {
      await request(
        `/api/classes/${classItem.id}/materials/${item.id}`,
        { isPublished: !item.isPublished },
        'PATCH',
      );
      setMessage(item.isPublished ? 'Materi diubah menjadi draf.' : 'Materi dipublikasikan.');
      await loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal mengubah status publikasi materi.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteMaterial(materialId: string) {
    setBusy(true);
    setMessage('');
    try {
      await request(`/api/classes/${classItem.id}/materials/${materialId}`, undefined, 'DELETE');
      setMessage('Materi dihapus.');
      await loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menghapus materi.');
    } finally {
      setBusy(false);
    }
  }

  async function createAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const dueRaw = String(form.get('dueAt') ?? '').trim();
    const dueAt = dueRaw ? new Date(dueRaw).toISOString() : null;
    try {
      await request(`/api/classes/${classItem.id}/assignments`, {
        title: String(form.get('title') ?? '').trim(),
        instructions: String(form.get('instructions') ?? '').trim(),
        dueAt,
        allowLate: form.get('allowLate') === 'on',
      });
      formEl.reset();
      setMessage('Tugas baru berhasil dibuat dan notifikasi dikirim ke mahasiswa.');
      onWorkspaceChanged();
      await loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal membuat tugas.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleAssignmentStatus(item: Assignment) {
    setBusy(true);
    setMessage('');
    try {
      const nextStatus = item.status === 'OPEN' ? 'CLOSED' : 'OPEN';
      await request(
        `/api/classes/${classItem.id}/assignments/${item.id}`,
        { status: nextStatus },
        'PATCH',
      );
      setMessage(nextStatus === 'CLOSED' ? 'Tugas ditutup.' : 'Tugas dibuka kembali.');
      onWorkspaceChanged();
      await loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memperbarui status tugas.');
    } finally {
      setBusy(false);
    }
  }

  async function reloadRoster(assignmentId: string) {
    const result = (await request(
      `/api/classes/${classItem.id}/assignments/${assignmentId}/submissions`,
      undefined,
      'GET',
    )) as { rosterStatus: RosterSubmissionItem[] };
    setRosterByAssignment((current) => ({ ...current, [assignmentId]: result.rosterStatus }));
  }

  async function toggleRoster(assignmentId: string) {
    if (rosterByAssignment[assignmentId]) {
      setRosterByAssignment((current) => {
        const next = { ...current };
        delete next[assignmentId];
        return next;
      });
      if (gradingTarget?.assignmentId === assignmentId) {
        setGradingTarget(null);
      }
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await reloadRoster(assignmentId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memuat daftar pengumpulan.');
    } finally {
      setBusy(false);
    }
  }

  function openGradingPanel(
    assignmentId: string,
    studentName: string,
    studentEmail: string,
    submission: SubmissionRecord,
  ) {
    setGradingTarget({ assignmentId, studentName, studentEmail, submission });
    setGradeScore(submission.score ?? '');
    setGradeFeedback(submission.feedback ?? '');
  }

  async function saveAssignmentGrade(gradeStatus: 'DRAFT' | 'PUBLISHED') {
    if (!gradingTarget) return;
    const numericScore = Number(gradeScore);
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
      setMessage('Nilai harus berupa angka antara 0 hingga 100.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await request(
        `/api/classes/${classItem.id}/assignments/${gradingTarget.assignmentId}/submissions/${gradingTarget.submission.id}/grade`,
        {
          score: numericScore,
          feedback: gradeFeedback.trim() || null,
          gradeStatus,
        },
        'PATCH',
      );
      setMessage(
        gradeStatus === 'PUBLISHED'
          ? `Nilai untuk ${gradingTarget.studentName} berhasil dipublikasikan dan notifikasi dikirim.`
          : `Draf nilai untuk ${gradingTarget.studentName} tersimpan.`,
      );
      await reloadRoster(gradingTarget.assignmentId);
      setGradingTarget(null);
      onWorkspaceChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menyimpan nilai tugas.');
    } finally {
      setBusy(false);
    }
  }

  async function publishAllDraftGrades(assignmentId: string) {
    setBusy(true);
    setMessage('');
    try {
      const res = (await request(
        `/api/classes/${classItem.id}/assignments/${assignmentId}/grades/publish`,
        {},
      )) as { publishedCount: number };
      setMessage(
        res.publishedCount > 0
          ? `${res.publishedCount} nilai draf berhasil dipublikasikan dan notifikasi dikirim ke mahasiswa.`
          : 'Tidak ada nilai draf yang siap dipublikasikan.',
      );
      await reloadRoster(assignmentId);
      onWorkspaceChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal mempublikasikan nilai draf.');
    } finally {
      setBusy(false);
    }
  }

  async function submitAssignment(event: FormEvent<HTMLFormElement>, assignmentId: string) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const textAnswer = String(form.get('textAnswer') ?? '').trim() || null;
    const file = form.get('attachment');
    try {
      const attachment =
        file instanceof File && file.size > 0 ? await readFileAsAttachment(file) : null;
      if (!textAnswer && !attachment) {
        throw new Error('Isi jawaban teks atau unggah berkas lampiran terlebih dahulu.');
      }
      const result = (await request(`/api/classes/${classItem.id}/assignments/${assignmentId}/submissions`, {
        textAnswer,
        attachment,
      })) as { submission: SubmissionRecord };
      formEl.reset();
      setMessage(`Pengumpulan berhasil dicatat (Versi ke-${result.submission.version}).`);
      onWorkspaceChanged();
      await loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Pengumpulan tugas gagal.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(path: string, fallbackName: string) {
    setBusy(true);
    setMessage('');
    try {
      await downloadFile(path, fallbackName);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal mengunduh berkas.');
    } finally {
      setBusy(false);
    }
  }

  const uncategorizedMaterials = materials.filter(
    (m) => !m.topicId || !topics.some((t) => t.id === m.topicId),
  );

  function renderMaterialCard(material: Material) {
    const typeLabel = material.type === 'TEXT' ? 'Teks' : material.type === 'LINK' ? 'Tautan' : 'Berkas';
    return (
      <article className="workspace-item-card" key={material.id}>
        <div className="workspace-item-header">
          <div>
            <h5>{material.title}</h5>
            <div className="workspace-badges">
              <span className="workspace-badge">{typeLabel}</span>
              {role === 'DOSEN' && (
                <span className={`workspace-badge ${material.isPublished ? 'open' : 'closed'}`}>
                  {material.isPublished ? 'Dipublikasikan' : 'Draf'}
                </span>
              )}
            </div>
          </div>
          {role === 'DOSEN' && (
            <div className="workspace-item-actions">
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => void togglePublishMaterial(material)}
              >
                {material.isPublished ? 'Jadikan draf' : 'Publikasikan'}
              </button>
              <button
                type="button"
                className="text-button danger-link"
                disabled={busy}
                onClick={() => void deleteMaterial(material.id)}
              >
                Hapus
              </button>
            </div>
          )}
        </div>
        {material.content && <p className="workspace-body-text">{material.content}</p>}
        {material.externalUrl && (
          <p className="workspace-link-row">
            <a
              href={material.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="workspace-external-link"
            >
              Buka tautan materi
            </a>
          </p>
        )}
        {material.attachmentName && (
          <div className="workspace-attachment-row">
            <span>
              {material.attachmentName}
              {material.attachmentSize ? ` (${formatFileSize(material.attachmentSize)})` : ''}
            </span>
            <button
              type="button"
              className="button secondary inline-btn"
              disabled={busy}
              onClick={() =>
                void handleDownload(
                  `/api/classes/${classItem.id}/materials/${material.id}/download`,
                  material.attachmentName!,
                )
              }
            >
              Unduh
            </button>
          </div>
        )}
      </article>
    );
  }

  return (
    <section className="workspace-panel" aria-labelledby="workspace-title">
      <div className="workspace-context-banner">
        <div className="workspace-topbar">
          <button type="button" className="text-button workspace-back-btn" onClick={onBack}>
            Kembali ke daftar kelas
          </button>
          <button
            type="button"
            className="button secondary inline-btn"
            onClick={() => void loadWorkspace()}
            disabled={loading}
          >
            Muat ulang ruang kelas
          </button>
        </div>

        <div className="workspace-header">
          <div>
            <h3 id="workspace-title">{classItem.name}</h3>
            <p className="workspace-description">
              {classItem.description || 'Tidak ada deskripsi kelas.'}
            </p>
          </div>
          <span className={`class-status ${classItem.status.toLowerCase()}`}>
            {classItem.status === 'OPEN' ? 'Terbuka' : 'Ditutup'}
          </span>
        </div>
      </div>

      {classItem.status === 'CLOSED' && (
        <div className="workspace-notice" role="status">
          Kelas ini berstatus ditutup. Materi dan riwayat tugas tetap dapat diakses secara baca-saja,
          namun pengumpulan baru dinonaktifkan.
        </div>
      )}

      <div className="workspace-tabs" role="tablist" aria-label="Bagian ruang kelas">
        {tabs.map((item, index) => (
          <button
            key={item.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            id={`workspace-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls="workspace-tabpanel"
            tabIndex={tab === item.id ? 0 : -1}
            className="workspace-tab"
            onClick={() => {
              setTab(item.id);
              setMessage('');
            }}
            onKeyDown={(e) => moveTab(e, index)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {message && (
        <div ref={statusRef} tabIndex={-1} className="feedback" role="status" aria-live="polite">
          {message}
        </div>
      )}

      <div
        id="workspace-tabpanel"
        role="tabpanel"
        aria-labelledby={`workspace-tab-${tab}`}
        tabIndex={0}
        className="workspace-tabpanel"
      >
        {tab === 'materials' && (
          <div className="workspace-section">
            {role === 'DOSEN' && (
              <div className="workspace-forms-grid">
                <form className="class-form" onSubmit={createTopic}>
                  <h4>Tambah topik baru</h4>
                  <label>
                    Nama topik / pertemuan
                    <input name="title" minLength={1} maxLength={150} required />
                  </label>
                  <div>
                    <button className="button primary inline-btn" disabled={busy}>
                      {busy ? 'Menyimpan…' : 'Tambah topik'}
                    </button>
                  </div>
                </form>

                <form className="class-form" onSubmit={createMaterial}>
                  <h4>Tambah materi pembelajaran</h4>
                  <label>
                    Judul materi
                    <input name="title" minLength={1} maxLength={160} required />
                  </label>
                  <div className="workspace-two-col">
                    <label>
                      Topik <span className="optional">(opsional)</span>
                      <select name="topicId" defaultValue="">
                        <option value="">Tanpa topik</option>
                        {topics.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Jenis materi
                      <select
                        name="type"
                        value={materialType}
                        onChange={(e) => setMaterialType(e.target.value as 'TEXT' | 'LINK' | 'FILE')}
                      >
                        <option value="TEXT">Teks / Catatan</option>
                        <option value="LINK">Tautan Eksternal</option>
                        <option value="FILE">Berkas Lampiran (maks. 4 MB)</option>
                      </select>
                    </label>
                  </div>
                  {materialType === 'LINK' && (
                    <label>
                      Alamat tautan (https://...)
                      <input name="externalUrl" type="url" maxLength={1000} required />
                    </label>
                  )}
                  {materialType === 'FILE' && (
                    <label>
                      Pilih berkas (PDF, TXT, MD, CSV, PNG, JPG, DOCX, ZIP, maks. 4 MB)
                      <input
                        name="attachment"
                        type="file"
                        accept=".pdf,.txt,.md,.csv,.png,.jpg,.jpeg,.docx,.zip"
                        required
                      />
                    </label>
                  )}
                  <label>
                    {materialType === 'TEXT' ? (
                      'Isi materi teks'
                    ) : (
                      <>
                        Catatan tambahan <span className="optional">(opsional)</span>
                      </>
                    )}
                    <textarea
                      name="content"
                      rows={3}
                      maxLength={20000}
                      required={materialType === 'TEXT'}
                    />
                  </label>
                  <label className="filter-option workspace-checkbox">
                    <input type="checkbox" name="isPublished" defaultChecked /> Publikasikan langsung ke
                    mahasiswa
                  </label>
                  <div>
                    <button className="button primary inline-btn" disabled={busy}>
                      {busy ? 'Menyimpan…' : 'Simpan materi'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {loading ? (
              <p className="class-empty" role="status">
                Memuat topik dan materi…
              </p>
            ) : topics.length === 0 && materials.length === 0 ? (
              <p className="class-empty">Belum ada topik atau materi di kelas ini.</p>
            ) : (
              <div className="workspace-topic-list">
                {topics.map((topic) => {
                  const topicMaterials = materials.filter((m) => m.topicId === topic.id);
                  return (
                    <section
                      className="workspace-topic-group"
                      key={topic.id}
                      aria-labelledby={`topic-heading-${topic.id}`}
                    >
                      <div className="workspace-topic-header">
                        <h4 id={`topic-heading-${topic.id}`}>{topic.title}</h4>
                        {role === 'DOSEN' && (
                          <button
                            type="button"
                            className="text-button danger-link"
                            disabled={busy}
                            onClick={() => void deleteTopic(topic.id)}
                          >
                            Hapus topik
                          </button>
                        )}
                      </div>
                      {topicMaterials.length === 0 ? (
                        <p className="workspace-muted">Belum ada materi pada topik ini.</p>
                      ) : (
                        <div className="workspace-items-stack">
                          {topicMaterials.map(renderMaterialCard)}
                        </div>
                      )}
                    </section>
                  );
                })}

                {uncategorizedMaterials.length > 0 && (
                  <section
                    className="workspace-topic-group"
                    aria-labelledby="topic-heading-uncategorized"
                  >
                    <div className="workspace-topic-header">
                      <h4 id="topic-heading-uncategorized">Materi Umum</h4>
                    </div>
                    <div className="workspace-items-stack">
                      {uncategorizedMaterials.map(renderMaterialCard)}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'assignments' && (
          <div className="workspace-section">
            {role === 'DOSEN' && (
              <form className="class-form" onSubmit={createAssignment}>
                <h4>Buat tugas baru</h4>
                <label>
                  Judul tugas
                  <input name="title" minLength={1} maxLength={160} required />
                </label>
                <label>
                  Instruksi tugas
                  <textarea name="instructions" rows={3} minLength={1} maxLength={20000} required />
                </label>
                <div className="workspace-two-col">
                  <label>
                    Batas waktu pengumpulan <span className="optional">(opsional)</span>
                    <input name="dueAt" type="datetime-local" />
                  </label>
                  <label className="filter-option workspace-checkbox">
                    <input type="checkbox" name="allowLate" /> Izinkan pengumpulan terlambat
                  </label>
                </div>
                <div>
                  <button className="button primary inline-btn" disabled={busy}>
                    {busy ? 'Menyimpan…' : 'Buat tugas'}
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <p className="class-empty" role="status">
                Memuat daftar tugas…
              </p>
            ) : assignments.length === 0 ? (
              <p className="class-empty">Belum ada tugas pada kelas ini.</p>
            ) : (
              <div className="workspace-items-stack">
                {assignments.map((assignment) => {
                  const dueDate = assignment.dueAt ? new Date(assignment.dueAt) : null;
                  const isPastDue = Boolean(dueDate && new Date() > dueDate);
                  const canSubmit =
                    classItem.status === 'OPEN' &&
                    assignment.status === 'OPEN' &&
                    (!isPastDue || assignment.allowLate);
                  const mySub = assignment.mySubmission;
                  const roster = rosterByAssignment[assignment.id];
                  const draftCount = roster
                    ? roster.filter((r) => r.submission?.gradeStatus === 'DRAFT' && r.submission.score !== null)
                        .length
                    : 0;

                  const submittedRosterEntries = roster ? roster.filter((r) => Boolean(r.submission)) : [];
                  const activeGradeIdx =
                    gradingTarget && gradingTarget.assignmentId === assignment.id
                      ? submittedRosterEntries.findIndex(
                          (e) => e.submission?.id === gradingTarget.submission.id,
                        )
                      : -1;

                  return (
                    <article className="workspace-item-card" key={assignment.id}>
                      <div className="workspace-item-header">
                        <div>
                          <h5>{assignment.title}</h5>
                          <div className="workspace-badges">
                            <span
                              className={`workspace-badge ${
                                assignment.status === 'OPEN' ? 'open' : 'closed'
                              }`}
                            >
                              {assignment.status === 'OPEN' ? 'Dibuka' : 'Ditutup'}
                            </span>
                            <span className="workspace-badge neutral">
                              {dueDate ? `Tenggat ${dueDate.toLocaleString('id-ID')}` : 'Tanpa tenggat'}
                            </span>
                            {assignment.allowLate && (
                              <span className="workspace-badge late">Pengumpulan terlambat diizinkan</span>
                            )}
                            {role === 'DOSEN' && typeof assignment.submissionCount === 'number' && (
                              <span className="workspace-badge neutral">
                                {assignment.submissionCount} pengumpulan
                              </span>
                            )}
                          </div>
                        </div>
                        {role === 'DOSEN' && (
                          <div className="workspace-item-actions">
                            <button
                              type="button"
                              className="text-button"
                              disabled={busy}
                              onClick={() => void toggleAssignmentStatus(assignment)}
                            >
                              {assignment.status === 'OPEN' ? 'Tutup tugas' : 'Buka tugas'}
                            </button>
                            <button
                              type="button"
                              className="button secondary inline-btn"
                              disabled={busy}
                              onClick={() => void toggleRoster(assignment.id)}
                            >
                              {roster ? 'Sembunyikan pengumpulan' : 'Lihat & Nilai Pengumpulan'}
                            </button>
                          </div>
                        )}
                      </div>

                      {role === 'MAHASISWA' && assignment.allowLate && (
                        <div className="workspace-notice">
                          <strong>Pengumpulan terlambat diizinkan.</strong> Pastikan jawaban tetap
                          dikirim melalui formulir di bawah ini.
                        </div>
                      )}

                      {role === 'MAHASISWA' ? (
                        <div className="assignment-split-grid">
                          <div className="assignment-instructions-col">
                            <p className="workspace-body-text">{assignment.instructions}</p>

                            {mySub && (
                              <div className="workspace-receipt">
                                <div className="workspace-badges workspace-badges--tight">
                                  <span className="stamp-seal">
                                    Terkirim, Versi ke-{mySub.version}
                                  </span>
                                  <span className={`workspace-badge ${mySub.isLate ? 'late' : 'open'}`}>
                                    {mySub.isLate ? 'Terlambat' : 'Tepat waktu'}
                                  </span>
                                  {mySub.gradeStatus === 'PUBLISHED' &&
                                    mySub.score !== null &&
                                    mySub.score !== undefined && (
                                      <span className="workspace-badge open num">Nilai: {mySub.score}</span>
                                    )}
                                  <time className="workspace-meta-time" dateTime={mySub.submittedAt}>
                                    {new Date(mySub.submittedAt).toLocaleString('id-ID')}
                                  </time>
                                </div>
                                {mySub.gradeStatus === 'PUBLISHED' && mySub.feedback && (
                                  <p className="workspace-body-text">
                                    <strong>Umpan Balik Dosen:</strong> {mySub.feedback}
                                  </p>
                                )}
                                {mySub.textAnswer && (
                                  <p className="workspace-body-text">{mySub.textAnswer}</p>
                                )}
                                {mySub.attachmentName && (
                                  <div className="workspace-attachment-row">
                                    <span>
                                      {mySub.attachmentName}
                                      {mySub.attachmentSize
                                        ? ` (${formatFileSize(mySub.attachmentSize)})`
                                        : ''}
                                    </span>
                                    <button
                                      type="button"
                                      className="button secondary inline-btn"
                                      disabled={busy}
                                      onClick={() =>
                                        void handleDownload(
                                          `/api/classes/${classItem.id}/assignments/${assignment.id}/submissions/${mySub.id}/download`,
                                          mySub.attachmentName!,
                                        )
                                      }
                                    >
                                      Unduh
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div>
                            {canSubmit ? (
                              <form
                                className="workspace-submit-form"
                                onSubmit={(e) => void submitAssignment(e, assignment.id)}
                              >
                                <div className="workspace-item-header">
                                  <h6>
                                    {mySub
                                      ? 'Kirim ulang jawaban (versi baru)'
                                      : 'Kirim jawaban tugas'}
                                  </h6>
                                  {!mySub && (
                                    <span className="workspace-badge neutral">Belum mengumpulkan</span>
                                  )}
                                </div>
                                <label>
                                  Jawaban teks{' '}
                                  <span className="optional">(opsional jika mengunggah berkas)</span>
                                  <textarea
                                    name="textAnswer"
                                    rows={4}
                                    maxLength={20000}
                                    defaultValue={mySub?.textAnswer ?? ''}
                                  />
                                </label>
                                <label>
                                  Lampiran berkas{' '}
                                  <span className="optional">(PDF, DOCX, ZIP, PNG, JPG, maks. 4 MB)</span>
                                  <input
                                    name="attachment"
                                    type="file"
                                    accept=".pdf,.txt,.md,.csv,.png,.jpg,.jpeg,.docx,.zip"
                                  />
                                </label>
                                <p className="workspace-muted">
                                  Periksa jawaban dan lampiran sebelum mengirim.
                                </p>
                                <button className="button primary" disabled={busy}>
                                  {busy ? 'Mengirim…' : mySub ? 'Kirim ulang jawaban' : 'Kirim jawaban'}
                                </button>
                              </form>
                            ) : (
                              <div className="workspace-submit-form">
                                <p className="workspace-muted">
                                  {classItem.status === 'CLOSED'
                                    ? 'Kelas ditutup, pengumpulan tugas tidak lagi diterima.'
                                    : assignment.status === 'CLOSED'
                                      ? 'Tugas telah ditutup oleh dosen.'
                                      : 'Batas waktu pengumpulan telah berakhir.'}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="workspace-body-text">{assignment.instructions}</p>
                          {roster && (
                            <div className="workspace-roster-box">
                              <div className="workspace-item-header">
                                <h6>Status pengumpulan &amp; penilaian mahasiswa</h6>
                                {draftCount > 0 && (
                                  <button
                                    type="button"
                                    className="button primary inline-btn"
                                    disabled={busy}
                                    onClick={() => void publishAllDraftGrades(assignment.id)}
                                  >
                                    Publikasikan Semua Nilai Draf ({draftCount})
                                  </button>
                                )}
                              </div>

                              {roster.length === 0 ? (
                                <p className="workspace-muted">
                                  Belum ada mahasiswa yang terdaftar di kelas ini.
                                </p>
                              ) : (
                                <div
                                  className="account-table-scroll"
                                  role="region"
                                  aria-label={`Pengumpulan ${assignment.title}`}
                                  tabIndex={0}
                                >
                                  <table className="account-table workspace-submission-table">
                                    <thead>
                                      <tr>
                                        <th scope="col">Mahasiswa</th>
                                        <th scope="col">Status</th>
                                        <th scope="col">Waktu Kirim</th>
                                        <th scope="col">Jawaban &amp; Lampiran</th>
                                        <th scope="col">Nilai</th>
                                        <th scope="col">Aksi</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {roster.map((entry) => (
                                        <tr key={entry.student.userId}>
                                          <td className="account-name">
                                            {entry.student.fullName}
                                            <div className="workspace-sub-email">
                                              {entry.student.email}
                                            </div>
                                          </td>
                                          <td>
                                            {entry.submission ? (
                                                <span
                                                  className={`workspace-badge ${
                                                    entry.submission.isLate ? 'late' : 'open'
                                                  }`}
                                                >
                                                  Terkirim (v{entry.submission.version})
                                                  {entry.submission.isLate ? ', Terlambat' : ''}
                                                </span>
                                              ) : (
                                                <span className="workspace-badge closed">
                                                  Belum mengumpulkan
                                                </span>
                                              )}
                                            </td>
                                            <td>
                                              {entry.submission ? (
                                                <time dateTime={entry.submission.submittedAt}>
                                                  {new Date(entry.submission.submittedAt).toLocaleString(
                                                    'id-ID',
                                                  )}
                                                </time>
                                              ) : (
                                                '-'
                                              )}
                                            </td>
                                            <td>
                                              {entry.submission ? (
                                                <div className="workspace-roster-answer">
                                                  {entry.submission.textAnswer && (
                                                    <ExpandableAnswerText
                                                      text={entry.submission.textAnswer}
                                                      className="workspace-roster-answer-text"
                                                      studentName={entry.student.fullName}
                                                      contextLabel={assignment.title}
                                                    />
                                                  )}
                                                  {entry.submission.attachmentName && (
                                                    <button
                                                      type="button"
                                                      className="text-button"
                                                      disabled={busy}
                                                      onClick={() =>
                                                        void handleDownload(
                                                          `/api/classes/${classItem.id}/assignments/${assignment.id}/submissions/${entry.submission!.id}/download`,
                                                          entry.submission!.attachmentName!,
                                                        )
                                                      }
                                                    >
                                                      Unduh {entry.submission.attachmentName}
                                                    </button>
                                                  )}
                                                </div>
                                              ) : (
                                                '-'
                                              )}
                                            </td>
                                            <td>
                                              {entry.submission?.score !== null &&
                                              entry.submission?.score !== undefined ? (
                                                <div className="gradebook-cell">
                                                  <strong className="num">{entry.submission.score}</strong>
                                                <span
                                                  className={`workspace-badge ${
                                                    entry.submission.gradeStatus === 'PUBLISHED'
                                                      ? 'open'
                                                      : 'late'
                                                  }`}
                                                >
                                                  {entry.submission.gradeStatus === 'PUBLISHED'
                                                    ? 'Dipublikasikan'
                                                    : 'Draf'}
                                                </span>
                                              </div>
                                            ) : (
                                              <span className="workspace-muted">Belum dinilai</span>
                                            )}
                                          </td>
                                          <td>
                                            {entry.submission && (
                                              <button
                                                type="button"
                                                className="text-button"
                                                onClick={() =>
                                                  openGradingPanel(
                                                    assignment.id,
                                                    entry.student.fullName,
                                                    entry.student.email,
                                                    entry.submission!,
                                                  )
                                                }
                                              >
                                                {entry.submission.score ? 'Edit Nilai' : 'Beri Nilai'}
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {gradingTarget && gradingTarget.assignmentId === assignment.id && (
                                <div key={gradingTarget.submission.id} className="grading-split-grid">
                                  <div className="grading-preview-pane">
                                    <div className="grading-preview-bar">
                                      <div>
                                        <strong>{gradingTarget.studentName}</strong>
                                        <div className="workspace-sub-email">
                                          <span>{gradingTarget.studentEmail}</span>{' '}
                                          <span className="receipt-version">
                                            (Versi ke-{gradingTarget.submission.version},{' '}
                                            {new Date(
                                              gradingTarget.submission.submittedAt,
                                            ).toLocaleString('id-ID')}
                                            )
                                          </span>
                                        </div>
                                      </div>
                                      <span
                                        className={`workspace-badge ${
                                          gradingTarget.submission.isLate ? 'late' : 'open'
                                        }`}
                                      >
                                        {gradingTarget.submission.isLate
                                          ? 'Terlambat'
                                          : 'Tepat waktu'}
                                      </span>
                                    </div>
                                    <div className="grading-preview-body">
                                      <h6 className="pane-section-title">Pratinjau Jawaban</h6>
                                      {gradingTarget.submission.textAnswer ? (
                                        <ExpandableAnswerText
                                          text={gradingTarget.submission.textAnswer}
                                          className="workspace-roster-answer-text"
                                          studentName={gradingTarget.studentName}
                                          contextLabel={assignment.title}
                                        />
                                      ) : (
                                        <p className="workspace-muted">
                                          Tidak ada jawaban teks terlampir.
                                        </p>
                                      )}
                                      {gradingTarget.submission.attachmentName && (
                                        <div className="workspace-attachment-row">
                                          <span>
                                            {gradingTarget.submission.attachmentName}
                                            {gradingTarget.submission.attachmentSize
                                              ? ` (${formatFileSize(gradingTarget.submission.attachmentSize)})`
                                              : ''}
                                          </span>
                                          <button
                                            type="button"
                                            className="button secondary inline-btn"
                                            disabled={busy}
                                            onClick={() =>
                                              void handleDownload(
                                                `/api/classes/${classItem.id}/assignments/${assignment.id}/submissions/${gradingTarget.submission.id}/download`,
                                                gradingTarget.submission.attachmentName!,
                                              )
                                            }
                                          >
                                            Unduh
                                          </button>
                                        </div>
                                      )}
                                      {submittedRosterEntries.length > 1 && activeGradeIdx >= 0 && (
                                        <div className="grading-student-nav">
                                          <button
                                            type="button"
                                            className="button secondary inline-btn"
                                            disabled={activeGradeIdx <= 0}
                                            onClick={() => {
                                              const prev = submittedRosterEntries[activeGradeIdx - 1];
                                              if (prev?.submission) {
                                                openGradingPanel(
                                                  assignment.id,
                                                  prev.student.fullName,
                                                  prev.student.email,
                                                  prev.submission,
                                                );
                                              }
                                            }}
                                          >
                                            Mahasiswa sebelumnya
                                          </button>
                                          <button
                                            type="button"
                                            className="button secondary inline-btn"
                                            disabled={
                                              activeGradeIdx >= submittedRosterEntries.length - 1
                                            }
                                            onClick={() => {
                                              const next = submittedRosterEntries[activeGradeIdx + 1];
                                              if (next?.submission) {
                                                openGradingPanel(
                                                  assignment.id,
                                                  next.student.fullName,
                                                  next.student.email,
                                                  next.submission,
                                                );
                                              }
                                            }}
                                          >
                                            Mahasiswa berikutnya
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="grading-panel">
                                    <div className="workspace-item-header">
                                      <h6>Periksa &amp; Nilai Pengumpulan</h6>
                                      <button
                                        type="button"
                                        className="text-button"
                                        onClick={() => setGradingTarget(null)}
                                      >
                                        Tutup
                                      </button>
                                    </div>

                                    <label className="field-label">
                                      Skor (0 hingga 100)
                                      <div className="grading-score-row">
                                        <input
                                          className="sintaks-input"
                                          type="number"
                                          min={0}
                                          max={100}
                                          step="0.01"
                                          value={gradeScore}
                                          onChange={(e) => setGradeScore(e.target.value)}
                                          required
                                        />
                                        <span className="workspace-muted">/ 100</span>
                                      </div>
                                    </label>

                                    <label className="field-label">
                                      Umpan Balik / Komentar{' '}
                                      <span className="optional">(opsional)</span>
                                      <textarea
                                        className="sintaks-textarea"
                                        rows={4}
                                        maxLength={10000}
                                        value={gradeFeedback}
                                        onChange={(e) => setGradeFeedback(e.target.value)}
                                      />
                                    </label>

                                    <div className="grading-notice-box">
                                      Status saat ini:{' '}
                                      <strong>
                                        {gradingTarget.submission.gradeStatus === 'PUBLISHED'
                                          ? 'Dipublikasikan'
                                          : gradingTarget.submission.gradeStatus === 'DRAFT'
                                            ? 'Draf (tersembunyi dari mahasiswa)'
                                            : 'Belum dinilai'}
                                      </strong>
                                      . Draf hanya terlihat oleh dosen hingga dipublikasikan.
                                    </div>

                                    <button
                                      type="button"
                                      className="button secondary"
                                      disabled={busy}
                                      onClick={() => void saveAssignmentGrade('DRAFT')}
                                    >
                                      Simpan Draf
                                    </button>
                                    <button
                                      type="button"
                                      className="button primary"
                                      disabled={busy}
                                      onClick={() => void saveAssignmentGrade('PUBLISHED')}
                                    >
                                      Publikasikan Nilai
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'quizzes' && (
          <QuizzesSection
            classItem={classItem}
            role={role}
            onStatusMessage={(msg) => setMessage(msg)}
          />
        )}

        {tab === 'announcements' && (
          <AnnouncementsPanel
            classItem={classItem}
            role={role}
            onStatusMessage={(msg) => setMessage(msg)}
          />
        )}

        {tab === 'forum' && (
          <ForumPanel
            classItem={classItem}
            currentUser={currentUser}
            onStatusMessage={(msg) => setMessage(msg)}
          />
        )}

        {tab === 'grades' && (
          <GradesSection
            classItem={classItem}
            role={role}
            onStatusMessage={(msg) => setMessage(msg)}
          />
        )}
      </div>
    </section>
  );
}

function ChangePassword({ email, onDone }: { email: string; onDone: (user: User) => void }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const newPassword = String(form.get('newPassword'));
      await request('/auth/change-password', {
        currentPassword: form.get('currentPassword'),
        newPassword,
      });
      formElement.reset();
      const result = await request('/auth/login', { email, password: newPassword });
      onDone(result.user);
      setMessage('Kata sandi diperbarui. Silakan lanjutkan.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal mengganti kata sandi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="change-form" onSubmit={submit}>
      <h3>Perbarui kata sandi sementara</h3>
      <label className="field-label">
        Kata sandi sementara
        <input className="sintaks-input" name="currentPassword" type="password" required />
      </label>
      <label className="field-label">
        Kata sandi baru
        <input
          className="sintaks-input"
          name="newPassword"
          type="password"
          minLength={12}
          maxLength={200}
          required
        />
      </label>
      {message && (
        <div className="feedback" role="status">
          {message}
        </div>
      )}
      <div>
        <button className="button primary inline-btn" disabled={busy}>
          Simpan kata sandi
        </button>
      </div>
    </form>
  );
}

function AccountManagement({
  refreshKey,
  onAccountsChanged,
}: {
  refreshKey: number;
  onAccountsChanged: () => void;
}) {
  const [users, setUsers] = useState<Array<User & { status: string }>>([]);
  const [message, setMessage] = useState('');
  const [section, setSection] = useState<'create' | 'roster' | 'accounts'>('create');
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [busy, setBusy] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  async function load() {
    try {
      const result = await request('/auth/admin/users', undefined, 'GET');
      setUsers(result.users);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memuat akun.');
    }
  }

  useEffect(() => {
    void load();
  }, [refreshKey]);

  const sections = [
    { id: 'create', label: 'Buat akun Dosen' },
    { id: 'roster', label: 'Impor roster' },
    { id: 'accounts', label: 'Akun aktif' },
  ] as const;

  const visibleUsers = showAllAccounts ? users : users.filter((u) => u.status === 'ACTIVE');

  function moveTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % sections.length
        : event.key === 'ArrowLeft'
          ? (index + sections.length - 1) % sections.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? sections.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    setSection(sections[next].id);
    tabRefs.current[next]?.focus();
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const result = await request('/auth/admin/instructors', Object.fromEntries(form.entries()));
      formElement.reset();
      setMessage(
        `Akun dibuat. Kata sandi awal (tampilkan sekali): ${result.temporaryPassword}. Berikan melalui saluran aman.`,
      );
      onAccountsChanged();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal membuat akun.');
    } finally {
      setBusy(false);
    }
  }

  async function importRoster(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const formElement = event.currentTarget;
    const file = new FormData(formElement).get('roster');
    if (!(file instanceof File) || file.size === 0) {
      setMessage('Pilih file roster CSV terlebih dahulu.');
      setBusy(false);
      return;
    }
    try {
      const result = await request('/auth/admin/roster/import', { csv: await file.text() });
      formElement.reset();
      setMessage(
        `Impor roster selesai: ${result.summary.rows} baris, ${result.summary.created} baru, ${result.summary.updated} diperbarui.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Impor roster gagal.');
    } finally {
      setBusy(false);
    }
  }

  async function exportRoster() {
    setBusy(true);
    setMessage('');
    try {
      await downloadFile('/auth/admin/roster/export', 'roster-mahasiswa-sintaks.csv');
      setMessage('Cadangan CSV roster mahasiswa berhasil diunduh.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal mengekspor roster CSV.');
    } finally {
      setBusy(false);
    }
  }

  async function update(id: string, path: 'status' | 'role', value: string) {
    try {
      const result = await request(`/auth/admin/users/${id}/${path}`, { [path]: value }, 'PATCH');
      setMessage(
        result.temporaryPassword
          ? `Perubahan tersimpan. Kata sandi awal (tampilkan sekali): ${result.temporaryPassword}. Berikan melalui saluran aman.`
          : 'Perubahan akun tersimpan.',
      );
      onAccountsChanged();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memperbarui akun.');
    }
  }

  return (
    <section className="admin-panel" aria-labelledby="admin-title">
      <div className="admin-panel-heading">
        <div>
          <h3 id="admin-title">Kelola akun kampus</h3>
          <p className="section-deck">
            Buat akun dosen, impor atau cadangkan roster mahasiswa CSV, dan kelola status akses pengguna.
          </p>
        </div>
        <span className="admin-account-count">{users.length} akun</span>
      </div>
      <div className="admin-tabs" role="tablist" aria-label="Navigasi administrasi akun">
        {sections.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={`admin-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={section === item.id}
            aria-controls="admin-tabpanel"
            tabIndex={section === item.id ? 0 : -1}
            className="admin-tab"
            onClick={() => setSection(item.id)}
            onKeyDown={(event) => moveTab(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        id="admin-tabpanel"
        className="admin-tabpanel"
        role="tabpanel"
        aria-labelledby={`admin-tab-${section}`}
        tabIndex={0}
      >
        {section === 'create' && (
          <form className="admin-section-form" onSubmit={create}>
            <div>
              <h4>Buat akun Dosen</h4>
              <p>Admin membuat akun Dosen dan membagikan kata sandi awal melalui saluran aman.</p>
            </div>
            <label>
              Nama lengkap
              <input name="fullName" required maxLength={150} />
            </label>
            <label>
              Email
              <input name="email" type="email" required maxLength={255} />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? 'Membuat…' : 'Buat akun Dosen'}
            </button>
          </form>
        )}
        {section === 'roster' && (
          <form className="admin-section-form" onSubmit={importRoster}>
            <div>
              <h4>Impor &amp; cadangan roster Mahasiswa</h4>
              <p>
                Gunakan CSV roster kampus dengan kolom NIM, nama, email, dan status kelayakan, atau
                ekspor daftar roster saat ini sebagai cadangan luring.
              </p>
            </div>
            <label className="admin-full-span">
              File roster
              <input name="roster" type="file" accept=".csv,text/csv" required />
            </label>
            <div className="admin-form-actions">
              <button className="button primary" disabled={busy}>
                {busy ? 'Memproses…' : 'Impor roster'}
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => void exportRoster()}
                disabled={busy}
              >
                Unduh CSV roster
              </button>
            </div>
          </form>
        )}
        {section === 'accounts' && (
          <div className="admin-accounts">
            <div className="admin-accounts-toolbar">
              <div>
                <h4>Akun aktif</h4>
                <p>{visibleUsers.length} akun ditampilkan</p>
              </div>
              <label className="filter-option">
                <input
                  type="checkbox"
                  checked={showAllAccounts}
                  onChange={(event) => setShowAllAccounts(event.target.checked)}
                />{' '}
                Tampilkan semua status
              </label>
            </div>
            <div
              className="account-table-scroll"
              role="region"
              aria-label={showAllAccounts ? 'Daftar akun semua status' : 'Daftar akun aktif'}
              tabIndex={0}
            >
              <table className="account-table">
                <caption className="visually-hidden">
                  {showAllAccounts
                    ? 'Semua akun beserta pengaturan peran dan status'
                    : 'Akun aktif beserta pengaturan peran dan status'}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Nama</th>
                    <th scope="col">Email</th>
                    <th scope="col">Peran</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((u) => (
                    <tr key={u.id}>
                      <td className="account-name">{u.fullName}</td>
                      <td className="account-email">{u.email}</td>
                      <td>
                        <select
                          id={`role-${u.id}`}
                          aria-label={`Peran ${u.email}`}
                          value={u.role}
                          onChange={(event) => void update(u.id, 'role', event.target.value)}
                        >
                          <option value="ADMIN">Admin</option>
                          <option value="DOSEN">Dosen</option>
                          <option value="MAHASISWA">Mahasiswa</option>
                        </select>
                      </td>
                      <td>
                        <select
                          id={`status-${u.id}`}
                          aria-label={`Status ${u.email}`}
                          value={u.status}
                          onChange={(event) => void update(u.id, 'status', event.target.value)}
                        >
                          <option value="ACTIVE">Aktif</option>
                          <option value="INACTIVE">Nonaktif</option>
                          <option value="PENDING">Menunggu</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleUsers.length === 0 && <p className="class-empty">Belum ada akun aktif.</p>}
            </div>
          </div>
        )}
      </div>
      {message && (
        <div className="feedback" role="status" aria-live="polite">
          {message}
        </div>
      )}
    </section>
  );
}
