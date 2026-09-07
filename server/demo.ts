import type { Database } from './database/database.js';
import type { Config } from './config.js';
import { ensureAccount } from './accounts.js';
import { createImport, commitImport } from './imports.js';
import type { CourseInput, CourseSnapshot } from '../shared/course.js';
export const demoStudent = '99990000001';
export const demoAdmin = '99990000002';
export function demoConfig(config: Config): Config {
  return { ...config, ADMIN_UIS_IDS: demoAdmin };
}
export function demoSnapshot(term: string): CourseSnapshot {
  const names = [
    '机器学习 · 演示',
    '系统安全 · 演示',
    '计算机网络 · 演示',
    '学术英语 · 演示',
    '政治理论 · 演示',
    '分布式系统 · 演示',
    '人工智能导论 · 演示',
    '数据库专题 · 演示',
    '密码学基础 · 演示',
    '自然语言处理 · 演示',
    '算法设计 · 演示',
    '计算机视觉 · 演示',
  ];
  const arrangements = [
    [1, 3, 5],
    [2, 3, 5],
    [3, 6, 8],
    [4, 1, 2],
    [5, 3, 5],
    [1, 9, 11],
    [3, 1, 2],
    [2, 3, 5],
    [2, 3, 5],
    [2, 3, 5],
    [4, 6, 8],
    [5, 9, 11],
  ];
  const courses: CourseInput[] = names.map((name, i) => {
    const [day, start, end] = arrangements[i]!;
    const code = `DEMO${String(i + 1).padStart(5, '0')}`;
    const category = i === 3 ? '第一外国语' : i === 4 ? '政治理论课' : '专业选修课';
    return {
      term,
      code,
      section: `2026202701${code}.01`,
      name,
      credits: i === 3 ? 2 : 3,
      teachers: ['示例教师甲', '示例教师乙', '示例教师丙'][i % 3]!,
      department: i === 3 ? '示例外语院系' : i === 4 ? '示例公共课院系' : '示例计算机院系',
      category,
      schedule: `1~16周 星期${'一二三四五六日'[day! - 1]} ${start}~${end}节 DEMO${100 + i} 示例教师`,
      meetings: [
        {
          weeks: Array.from({ length: 16 }, (_, j) => j + 1),
          day: day!,
          start: start!,
          end: end!,
          room: `DEMO${100 + i}`,
          teacher: ['示例教师甲', '示例教师乙', '示例教师丙'][i % 3]!,
          raw: '合成演示安排',
        },
      ],
    };
  });
  return { term, courses, issues: [], complete: true, excluded: 0, total: courses.length };
}
export async function seedDemo(db: Database, config: Config) {
  if (config.DEMO_MODE !== 'true' || config.NODE_ENV === 'production')
    throw new Error('演示数据仅允许本地测试环境');
  const admin = await ensureAccount(db, demoAdmin, demoConfig(config));
  const student = await ensureAccount(db, demoStudent, demoConfig(config));
  await db.query('UPDATE users SET nickname=$2 WHERE id=$1', [admin.id, '演示管理员']);
  await db.query('UPDATE users SET nickname=$2 WHERE id=$1', [student.id, '演示同学']);
  const snapshot = demoSnapshot(config.CURRENT_TERM);
  const batch = await createImport(db, admin.id, snapshot);
  await commitImport(db, admin.id, batch, false);
  const selected = { ...snapshot, courses: snapshot.courses.slice(0, 5), total: 5 };
  const own = await createImport(db, student.id, selected);
  await commitImport(db, student.id, own, false);
  for (let i = 0; i < snapshot.courses.length; i++)
    await db.query('UPDATE offerings SET attendance=$2 WHERE section=$1 AND term=$3', [
      snapshot.courses[i]!.section,
      ['green', 'red', 'yellow', 'gray'][i % 4],
      config.CURRENT_TERM,
    ]);
}
