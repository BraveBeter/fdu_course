import { useEffect, useState } from 'react';
import type { AdminCourse, AdminStudent } from '../../shared/admin';
import { attendanceColors, attendanceLabels, categories } from '../../shared/course';

export const dateLabel = (value: string | null) =>
  value ? new Date(value).toLocaleString('zh-CN') : '尚未完整同步';
export function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / 20));
  return (
    <div className="admin-pagination">
      <span>
        共 {total} 条 · 第 {page} / {pages} 页
      </span>
      <button className="button outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        上一页
      </button>
      <button className="button outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        下一页
      </button>
    </div>
  );
}
function CourseFacts({ course }: { course: AdminCourse }) {
  return (
    <div className="admin-course-facts">
      <h3>{course.name}</h3>
      <p>{course.section}</p>
      <p>
        {course.teachers} · {course.department} · {course.credits} 学分
      </p>
      <p>
        {course.categories.join(' / ')} · {attendanceLabels[course.attendance]}
      </p>
      <p className="schedule-original">{course.schedule || '尚未排课'}</p>
      <p>
        {course.count} 人登记 · {course.pendingReports} 条待审反馈 · {course.pendingChanges}{' '}
        条待审安排变化
      </p>
    </div>
  );
}
export function AdminCourses({
  courses,
  students,
  query,
}: {
  courses: AdminCourse[];
  students: AdminStudent[];
  query: string;
}) {
  const [color, setColor] = useState('');
  const [category, setCategory] = useState('');
  const [department, setDepartment] = useState('');
  const [pending, setPending] = useState('');
  const [sort, setSort] = useState('count');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('');
  const [rosterQuery, setRosterQuery] = useState('');
  useEffect(() => setPage(1), [query, color, category, department, pending, sort, courses]);
  const course = courses.find((item) => item.id === selected);
  if (course) {
    const roster = students.filter(
      (student) =>
        student.courseIds.includes(course.id) &&
        `${student.nickname} ${student.id}`.toLowerCase().includes(rosterQuery.toLowerCase()),
    );
    return (
      <section>
        <button className="text-button" onClick={() => setSelected('')}>
          ← 返回课程列表
        </button>
        <CourseFacts course={course} />
        <h3>本课程登记人员 ({roster.length})</h3>
        <input
          className="admin-search"
          aria-label="筛选本课程人员"
          placeholder="昵称或本站编号"
          value={rosterQuery}
          onChange={(e) => setRosterQuery(e.target.value)}
        />
        <div className="admin-roster">
          {roster.map((student) => (
            <article key={student.id}>
              <strong>{student.nickname}</strong>
              <small>本站编号 {student.id.slice(0, 8)}</small>
              <span>最近完整同步：{dateLabel(student.lastSyncedAt)}</span>
            </article>
          ))}
        </div>
        {!roster.length && <p className="panel-empty">没有符合条件的登记人员</p>}
      </section>
    );
  }
  const filtered = courses
    .filter(
      (course) =>
        (!color || course.attendance === color) &&
        (!category || course.categories.includes(category)) &&
        (!department || course.department === department) &&
        (!pending || course.pendingReports + course.pendingChanges > 0) &&
        `${course.name} ${course.code} ${course.section} ${course.teachers}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'count'
        ? b.count - a.count || a.name.localeCompare(b.name)
        : sort === 'pending'
          ? b.pendingReports + b.pendingChanges - (a.pendingReports + a.pendingChanges) ||
            a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
    );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)));
  return (
    <section>
      <div className="admin-filters">
        <select aria-label="管理课程考勤" value={color} onChange={(e) => setColor(e.target.value)}>
          <option value="">全部考勤</option>
          {attendanceColors.map((c) => (
            <option key={c} value={c}>
              {attendanceLabels[c]}
            </option>
          ))}
        </select>
        <select
          aria-label="管理课程类别"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">全部类别</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="管理课程院系"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">全部院系</option>
          {[...new Set(courses.map((c) => c.department))].sort().map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select
          aria-label="待审课程筛选"
          value={pending}
          onChange={(e) => setPending(e.target.value)}
        >
          <option value="">所有课程</option>
          <option value="pending">仅有待审事项</option>
        </select>
        <select aria-label="管理课程排序" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="count">登记人数最多</option>
          <option value="pending">待审事项最多</option>
          <option value="name">课程名称</option>
        </select>
      </div>
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>课程 / 教学班</th>
              <th>教师 / 院系</th>
              <th>考勤</th>
              <th>人数</th>
              <th>待审</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice((currentPage - 1) * 20, currentPage * 20).map((course) => (
              <tr key={course.id}>
                <td>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSelected(course.id);
                      setRosterQuery('');
                    }}
                  >
                    {course.name}
                  </button>
                  <small>{course.section}</small>
                </td>
                <td>
                  {course.teachers}
                  <small>{course.department}</small>
                </td>
                <td>
                  <span className={`badge ${course.attendance}`}>
                    {attendanceLabels[course.attendance]}
                  </span>
                </td>
                <td>{course.count}</td>
                <td>{course.pendingReports + course.pendingChanges}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && <p className="panel-empty">没有符合条件的课程</p>}
      <Pager page={currentPage} total={filtered.length} onPage={setPage} />
    </section>
  );
}
export function AdminStudents({
  courses,
  students,
  query,
}: {
  courses: AdminCourse[];
  students: AdminStudent[];
  query: string;
}) {
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('');
  useEffect(() => setPage(1), [query, state, students]);
  const student = students.find((student) => student.id === selected);
  if (student)
    return (
      <section>
        <button className="text-button" onClick={() => setSelected('')}>
          ← 返回人员列表
        </button>
        <div className="admin-course-facts">
          <h3>{student.nickname}</h3>
          <p>
            本站编号 {student.id.slice(0, 8)} · {student.courseIds.length} 门登记
          </p>
          <p>最近完整同步：{dateLabel(student.lastSyncedAt)}</p>
        </div>
        {courses
          .filter((c) => student.courseIds.includes(c.id))
          .map((course) => (
            <CourseFacts key={course.id} course={course} />
          ))}
        {!student.courseIds.length && <p className="panel-empty">该同学在当前学期没有登记课程</p>}
      </section>
    );
  const filtered = students
    .filter(
      (s) =>
        `${s.nickname} ${s.id}`.toLowerCase().includes(query.toLowerCase()) &&
        (!state ||
          (state === 'enrolled'
            ? s.courseIds.length > 0
            : state === 'empty'
              ? s.courseIds.length === 0
              : !s.lastSyncedAt)),
    )
    .sort(
      (a, b) => b.courseIds.length - a.courseIds.length || a.nickname.localeCompare(b.nickname),
    );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)));
  return (
    <section>
      <div className="admin-filters">
        <select aria-label="人员登记筛选" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">全部人员</option>
          <option value="enrolled">本学期有登记</option>
          <option value="empty">本学期无登记</option>
          <option value="unsynced">尚未完整同步</option>
        </select>
      </div>
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>同学 / 本站编号</th>
              <th>角色</th>
              <th>本学期课程</th>
              <th>最近完整同步</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice((currentPage - 1) * 20, currentPage * 20).map((s) => (
              <tr key={s.id}>
                <td>
                  <button className="text-button" onClick={() => setSelected(s.id)}>
                    {s.nickname}
                  </button>
                  <small>{s.id.slice(0, 8)}</small>
                </td>
                <td>{s.role === 'admin' ? '管理员' : '同学'}</td>
                <td>{s.courseIds.length}</td>
                <td>{dateLabel(s.lastSyncedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && <p className="panel-empty">没有符合条件的人员</p>}
      <Pager page={currentPage} total={filtered.length} onPage={setPage} />
    </section>
  );
}
