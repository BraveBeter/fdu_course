import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
export function AdminLogin({ onComplete }: { onComplete: () => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const signal = (controller.current = new AbortController()).signal;
    try {
      await api('/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        signal,
      });
      await onComplete();
    } catch (error) {
      if (!signal.aborted) setError((error as Error).message);
    } finally {
      setPassword('');
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <form className="stack-form" onSubmit={login}>
      <p className="muted">使用部署者创建的本站管理员账号，无需学号或 UIS 验证。</p>
      <label htmlFor="admin-username">管理员用户名</label>
      <input
        id="admin-username"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        minLength={3}
        maxLength={64}
        required
        disabled={busy}
      />
      <label htmlFor="admin-password">管理员密码</label>
      <input
        id="admin-password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        maxLength={256}
        required
        disabled={busy}
      />
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? '正在登录…' : '登录管理后台'}
      </button>
      <p className="muted">没有账号或忘记密码，请联系部署者创建或重置。</p>
    </form>
  );
}
