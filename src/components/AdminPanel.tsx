import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import {
  attendanceColors,
  attendanceLabels,
  type Attendance,
  type CourseInput,
} from '../../shared/course';
interface Report {
  id: string;
  name: string;
  section: string;
  nickname: string;
  color: Attendance;
  note: string;
}
interface Change {
  id: string;
  current: CourseInput;
  proposed: CourseInput;
  nickname: string;
}
interface Decision {
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
export function AdminPanel({ onChange }: { onChange: () => Promise<void> }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [history, setHistory] = useState<Decision[]>([]);
  const [tab, setTab] = useState('reports');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([
        api<{ reports: Report[] }>('/admin/reports'),
        api<{ changes: Change[] }>('/admin/changes'),
        api<{ decisions: Decision[] }>('/admin/history'),
      ]);
      setReports(a.reports);
      setChanges(b.changes);
      setHistory(c.decisions);
    } catch (error) {
      setError((error as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const updated = async () => {
    await load();
    await onChange();
  };
  return (
    <>
      <div className="admin-tabs">
        <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>
          考勤反馈 ({reports.length})
        </button>
        <button className={tab === 'changes' ? 'active' : ''} onClick={() => setTab('changes')}>
          课程变更 ({changes.length})
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          审核记录
        </button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {tab === 'reports' &&
        (reports.length ? (
          reports.map((report) => (
            <ReviewForm report={report} onReviewed={updated} key={report.id} />
          ))
        ) : (
          <p className="panel-empty">暂无待审核反馈</p>
        ))}
      {tab === 'changes' &&
        (changes.length ? (
          changes.map((change) => (
            <ChangeReview change={change} onReviewed={updated} key={change.id} />
          ))
        ) : (
          <p className="panel-empty">暂无待审核课程变更</p>
        ))}
      {tab === 'history' &&
        (history.length ? (
          history.map((decision, i) => (
            <article className="review-card" key={i}>
              <strong>{decision.name}</strong>
              <p className="muted">
                {
                  (
                    {
                      approved: '已采纳',
                      rejected: '已驳回',
                      schedule_reset: '教师变化重置',
                    } as Record<string, string>
                  )[decision.action]
                }{' '}
                · {attendanceLabels[decision.color]}
              </p>
              <p className="report-note">{decision.reason}</p>
            </article>
          ))
        ) : (
          <p className="panel-empty">暂无审核记录</p>
        ))}
    </>
  );
}
