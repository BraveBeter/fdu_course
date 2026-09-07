import { beforeEach, afterEach, it, expect } from 'vitest';
import { openDatabase, migrate, type Database } from '../server/database/database.js';
import { readConfig } from '../server/config.js';
import { ensureAccount } from '../server/accounts.js';
import { createImport, commitImport } from '../server/imports.js';
import { submitReport, reviewReport, reviewCourseChange } from '../server/attendance.js';
import { listOfferings } from '../server/catalog.js';
import { demoSnapshot } from '../server/demo.js';
import type { Viewer } from '../shared/course.js';
let db: Database;
let student: Viewer;
let admin: Viewer;
let outsider: Viewer;
let offeringId: string;
const term = '2026-2027学年 第一学期';
beforeEach(async () => {
  db = await openDatabase('pglite:');
  await migrate(db);
  const config = readConfig({ NODE_ENV: 'test', ADMIN_UIS_IDS: '99990000002' });
  student = await ensureAccount(db, '99990000001', config);
  admin = await ensureAccount(db, '99990000002', config);
  outsider = await ensureAccount(db, '99990000003', config);
  const id = await createImport(db, student.id, demoSnapshot(term));
  await commitImport(db, student.id, id, false);
  offeringId = (await listOfferings(db, term))[0]!.id;
});
afterEach(async () => {
  await db.close();
});
it('反馈不自动改色，审核后修改，禁止普通同学审核和重复审核', async () => {
  const { id } = await submitReport(db, student, offeringId, 'red', '连续点名');
  expect((await listOfferings(db, term)).find((c) => c.id === offeringId)?.attendance).toBe('gray');
  await expect(reviewReport(db, student, id, 'approved', 'red', '已核实')).rejects.toMatchObject({
    status: 403,
  });
  await reviewReport(db, admin, id, 'approved', 'red', '已核实');
  expect((await listOfferings(db, term)).find((c) => c.id === offeringId)?.attendance).toBe('red');
  await expect(reviewReport(db, admin, id, 'approved', 'green', '再次审核')).rejects.toMatchObject({
    status: 409,
  });
});
it('只有登记者可以反馈，修改反馈保留历史且只有一条待审', async () => {
  await expect(submitReport(db, outsider, offeringId, 'green', '未点名')).rejects.toMatchObject({
    status: 403,
  });
  await submitReport(db, student, offeringId, 'red', '首次反馈');
  await submitReport(db, student, offeringId, 'yellow', '更正反馈');
  expect((await db.query("SELECT id FROM reports WHERE status='pending'")).rows).toHaveLength(1);
  expect((await db.query("SELECT id FROM reports WHERE status='superseded'")).rows).toHaveLength(1);
});
it('驳回不改变现有颜色，记录审核原因', async () => {
  const { id } = await submitReport(db, student, offeringId, 'green', '无考勤');
  await reviewReport(db, admin, id, 'rejected', 'green', '信息不足');
  expect((await listOfferings(db, term)).find((c) => c.id === offeringId)?.attendance).toBe('gray');
  expect((await db.query<{ reason: string }>('SELECT reason FROM decisions')).rows[0]?.reason).toBe(
    '信息不足',
  );
});
it('教师变更审批后重置颜色，保留变更与考勤历史', async () => {
  const old = (await listOfferings(db, term)).find((c) => c.id === offeringId)!;
  const report = await submitReport(db, student, offeringId, 'red', '严格考勤');
  await reviewReport(db, admin, report.id, 'approved', 'red', '确认');
  const snapshot = demoSnapshot(term);
  snapshot.courses = snapshot.courses.map((course) =>
    course.section === old.section ? { ...course, teachers: '替换教师' } : course,
  );
  const batch = await createImport(db, student.id, snapshot);
  await commitImport(db, student.id, batch, false);
  const id = (await db.query<{ id: string }>('SELECT id FROM course_changes')).rows[0]!.id;
  await reviewCourseChange(db, admin, id, 'approved', '学校调整');
  expect((await listOfferings(db, term)).find((c) => c.id === offeringId)).toMatchObject({
    teachers: '替换教师',
    attendance: 'gray',
  });
  expect((await db.query('SELECT id FROM decisions')).rows).toHaveLength(2);
});
