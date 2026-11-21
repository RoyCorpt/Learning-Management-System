import { useEffect, useState } from 'react';
import { request, type ClassSummary, type Role } from '../lib/api.ts';

type GradesSectionProps = {
  classItem: ClassSummary;
  role: Extract<Role, 'DOSEN' | 'MAHASISWA'>;
  onStatusMessage: (msg: string) => void;
};

type RecapResponse = {
  assignments: Array<{ id: string; title: string; dueAt: string | null }>;
  quizzes: Array<{ id: string; title: string; status: string }>;
  students: Array<{
    student: { userId: string; fullName: string; email: string };
    assignmentScores: Record<string, { score: string | null; gradeStatus: string | null }>;
    quizScores: Record<string, { score: string | null; status: string | null }>;
    averageScore: string | null;
  }>;
  itemAverages: Record<string, string | null>;
  classAverage: string | null;
};

type MyGradesResponse = {
  assignmentGrades: Array<{
    assignmentId: string;
    assignmentTitle: string;
    dueAt: string | null;
    submissionId: string;
    version: number;
    isLate: boolean;
    score: string | null;
    feedback: string | null;
    gradedAt: string | null;
  }>;
  quizGrades: Array<{
    quizId: string;
    quizTitle: string;
    attemptId: string;
    attemptNumber: number;
    status: 'PROVISIONAL' | 'FINAL';
    autoScore: string;
    manualScore: string;
    finalScore: string | null;
    submittedAt: string | null;
  }>;
};

