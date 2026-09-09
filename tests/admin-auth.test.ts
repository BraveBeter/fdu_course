import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openTestDatabase } from './support/database.js';
import { migrate, type Database } from '../server/database/database.js';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { ensureAccount, createSession, getViewer } from '../server/accounts.js';
import {
  createAdmin,
  loginAdmin,
  resetAdminPassword,
  disableAdmin,
} from '../server/admin-accounts.js';
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
const password = 'synthetic-admin-password-for-tests';
const headers = { origin: 'http://127.0.0.1:5173', 'x-requested-with': 'fdu-course' };
const school = vi.fn();
beforeEach(async () => {
  db = await openTestDatabase();
  await migrate(db);
  school.mockClear();
  app = await buildApp(db, readConfig({ NODE_ENV: 'test', UIS_ENABLED: 'false' }), school);
});
afterEach(async () => {
  await app.close();
  await db.close();
});
const login = (username = 'site.manager', secret = password) =>
  app.inject({
    method: 'POST',
    url: '/api/auth/admin/login',
    headers,
    payload: { username, password: secret },
  });
it('没有学号的独立管理员在 UIS 关闭时登录，安全会话可访问管理后台', async () => {
  const created = await createAdmin(db, 'Site.Manager', password, '课程维护员');
  const result = await login('SITE.MANAGER');
  expect(result.statusCode).toBe(200);
  expect(result.json()).toEqual({ user: created });
  expect(created).toMatchObject({ role: 'admin', authProvider: 'local' });
  const cookie = result.cookies.find((c) => c.name === 'session')!;
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  const dashboard = await app.inject({
    url: '/api/admin/dashboard?term=test',
    cookies: { session: cookie.value },
  });
  expect(dashboard.statusCode).toBe(200);
  expect(school).not.toHaveBeenCalled();
  const stored = (
    await db.query<{ password_hash: string }>('SELECT password_hash FROM admin_credentials')
  ).rows[0]!.password_hash;
  expect(stored).not.toContain(password);
  expect(JSON.stringify(result.json()) + JSON.stringify(dashboard.json())).not.toContain(stored);
  await app.inject({
    method: 'POST',
    url: '/api/auth/logout',
    headers,
    cookies: { session: cookie.value },
  });
  expect(await getViewer(db, cookie.value)).toBeNull();
});
it('普通 UIS 账号不能通过管理员密码登录；用户名冲突不修改现有账号', async () => {
  const student = await ensureAccount(db, '99990000001', readConfig({ NODE_ENV: 'test' }));
  const first = await createAdmin(db, 'site.manager', password, '维护员');
  await expect(createAdmin(db, 'SITE.MANAGER', password, '覆盖账号')).rejects.toMatchObject({
    status: 409,
  });
  expect((await db.query('SELECT id FROM users')).rows).toHaveLength(2);
  expect((await loginAdmin(db, 'site.manager', password)).user.id).toBe(first.id);
  const absent = await login('missing.manager');
  const wrong = await login('site.manager', 'wrong-password');
  expect(absent.statusCode).toBe(401);
  expect(wrong.json()).toEqual(absent.json());
  const token = await createSession(db, student.id);
  expect(
    (await app.inject({ url: '/api/admin/dashboard?term=test', cookies: { session: token } }))
      .statusCode,
  ).toBe(403);
});
it('连续失败会按账号暂时锁定，锁定到期恢复，不依赖浏览器或 IP', async () => {
  await createAdmin(db, 'site.manager', password, '维护员');
  for (let i = 0; i < 5; i++)
    await expect(loginAdmin(db, 'site.manager', 'wrong')).rejects.toMatchObject({ status: 401 });
  await expect(loginAdmin(db, 'site.manager', password)).rejects.toMatchObject({ status: 401 });
  await db.query("UPDATE admin_credentials SET blocked_until=now()-interval '1 second'");
  expect((await loginAdmin(db, 'site.manager', password)).user.role).toBe('admin');
});
it('重置密码和停用使已有会话失效；重置停用账号不会重新启用', async () => {
  await createAdmin(db, 'site.manager', password, '维护员');
  const original = await loginAdmin(db, 'site.manager', password);
  const newPassword = 'synthetic-replacement-password';
  await resetAdminPassword(db, 'site.manager', newPassword);
  expect(await getViewer(db, original.session)).toBeNull();
  await expect(loginAdmin(db, 'site.manager', password)).rejects.toMatchObject({ status: 401 });
  const fresh = await loginAdmin(db, 'site.manager', newPassword);
  await disableAdmin(db, 'site.manager');
  expect(await getViewer(db, fresh.session)).toBeNull();
  await expect(loginAdmin(db, 'site.manager', newPassword)).rejects.toMatchObject({ status: 401 });
  await resetAdminPassword(db, 'site.manager', password);
  await expect(loginAdmin(db, 'site.manager', password)).rejects.toMatchObject({ status: 401 });
});
it('管理员登录校验来源和输入，并限制同一 IP 的尝试频率', async () => {
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/api/auth/admin/login',
        payload: { username: 'site.manager', password },
      })
    ).statusCode,
  ).toBe(403);
  expect((await login('x')).statusCode).toBe(400);
  for (let i = 0; i < 5; i++) await login('unknown.manager', 'wrong');
  expect((await login()).statusCode).toBe(429);
  await expect(createAdmin(db, 'site.manager', 'short', '维护员')).rejects.toThrow();
  expect((await db.query('SELECT id FROM users')).rows).toHaveLength(0);
});
it('切换至管理员登录撤销此前会话；本站管理员不能用学校同步接口', async () => {
  await app.close();
  app = await buildApp(
    db,
    readConfig({
      NODE_ENV: 'test',
      UIS_ENABLED: 'true',
      CONNECTOR_SECRET: 'synthetic-test-connector-secret-12345',
    }),
    school,
  );
  await createAdmin(db, 'site.manager', password, '维护员');
  const student = await ensureAccount(db, '99990000001', readConfig({ NODE_ENV: 'test' }));
  const prior = await createSession(db, student.id);
  const result = await app.inject({
    method: 'POST',
    url: '/api/auth/admin/login',
    headers,
    cookies: { session: prior },
    payload: { username: 'site.manager', password },
  });
  expect(await getViewer(db, prior)).toBeNull();
  const session = result.cookies.find((c) => c.name === 'session')!.value;
  const sync = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers,
    cookies: { session },
    payload: { username: '99990000001', password: 'synthetic' },
  });
  expect(sync.statusCode).toBe(403);
  expect(school).not.toHaveBeenCalled();
});
