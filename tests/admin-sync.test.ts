import { afterEach, beforeEach, expect, it } from 'vitest';
import { openTestDatabase } from './support/database.js';
import { migrate, type Database } from '../server/database/database.js';
import { buildApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { createSession, ensureAccount } from '../server/accounts.js';
import { createImport, commitImport, previewImport } from '../server/imports.js';
import { listOfferings } from '../server/catalog.js';
import { submitReport, reviewReport } from '../server/attendance.js';
import { demoSnapshot } from '../server/demo.js';
import type { CourseSnapshot, Viewer } from '../shared/course.js';
import type { AdminDashboard } from '../shared/admin.js';
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let student: Viewer;
let admin: Viewer;
let studentToken: string;
let adminToken: string;
const term = '2026-2027学年 第一学期';
const nextTerm = '2027-2028学年 第一学期';
const headers = { origin: 'http://127.0.0.1:5173', 'x-requested-with': 'fdu-course' };
const selected = (indices: number[], semester = term): CourseSnapshot => {
  const all = demoSnapshot(semester);
  return { ...all, courses: indices.map((i) => all.courses[i]!), total: indices.length };
};
async function importFor(user: Viewer, snapshot: CourseSnapshot, sync = false) {
  const id = await createImport(db, user.id, snapshot);
  await commitImport(db, user.id, id, sync);
  return id;
}
async function get(path: string, token = adminToken) {
  return app.inject({
    url: `/api/${path}?term=${encodeURIComponent(term)}`,
    cookies: { session: token },
  });
}
beforeEach(async () => {
  db = await openTestDatabase();
  await migrate(db);
  const config = readConfig({ NODE_ENV: 'test', ADMIN_UIS_IDS: '99990000002' });
  app = await buildApp(db, config);
  student = await ensureAccount(db, '99990000001', config);
  admin = await ensureAccount(db, '99990000002', config);
  studentToken = await createSession(db, student.id);
  adminToken = await createSession(db, admin.id);
});
afterEach(async () => {
  await app.close();
  await db.close();
});
it('完整同步新增与退课，保留其他同学、其他学期和共享课程，重复提交幂等', async () => {
  await importFor(student, selected([0, 1]));
  await importFor(admin, selected([0]));
  await importFor(student, selected([0], nextTerm));
  expect((await get('my/sync-status', studentToken)).json().lastSyncedAt).toBeNull();
  const id = await createImport(db, student.id, selected([1, 2]));
  const preview = await previewImport(db, student.id, id);
  expect(preview.additions).toHaveLength(1);
  expect(preview.removals).toHaveLength(1);
  const response = await app.inject({
    method: 'POST',
    url: `/api/imports/${id}/commit`,
    headers,
    cookies: { session: studentToken },
    payload: { removeMissing: true },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ imported: 2, removed: 1 });
  const courses = await listOfferings(db, term, student.id);
  expect(
    courses
      .filter((c) => c.mine)
      .map((c) => c.code)
      .sort(),
  ).toEqual(
    selected([1, 2])
      .courses.map((c) => c.code)
      .sort(),
  );
  expect(courses.find((c) => c.code === selected([0]).courses[0]!.code)).toMatchObject({
    mine: false,
    count: 1,
  });
  expect((await listOfferings(db, nextTerm, student.id))[0]).toMatchObject({
    mine: true,
    count: 1,
  });
  const before = (await get('my/sync-status', studentToken)).json();
  expect(before.lastSyncedAt).toMatch(/^\d{4}-/);
  expect((await commitImport(db, student.id, id, true)).alreadyCommitted).toBe(true);
  expect((await get('my/sync-status', studentToken)).json()).toEqual(before);
  await importFor(student, selected([]), true);
  expect((await listOfferings(db, term, student.id)).filter((c) => c.mine)).toHaveLength(0);
  expect(await listOfferings(db, term)).toHaveLength(3);
});
it('不完整同步不写入新增、不删课、不更新同步时间，较旧预览无法覆盖较新提交', async () => {
  await importFor(student, selected([0]), true);
  const before = (await get('my/sync-status', studentToken)).json();
  const partial = await createImport(db, student.id, { ...selected([1]), complete: false });
  await expect(commitImport(db, student.id, partial, true)).rejects.toMatchObject({ status: 409 });
  expect((await get('my/sync-status', studentToken)).json()).toEqual(before);
  expect((await listOfferings(db, term, student.id)).filter((c) => c.mine)).toHaveLength(1);
  expect(await listOfferings(db, term)).toHaveLength(1);
  const older = await createImport(db, student.id, selected([0]));
  await db.query("UPDATE imports SET created_at=now()-interval '1 minute' WHERE id=$1", [older]);
  await importFor(student, selected([1]), true);
  await expect(commitImport(db, student.id, older, true)).rejects.toMatchObject({ status: 409 });
  expect((await listOfferings(db, term, student.id)).filter((c) => c.mine)[0]?.code).toBe(
    selected([1]).courses[0]!.code,
  );
});
it('管理接口只允许管理员，人员列表不返回身份摘要和会话信息', async () => {
  await importFor(student, selected([0]), true);
  for (const path of ['admin/dashboard', 'admin/reports', 'admin/changes', 'admin/history']) {
    expect((await get(path, '')).statusCode).toBe(401);
    expect((await get(path, studentToken)).statusCode).toBe(403);
    expect((await get(path)).statusCode).toBe(200);
  }
  const dashboard = (await get('admin/dashboard')).json<AdminDashboard>();
  expect(Object.keys(dashboard.students[0]!).sort()).toEqual(
    ['id', 'nickname', 'role', 'courseIds', 'lastSyncedAt'].sort(),
  );
  expect(dashboard.students.find((s) => s.id === student.id)).toMatchObject({
    courseIds: [dashboard.courses[0]!.id],
    lastSyncedAt: expect.any(String),
  });
  expect(JSON.stringify(dashboard)).not.toContain('99990000001');
  expect((await get('my/sync-status', '')).statusCode).toBe(401);
});
it('汇总按学期计算人数、待审数；审核状态筛选和记录匹配', async () => {
  await importFor(student, selected([0, 1]), true);
  await importFor(admin, selected([0]));
  await importFor(student, selected([2], nextTerm), true);
  const courses = await listOfferings(db, term);
  const first = courses.find((c) => c.code === selected([0]).courses[0]!.code)!;
  await submitReport(db, student, first.id, 'yellow', '此前偶尔点名');
  const report = await submitReport(db, student, first.id, 'red', '最近严格点名');
  const change = selected([0]);
  change.courses[0]!.teachers = '新教师';
  await importFor(admin, change);
  let dashboard = (await get('admin/dashboard')).json<AdminDashboard>();
  expect(dashboard.courses).toHaveLength(2);
  expect(dashboard.courses.find((c) => c.id === first.id)).toMatchObject({
    count: 2,
    pendingReports: 1,
    pendingChanges: 1,
  });
  expect(dashboard.students.find((s) => s.id === student.id)?.courseIds).toHaveLength(2);
  expect((await get('admin/reports')).json().reports).toHaveLength(1);
  await reviewReport(db, admin, report.id, 'approved', 'red', '核实通过');
  dashboard = (await get('admin/dashboard')).json<AdminDashboard>();
  expect(dashboard.courses.find((c) => c.id === first.id)).toMatchObject({
    attendance: 'red',
    pendingReports: 0,
  });
  const read = (path: string, semester = term) =>
    app.inject({
      url: `/api/admin/${path}&term=${encodeURIComponent(semester)}`,
      cookies: { session: adminToken },
    });
  expect((await read('reports?status=approved')).json().reports).toHaveLength(1);
  expect((await read('reports?status=all')).json().reports).toHaveLength(2);
  expect((await read('reports?status=all', nextTerm)).json().reports).toHaveLength(0);
  expect((await get('admin/history')).json().decisions[0]).toMatchObject({
    reason: '核实通过',
    section: first.section,
    reviewer: admin.nickname,
  });
  expect((await read('changes?status=pending')).json().changes).toHaveLength(1);
  expect((await read('changes?status=approved')).json().changes).toHaveLength(0);
});

it('旧数据库升级保留既有导入与登记，不把历史导入误标为完整同步', async () => {
  const batch = await importFor(student, selected([0]));
  await db.query('ALTER TABLE imports DROP COLUMN reconciled');
  await db.query('DROP INDEX imports_user_term_created');
  await db.query('DELETE FROM schema_migrations WHERE version=2');
  await migrate(db);
  expect(
    (
      await db.query<{ reconciled: boolean; committed_at: Date }>(
        'SELECT reconciled,committed_at FROM imports WHERE id=$1',
        [batch],
      )
    ).rows[0],
  ).toMatchObject({ reconciled: false, committed_at: expect.any(Date) });
  expect((await listOfferings(db, term, student.id))[0]).toMatchObject({ mine: true, count: 1 });
  expect((await get('my/sync-status', studentToken)).json().lastSyncedAt).toBeNull();
  await migrate(db);
});
