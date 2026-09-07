import { categories, type CourseSnapshot, type RawCourse } from './course.js';
import { parseSchedule } from './schedule.js';

export function normalizeCategory(value: string): string {
  const text = value.trim();
  if (['第一外国语课', '第一外国语课程', '第一外语', '第一外语课程'].includes(text))
    return '第一外国语';
  return text;
}
export function parseSnapshot(rows: RawCourse[], total: number, term: string): CourseSnapshot {
  const snapshot: CourseSnapshot = {
    term,
    courses: [],
    issues: [],
    excluded: 0,
    complete: rows.length === total,
    total,
  };
  if (!snapshot.complete) snapshot.issues.push('分页数据不完整，不能同步取消登记');
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.term !== term) continue;
    const category = normalizeCategory(row.category);
    if (
      ['专业外语', '专业外语课', '公共选修课', '其他选修课', '跨一级学科选修课'].includes(category)
    ) {
      snapshot.excluded++;
      continue;
    }
    if (!(categories as readonly string[]).includes(category)) {
      snapshot.issues.push(`${row.code}：课程类别待确认`);
      snapshot.complete = false;
      continue;
    }
    const section = /(\d{10}[A-Z][A-Z0-9]*\.\d+)\s*$/.exec(row.nameAndSection)?.[1];
    const name = section
      ? row.nameAndSection
          .slice(0, row.nameAndSection.lastIndexOf(section))
          .trim()
          .replace(/[|｜]\s*$/, '')
      : '';
    const credits = Number(row.credits);
    if (
      !section ||
      !name ||
      !row.code ||
      !section.includes(row.code + '.') ||
      !Number.isFinite(credits) ||
      credits < 0
    ) {
      snapshot.issues.push(`${row.code || '未知课程'}：班级编号或基本信息无效`);
      snapshot.complete = false;
      continue;
    }
    if (seen.has(section)) {
      snapshot.issues.push(`${row.code}：分页出现重复教学班`);
      snapshot.complete = false;
      continue;
    }
    seen.add(section);
    try {
      snapshot.courses.push({
        term,
        code: row.code,
        section,
        name,
        credits,
        teachers: row.teachers,
        department: row.department,
        category,
        schedule: row.schedule,
        meetings: parseSchedule(row.schedule),
      });
    } catch {
      snapshot.issues.push(`${row.code}：上课时间待确认，已保留原文`);
      snapshot.complete = false;
      snapshot.courses.push({
        term,
        code: row.code,
        section,
        name,
        credits,
        teachers: row.teachers,
        department: row.department,
        category,
        schedule: row.schedule,
        meetings: [],
      });
    }
  }
  return snapshot;
}
