import { AccountPanel } from './components/AccountPanel';
import { ImportPanel } from './components/ImportPanel';
import { CourseDetail } from './components/CourseDetail';
import { AdminPanel } from './components/AdminPanel';
import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  CalendarDays,
  List,
  Search,
  LogIn,
  ArrowUpRight,
  RotateCcw,
  GraduationCap,
  LoaderCircle,
} from 'lucide-react';
import {
  attendanceColors,
  attendanceLabels,
  categories,
  type Attendance,
  type Filters,
  type Offering,
  type Viewer,
} from '../shared/course';
import { filterCourses, type ConflictGroup } from '../shared/timetable';
import { api } from './api';
import { Timetable } from './components/Timetable';
import { Dialog } from './components/ui/dialog';
import { Checkbox } from './components/ui/checkbox';
interface Meta {
  term: string;
  uisEnabled: boolean;
  demo: boolean;
}
const initialFilters = (): Filters => {
  const search = new URLSearchParams(location.search);
  return {
    term: search.get('term') ?? '',
    week: Math.min(30, Math.max(1, Number(search.get('week')) || 1)),
    colors: attendanceColors.filter((color) => search.getAll('color').includes(color)),
    mine: false,
    category: search.get('category') ?? '',
    department: search.get('department') ?? '',
    query: search.get('q') ?? '',
  };
};
export function App() {
  const [meta, setMeta] = useState<Meta>();
  const [user, setUser] = useState<Viewer | null>(null);
  const [courses, setCourses] = useState<Offering[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [list, setList] = useState(false);
  const [day, setDay] = useState(1);
  const [selected, setSelected] = useState<Offering | null>(null);
  const [group, setGroup] = useState<ConflictGroup | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const reload = useCallback(async () => {
    try {
      const [{ user }, metadata, { terms }] = await Promise.all([
        api<{ user: Viewer | null }>('/me'),
        api<Meta>('/meta'),
        api<{ terms: string[] }>('/terms'),
      ]);
      setUser(user);
      setMeta(metadata);
      setTerms(terms);
      setFilters((current) => ({
        ...current,
        term: current.term || metadata.term,
        mine: user ? current.mine : false,
      }));
    } catch (error) {
      setError((error as Error).message);
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!filters.term) return;
    const controller = new AbortController();
    setLoading(true);
    api<{ offerings: Offering[] }>(`/offerings?term=${encodeURIComponent(filters.term)}`, {
      signal: controller.signal,
    })
      .then((result) => {
        setCourses(result.offerings);
        setLoading(false);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(error.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [filters.term, user]);
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.term) params.set('term', filters.term);
    params.set('week', String(filters.week));
    filters.colors.forEach((color) => params.append('color', color));
    if (filters.query) params.set('q', filters.query);
    if (filters.category) params.set('category', filters.category);
    if (filters.department) params.set('department', filters.department);
    history.replaceState(null, '', `${location.pathname}?${params}`);
  }, [filters]);
  const visible = filterCourses(courses, filters);
  const change = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/">
          <span className="brand-icon">
            <GraduationCap size={24} />
          </span>
          <span>
            复旦<span className="brand-divider">/</span>共享课表
            <small>FUDAN COURSE COLLECTIVE</small>
          </span>
        </a>
        <div className="header-right">
          <span className="community-label">由同学共同完善</span>
          {user?.role === 'admin' && (
            <button className="button outline" onClick={() => setAdminOpen(true)}>
              审核管理
            </button>
          )}
          {user ? (
            <button className="button outline" onClick={() => setLoginOpen(true)}>
              {user.nickname}
              <ArrowUpRight size={15} />
            </button>
          ) : (
            <button className="button primary" onClick={() => setLoginOpen(true)}>
              <LogIn size={16} />
              登录 / 导入课表
            </button>
          )}
        </div>
      </header>
      {meta?.demo && <div className="demo-banner">开发演示 · 以下课程和登记均为合成数据</div>}
      <main className="workspace">
        <aside className={`sidebar ${sidebar ? 'sidebar-open' : ''}`}>
          <div className="sidebar-heading">
            <h2>筛选课程</h2>
            <button
              className="text-button"
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  colors: [],
                  mine: false,
                  category: '',
                  department: '',
                  query: '',
                }))
              }
            >
              <RotateCcw size={13} />
              重置
            </button>
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              placeholder="课程、教师或代码"
              aria-label="搜索课程"
              value={filters.query}
              onChange={(e) => change('query', e.target.value)}
            />
          </label>
          <div className="filter-section">
            <span className="field-label">查看范围</span>
            <Checkbox
              checked={filters.mine}
              onChange={(value) => change('mine', value)}
              label="只看我的课程"
              disabled={!user}
            />
            {!user && (
              <button className="login-hint" onClick={() => setLoginOpen(true)}>
                登录后查看个人课表 →
              </button>
            )}
          </div>
          <div className="filter-section">
            <span className="field-label">
              考勤情况 <small>可多选</small>
            </span>
            {attendanceColors.map((color) => (
              <button
                key={color}
                className={`color-filter ${filters.colors.includes(color) ? 'selected' : ''}`}
                onClick={() =>
                  change(
                    'colors',
                    filters.colors.includes(color)
                      ? filters.colors.filter((value) => value !== color)
                      : [...filters.colors, color],
                  )
                }
                aria-pressed={filters.colors.includes(color)}
              >
                <span className={`dot ${color}`} />
                <span>{attendanceLabels[color]}</span>
                <span className="filter-count">
                  {courses.filter((course) => course.attendance === color).length}
                </span>
                <span className="filter-check">{filters.colors.includes(color) ? '✓' : ''}</span>
              </button>
            ))}
            <p className="filter-caption">未勾选颜色时显示全部</p>
          </div>
          <div className="filter-section">
            <label className="field-label" htmlFor="category">
              课程类别
            </label>
            <select
              id="category"
              value={filters.category}
              onChange={(e) => change('category', e.target.value)}
            >
              <option value="">全部类别</option>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
            <label className="field-label spaced" htmlFor="department">
              开课院系
            </label>
            <select
              id="department"
              value={filters.department}
              onChange={(e) => change('department', e.target.value)}
            >
              <option value="">全部院系</option>
              {[...new Set(courses.map((course) => course.department))].sort().map((department) => (
                <option key={department}>{department}</option>
              ))}
            </select>
          </div>
          <div className="sidebar-note">
            <BookOpen size={18} />
            <p>你的课表，也是大家的参考。</p>
            <span>导入已选课程，共同补全课程安排与考勤信息。</span>
          </div>
        </aside>
        <section className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">一起发现适合自己的课程</span>
              <h1>这一周，学什么？</h1>
              <p>
                已收录 <strong>{courses.length}</strong> 门课程<span>·</span>当前显示{' '}
                <strong>{visible.length}</strong> 门
              </p>
            </div>
            <button className="button outline filter-toggle" onClick={() => setSidebar(!sidebar)}>
              <SlidersHorizontal size={16} />
              筛选
            </button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                onClick={() => {
                  setError('');
                  void reload();
                }}
              >
                重试
              </button>
            </div>
          )}
          <div className="schedule-toolbar">
            <select
              aria-label="学期"
              value={filters.term}
              onChange={(e) => change('term', e.target.value)}
            >
              {terms.map((term) => (
                <option key={term}>{term}</option>
              ))}
            </select>
            <div className="week-switch">
              <button
                className="icon-button"
                aria-label="上一周"
                disabled={filters.week <= 1}
                onClick={() => change('week', filters.week - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <select
                aria-label="教学周"
                value={filters.week}
                onChange={(e) => change('week', Number(e.target.value))}
              >
                {Array.from({ length: 30 }, (_, i) => (
                  <option value={i + 1} key={i}>
                    第 {i + 1} 周
                  </option>
                ))}
              </select>
              <button
                className="icon-button"
                aria-label="下一周"
                disabled={filters.week >= 30}
                onClick={() => change('week', filters.week + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="view-switch">
              <button
                className={!list ? 'active' : ''}
                aria-label="周课表"
                aria-pressed={!list}
                onClick={() => setList(false)}
              >
                <CalendarDays size={17} />
              </button>
              <button
                className={list ? 'active' : ''}
                aria-label="日列表"
                aria-pressed={list}
                onClick={() => setList(true)}
              >
                <List size={17} />
              </button>
            </div>
          </div>
          <div className="schedule-surface">
            {loading ? (
              <div className="loading-state">
                <LoaderCircle className="spin" />
                正在读取课程…
              </div>
            ) : !courses.length ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <CalendarDays size={32} />
                </div>
                <h2>一起填满第一张课表</h2>
                <p>从你的已选课程开始。确认导入后，课程就会出现在这里。</p>
                <button className="button primary" onClick={() => setLoginOpen(true)}>
                  登录并导入课程
                  <ArrowUpRight size={16} />
                </button>
              </div>
            ) : !visible.length ? (
              <div className="empty-state">
                <Search size={30} />
                <h2>没有符合条件的课程</h2>
                <p>试试切换教学周，或减少筛选条件。</p>
              </div>
            ) : (
              <Timetable
                courses={visible}
                week={filters.week}
                onCourse={setSelected}
                onGroup={setGroup}
                list={list}
                day={day}
                onDay={setDay}
              />
            )}
          </div>
          <footer className="schedule-footer">
            <span>人数为本站登记人数</span>
            <span>考勤信息来自同学反馈，经管理员审核</span>
          </footer>
        </section>
      </main>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.name ?? '课程详情'}
        description={selected?.section}
      >
        {selected && (
          <CourseDetail
            key={selected.id}
            course={selected}
            onChange={async () => {
              setSelected(null);
              await reload();
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={!!group}
        onOpenChange={(open) => !open && setGroup(null)}
        title="这个时段的课程"
        description="所有重叠课程都在这里，点击查看完整安排。"
      >
        {group?.events.map((event) => (
          <button
            className="group-course"
            key={event.key}
            onClick={() => {
              setGroup(null);
              setSelected(event.course);
            }}
          >
            <span className={`dot ${event.course.attendance}`} />
            <div>
              <strong>{event.course.name}</strong>
              <span>
                第 {event.meeting.start}–{event.meeting.end} 节 · {event.meeting.room} ·{' '}
                {event.meeting.teacher || event.course.teachers}
              </span>
            </div>
            <ChevronRight size={16} />
          </button>
        ))}
      </Dialog>
      <Dialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        title="登录与课程导入"
        description="使用学校 UIS 账号验证身份，确认后导入课程。"
      >
        <AccountPanel
          key={user?.id ?? 'guest'}
          user={user}
          uisEnabled={meta?.uisEnabled ?? false}
          demo={meta?.demo ?? false}
          onUserChange={reload}
          onPreview={(id) => {
            setLoginOpen(false);
            setPreviewId(id);
          }}
        />
      </Dialog>
      <Dialog
        open={!!previewId}
        onOpenChange={(open) => !open && setPreviewId(null)}
        title="确认导入课程"
        description="请核对查询结果。确认前不会更改共享课程或个人登记。"
        wide
      >
        {previewId && (
          <ImportPanel
            id={previewId}
            onComplete={async () => {
              setPreviewId(null);
              await reload();
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={adminOpen}
        onOpenChange={setAdminOpen}
        title="审核管理"
        description="审核同学反馈，维护共享课程信息。"
        wide
      >
        {adminOpen && <AdminPanel onChange={reload} />}
      </Dialog>
    </div>
  );
}
