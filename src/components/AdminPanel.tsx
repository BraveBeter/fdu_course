import { useEffect, useState } from 'react';
import { api } from '../api';
import type { AdminDashboard } from '../../shared/admin';
import { AdminCourses, AdminStudents, dateLabel, Pager } from './AdminCatalog';
import {
  attendanceColors,
  attendanceLabels,
  type Attendance,
  type CourseInput,
} from '../../shared/course';
interface Report {
  status: string;
  created_at: string;
  id: string;
  name: string;
  section: string;
  nickname: string;
  color: Attendance;
  note: string;
}
interface Change {
  status: string;
  reason: string;
  created_at: string;
  id: string;
  current: CourseInput;
  proposed: CourseInput;
  nickname: string;
}
interface Decision {
  id: string;
  section: string;
  reviewer: string;
  name: string;
  color: Attendance;
  action: string;
  reason: string;
  created_at: string;
}
function ReviewForm({ report, onReviewed }: { report: Report; onReviewed: () => Promise<void> }) {
  const [color, setColor] = useState(report.color);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function review(action: 'approved' | 'rejected') {
    if (reason.trim().length < 2) {
      setError('请填写至少两个字的处理说明');
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/reports/${report.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action, color, reason }),
      });
      await onReviewed();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="review-card">
      <div className="review-title">
        <strong>{report.name}</strong>
        <span className={`badge ${report.color}`}>{attendanceLabels[report.color]}</span>
      </div>
      <small>
        {report.section} · {report.nickname}
      </small>
      <p className="report-note">{report.note}</p>
      <div className="review-controls">
        <select
          aria-label={`最终颜色 ${report.name}`}
          value={color}
          onChange={(e) => setColor(e.target.value as Attendance)}
        >
          {attendanceColors.map((color) => (
            <option key={color} value={color}>
              {attendanceLabels[color]}
            </option>
          ))}
        </select>
        <input
          aria-label={`处理说明 ${report.name}`}
          placeholder="处理说明（必填）"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
        />
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="panel-actions">
        <button className="button outline" disabled={busy} onClick={() => void review('rejected')}>
          驳回建议
        </button>
        <button className="button primary" disabled={busy} onClick={() => void review('approved')}>
          采纳并更新颜色
        </button>
      </div>
    </article>
  );
}
function ChangeReview({ change, onReviewed }: { change: Change; onReviewed: () => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function review(action: 'approved' | 'rejected') {
    if (reason.trim().length < 2) {
      setError('请填写处理说明');
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/changes/${change.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action, reason }),
      });
      await onReviewed();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="review-card">
      <strong>{change.current.name}</strong>
      <div className="change-comparison">
        <div>
          <small>现有安排</small>
          <p>{change.current.teachers}</p>
          <p>{change.current.schedule}</p>
        </div>
        <div>
          <small>新导入的安排</small>
          <p>{change.proposed.teachers}</p>
          <p>{change.proposed.schedule}</p>
        </div>
      </div>
      <p className="muted">教师变化获准后，考勤颜色将重置为未知。</p>
      <input
        aria-label="课程变更处理说明"
        placeholder="处理说明（必填）"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={1000}
      />
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="panel-actions">
        <button className="button outline" disabled={busy} onClick={() => void review('rejected')}>
          保留原安排
        </button>
        <button className="button primary" disabled={busy} onClick={() => void review('approved')}>
          更新安排
        </button>
      </div>
    </article>
  );
}
const statusLabels: Record<string, string> = {
  pending: '待审核',
  approved: '已采纳',
  rejected: '已驳回',
  superseded: '已被后续反馈替代',
  schedule_reset: '教师变化重置',
};
export function AdminPanel({
  terms,
  initialTerm,
  onChange,
}: {
  terms: string[];
  initialTerm: string;
  onChange: () => Promise<void>;
}) {
  const [term, setTerm] = useState(initialTerm || terms[0] || '');
  const [tab, setTab] = useState('courses');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<AdminDashboard>({ courses: [], students: [] });
  const [reports, setReports] = useState<Report[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [history, setHistory] = useState<Decision[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ term, status });
    void Promise.all([
      api<AdminDashboard>(`/admin/dashboard?${params}`, { signal: controller.signal }),
      api<{ reports: Report[] }>(`/admin/reports?${params}`, { signal: controller.signal }),
      api<{ changes: Change[] }>(`/admin/changes?${params}`, { signal: controller.signal }),
      api<{ decisions: Decision[] }>(`/admin/history?${params}`, { signal: controller.signal }),
    ])
      .then(([dashboard, a, b, c]) => {
        if (controller.signal.aborted) return;
        setData(dashboard);
        setReports(a.reports);
        setChanges(b.changes);
        setHistory(c.decisions);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError((error as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [term, status, revision]);
  useEffect(() => setPage(1), [term, status, query, tab]);
  const updated = async () => {
    setRevision((v) => v + 1);
    await onChange();
  };
  const matches = (...parts: string[]) =>
    parts.join(' ').toLowerCase().includes(query.trim().toLowerCase());
  const filteredReports = reports.filter((r) => matches(r.name, r.section, r.nickname, r.note));
  const filteredChanges = changes.filter((c) =>
    matches(c.current.name, c.current.section, c.proposed.teachers, c.nickname, c.reason),
  );
  const filteredHistory = history.filter((d) => matches(d.name, d.section, d.reviewer, d.reason));
  const total =
    tab === 'reports'
      ? filteredReports.length
      : tab === 'changes'
        ? filteredChanges.length
        : filteredHistory.length;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(total / 20)));
  const start = (currentPage - 1) * 20;
  const pendingReports = data.courses.reduce((n, c) => n + c.pendingReports, 0);
  const pendingChanges = data.courses.reduce((n, c) => n + c.pendingChanges, 0);
  return (
    <div className="admin-dashboard">
      <div className="admin-filters">
        <label>
          学期
          <select
            aria-label="管理学期"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setQuery('');
            }}
          >
            {terms.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="admin-search">
          搜索
          <input
            aria-label="管理搜索"
            placeholder={tab === 'students' ? '昵称或本站编号' : '课程名称、教学班、教师或反馈内容'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <p className="muted">人数为本站登记人数；选课和同步时间按所选学期统计。</p>
      <div className="admin-tabs">
        {[
          ['courses', '课程汇总'],
          ['students', '选课人员'],
          ['reports', `考勤反馈 (${pendingReports})`],
          ['changes', `课程变更 (${pendingChanges})`],
          ['history', '审核记录'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => {
              setTab(id);
              setQuery('');
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {(tab === 'reports' || tab === 'changes') && (
        <select aria-label="审核状态" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">待审核</option>
          <option value="all">全部状态</option>
          <option value="approved">已采纳</option>
          <option value="rejected">已驳回</option>
          <option value="superseded">已替代</option>
        </select>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="panel-empty">
          正在加载管理数据…
        </p>
      ) : (
        !error && (
          <>
            <div className="admin-stats">
              {[
                ['已收录课程', data.courses.length],
                ['本学期登记人员', data.students.filter((s) => s.courseIds.length > 0).length],
                ['选课登记总数', data.courses.reduce((n, c) => n + c.count, 0)],
                ['待审核事项', pendingReports + pendingChanges],
              ].map(([label, count]) => (
                <div key={label}>
                  <strong>{count}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            {tab === 'courses' && (
              <AdminCourses
                key={term}
                courses={data.courses}
                students={data.students}
                query={query}
              />
            )}
            {tab === 'students' && (
              <AdminStudents
                key={term}
                courses={data.courses}
                students={data.students}
                query={query}
              />
            )}
            {tab === 'reports' &&
              (total ? (
                filteredReports.slice(start, start + 20).map((r) =>
                  r.status === 'pending' ? (
                    <ReviewForm key={r.id} report={r} onReviewed={updated} />
                  ) : (
                    <article className="review-card" key={r.id}>
                      <strong>{r.name}</strong>
                      <p>
                        {r.section} · {r.nickname} · {statusLabels[r.status]} ·{' '}
                        {attendanceLabels[r.color]}
                      </p>
                      <p className="report-note">{r.note}</p>
                      <small>{dateLabel(r.created_at)}</small>
                    </article>
                  ),
                )
              ) : (
                <p className="panel-empty">
                  {status === 'pending' && !query ? '暂无待审核反馈' : '没有符合条件的反馈'}
                </p>
              ))}
            {tab === 'changes' &&
              (total ? (
                filteredChanges.slice(start, start + 20).map((c) =>
                  c.status === 'pending' ? (
                    <ChangeReview key={c.id} change={c} onReviewed={updated} />
                  ) : (
                    <article className="review-card" key={c.id}>
                      <strong>{c.current.name}</strong>
                      <p>
                        {c.current.section} · {c.nickname} · {statusLabels[c.status]}
                      </p>
                      <div className="change-comparison">
                        <p>
                          现有安排：{c.current.teachers} · {c.current.schedule}
                        </p>
                        <p>
                          申请安排：{c.proposed.teachers} · {c.proposed.schedule}
                        </p>
                      </div>
                      <p className="report-note">{c.reason}</p>
                      <small>{dateLabel(c.created_at)}</small>
                    </article>
                  ),
                )
              ) : (
                <p className="panel-empty">
                  {status === 'pending' && !query ? '暂无待审核课程变更' : '没有符合条件的课程变更'}
                </p>
              ))}
            {tab === 'history' &&
              (total ? (
                filteredHistory.slice(start, start + 20).map((d) => (
                  <article className="review-card" key={d.id}>
                    <strong>{d.name}</strong>
                    <p className="muted">
                      {d.section} · {statusLabels[d.action]} · {attendanceLabels[d.color]}
                    </p>
                    <p className="report-note">{d.reason}</p>
                    <small>
                      {d.reviewer} · {dateLabel(d.created_at)}
                    </small>
                  </article>
                ))
              ) : (
                <p className="panel-empty">暂无审核记录</p>
              ))}
            {['reports', 'changes', 'history'].includes(tab) && (
              <Pager page={currentPage} total={total} onPage={setPage} />
            )}
          </>
        )
      )}
    </div>
  );
}
