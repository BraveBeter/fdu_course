export const attendanceColors = ['red', 'yellow', 'green', 'gray'] as const;
export type Attendance = (typeof attendanceColors)[number];
export const attendanceLabels: Record<Attendance, string> = {
  red: '严格考勤',
  yellow: '偶尔考勤',
  green: '不考勤',
  gray: '情况未知',
};
export const categories = [
  '政治理论课',
  '第一外国语',
  '学位基础课',
  '学位专业课',
  '专业选修课',
] as const;
export type Category = (typeof categories)[number];
export interface Meeting {
  weeks: number[];
  day: number;
  start: number;
  end: number;
  room: string;
  teacher: string;
  raw: string;
}
export interface CourseInput {
  term: string;
  code: string;
  section: string;
  name: string;
  credits: number;
  teachers: string;
  department: string;
  category: string;
  schedule: string;
  meetings: Meeting[];
}
export interface Offering extends CourseInput {
  id: string;
  attendance: Attendance;
  categories: string[];
  count: number;
  mine: boolean;
}
export interface RawCourse {
  term: string;
  code: string;
  nameAndSection: string;
  credits: string;
  teachers: string;
  department: string;
  category: string;
  schedule: string;
}
export interface CourseSnapshot {
  term: string;
  courses: CourseInput[];
  issues: string[];
  excluded: number;
  complete: boolean;
  total: number;
}
export interface Viewer {
  id: string;
  nickname: string;
  role: 'student' | 'admin';
}
export interface Filters {
  term: string;
  week: number;
  colors: Attendance[];
  mine: boolean;
  category: string;
  department: string;
  query: string;
}
export interface ImportPreview {
  id: string;
  snapshot: CourseSnapshot;
  additions: string[];
  removals: { id: string; name: string }[];
  changes: string[];
  expiresAt: string;
  committed: boolean;
}
