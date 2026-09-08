import { describe, expect, it } from 'vitest';
import { parseWeeks, parseSchedule } from '../shared/schedule.js';
import { parseSnapshot } from '../shared/import-parser.js';
import type { RawCourse } from '../shared/course.js';
const row: RawCourse = {
  term: '2026-2027学年 第一学期',
  code: 'TEST60001',
  nameAndSection: '测试课程2026202701TEST60001.01',
  credits: '3',
  teachers: '测试教师',
  department: '测试院系',
  category: '专业选修课',
  schedule: '1~16周 星期一 3~5节 TEST101 测试教师',
};
describe('学校课表解析', () => {
  it('解析真实格式的复杂单双周', () => {
    expect(parseWeeks('1~3(单),6~7,10,13~15')).toEqual([1, 3, 6, 7, 10, 13, 14, 15]);
    expect(parseWeeks('2~4（双），5，8~9，11~12，16周')).toEqual([2, 4, 5, 8, 9, 11, 12, 16]);
  });
  it('拒绝模糊和越界周次', () => {
    for (const text of ['0~2', '3~1', '1~100', '1,', '每周', '2(单)'])
      expect(() => parseWeeks(text)).toThrow();
  });
  it('拆分轮换教师，不丢失周次', () => {
    const result = parseSchedule(
      '1~3,12~16周 星期二 3~5节 TEST102 甲老师 4~11周 星期二 3~5节 TEST102 乙老师',
    );
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      weeks: [4, 5, 6, 7, 8, 9, 10, 11],
      day: 2,
      start: 3,
      end: 5,
      teacher: '乙老师',
    });
  });
  it('教师姓名的括号不混入下一段单双周，完整保留两组授课周', () => {
    const schedule =
      '1~3(单),6~7,10,13~15周 星期三 6~8节 TEST302 TEACHER（甲）\n2~4(双),5,8~9,11~12,16周 星期三 6~8节 TEST302 乙老师';
    const snapshot = parseSnapshot([{ ...row, schedule }], 1, row.term);
    expect(snapshot.complete).toBe(true);
    expect(snapshot.issues).toEqual([]);
    const meetings = snapshot.courses[0]!.meetings;
    expect(meetings).toHaveLength(2);
    expect(meetings[0]).toMatchObject({
      weeks: [1, 3, 6, 7, 10, 13, 14, 15],
      day: 3,
      start: 6,
      end: 8,
      teacher: 'TEACHER（甲）',
    });
    expect(meetings[1]).toMatchObject({
      weeks: [2, 4, 5, 8, 9, 11, 12, 16],
      teacher: '乙老师',
    });
    expect([...meetings.flatMap((meeting) => meeting.weeks)].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 1),
    );
  });
  it('处理星期天、单节和待定安排', () => {
    expect(parseSchedule('1周 星期天 8节 TEST')).toEqual([
      expect.objectContaining({ day: 7, start: 8, end: 8 }),
    ]);
    expect(parseSchedule('待定')).toEqual([]);
    expect(() => parseSchedule('未知时间')).toThrow();
  });
  it('保留完整教学班编号', () => {
    expect(parseSnapshot([row], 1, row.term).courses[0]).toMatchObject({
      section: '2026202701TEST60001.01',
      name: '测试课程',
    });
  });
  it('分页缺失、重复或分类未知时禁止破坏性同步', () => {
    expect(parseSnapshot([row], 21, row.term).complete).toBe(false);
    expect(parseSnapshot([row, row], 2, row.term).complete).toBe(false);
    expect(parseSnapshot([{ ...row, category: '未知' }], 1, row.term).complete).toBe(false);
  });
  it('排除范围外课程，解析失败保留原文', () => {
    expect(parseSnapshot([{ ...row, category: '公共选修课' }], 1, row.term).excluded).toBe(1);
    const result = parseSnapshot([{ ...row, schedule: '待通知的特殊安排' }], 1, row.term);
    expect(result.complete).toBe(false);
    expect(result.courses[0]?.schedule).toBe('待通知的特殊安排');
  });
});
