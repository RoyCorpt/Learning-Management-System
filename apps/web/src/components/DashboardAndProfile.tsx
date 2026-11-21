import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  request,
  type DashboardSummary,
  type NotificationItem,
  type Role,
  type User,
} from '../lib/api.ts';
import {
  isFcmPushSupported,
  listenForegroundFcmMessages,
  registerFcmDeviceToken,
} from '../lib/firebase.ts';

function firstWord(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return 'Pengguna';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function getInitials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'S';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}

function roleLabel(role: Role) {
  return role === 'DOSEN' ? 'Dosen' : role === 'MAHASISWA' ? 'Mahasiswa' : 'Admin';
}

export function NotificationBell({
  onNavigate,
}: {
  onNavigate: (targetUrl: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushVapidKey, setPushVapidKey] = useState<string | null>(null);
  const [pushRegistered, setPushRegistered] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushFeedback, setPushFeedback] = useState('');

  async function loadNotifications() {
    try {
      const res = (await request('/api/notifications', undefined, 'GET')) as {
        notifications: NotificationItem[];
        unreadCount: number;
      };
      setItems(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // Ignore transient poll errors silently
    }
  }

  useEffect(() => {
    void loadNotifications();
    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribeForeground: (() => void) | null = null;

    async function setupPushAwareness() {
      const supported = await isFcmPushSupported();
      if (!active) return;
      setPushSupported(supported);

      let serverVapidKey: string | null = null;
      try {
        const cfg = (await request('/api/notifications/push-config', undefined, 'GET')) as {
          vapidKey: string | null;
          hasRegisteredToken: boolean;
        };
        if (!active) return;
        serverVapidKey = cfg.vapidKey;
        setPushVapidKey(cfg.vapidKey);
        setPushRegistered(cfg.hasRegisteredToken);
      } catch {
        // Non-blocking if push-config check fails
      }

      if (!supported) return;

      unsubscribeForeground = await listenForegroundFcmMessages(() => {
        void loadNotifications();
      });

      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        (serverVapidKey || (import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '').trim())
      ) {
        try {
          const token = await registerFcmDeviceToken(serverVapidKey);
          await request('/api/notifications/fcm-token', { token }, 'POST');
          if (active) setPushRegistered(true);
        } catch {
          // Silent sync error; user can manually retry inside drawer
        }
      }
    }

    void setupPushAwareness();

    return () => {
      active = false;
      unsubscribeForeground?.();
    };
  }, []);

  async function enableDevicePush() {
    setPushBusy(true);
    setPushFeedback('');
    try {
      const token = await registerFcmDeviceToken(pushVapidKey);
      await request('/api/notifications/fcm-token', { token }, 'POST');
      setPushRegistered(true);
      setPushFeedback('Notifikasi push Firebase aktif di perangkat ini.');
    } catch (error) {
      setPushFeedback(
        error instanceof Error ? error.message : 'Gagal mengaktifkan notifikasi perangkat.',
      );
    } finally {
      setPushBusy(false);
    }
  }

  async function handleOpenToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      await loadNotifications();
    }
  }

  async function markAllRead() {
    setBusy(true);
    try {
      await request('/api/notifications/read-all', {}, 'PATCH');
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } finally {
      setBusy(false);
    }
  }

  async function clickNotification(item: NotificationItem) {
    if (!item.isRead) {
      try {
        await request(`/api/notifications/${item.id}/read`, {}, 'PATCH');
        setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // Proceed with navigation even if mark-read fails
      }
    }
    setOpen(false);
    onNavigate(item.targetUrl);
  }

  const permissionBlocked =
    typeof Notification !== 'undefined' && Notification.permission === 'denied';

  return (
    <div className="notification-wrapper">
      <button
        type="button"
        className="notification-bell-btn"
        aria-expanded={open}
        aria-label={`Notifikasi (${unreadCount} belum dibaca)`}
        onClick={() => void handleOpenToggle()}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M15 17H20L18.5951 15.5951C18.2141 15.2141 18 14.6973 18 14.1585V11C18 8.38757 16.3304 6.16509 14 5.34142V5C14 3.89543 13.1046 3 12 3C10.8954 3 10 3.89543 10 5V5.34142C7.66962 6.16509 6 8.38757 6 11V14.1585C6 14.6973 5.78595 15.2141 5.40493 15.5951L4 17H9M15 17V18C15 19.6569 13.6569 21 12 21C10.3431 21 9 19.6569 9 18V17M15 17H9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="notification-bell-text">Notifikasi</span>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-drawer" role="region" aria-label="Daftar notifikasi terbaru">
          <div className="notification-drawer-head">
            <strong>Notifikasi</strong>
            <div className="notification-drawer-actions">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => void markAllRead()}
                >
                  Tandai semua dibaca
                </button>
              )}
              <button type="button" className="text-button" onClick={() => setOpen(false)}>
                Tutup
              </button>
            </div>
          </div>

          {pushSupported && (
            <div className="notification-push-bar">
              {pushRegistered ? (
                <span className="notification-push-status">
                  Notifikasi push Firebase aktif
                </span>
              ) : permissionBlocked ? (
                <span className="notification-push-status">
                  Izin notifikasi diblokir pada peramban ini
                </span>
              ) : (
                <button
                  type="button"
                  className="text-button"
                  disabled={pushBusy}
                  onClick={() => void enableDevicePush()}
                >
                  {pushBusy ? 'Mengaktifkan push…' : 'Aktifkan notifikasi perangkat'}
                </button>
              )}
              {pushFeedback && <p className="notification-push-feedback">{pushFeedback}</p>}
            </div>
          )}

          {items.length === 0 ? (
            <p className="notification-empty">Belum ada notifikasi saat ini.</p>
          ) : (
            <ul className="notification-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`notification-item ${n.isRead ? 'read' : 'unread'}`}
                    onClick={() => void clickNotification(n)}
                  >
                    <div className="notification-item-top">
                      <strong>{n.title}</strong>
                      {!n.isRead && <span className="notification-dot" aria-label="Belum dibaca" />}
                    </div>
                    <p>{n.message}</p>
                    <time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString('id-ID')}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const DOSEN_SUMMARY_PAGE_SIZE = 9;

export function RoleSummaryDashboard({
  role,
  userFullName,
  refreshKey,
  onNavigate,
  onOpenClass,
  onManageClasses,
  onAccountUpdated,
}: {
  role: Role;
  userFullName: string;
  refreshKey: number;
  onNavigate: (targetUrl: string) => void;
  onOpenClass?: (classId: string) => void;
  onManageClasses?: () => void;
  onAccountUpdated?: () => void;
}) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dosenSearch, setDosenSearch] = useState('');
  const [dosenStatusFilter, setDosenStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [dosenPage, setDosenPage] = useState(1);

  async function loadSummary() {
    setLoading(true);
    try {
      const res = (await request('/api/dashboard/summary', undefined, 'GET')) as DashboardSummary;
      setSummary(res);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memuat ringkasan dasbor.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSummary();
  }, [role, refreshKey]);

  useEffect(() => {
    setDosenPage(1);
  }, [dosenSearch, dosenStatusFilter, refreshKey]);

  const dosenMetrics = useMemo(() => {
    if (!summary || summary.role !== 'DOSEN') {
      return {
        totalClasses: 0,
        openClasses: 0,
        totalStudents: 0,
        overallAverage: '-',
        filtered: [],
      };
    }
    const items = summary.classSummaries;
    const openClasses = items.filter((c) => c.status === 'OPEN').length;
    const totalStudents = items.reduce((acc, c) => acc + c.studentCount, 0);
    const numericAvgs = items
      .map((c) => (c.averageScore !== null ? Number(c.averageScore) : NaN))
      .filter((n) => Number.isFinite(n));
    const overallAverage =
      numericAvgs.length > 0
        ? (numericAvgs.reduce((acc, n) => acc + n, 0) / numericAvgs.length).toFixed(1)
        : '-';
    const query = dosenSearch.trim().toLowerCase();
    const filtered = items.filter((c) => {
      if (dosenStatusFilter !== 'ALL' && c.status !== dosenStatusFilter) return false;
      if (query && !c.className.toLowerCase().includes(query)) return false;
      return true;
    });
    return {
      totalClasses: items.length,
      openClasses,
      totalStudents,
      overallAverage,
      filtered,
    };
  }, [summary, dosenSearch, dosenStatusFilter]);

  async function activateStudent(studentId: string) {
    setBusyId(studentId);
    setMessage('');
    try {
      await request(`/auth/admin/users/${studentId}/status`, { status: 'ACTIVE' }, 'PATCH');
      setMessage('Akun mahasiswa berhasil diaktifkan.');
      await loadSummary();
      onAccountUpdated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal mengaktifkan akun.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !summary) {
    return (
      <section className="summary-panel" aria-label="Ringkasan dasbor">
        <p className="class-empty" role="status">
          Memuat ringkasan aktivitas…
        </p>
      </section>
    );
  }

  if (!summary) return null;

  const latestGrade = summary.role === 'MAHASISWA' ? summary.recentGrades[0] : null;
  const recentAnnouncements = summary.role === 'MAHASISWA' ? (summary.recentAnnouncements ?? []) : [];
  const totalDosenPages = Math.max(1, Math.ceil(dosenMetrics.filtered.length / DOSEN_SUMMARY_PAGE_SIZE));
  const currentDosenPage = Math.min(dosenPage, totalDosenPages);
  const dosenStartIndex = (currentDosenPage - 1) * DOSEN_SUMMARY_PAGE_SIZE;
  const pagedDosenSummaries = dosenMetrics.filtered.slice(
    dosenStartIndex,
    dosenStartIndex + DOSEN_SUMMARY_PAGE_SIZE,
  );

  return (
    <section className="summary-panel" aria-labelledby="summary-heading">
      <div className="class-panel-heading">
        <div className="summary-greeting">
          <h2 id="summary-heading">
            {summary.role === 'DOSEN'
              ? 'Ringkasan kelas yang Anda kelola'
              : `Selamat datang, ${firstWord(userFullName)}.`}
          </h2>
          <p className="summary-greeting-sub">
            {summary.role === 'MAHASISWA'
              ? summary.upcomingDeadlines.length > 0
                ? `${summary.upcomingDeadlines.length} tenggat waktu aktif yang perlu diselesaikan. Selesaikan satu per satu.`
                : 'Semua tugas dan kuis aktif sudah diselesaikan. Pantau materi terbaru di kelas Anda.'
              : summary.role === 'DOSEN'
                ? 'Pantau keaktifan mahasiswa, rasio pengumpulan tugas, dan rata-rata capaian kelas.'
                : 'Ringkasan pengguna aktif, kelas terbuka, dan antrean verifikasi akun mahasiswa.'}
          </p>
        </div>
        <div className="workspace-item-actions">
          {summary.role === 'DOSEN' && onManageClasses && (
            <button
              type="button"
              className="button secondary inline-btn"
              onClick={onManageClasses}
            >
              Kelola semua kelas
            </button>
          )}
          <button
            type="button"
            className="button secondary inline-btn"
            onClick={() => void loadSummary()}
            disabled={loading}
          >
            Perbarui ringkasan
          </button>
        </div>
      </div>

      {message && (
        <div className="feedback" role="status">
          {message}
        </div>
      )}

      {summary.role === 'MAHASISWA' && (
        <div className="summary-grid">
          <div className="summary-stats-row">
            <div className="summary-stat-card">
              <span className="summary-stat-label">Kelas Aktif Diikuti</span>
              <strong className="summary-stat-value">{summary.activeClassesCount}</strong>
              <span className="summary-stat-meta">Ruang kelas berstatus terbuka</span>
            </div>
            <div className="summary-stat-card">
              <span className="summary-stat-label">Tenggat Waktu Mendatang</span>
              <strong className="summary-stat-value">{summary.upcomingDeadlines.length}</strong>
              <span className="summary-stat-meta">Tugas &amp; kuis yang perlu dikerjakan</span>
            </div>
            <div className="summary-stat-card">
              <span className="summary-stat-label">Nilai Terbaru</span>
              <strong className="summary-stat-value">
                {latestGrade ? `${latestGrade.score} / 100` : `${summary.recentGrades.length}`}
              </strong>
              <span className="summary-stat-meta">
                {latestGrade ? `${latestGrade.className}, ${latestGrade.statusLabel}` : 'Belum ada nilai dirilis'}
              </span>
            </div>
          </div>

          <div className="summary-two-col">
            <div className="summary-box">
              <h4>Tenggat Waktu Terdekat</h4>
              {summary.upcomingDeadlines.length === 0 ? (
                <p className="workspace-muted">Tidak ada tugas atau kuis yang belum dikerjakan saat ini.</p>
              ) : (
                <ul className="summary-list">
                  {summary.upcomingDeadlines.map((item) => (
                    <li key={`${item.kind}-${item.id}`} className="summary-list-item">
                      <div>
                        <div className="workspace-badges workspace-badges--tight">
                          <span className="workspace-badge">
                            {item.kind === 'QUIZ' ? 'Kuis' : 'Tugas'}
                          </span>
                          <span className="workspace-meta-time">{item.className}</span>
                        </div>
                        <strong>{item.title}</strong>
                        <span className="workspace-meta-time">
                          {item.deadlineAt
                            ? `Tenggat: ${new Date(item.deadlineAt).toLocaleString('id-ID')}`
                            : 'Tanpa batas waktu'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="button secondary inline-btn"
                        onClick={() => onNavigate(item.targetUrl)}
                      >
                        Buka
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="summary-box subtle-box">
              <div>
                <h4>Nilai Terbaru</h4>
                <p className="workspace-muted">Hanya nilai yang telah dipublikasikan dosen.</p>
              </div>
              {summary.recentGrades.length === 0 ? (
                <p className="workspace-muted">Belum ada nilai yang dipublikasikan.</p>
              ) : (
                <div>
                  {summary.recentGrades.map((g) => (
                    <div key={`${g.kind}-${g.id}`} className="grade-row-item">
                      <div className="grade-row-main">
                        <strong className="grade-row-title">{g.title}</strong>
                        <span className="workspace-meta-time">
                          {g.className}, {g.statusLabel}
                        </span>
                        {g.feedback && <p className="workspace-muted">{g.feedback}</p>}
                      </div>
                      <div className="grade-row-right">
                        <span className="grade-row-score">{g.score} / 100</span>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => onNavigate(`/classes/${g.classId}/grades`)}
                        >
                          Lihat
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {recentAnnouncements.length > 0 && (
            <div className="class-panel">
              <div className="class-panel-heading">
                <h3>Pengumuman Terbaru</h3>
              </div>
              <div className="announcement-feed-stack">
                {recentAnnouncements.map((ann) => (
                  <article className="announcement-feed-row" key={ann.id}>
                    <span className="announcement-feed-course">{ann.className}</span>
                    <div className="announcement-feed-body">
                      <strong>{ann.title}</strong>
                      <p>{ann.body.length > 180 ? `${ann.body.slice(0, 180)}…` : ann.body}</p>
                      <span className="workspace-meta-time">
                        {ann.authorName},{' '}
                        <time dateTime={ann.createdAt}>
                          {new Date(ann.createdAt).toLocaleString('id-ID')}
                        </time>
                      </span>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => onNavigate(`/classes/${ann.classId}/announcements`)}
                    >
                      Buka kelas
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {summary.role === 'DOSEN' &&
        (summary.classSummaries.length === 0 ? (
          <p className="class-empty">Belum ada ringkasan kelas karena Anda belum membuat kelas.</p>
        ) : (
          <div className="summary-grid">
            <div className="summary-stats-row">
              <div className="summary-stat-card">
                <span className="summary-stat-label">Total Kelas Dikelola</span>
                <strong className="summary-stat-value">{dosenMetrics.totalClasses}</strong>
                <span className="summary-stat-meta">
                  {dosenMetrics.openClasses} kelas terbuka,{' '}
                  {dosenMetrics.totalClasses - dosenMetrics.openClasses} ditutup
                </span>
              </div>
              <div className="summary-stat-card">
                <span className="summary-stat-label">Total Mahasiswa Terdaftar</span>
                <strong className="summary-stat-value">{dosenMetrics.totalStudents}</strong>
                <span className="summary-stat-meta">Akumulasi peserta seluruh kelas</span>
              </div>
              <div className="summary-stat-card">
                <span className="summary-stat-label">Rata-rata Nilai Tugas</span>
                <strong className="summary-stat-value">{dosenMetrics.overallAverage}</strong>
                <span className="summary-stat-meta">Dari kelas dengan nilai dirilis</span>
              </div>
            </div>

            <div className="class-toolbar" role="search" aria-label="Filter ringkasan kelas">
              <label className="field-label class-search-field">
                Cari ringkasan kelas
                <input
                  type="search"
                  className="sintaks-input"
                  placeholder="Cari berdasarkan nama kelas…"
                  value={dosenSearch}
                  onChange={(event) => setDosenSearch(event.target.value)}
                  maxLength={120}
                />
              </label>
              <label className="field-label class-sort-field">
                Status kelas
                <select
                  className="sintaks-select"
                  value={dosenStatusFilter}
                  onChange={(event) =>
                    setDosenStatusFilter(event.target.value as 'ALL' | 'OPEN' | 'CLOSED')
                  }
                >
                  <option value="ALL">Semua status</option>
                  <option value="OPEN">Terbuka</option>
                  <option value="CLOSED">Ditutup</option>
                </select>
              </label>
            </div>

            {dosenMetrics.filtered.length === 0 ? (
              <div className="class-empty" role="status">
                Tidak ada ringkasan kelas yang sesuai dengan filter saat ini.
                <div className="class-empty-actions">
                  <button
                    type="button"
                    className="button secondary inline-btn"
                    onClick={() => {
                      setDosenSearch('');
                      setDosenStatusFilter('ALL');
                    }}
                  >
                    Reset filter
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="summary-cards-grid">
                  {pagedDosenSummaries.map((c) => (
                    <article key={c.classId} className="summary-box">
                      <div className="class-card-heading">
                        <h4>{c.className}</h4>
                        <span className={`class-status ${c.status.toLowerCase()}`}>
                          {c.status === 'OPEN' ? 'Terbuka' : 'Ditutup'}
                        </span>
                      </div>
                      <dl className="summary-metrics-dl">
                        <div>
                          <dt>Mahasiswa</dt>
                          <dd>{c.studentCount}</dd>
                        </div>
                        <div>
                          <dt>Tugas &amp; Kuis</dt>
                          <dd>
                            {c.assignmentCount} tugas, {c.quizCount} kuis
                          </dd>
                        </div>
                        <div>
                          <dt>Rasio Pengumpulan</dt>
                          <dd>
                            {c.submissionRatio}% ({c.actualSubmissions}/{c.expectedSubmissions})
                          </dd>
                        </div>
                        <div>
                          <dt>Rata-rata Nilai Tugas</dt>
                          <dd>{c.averageScore ?? '-'}</dd>
                        </div>
                        <div>
                          <dt>Aktivitas 7 Hari</dt>
                          <dd>{c.recentActivityCount} postingan</dd>
                        </div>
                      </dl>
                      {onOpenClass && (
                        <button
                          type="button"
                          className="button secondary inline-btn"
                          onClick={() => onOpenClass(c.classId)}
                        >
                          Buka ruang kelas
                        </button>
                      )}
                    </article>
                  ))}
                </div>

                {dosenMetrics.filtered.length > DOSEN_SUMMARY_PAGE_SIZE && (
                  <nav className="summary-pagination" aria-label="Navigasi halaman ringkasan kelas">
                    <p className="summary-pagination-status">
                      Menampilkan {dosenStartIndex + 1} hingga{' '}
                      {Math.min(
                        dosenStartIndex + DOSEN_SUMMARY_PAGE_SIZE,
                        dosenMetrics.filtered.length,
                      )}{' '}
                      dari {dosenMetrics.filtered.length} kelas (Halaman {currentDosenPage} dari{' '}
                      {totalDosenPages})
                    </p>
                    <div className="summary-pagination-controls">
                      <button
                        type="button"
                        className="button secondary inline-btn"
                        disabled={currentDosenPage <= 1}
                        onClick={() => setDosenPage((p) => Math.max(1, p - 1))}
                      >
                        Sebelumnya
                      </button>
                      <button
                        type="button"
                        className="button secondary inline-btn"
                        disabled={currentDosenPage >= totalDosenPages}
                        onClick={() => setDosenPage((p) => Math.min(totalDosenPages, p + 1))}
                      >
                        Berikutnya
                      </button>
                    </div>
                  </nav>
                )}
              </>
            )}
          </div>
        ))}

      {summary.role === 'ADMIN' && (
        <div className="summary-grid">
          <div className="summary-stats-row">
            <div className="summary-stat-card">
              <span className="summary-stat-label">Pengguna Aktif</span>
              <strong className="summary-stat-value">{summary.totalActiveUsers}</strong>
              <span className="summary-stat-meta">Admin, Dosen &amp; Mahasiswa aktif</span>
            </div>
            <div className="summary-stat-card">
              <span className="summary-stat-label">Kelas Terbuka</span>
              <strong className="summary-stat-value">{summary.totalActiveClasses}</strong>
              <span className="summary-stat-meta">Kelas perkuliahan aktif saat ini</span>
            </div>
            <div className="summary-stat-card">
              <span className="summary-stat-label">Menunggu Aktivasi</span>
              <strong className="summary-stat-value">{summary.pendingStudentCount}</strong>
              <span className="summary-stat-meta">Akun mahasiswa berstatus Pending</span>
            </div>
          </div>

          <div className="summary-box">
            <h4>Antrean Aktivasi Akun Mahasiswa (Pending)</h4>
            {summary.pendingStudents.length === 0 ? (
              <p className="workspace-muted">Tidak ada akun mahasiswa berstatus menunggu saat ini.</p>
            ) : (
              <ul className="summary-list">
                {summary.pendingStudents.map((st) => (
                  <li key={st.id} className="summary-list-item">
                    <div>
                      <strong>{st.fullName}</strong>
                      <span className="workspace-meta-time">{st.email}</span>
                    </div>
                    <button
                      type="button"
                      className="button primary inline-btn"
                      disabled={busyId === st.id}
                      onClick={() => void activateStudent(st.id)}
                    >
                      {busyId === st.id ? 'Mengaktifkan…' : 'Aktifkan'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function ProfileBanner({
  user,
  onUserUpdated,
  onLogout,
}: {
  user: User;
  onUserUpdated: (user: User) => void;
  onLogout: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const fullName = String(form.get('fullName') ?? '').trim();
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');

    if (!fullName && !newPassword) {
      setMessage('Tidak ada perubahan yang dikirimkan.');
      setBusy(false);
      return;
    }

    if (newPassword && !currentPassword) {
      setMessage('Kata sandi saat ini wajib diisi untuk mengganti kata sandi.');
      setBusy(false);
      return;
    }

    try {
      const payload: Record<string, string> = {};
      if (fullName && fullName !== user.fullName) payload.fullName = fullName;
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }
      if (Object.keys(payload).length === 0) {
        setMessage('Nama tampilan tidak berubah.');
        setBusy(false);
        return;
      }
      const res = (await request('/api/users/me/profile', payload, 'PATCH')) as {
        user: User;
        message: string;
      };
      onUserUpdated(res.user);
      setMessage(res.message);
      const pwCur = formEl.elements.namedItem('currentPassword') as HTMLInputElement | null;
      const pwNew = formEl.elements.namedItem('newPassword') as HTMLInputElement | null;
      if (pwCur) pwCur.value = '';
      if (pwNew) pwNew.value = '';
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memperbarui profil.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="profile-banner" aria-label="Profil akun">
      <div className="profile-banner-top">
        <div className="profile-identity">
          <span className="avatar" aria-hidden="true">
            {getInitials(user.fullName)}
          </span>
          <div className="profile-meta">
            <div className="profile-name-row">
              <strong>{user.fullName}</strong>
              <span className="workspace-badge">{roleLabel(user.role)}</span>
            </div>
            <span className="profile-email">{user.email}</span>
          </div>
        </div>

        <div className="profile-banner-actions">
          {!user.mustChangePassword && (
            <button
              type="button"
              className="button secondary inline-btn"
              aria-expanded={expanded}
              onClick={() => {
                setExpanded((v) => !v);
                setMessage('');
              }}
            >
              {expanded ? 'Tutup Edit Profil' : 'Edit Profil & Kata Sandi'}
            </button>
          )}
          <button type="button" className="button secondary inline-btn" onClick={onLogout}>
            Keluar dari akun
          </button>
        </div>
      </div>

      {expanded && !user.mustChangePassword && (
        <div className="profile-edit-drawer">
          <form className="class-form" onSubmit={submitProfile}>
            <h4>Pengaturan Profil Akun</h4>
            <label>
              Nama tampilan
              <input
                name="fullName"
                defaultValue={user.fullName}
                minLength={1}
                maxLength={150}
                required
              />
            </label>
            <div className="workspace-two-col">
              <label>
                Kata sandi saat ini <span className="optional">(jika ganti sandi)</span>
                <input name="currentPassword" type="password" autoComplete="current-password" />
              </label>
              <label>
                Kata sandi baru <span className="optional">(min. 12 karakter)</span>
                <input
                  name="newPassword"
                  type="password"
                  minLength={12}
                  maxLength={200}
                  autoComplete="new-password"
                />
              </label>
            </div>
            {message && (
              <div className="feedback" role="status">
                {message}
              </div>
            )}
            <div>
              <button className="button primary inline-btn" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan Perubahan Profil'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
