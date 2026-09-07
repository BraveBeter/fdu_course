import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { buildApp } from '../server/app.js';
import { openDatabase, migrate, type Database } from '../server/database/database.js';
import { ensureAccount, createSession } from '../server/accounts.js';
import { readConfig } from '../server/config.js';
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
const origin = 'http://127.0.0.1:5173';
const headers = { origin, 'x-requested-with': 'fdu-course' };
beforeEach(async () => {
  db = await openDatabase('pglite:');
  await migrate(db);
  app = await buildApp(
    db,
    readConfig({
      NODE_ENV: 'test',
      UIS_ENABLED: 'true',
      CONNECTOR_SECRET: 'test-secret-that-is-at-least-32-characters',
    }),
    async (username) => ({ studentNo: username, queryError: '测试：学校查询维护' }),
  );
});
afterEach(async () => {
  await app.close();
  await db.close();
});
it('写接口检查来源，未登录无法读取个人数据', async () => {
  expect(
    (await app.inject({ method: 'PATCH', url: '/api/me', payload: { nickname: '更改' } }))
      .statusCode,
  ).toBe(403);
  expect((await app.inject('/api/imports/00000000-0000-4000-8000-000000000000')).statusCode).toBe(
    401,
  );
});
it('成功学校认证发出安全会话，查询失败不影响本站登录，任务不能跨浏览器读取', async () => {
  const start = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers,
    payload: { username: '99990000001', password: 'synthetic-test-password' },
  });
  expect(start.statusCode).toBe(200);
  const id = start.json().id;
  const flow = start.cookies.find((cookie) => cookie.name === 'auth_flow')!.value;
  expect((await app.inject(`/api/auth/jobs/${id}`)).statusCode).toBe(404);
  let result = await app.inject({ url: `/api/auth/jobs/${id}`, cookies: { auth_flow: flow } });
  await vi.waitFor(async () => {
    result = await app.inject({ url: `/api/auth/jobs/${id}`, cookies: { auth_flow: flow } });
    expect(result.json().state).toBe('done');
  });
  expect(result.json().user.role).toBe('student');
  expect(result.json().message).toContain('查询维护');
  expect(JSON.stringify(result.json())).not.toContain('99990000001');
  const session = result.cookies.find((cookie) => cookie.name === 'session')!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe('Lax');
  const me = await app.inject({ url: '/api/me', cookies: { session: session.value } });
  expect(me.json().user).not.toBeNull();
  await app.inject({
    method: 'POST',
    url: '/api/auth/logout',
    headers,
    cookies: { session: session.value, auth_flow: flow },
  });
  expect(
    (await app.inject({ url: '/api/me', cookies: { session: session.value } })).json().user,
  ).toBeNull();
  expect(
    (await app.inject({ url: `/api/auth/jobs/${id}`, cookies: { auth_flow: flow } })).statusCode,
  ).toBe(404);
});
it('昵称只修改当前用户，过期会话不能修改', async () => {
  const user = await ensureAccount(db, '99990000001', readConfig({ NODE_ENV: 'test' }));
  const token = await createSession(db, user.id);
  expect(
    (
      await app.inject({
        method: 'PATCH',
        url: '/api/me',
        headers,
        cookies: { session: token },
        payload: { nickname: '测试昵称' },
      })
    ).json().user.nickname,
  ).toBe('测试昵称');
  await db.query("UPDATE sessions SET expires_at=now()-interval '1 minute'");
  expect(
    (
      await app.inject({
        method: 'PATCH',
        url: '/api/me',
        headers,
        cookies: { session: token },
        payload: { nickname: '失效' },
      })
    ).statusCode,
  ).toBe(401);
});
it('生产配置拒绝演示登录与开发密钥', () => {
  expect(() => readConfig({ NODE_ENV: 'production', DEMO_MODE: 'true' })).toThrow();
});