export function GradesSection({ classItem, role, onStatusMessage }: GradesSectionProps) {
  const [loading, setLoading] = useState(true);
  const [recap, setRecap] = useState<RecapResponse | null>(null);
  const [myGrades, setMyGrades] = useState<MyGradesResponse | null>(null);

  async function loadGrades() {
    setLoading(true);
    try {
      if (role === 'DOSEN') {
        const res = (await request(
          `/api/classes/${classItem.id}/grades/recap`,
          undefined,
          'GET',
        )) as RecapResponse;
        setRecap(res);
      } else {
        const res = (await request(
          `/api/classes/${classItem.id}/my-grades`,
          undefined,
          'GET',
        )) as MyGradesResponse;
        setMyGrades(res);
      }
    } catch (error) {
      onStatusMessage(error instanceof Error ? error.message : 'Gagal memuat data nilai.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadGrades();
  }, [classItem.id, role]);

  if (loading) {
    return (
      <p className="class-empty" role="status">
        Memuat data nilai…
      </p>
    );
  }

  if (role === 'DOSEN') {
    if (!recap) {
      return <p className="class-empty">Data rekap nilai belum tersedia.</p>;
    }

    return (
      <div className="workspace-section">
        <div className="workspace-item-card">
          <div className="workspace-item-header">
            <div>
              <h5>Rekap Nilai Kelas: {classItem.name}</h5>
              <div className="workspace-badges">
                <span className="workspace-badge open">
                  Rata-rata Kelas: {recap.classAverage ?? 'Belum ada nilai'}
                </span>
                <span className="workspace-badge neutral">{recap.students.length} mahasiswa</span>
                <span className="workspace-badge">{recap.assignments.length} tugas</span>
                <span className="workspace-badge">{recap.quizzes.length} kuis</span>
              </div>
            </div>
            <button
              type="button"
              className="button secondary inline-btn"
              onClick={() => void loadGrades()}
            >
              Muat ulang rekap
            </button>
          </div>

          {recap.students.length === 0 ? (
            <p className="workspace-muted">Belum ada mahasiswa yang terdaftar di kelas ini.</p>
          ) : recap.assignments.length === 0 && recap.quizzes.length === 0 ? (
            <p className="workspace-muted">
              Belum ada tugas atau kuis yang dapat direkap di kelas ini.
            </p>
          ) : (
            <div
              className="account-table-scroll"
              role="region"
              aria-label="Matriks rekap nilai mahasiswa"
              tabIndex={0}
            >
              <table className="account-table gradebook-table">
                <thead>
                  <tr>
                    <th scope="col">Mahasiswa</th>
                    {recap.assignments.map((a) => (
                      <th key={a.id} scope="col">
                        <span className="gradebook-col-type">Tugas</span>
                        <span>{a.title}</span>
                      </th>
                    ))}
                    {recap.quizzes.map((q) => (
                      <th key={q.id} scope="col">
                        <span className="gradebook-col-type">Kuis</span>
                        <span>{q.title}</span>
                      </th>
                    ))}
                    <th scope="col">Rata-rata</th>
                  </tr>
                </thead>
                <tbody>
                  {recap.students.map((row) => (
                    <tr key={row.student.userId}>
                      <td className="account-name">
                        {row.student.fullName}
                        <div className="workspace-sub-email">{row.student.email}</div>
                      </td>
                      {recap.assignments.map((a) => {
                        const cell = row.assignmentScores[a.id];
                        return (
                          <td key={a.id}>
                            {cell?.score !== null && cell?.score !== undefined ? (
                              <div className="gradebook-cell">
                                <strong className="num">{cell.score}</strong>
                                <span
                                  className={`workspace-badge ${
                                    cell.gradeStatus === 'PUBLISHED' ? 'open' : 'late'
                                  }`}
                                >
                                  {cell.gradeStatus === 'PUBLISHED' ? 'Dirilis' : 'Draf'}
                                </span>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                        );
                      })}
                      {recap.quizzes.map((q) => {
                        const cell = row.quizScores[q.id];
                        return (
                          <td key={q.id}>
                            {cell?.score !== null && cell?.score !== undefined ? (
                              <div className="gradebook-cell">
                                <strong className="num">{cell.score}</strong>
                                <span
                                  className={`workspace-badge ${
                                    cell.status === 'FINAL' ? 'open' : 'late'
                                  }`}
                                >
                                  {cell.status === 'FINAL' ? 'Final' : 'Sementara'}
                                </span>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <strong className="num">{row.averageScore ?? '-'}</strong>
                      </td>
                    </tr>
                  ))}
                  <tr className="gradebook-average-row">
                    <th scope="row">Rata-rata Kelas per Item</th>
                    {recap.assignments.map((a) => (
                      <td key={a.id}>
                        <strong className="num">{recap.itemAverages[`assignment:${a.id}`] ?? '-'}</strong>
                      </td>
                    ))}
                    {recap.quizzes.map((q) => (
                      <td key={q.id}>
                        <strong className="num">{recap.itemAverages[`quiz:${q.id}`] ?? '-'}</strong>
                      </td>
                    ))}
                    <td>
                      <strong className="num">{recap.classAverage ?? '-'}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // MAHASISWA view
  const assignmentsList = myGrades?.assignmentGrades ?? [];
  const quizzesList = myGrades?.quizGrades ?? [];

  return (
    <div className="workspace-section">
      <div className="workspace-item-card">
        <div className="workspace-item-header">
          <div>
            <h5>Nilai Tugas yang Dipublikasikan</h5>
            <p className="workspace-muted">
              Hanya nilai tugas yang telah dipublikasikan oleh dosen yang ditampilkan di sini.
            </p>
          </div>
          <button
            type="button"
            className="button secondary inline-btn"
            onClick={() => void loadGrades()}
          >
            Muat ulang nilai
          </button>
        </div>

        {assignmentsList.length === 0 ? (
          <p className="workspace-muted">Belum ada nilai tugas yang dipublikasikan di kelas ini.</p>
        ) : (
          <div className="workspace-items-stack">
            {assignmentsList.map((item) => (
              <article key={item.assignmentId} className="workspace-receipt">
                <div className="workspace-item-header">
                  <div>
                    <h6>{item.assignmentTitle}</h6>
                    <div className="workspace-badges">
                      <span className="stamp-seal">Nilai: {item.score ?? '0.00'}</span>
                      <span className="workspace-badge neutral receipt-version">
                        Pengumpulan Versi ke-{item.version}
                      </span>
                      <span className={`workspace-badge ${item.isLate ? 'late' : 'open'}`}>
                        {item.isLate ? 'Terlambat' : 'Tepat waktu'}
                      </span>
                      {item.gradedAt && (
                        <span className="workspace-meta-time">
                          Dinilai {new Date(item.gradedAt).toLocaleString('id-ID')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {item.feedback ? (
                  <p className="workspace-body-text">
                    <strong>Umpan Balik Dosen:</strong> {item.feedback}
                  </p>
                ) : (
                  <p className="workspace-muted">Tidak ada catatan umpan balik tambahan.</p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="workspace-item-card">
        <h5>Hasil Kuis</h5>
        {quizzesList.length === 0 ? (
          <p className="workspace-muted">
            Belum ada riwayat pengerjaan kuis yang dikumpulkan di kelas ini.
          </p>
        ) : (
          <div className="workspace-items-stack">
            {quizzesList.map((q) => (
              <article key={q.attemptId} className="workspace-receipt">
                <div className="workspace-item-header">
                  <div>
                    <h6>
                      {q.quizTitle} (Percobaan ke-{q.attemptNumber})
                    </h6>
                    <div className="workspace-badges">
                      <span
                        className={q.status === 'FINAL' ? 'stamp-seal' : 'stamp-seal late'}
                      >
                        {q.status === 'FINAL'
                          ? `Skor Final: ${q.finalScore ?? q.autoScore}`
                          : `Skor Sementara: ${q.autoScore}`}
                      </span>
                      <span className="workspace-badge neutral num">Pilihan Ganda: {q.autoScore}</span>
                      {Number(q.manualScore) > 0 && (
                        <span className="workspace-badge neutral num">Esai: {q.manualScore}</span>
                      )}
                      {q.submittedAt && (
                        <span className="workspace-meta-time">
                          Dikumpulkan {new Date(q.submittedAt).toLocaleString('id-ID')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
