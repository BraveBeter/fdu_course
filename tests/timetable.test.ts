import { expect, it } from 'vitest';
import { filterCourses, layoutTimetable } from '../shared/timetable.js';
import type { Offering, Filters } from '../shared/course.js';
const course = (id: string, start = 1, end = 3): Offering => ({
  id,
  term: 'test',
  code: id,
  section: id,
  name: id,
  teachers: '教师',
  department: '院系',
  credits: 3,
  category: '专业选修课',
  categories: ['专业选修课'],
  schedule: '测试',
  meetings: [{ day: 1, start, end, weeks: [1, 3], room: 'TEST', teacher: '教师', raw: '测试' }],
  attendance: 'gray',
  count: 1,
  mine: true,
});
it('链式冲突复用列，首尾包含而相邻节次不冲突', () => {
  const groups = layoutTimetable(
    [course('a', 1, 3), course('b', 3, 5), course('c', 5, 7), course('d', 8, 9)],
    1,
  );
  expect(groups).toHaveLength(2);
  expect(groups[0]?.columns).toBe(2);
  expect(groups[0]?.events.map((event) => event.column)).toEqual([0, 1, 0]);
});
it('只展示当前周，合并同班同一时间的多教师记录', () => {
  const a = course('a');
  a.meetings.push({ ...a.meetings[0]!, teacher: '另一教师' });
  expect(layoutTimetable([a], 2)).toHaveLength(0);
  expect(layoutTimetable([a], 1)[0]?.events).toHaveLength(1);
  expect(layoutTimetable([a], 1)[0]?.events[0]?.meeting.teacher).toContain('另一教师');
});
it('300 门课程、同一时段 20 门都不会丢失', () => {
  const courses = Array.from({ length: 300 }, (_, i) => ({
    ...course(String(i)),
    meetings: [
      {
        ...course(String(i)).meetings[0]!,
        day: (i % 7) + 1,
        start: (Math.floor(i / 7) % 14) + 1,
        end: (Math.floor(i / 7) % 14) + 1,
      },
    ],
  }));
  expect(layoutTimetable(courses, 1).reduce((sum, group) => sum + group.events.length, 0)).toBe(
    300,
  );
  expect(
    layoutTimetable(
      Array.from({ length: 20 }, (_, i) => course(String(i))),
      1,
    )[0]?.columns,
  ).toBe(20);
});
it('颜色内部 OR、维度间 AND，过滤后重排', () => {
  const list = [
    course('a'),
    { ...course('b'), attendance: 'green' as const },
    { ...course('c'), attendance: 'green' as const, mine: false },
    { ...course('d'), attendance: 'red' as const },
  ];
  const filters: Filters = {
    term: 'test',
    week: 1,
    colors: ['green', 'gray'],
    mine: true,
    category: '',
    department: '',
    query: '',
  };
  expect(filterCourses(list, filters).map((course) => course.id)).toEqual(['a', 'b']);
  expect(layoutTimetable(filterCourses(list, filters), 1)[0]?.columns).toBe(2);
  expect(filterCourses(list, { ...filters, colors: [], mine: false })).toHaveLength(4);
});
