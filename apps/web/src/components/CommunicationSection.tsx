import { useEffect, useState, type FormEvent } from 'react';
import {
  request,
  type Announcement,
  type ClassSummary,
  type ForumTopic,
  type Role,
  type User,
} from '../lib/api.ts';

const EDIT_WINDOW_MS = 15 * 60_000;

function isWithinEditWindow(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() <= EDIT_WINDOW_MS;
}

function roleLabel(role: Role) {
  return role === 'DOSEN' ? 'Dosen' : role === 'MAHASISWA' ? 'Mahasiswa' : 'Admin';
}

export function AnnouncementsPanel({
  classItem,
  role,
  onStatusMessage,
}: {
  classItem: ClassSummary;
  role: Extract<Role, 'DOSEN' | 'MAHASISWA'>;
  onStatusMessage: (msg: string) => void;
}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function loadAnnouncements() {
    setLoading(true);
    try {
      const res = (await request(`/api/classes/${classItem.id}/announcements`, undefined, 'GET')) as {
        announcements: Announcement[];
      };
      setAnnouncements(res.announcements);
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal memuat pengumuman kelas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAnnouncements();
  }, [classItem.id]);

  async function createAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onStatusMessage('');
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    try {
      await request(`/api/classes/${classItem.id}/announcements`, {
        title: String(form.get('title') ?? '').trim(),
        body: String(form.get('body') ?? '').trim(),
      });
      formEl.reset();
      onStatusMessage('Pengumuman berhasil dikirim dan notifikasi diteruskan ke mahasiswa.');
      await loadAnnouncements();
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal membuat pengumuman.');
    } finally {
      setBusy(false);
    }
  }

  const listContent = loading ? (
    <p className="class-empty" role="status">
      Memuat pengumuman…
    </p>
  ) : announcements.length === 0 ? (
    <p className="class-empty">Belum ada pengumuman di kelas ini.</p>
  ) : (
    <div className={role === 'MAHASISWA' ? 'announcements-grid' : 'workspace-items-stack'}>
      {announcements.map((item) => (
        <article className="workspace-item-card" key={item.id}>
          <div className="workspace-item-header">
            <div>
              <h5>{item.title}</h5>
              <div className="workspace-badges">
                <span className="workspace-badge open">{item.authorName}</span>
                <span className="workspace-badge">{roleLabel(item.authorRole)}</span>
                <span className="workspace-meta-time">
                  {new Date(item.createdAt).toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          </div>
          <p className="workspace-body-text">{item.body}</p>
        </article>
      ))}
    </div>
  );

  return (
    <div className={role === 'DOSEN' ? 'workspace-split-layout' : 'workspace-section'}>
      {role === 'DOSEN' && (
        <form className="class-form" onSubmit={createAnnouncement}>
          <h4>Buat Pengumuman Kelas</h4>
          <label>
            Judul pengumuman
            <input name="title" minLength={1} maxLength={160} required />
          </label>
          <label>
            Isi pengumuman
            <textarea name="body" rows={4} minLength={1} maxLength={15000} required />
          </label>
          <div>
            <button className="button primary inline-btn" disabled={busy}>
              {busy ? 'Mengirim…' : 'Terbitkan Pengumuman'}
            </button>
          </div>
        </form>
      )}
      <div className="workspace-section">{listContent}</div>
    </div>
  );
}

