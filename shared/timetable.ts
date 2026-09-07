import type { Filters, Meeting, Offering } from './course.js';
export interface TimetableEvent {
  key: string;
  course: Offering;
  meeting: Meeting;
  column: number;
}
export interface ConflictGroup {
  key: string;
  day: number;
  start: number;
  end: number;
  columns: number;
  events: TimetableEvent[];
}
export function filterCourses(courses: Offering[], filters: Filters): Offering[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return courses.filter(
    (course) =>
      course.term === filters.term &&
      (!filters.colors.length || filters.colors.includes(course.attendance)) &&
      (!filters.mine || course.mine) &&
      (!filters.category || course.categories.includes(filters.category)) &&
      (!filters.department || course.department === filters.department) &&
      (!query ||
        [course.name, course.code, course.teachers, course.section]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)) &&
      (!course.meetings.length ||
        course.meetings.some((meeting) => meeting.weeks.includes(filters.week))),
  );
}
export function layoutTimetable(courses: Offering[], week: number): ConflictGroup[] {
  const result: ConflictGroup[] = [];
  for (let day = 1; day <= 7; day++) {
    const events: TimetableEvent[] = [];
    for (const course of courses)
      for (const meeting of course.meetings) {
        if (meeting.day !== day || !meeting.weeks.includes(week)) continue;
        const key = `${course.id}-${day}-${meeting.start}-${meeting.end}`;
        const same = events.find((event) => event.key === key);
        if (same) {
          same.meeting = {
            ...same.meeting,
            teacher: [...new Set([same.meeting.teacher, meeting.teacher])]
              .filter(Boolean)
              .join('、'),
            room: [...new Set([same.meeting.room, meeting.room])].filter(Boolean).join(' / '),
          };
          continue;
        }
        events.push({ key, course, meeting: { ...meeting }, column: 0 });
      }
    events.sort(
      (a, b) =>
        a.meeting.start - b.meeting.start ||
        a.meeting.end - b.meeting.end ||
        a.key.localeCompare(b.key),
    );
    let group: ConflictGroup | undefined;
    let ends: number[] = [];
    for (const event of events) {
      if (!group || event.meeting.start > group.end) {
        group = {
          key: event.key,
          day,
          start: event.meeting.start,
          end: event.meeting.end,
          columns: 0,
          events: [],
        };
        result.push(group);
        ends = [];
      }
      let column = ends.findIndex((end) => end < event.meeting.start);
      if (column < 0) column = ends.length;
      ends[column] = event.meeting.end;
      event.column = column;
      group.events.push(event);
      group.end = Math.max(group.end, event.meeting.end);
      group.columns = ends.length;
    }
  }
  return result;
}
