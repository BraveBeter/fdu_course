import { openTestDatabase } from './support/database.js';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { migrate, type Database } from '../server/database/database.js';
import { ensureAccount } from '../server/accounts.js';
import { readConfig } from '../server/config.js';
import { createImport, previewImport, commitImport } from '../server/imports.js';
import { listOfferings, classmates } from '../server/catalog.js';
import { repairMissingSchedules } from '../server/repair-schedules.js';
import { parseSchedule } from '../shared/schedule.js';
import type { CourseInput, CourseSnapshot, Viewer } from '../shared/course.js';
const term = '2026-2027学年 第一学期';
const course: CourseInput = {
  term,
  code: 'TEST60001',
  section: '2026202701TEST60001.01',
  name: '测试课程',
  credits: 3,
  teachers: '测试教师',
  department: '测试院系',
  category: '专业选修课',
  schedule: '1~16周 星期一 3~5节 TEST',
  meetings: [
    {
      weeks: [1, 2, 3],
      day: 1,
      start: 3,
      end: 5,
      room: 'TEST',
      teacher: '测试教师',
      raw: '测试安排',
    },
  ],
};
const snapshot = (courses = [course], complete = true): CourseSnapshot => ({
  term,
  courses,
  complete,
  issues: [],
  excluded: 0,
  total: courses.length,
});
let db: Database;
let a: Viewer;
let b: Viewer;
beforeEach(async () => {
  db = await openTestDatabase();
  await migrate(db);
  const config = readConfig({ NODE_ENV: 'test' });
  a = await ensureAccount(db, '99990000001', config);
  b = await ensureAccount(db, '99990000002', config);
});
afterEach(async () => {
  await db.close();
});
async function imported(user = a, courses = [course]) {
  const id = await createImport(db, user.id, snapshot(courses));
  await commitImport(db, user.id, id, false);
  return id;
}
describe('PostgreSQL 导入与权限', () => {
  it('修复已导入的空安排，保留原文、考勤和登记人数，重复执行幂等', async () => {
    const broken = {
      ...course,
      code: 'TEST60002',
      section: '2026202701TEST60002.01',
      meetings: [],
      schedule:
        '1~3(单),6~7,10,13~15周 星期三 6~8节 TEST302 TEACHER（甲）\n2~4(双),5,8~9,11~12,16周 星期三 6~8节 TEST302 乙老师',
    };
    const unknown = {
      ...course,
      code: 'TEST60003',
      section: '2026202701TEST60003.01',
      meetings: [],
      schedule: '待通知的特殊安排',
    };
    await imported(a, [course, broken, unknown]);
    await db.query("UPDATE offerings SET attendance='yellow' WHERE section=$1", [broken.section]);
    const before = await listOfferings(db, term, a.id);
    expect(await repairMissingSchedules(db)).toEqual({ repaired: 1, unresolved: 1 });
    const after = await listOfferings(db, term, a.id);
    expect(after).toEqual(
      before.map((item) =>
        item.section === broken.section
          ? { ...item, meetings: parseSchedule(broken.schedule) }
          : item,
      ),
    );
    expect(await repairMissingSchedules(db)).toEqual({ repaired: 0, unresolved: 1 });
  });
  it('预览不登记，确认幂等，不重复计数', async () => {
    const id = await createImport(db, a.id, snapshot());
    expect(await listOfferings(db, term)).toHaveLength(0);
    expect((await previewImport(db, a.id, id)).additions).toHaveLength(1);
    await commitImport(db, a.id, id, false);
    await commitImport(db, a.id, id, false);
    expect((await listOfferings(db, term, a.id))[0]).toMatchObject({ count: 1, mine: true });
  });
  it('不同用户复用教学班，并发导入人数正确', async () => {
    await Promise.all([imported(a), imported(b)]);
    const offerings = await listOfferings(db, term);
    expect(offerings).toHaveLength(1);
    expect(offerings[0]?.count).toBe(2);
  });
  it('同名不同班、跨学期分别保存', async () => {
    await imported(a, [course, { ...course, section: '2026202701TEST60001.02' }]);
    const nextTerm = '2027-2028学年 第一学期';
    const next = { ...course, term: nextTerm, section: '2027202801TEST60001.01' };
    const id = await createImport(db, a.id, { ...snapshot([next]), term: nextTerm });
    await commitImport(db, a.id, id, true);
    expect(await listOfferings(db, term)).toHaveLength(2);
    expect((await listOfferings(db, term)).every((item) => item.count === 1)).toBe(true);
    expect(await listOfferings(db, nextTerm)).toHaveLength(1);
  });
  it('拒绝混合学期的导入，已有登记保持不变', async () => {
    await imported();
    await expect(
      createImport(db, a.id, snapshot([{ ...course, term: '2027-2028学年 第一学期' }])),
    ).rejects.toMatchObject({ status: 422 });
    expect((await listOfferings(db, term))[0]?.count).toBe(1);
  });
  it('不同顺序的并发导入不会死锁或漏计人数', async () => {
    const courses = Array.from({ length: 8 }, (_, index) => ({
      ...course,
      code: `TEST${index}`,
      section: `2026202701TEST${index}.01`,
    }));
    await Promise.all([imported(a, courses), imported(b, [...courses].reverse())]);
    const offerings = await listOfferings(db, term);
    expect(offerings).toHaveLength(8);
    expect(offerings.every((item) => item.count === 2)).toBe(true);
  });
  it('不完整查询不能取消登记；完整快照可以明确同步取消', async () => {
    await imported();
    const bad = await createImport(db, a.id, snapshot([], false));
    await expect(commitImport(db, a.id, bad, true)).rejects.toMatchObject({ status: 409 });
    expect((await listOfferings(db, term))[0]?.count).toBe(1);
    const good = await createImport(db, a.id, snapshot([]));
    expect((await previewImport(db, a.id, good)).removals).toHaveLength(1);
    await commitImport(db, a.id, good, true);
    expect((await listOfferings(db, term))[0]?.count).toBe(0);
  });
  it('拒绝跨用户预览和名单读取，同班仅返回昵称', async () => {
    const id = await imported();
    await expect(previewImport(db, b.id, id)).rejects.toMatchObject({ status: 404 });
    const offering = (await listOfferings(db, term))[0]!;
    await expect(classmates(db, b, offering.id)).rejects.toMatchObject({ status: 403 });
    expect(Object.keys((await classmates(db, a, offering.id))[0]!)).toEqual(['nickname']);
  });
  it('共享安排变化进入审核，不静默覆盖', async () => {
    await imported();
    await imported(b, [{ ...course, teachers: '新教师' }]);
    expect((await listOfferings(db, term))[0]?.teachers).toBe('测试教师');
    expect((await db.query('SELECT id FROM course_changes')).rows).toHaveLength(1);
  });
  it('导入过期不能提交；数据库迁移可以重复执行', async () => {
    const id = await createImport(db, a.id, snapshot());
    await db.query("UPDATE imports SET expires_at=now()-interval '1 minute' WHERE id=$1", [id]);
    await expect(commitImport(db, a.id, id, false)).rejects.toMatchObject({ status: 410 });
    await migrate(db);
  });
});
