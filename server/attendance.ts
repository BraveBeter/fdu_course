import { randomUUID } from 'node:crypto';
import type { Database } from './database/database.js';
import type { Attendance, Viewer, CourseInput } from '../shared/course.js';
import { requireEnrollment } from './catalog.js';
import { AppError } from './errors.js';
export function requireAdmin(viewer: Viewer): void {
  if (viewer.role !== 'admin') throw new AppError(403, '此操作需要管理员权限');
}
export async function submitReport(
  db: Database,
  user: Viewer,
  offeringId: string,
  color: Attendance,
  note: string,
) {
  return db.transaction(async (tx) => {
    await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
    await requireEnrollment(tx, user.id, offeringId);
    await tx.query(
      "UPDATE reports SET status='superseded' WHERE user_id=$1 AND offering_id=$2 AND status='pending'",
      [user.id, offeringId],
    );
    const id = randomUUID();
    await tx.query(
      'INSERT INTO reports(id,user_id,offering_id,color,note) VALUES($1,$2,$3,$4,$5)',
      [id, user.id, offeringId, color, note],
    );
    return { id };
  });
}
export async function reviewReport(
  db: Database,
  admin: Viewer,
  id: string,
  action: 'approved' | 'rejected',
  color: Attendance,
  reason: string,
) {
  requireAdmin(admin);
  return db.transaction(async (tx) => {
    const report = (
      await tx.query<{ offering_id: string; status: string }>(
        'SELECT offering_id,status FROM reports WHERE id=$1 FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (!report) throw new AppError(404, '反馈不存在');
    if (report.status !== 'pending') throw new AppError(409, '这条反馈已处理，请刷新');
    await tx.query('SELECT id FROM offerings WHERE id=$1 FOR UPDATE', [report.offering_id]);
    if (action === 'approved')
      await tx.query('UPDATE offerings SET attendance=$2 WHERE id=$1', [report.offering_id, color]);
    await tx.query('UPDATE reports SET status=$2,reviewed_at=now() WHERE id=$1', [id, action]);
    await tx.query(
      'INSERT INTO decisions(id,offering_id,report_id,admin_id,color,action,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(), report.offering_id, id, admin.id, color, action, reason],
    );
    return { ok: true };
  });
}
export async function reviewCourseChange(
  db: Database,
  admin: Viewer,
  id: string,
  action: 'approved' | 'rejected',
  reason: string,
) {
  requireAdmin(admin);
  return db.transaction(async (tx) => {
    const change = (
      await tx.query<{ offering_id: string; proposed: CourseInput; status: string }>(
        'SELECT offering_id,proposed,status FROM course_changes WHERE id=$1 FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (!change) throw new AppError(404, '变更不存在');
    if (change.status !== 'pending') throw new AppError(409, '这条变更已处理');
    const offering = (
      await tx.query<{ payload: CourseInput }>(
        'SELECT payload FROM offerings WHERE id=$1 FOR UPDATE',
        [change.offering_id],
      )
    ).rows[0]!;
    if (action === 'approved') {
      const reset = offering.payload.teachers !== change.proposed.teachers;
      await tx.query(
        "UPDATE offerings SET payload=$2,attendance=CASE WHEN $3 THEN 'gray' ELSE attendance END WHERE id=$1",
        [change.offering_id, JSON.stringify(change.proposed), reset],
      );
      if (reset)
        await tx.query(
          "INSERT INTO decisions(id,offering_id,admin_id,color,action,reason) VALUES($1,$2,$3,'gray','schedule_reset',$4)",
          [randomUUID(), change.offering_id, admin.id, '任课教师变化，考勤重置为未知'],
        );
    }
    await tx.query(
      'UPDATE course_changes SET status=$2,reviewed_by=$3,reason=$4,reviewed_at=now() WHERE id=$1',
      [id, action, admin.id, reason],
    );
    return { ok: true };
  });
}
