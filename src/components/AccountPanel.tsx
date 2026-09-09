import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, LogOut, ArrowDownToLine } from 'lucide-react';
import { api } from '../api';
import type { Viewer, Attendance } from '../../shared/course';
import { attendanceLabels } from '../../shared/course';
import type { SyncStatus } from '../../shared/admin';
interface Report {
  id: string;
  name: string;
  color: Attendance;
  note: string;
  status: string;
}
export function AccountPanel({
  user,
  sync = false,
  term,
  uisEnabled,
  demo,
  onUserChange,
  onPreview,
}: {
  user: Viewer | null;
  sync?: boolean;
  term: string;
  uisEnabled: boolean;
  demo: boolean;
  onUserChange: () => Promise<void>;
  onPreview: (id: string) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reports, setReports] = useState<Report[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (user)
      api<{ reports: Report[] }>('/my/reports')
        .then((result) => setReports(result.reports))
        .catch((error) => setError(error.message));
  }, [user]);
  useEffect(() => {
    if (!user || !term) return;
    const controller = new AbortController();
    api<SyncStatus>(`/my/sync-status?term=${encodeURIComponent(term)}`, {
      signal: controller.signal,
    })
      .then(setSyncStatus)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [user, term]);
  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('正在验证学校身份并查询已选课程…');
    controller.current?.abort();
    const signal = (controller.current = new AbortController()).signal;
    try {
      const job = await api<{ id: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        signal,
      });
      setPassword('');
      for (let attempt = 0; attempt < 100; attempt++) {
        const state = await api<{
          state: string;
          user?: Viewer;
          previewId?: string;
          message?: string;
        }>(`/auth/jobs/${job.id}`, { signal });
        if (state.state === 'error') throw new Error(state.message);
        if (state.state === 'done') {
          await onUserChange();
          setMessage(state.message ?? '学校身份验证成功');
          if (state.previewId) onPreview(state.previewId);
          return;
        }
        await new Promise<void>((resolve, reject) => {
          const aborted = () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          };
          const timer = setTimeout(() => {
            signal.removeEventListener('abort', aborted);
            resolve();
          }, 1000);
          signal.addEventListener('abort', aborted, { once: true });
        });
      }
      throw new Error('查询超时，请稍后重试');
    } catch (error) {
      if (!signal.aborted) {
        setError((error as Error).message);
        setMessage('');
      }
    } finally {
      setPassword('');
      if (!signal.aborted) setBusy(false);
    }
  }
  async function demoLogin(role: 'student' | 'admin') {
    try {
      setError('');
      setBusy(true);
      await api('/auth/demo', { method: 'POST', body: JSON.stringify({ role }) });
      await onUserChange();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-panel">
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {user && (
        <section>
          <form
            className="nickname-form"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                await api('/me', { method: 'PATCH', body: JSON.stringify({ nickname }) });
                await onUserChange();
                setMessage('昵称已更新');
              } catch (error) {
                setError((error as Error).message);
              }
            }}
          >
            <label htmlFor="nickname">同班显示昵称</label>
            <div>
              <input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={24}
                required
              />
              <button className="button outline">保存</button>
            </div>
          </form>
          <button
            className="text-button logout"
            onClick={async () => {
              try {
                await api('/auth/logout', { method: 'POST' });
                await onUserChange();
                setMessage('已退出登录');
              } catch (error) {
                setError((error as Error).message);
              }
            }}
          >
            <LogOut size={14} />
            退出本站账号
          </button>
        </section>
      )}
      {user?.authProvider !== 'local' && (
        <form onSubmit={login} className="stack-form">
          <h3>{sync ? '同步学校选课' : user ? '重新查询学校课表' : 'UIS 账号登录'}</h3>
          {user && (
            <p className="muted">
              同步学期：{term}
              <br />
              {syncStatus?.lastSyncedAt
                ? `最近完整同步：${new Date(syncStatus.lastSyncedAt).toLocaleString('zh-CN')}`
                : '尚未完成整份选课同步'}
              {sync && (
                <>
                  <br />
                  学校选课发生变化后，请再次同步。密码不保存，因此每次查询需要重新输入。
                </>
              )}
            </p>
          )}
          <p className="form-explanation">
            账号密码经本站服务器用于学校验证，密码不保存。查询可能使原来的学校选课会话退出。
          </p>
          {!uisEnabled && <p className="notice">自动登录尚在验证，暂未开放。已有课表仍可浏览。</p>}
          <label htmlFor="uis-username">学号</label>
          <input
            id="uis-username"
            name="username"
            autoComplete="username"
            inputMode="numeric"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            pattern="[0-9]{8,15}"
            required
            disabled={!uisEnabled || busy}
          />
          <label htmlFor="uis-password">UIS 密码</label>
          <input
            id="uis-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={!uisEnabled || busy}
          />
          <button className="button primary" disabled={!uisEnabled || busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <ArrowDownToLine size={16} />}
            {sync ? '查询学校选课变化' : '验证并预览课程'}
          </button>
        </form>
      )}
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {demo && (
        <section className="demo-actions">
          <h3>开发演示</h3>
          <p>仅体验本站功能，不连接学校。</p>
          <div>
            <button
              className="button outline"
              disabled={busy}
              onClick={() => void demoLogin('student')}
            >
              演示同学登录
            </button>
            <button
              className="button outline"
              disabled={busy}
              onClick={() => void demoLogin('admin')}
            >
              演示管理员登录
            </button>
          </div>
          {user && (
            <button
              className="button outline"
              onClick={async () => {
                try {
                  const result = await api<{ id: string }>('/demo/preview', { method: 'POST' });
                  onPreview(result.id);
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            >
              预览合成课程导入
            </button>
          )}
        </section>
      )}
      {user && reports.length > 0 && (
        <section>
          <h3>我的反馈</h3>
          {reports.slice(0, 10).map((report) => (
            <div className="report-history" key={report.id}>
              <strong>{report.name}</strong>
              <span>
                {attendanceLabels[report.color]} ·{' '}
                {(
                  {
                    pending: '待审核',
                    approved: '已采纳',
                    rejected: '未采纳',
                    superseded: '已更新',
                  } as Record<string, string>
                )[report.status] ?? report.status}
              </span>
              <p>{report.note}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
