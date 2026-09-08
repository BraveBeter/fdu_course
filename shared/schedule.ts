import type { Meeting } from './course.js';

export function parseWeeks(input: string): number[] {
  const text = input
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[，、]/g, ',')
    .replace(/[～—–-]/g, '~')
    .replace(/周/g, '')
    .replace(/\s/g, '');
  if (!text) throw new Error('缺少周次');
  const weeks = new Set<number>();
  for (const part of text.split(',')) {
    const match = /^(\d+)(?:~(\d+))?(?:\((单|双)\))?$/.exec(part);
    if (!match) throw new Error(`无法识别周次：${part}`);
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end > 30 || end < start) throw new Error('周次范围无效');
    for (let week = start; week <= end; week++) {
      if (!match[3] || week % 2 === (match[3] === '单' ? 1 : 0)) weeks.add(week);
    }
  }
  if (!weeks.size) throw new Error('周次没有有效授课周');
  return [...weeks].sort((a, b) => a - b);
}

export function parseSchedule(input: string): Meeting[] {
  const normalized = input.replace(/\u00a0/g, ' ').trim();
  if (!normalized || /^(待定|待排|未排课|时间待定)$/.test(normalized)) return [];
  // A week expression starts with a number, never the preceding teacher's closing bracket.
  const pattern =
    /(\d[\d\s~～,，、()（）单双—–-]*)周\s*(?:星期|周)([一二三四五六日天])\s*(\d+)(?:\s*[~～—–-]\s*(\d+))?\s*节\s*([^]*?)(?=(?:\d[\d\s~～,，、()（）单双—–-]*)周\s*(?:星期|周)[一二三四五六日天]|$)/g;
  const meetings: Meeting[] = [];
  let consumed = 0;
  for (const match of normalized.matchAll(pattern)) {
    if (normalized.slice(consumed, match.index).trim()) throw new Error('存在未识别的授课安排');
    const start = Number(match[3]);
    const end = Number(match[4] ?? match[3]);
    if (start < 1 || end > 20 || end < start) throw new Error('节次范围无效');
    const [room = '', ...teacher] = match[5]!.trim().split(/\s+/);
    meetings.push({
      weeks: parseWeeks(match[1]!),
      day: ('一二三四五六日天'.indexOf(match[2]!) % 7) + 1,
      start,
      end,
      room,
      teacher: teacher.join(' '),
      raw: match[0].trim(),
    });
    if (match[2] === '天') meetings[meetings.length - 1]!.day = 7;
    consumed = match.index! + match[0].length;
  }
  if (!meetings.length || normalized.slice(consumed).trim())
    throw new Error('无法识别上课时间，请核对原文');
  return meetings;
}
