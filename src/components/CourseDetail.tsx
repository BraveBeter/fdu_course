import { useEffect, useState } from 'react';
import { Users, Send } from 'lucide-react';
import {
  attendanceColors,
  attendanceLabels,
  type Attendance,
  type Offering,
} from '../../shared/course';
import { api } from '../api';
export function CourseDetail({
  course,
  onChange,
}: {
  course: Offering;
  onChange: () => Promise<void>;
}) {
  const [classmates, setClassmates] = useState<{ nickname: string }[]>([]);
  const [color, setColor] = useState<Attendance>(course.attendance);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => {
    if (!course.mine) return;
    const controller = new AbortController();
    api<{ classmates: { nickname: string }[] }>(`/offerings/${course.id}/classmates`, {
      signal: controller.signal,
    })
      .then((result) => setClassmates(result.classmates))
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [course.id, course.mine]);
  return (
    <div className="course-detail">
      <span className={`badge ${course.attendance}`}>{attendanceLabels[course.attendance]}</span>
      <dl>
        <dt>任课教师</dt>
        <dd>{course.teachers}</dd>
        <dt>开课院系</dt>
        <dd>{course.department}</dd>
        <dt>课程学分</dt>
        <dd>{course.credits}</dd>
        <dt>登记人数</dt>
        <dd>{course.count} 人</dd>
        <dt>课程类别</dt>
        <dd>{course.categories.join('、')}</dd>
      </dl>
      <h3>授课安排</h3>
      <p className="raw-schedule">{course.schedule || '时间待定'}</p>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {course.mine ? (
        <>
          <h3 className="icon-heading">
            <Users size={16} />
            同班同学
          </h3>
          <div className="classmates">
            {classmates.map((person, i) => (
              <span key={i}>{person.nickname}</span>
            ))}
          </div>
          <form
            className="stack-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError('');
              try {
                await api(`/offerings/${course.id}/reports`, {
                  method: 'POST',
                  body: JSON.stringify({ color, note }),
                });
                setMessage('反馈已提交，管理员审核后会更新颜色。');
                setNote('');
              } catch (error) {
                setError((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>反馈考勤情况</h3>
            <label htmlFor="report-color">你了解的考勤情况</label>
            <select
              id="report-color"
              value={color}
              onChange={(e) => setColor(e.target.value as Attendance)}
            >
              {attendanceColors.map((color) => (
                <option key={color} value={color}>
                  {attendanceLabels[color]}
                </option>
              ))}
            </select>
            <label htmlFor="report-note">简要说明</label>
            <textarea
              id="report-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              minLength={2}
              maxLength={1000}
              required
              placeholder="例如：最近两次课均有签到"
            />
            <button className="button primary" disabled={busy}>
              <Send size={15} />
              提交反馈
            </button>
          </form>
          <div className="remove-enrollment">
            {confirmRemove ? (
              <>
                <p>确认取消本站登记？取消后将无法查看同班昵称，不影响学校选课。</p>
                <button className="button outline" onClick={() => setConfirmRemove(false)}>
                  保留登记
                </button>
                <button
                  className="button danger"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`/offerings/${course.id}/enrollment`, { method: 'DELETE' });
                      await onChange();
                    } catch (error) {
                      setError((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  确认取消登记
                </button>
              </>
            ) : (
              <button className="text-button" onClick={() => setConfirmRemove(true)}>
                取消本站课程登记
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="muted">导入这门已选课程后，可查看同班同学并反馈考勤。</p>
      )}
    </div>
  );
}