export function ForumPanel({
  classItem,
  currentUser,
  onStatusMessage,
}: {
  classItem: ClassSummary;
  currentUser: User;
  onStatusMessage: (msg: string) => void;
}) {
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);

  async function loadTopics() {
    setLoading(true);
    try {
      const res = (await request(`/api/classes/${classItem.id}/forum/topics`, undefined, 'GET')) as {
        topics: ForumTopic[];
      };
      setTopics(res.topics);
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal memuat forum diskusi.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTopics();
  }, [classItem.id]);

  async function createTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    onStatusMessage('');
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    try {
      await request(`/api/classes/${classItem.id}/forum/topics`, {
        title: String(form.get('title') ?? '').trim(),
        body: String(form.get('body') ?? '').trim(),
      });
      formEl.reset();
      onStatusMessage('Topik diskusi baru berhasil dibuat.');
      await loadTopics();
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal membuat topik diskusi.');
    } finally {
      setBusy(false);
    }
  }

  async function saveTopicEdit(event: FormEvent<HTMLFormElement>, topicId: string) {
    event.preventDefault();
    setBusy(true);
    onStatusMessage('');
    const form = new FormData(event.currentTarget);
    try {
      await request(
        `/api/classes/${classItem.id}/forum/topics/${topicId}`,
        {
          title: String(form.get('title') ?? '').trim(),
          body: String(form.get('body') ?? '').trim(),
        },
        'PATCH',
      );
      setEditingTopicId(null);
      onStatusMessage('Topik diskusi berhasil diperbarui.');
      await loadTopics();
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal memperbarui topik diskusi.');
    } finally {
      setBusy(false);
    }
  }

  async function submitReply(event: FormEvent<HTMLFormElement>, topicId: string) {
    event.preventDefault();
    setBusy(true);
    onStatusMessage('');
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    try {
      await request(`/api/classes/${classItem.id}/forum/topics/${topicId}/replies`, {
        body: String(form.get('body') ?? '').trim(),
      });
      formEl.reset();
      onStatusMessage('Balasan berhasil ditambahkan.');
      await loadTopics();
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal mengirim balasan.');
    } finally {
      setBusy(false);
    }
  }

  async function saveReplyEdit(event: FormEvent<HTMLFormElement>, topicId: string, replyId: string) {
    event.preventDefault();
    setBusy(true);
    onStatusMessage('');
    const form = new FormData(event.currentTarget);
    try {
      await request(
        `/api/classes/${classItem.id}/forum/topics/${topicId}/replies/${replyId}`,
        { body: String(form.get('body') ?? '').trim() },
        'PATCH',
      );
      setEditingReplyId(null);
      onStatusMessage('Balasan diskusi diperbarui.');
      await loadTopics();
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal memperbarui balasan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspace-split-layout">
      <form className="class-form" onSubmit={createTopic}>
        <h4>Mulai Topik Diskusi Baru</h4>
        <label>
          Judul topik
          <input name="title" minLength={1} maxLength={160} required />
        </label>
        <label>
          Pertanyaan atau bahasan
          <textarea name="body" rows={4} minLength={1} maxLength={15000} required />
        </label>
        <div>
          <button className="button primary inline-btn" disabled={busy}>
            {busy ? 'Mengirim…' : 'Terbitkan Topik'}
          </button>
        </div>
      </form>

      <div className="workspace-section">
        {loading ? (
          <p className="class-empty" role="status">
            Memuat topik forum diskusi…
          </p>
        ) : topics.length === 0 ? (
          <p className="class-empty">Belum ada topik diskusi. Mulai diskusi pertama di kelas ini.</p>
        ) : (
          <div className="workspace-items-stack">
          {topics.map((topic) => {
            const canEditTopic = currentUser.id === topic.authorId && isWithinEditWindow(topic.createdAt);
            const topicWasEdited =
              new Date(topic.updatedAt).getTime() - new Date(topic.createdAt).getTime() > 2000;

            return (
              <article className="workspace-item-card" key={topic.id}>
                <div className="workspace-item-header">
                  <div>
                    <h5>{topic.title}</h5>
                    <div className="workspace-badges">
                      <span
                        className={`workspace-badge ${topic.authorRole === 'DOSEN' ? 'open' : ''}`}
                      >
                        {topic.authorName}, {roleLabel(topic.authorRole)}
                      </span>
                      <span className="workspace-meta-time">
                        {new Date(topic.createdAt).toLocaleString('id-ID')}
                        {topicWasEdited ? ' (diedit)' : ''}
                      </span>
                      <span className="workspace-badge neutral">{topic.replies.length} balasan</span>
                    </div>
                  </div>
                  {canEditTopic && (
                    <div className="workspace-item-actions">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setEditingTopicId(editingTopicId === topic.id ? null : topic.id)}
                      >
                        {editingTopicId === topic.id ? 'Batal edit' : 'Edit topik'}
                      </button>
                    </div>
                  )}
                </div>

                {editingTopicId === topic.id ? (
                  <form
                    className="workspace-submit-form"
                    onSubmit={(e) => void saveTopicEdit(e, topic.id)}
                  >
                    <label>
                      Judul topik
                      <input
                        name="title"
                        defaultValue={topic.title}
                        minLength={1}
                        maxLength={160}
                        required
                      />
                    </label>
                    <label>
                      Bahasan
                      <textarea
                        name="body"
                        rows={3}
                        defaultValue={topic.body}
                        minLength={1}
                        maxLength={15000}
                        required
                      />
                    </label>
                    <div>
                      <button className="button primary inline-btn" disabled={busy}>
                        {busy ? 'Menyimpan…' : 'Simpan Perubahan'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="workspace-body-text">{topic.body}</p>
                )}

                <div className="workspace-submission-box">
                  <h6>Balasan ({topic.replies.length})</h6>
                  {topic.replies.length === 0 ? (
                    <p className="workspace-muted">Belum ada balasan pada topik ini.</p>
                  ) : (
                    <div className="forum-replies-list">
                      {topic.replies.map((reply) => {
                        const canEditReply =
                          currentUser.id === reply.authorId && isWithinEditWindow(reply.createdAt);
                        const replyWasEdited =
                          new Date(reply.updatedAt).getTime() - new Date(reply.createdAt).getTime() >
                          2000;

                        return (
                          <div key={reply.id} className="forum-reply-item">
                            <div className="workspace-item-header">
                              <div className="workspace-badges workspace-badges--tight">
                                <span
                                  className={`workspace-badge ${
                                    reply.authorRole === 'DOSEN' ? 'open' : ''
                                  }`}
                                >
                                  {reply.authorName}, {roleLabel(reply.authorRole)}
                                </span>
                                <span className="workspace-meta-time">
                                  {new Date(reply.createdAt).toLocaleString('id-ID')}
                                  {replyWasEdited ? ' (diedit)' : ''}
                                </span>
                              </div>
                              {canEditReply && (
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() =>
                                    setEditingReplyId(editingReplyId === reply.id ? null : reply.id)
                                  }
                                >
                                  {editingReplyId === reply.id ? 'Batal' : 'Edit'}
                                </button>
                              )}
                            </div>
                            {editingReplyId === reply.id ? (
                              <form
                                className="workspace-submit-form"
                                onSubmit={(e) => void saveReplyEdit(e, topic.id, reply.id)}
                              >
                                <textarea
                                  name="body"
                                  rows={2}
                                  defaultValue={reply.body}
                                  minLength={1}
                                  maxLength={10000}
                                  required
                                />
                                <div>
                                  <button className="button primary inline-btn" disabled={busy}>
                                    Simpan Balasan
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <p className="workspace-body-text">{reply.body}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <form
                    className="forum-reply-form"
                    onSubmit={(e) => void submitReply(e, topic.id)}
                  >
                    <label>
                      <span className="visually-hidden">Tulis balasan untuk {topic.title}</span>
                      <textarea
                        name="body"
                        rows={2}
                        maxLength={10000}
                        placeholder="Tulis balasan Anda di sini…"
                        required
                      />
                    </label>
                    <div>
                      <button className="button secondary inline-btn" disabled={busy}>
                        {busy ? 'Mengirim…' : 'Kirim Balasan'}
                      </button>
                    </div>
                  </form>
                </div>
              </article>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
}
