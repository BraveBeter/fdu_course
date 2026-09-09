import { useEffect, useState } from 'react';
import { LoaderCircle, CheckCircle2 } from 'lucide-react';
import type { ImportPreview } from '../../shared/course';
import { api } from '../api';
import { Checkbox } from './ui/checkbox';
export function ImportPanel({
  id,
  sync = false,
  onComplete,
}: {
  id: string;
  sync?: boolean;
  onComplete: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<ImportPreview>();
  const [removeMissing, setRemoveMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api<ImportPreview>(`/imports/${id}`, { signal: controller.signal })
      .then(setPreview)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [id]);
  async function commit() {
    try {
      setBusy(true);
      setError('');
      await api(`/imports/${id}/commit`, {
        method: 'POST',
        body: JSON.stringify({ removeMissing: sync || removeMissing }),
      });
      await onComplete();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!preview ? (
        <p className="muted">正在读取导入预览…</p>
      ) : (
        <>
          <div className="import-summary">
            <div>
              <strong>{preview.snapshot.courses.length}</strong>
              <span>门可导入课程</span>
            </div>
            <div>
              <strong>{preview.additions.length}</strong>
              <span>项新增登记</span>
            </div>
            <div>
              <strong>{preview.changes.length}</strong>
              <span>项安排变化待审</span>
            </div>
            <div>
              <strong>{preview.removals.length}</strong>
              <span>项退课登记</span>
            </div>
          </div>
          {sync && (
            <p className={preview.snapshot.complete ? 'notice' : 'warning-note'}>
              {preview.snapshot.complete
                ? `确认后将本站 ${preview.snapshot.term} 的个人登记与本次学校查询结果对齐：新增课程会登记，已退课程会取消登记。`
                : '本次学校数据不完整，无法执行同步。已有登记保持不变，请重新查询。'}
            </p>
          )}
          {preview.snapshot.issues.length > 0 && (
            <div className="warning-note">
              <strong>部分数据需要确认</strong>
              {preview.snapshot.issues.map((issue, index) => (
                <p key={index}>{issue}</p>
              ))}
              <p>本次不会取消任何已有登记。</p>
            </div>
          )}
          <div className="import-list">
            {preview.snapshot.courses.map((course) => (
              <div key={course.section}>
                <div>
                  <strong>{course.name}</strong>
                  <span>{course.section}</span>
                </div>
                <p>{course.schedule || '时间待定'}</p>
                <small>
                  {preview.additions.includes(course.section) ? '新增登记' : '已在我的课表'} ·{' '}
                  {course.category}
                </small>
              </div>
            ))}
          </div>
          {preview.snapshot.excluded > 0 && (
            <p className="muted">已排除 {preview.snapshot.excluded} 门不在本站收录范围内的课程。</p>
          )}
          {preview.removals.length > 0 && (
            <section className="removal-confirm">
              <h3>学校课表中不再出现</h3>
              <p>{preview.removals.map((course) => course.name).join('、')}</p>
              {!sync && (
                <Checkbox
                  checked={removeMissing}
                  onChange={setRemoveMissing}
                  label="同时取消以上课程的本站登记"
                />
              )}
              <small>只影响本站记录，不操作学校选课。</small>
            </section>
          )}
          <div className="panel-actions">
            <span className="muted">确认后才会公开课程并计入人数</span>
            <button
              className="button primary"
              onClick={() => void commit()}
              disabled={busy || preview.committed || (sync && !preview.snapshot.complete)}
            >
              {busy ? <LoaderCircle size={16} className="spin" /> : <CheckCircle2 size={16} />}
              {sync ? '确认同步选课' : '确认导入'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
