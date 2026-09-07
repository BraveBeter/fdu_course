import { CalendarDays, Layers3 } from 'lucide-react';
import { attendanceLabels, type Offering } from '../../shared/course';
import { layoutTimetable, type ConflictGroup } from '../../shared/timetable';
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
export function Timetable({
  courses,
  week,
  onCourse,
  onGroup,
  list,
  day,
  onDay,
}: {
  courses: Offering[];
  week: number;
  onCourse: (course: Offering) => void;
  onGroup: (group: ConflictGroup) => void;
  list: boolean;
  day: number;
  onDay: (day: number) => void;
}) {
  const groups = layoutTimetable(courses, week);
  const slots = Math.max(14, ...groups.map((group) => group.end));
  const events = groups.filter((group) => group.day === day).flatMap((group) => group.events);
  return (
    <>
      <div className="mobile-days">
        {weekdays.map((label, index) => (
          <button
            key={label}
            className={day === index + 1 ? 'active' : ''}
            onClick={() => onDay(index + 1)}
          >
            周{label}
          </button>
        ))}
      </div>
      <div className={`timetable-scroll ${list ? 'hide-grid' : ''}`}>
        <div className="timetable" style={{ minHeight: slots * 58 + 52 }}>
          <div className="time-header">节次</div>
          {weekdays.map((day, index) => (
            <div className="day-header" key={day}>
              <span>周{day}</span>
              <small>
                {groups
                  .filter((group) => group.day === index + 1)
                  .reduce((n, group) => n + group.events.length, 0)}{' '}
                节安排
              </small>
            </div>
          ))}
          <div className="time-column">
            {Array.from({ length: slots }, (_, i) => (
              <div key={i}>{String(i + 1).padStart(2, '0')}</div>
            ))}
          </div>
          {weekdays.map((label, index) => (
            <div className="day-column" key={label} style={{ height: slots * 58 }}>
              {Array.from({ length: slots }, (_, i) => (
                <div className="grid-line" key={i} style={{ top: i * 58 }} />
              ))}
              {groups
                .filter((group) => group.day === index + 1)
                .map((group) =>
                  group.columns > 3 ? (
                    <button
                      className="conflict-card"
                      style={{
                        top: (group.start - 1) * 58 + 4,
                        height: (group.end - group.start + 1) * 58 - 8,
                      }}
                      key={group.key}
                      onClick={() => onGroup(group)}
                    >
                      <Layers3 size={19} />
                      <strong>
                        {new Set(group.events.map((event) => event.course.id)).size} 门课程
                      </strong>
                      <span>
                        第 {group.start}–{group.end} 节
                      </span>
                      <span className="conflict-dots">
                        {['red', 'yellow', 'green', 'gray']
                          .filter((color) =>
                            group.events.some((event) => event.course.attendance === color),
                          )
                          .map((color) => (
                            <i className={`dot ${color}`} key={color} />
                          ))}
                      </span>
                      <small>展开全部 →</small>
                    </button>
                  ) : (
                    group.events.map((event) => (
                      <button
                        key={event.key}
                        className={`course-card ${event.course.attendance} ${event.meeting.end - event.meeting.start < 2 ? 'compact' : ''} ${event.meeting.end === event.meeting.start ? 'single' : ''}`}
                        style={{
                          top: (event.meeting.start - 1) * 58 + 4,
                          height: (event.meeting.end - event.meeting.start + 1) * 58 - 8,
                          left: `calc(${(event.column / group.columns) * 100}% + 3px)`,
                          width: `calc(${100 / group.columns}% - 6px)`,
                        }}
                        onClick={() => onCourse(event.course)}
                        aria-label={`${event.course.name}，${attendanceLabels[event.course.attendance]}`}
                      >
                        <span className="card-attendance">
                          {attendanceLabels[event.course.attendance]}
                        </span>
                        <strong>{event.course.name}</strong>
                        <span>{event.meeting.teacher || event.course.teachers}</span>
                        <span className="card-room">{event.meeting.room || '地点待定'}</span>
                        <small>
                          {event.course.count} 人登记 {event.course.mine ? '· 已选' : ''}
                        </small>
                      </button>
                    ))
                  ),
                )}
            </div>
          ))}
        </div>
      </div>
      <div className={`day-list ${list ? 'show-list' : ''}`}>
        {events.length ? (
          events.map((event) => (
            <button className="list-course" key={event.key} onClick={() => onCourse(event.course)}>
              <span className={`list-marker ${event.course.attendance}`} />
              <div className="list-time">
                {event.meeting.start}–{event.meeting.end}
                <small>节</small>
              </div>
              <div className="list-title">
                <strong>{event.course.name}</strong>
                <span>
                  {event.meeting.teacher || event.course.teachers} ·{' '}
                  {event.meeting.room || '地点待定'}
                </span>
              </div>
              <span className={`badge ${event.course.attendance}`}>
                {attendanceLabels[event.course.attendance]}
              </span>
            </button>
          ))
        ) : (
          <div className="empty-day">
            <CalendarDays />
            <p>这一天没有符合条件的课程</p>
            <span>试试切换星期或调整筛选条件</span>
          </div>
        )}
      </div>
      {courses.some((course) => !course.meetings.length) && (
        <section className="pending-schedules">
          <h3>时间待确认</h3>
          {courses
            .filter((course) => !course.meetings.length)
            .map((course) => (
              <button key={course.id} onClick={() => onCourse(course)}>
                {course.name}
                <span>{course.schedule || '尚未排课'}</span>
              </button>
            ))}
        </section>
      )}
    </>
  );
}
