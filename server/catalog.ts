import type { Queryable } from './database/database.js';
import type { CourseInput, Offering, Viewer } from '../shared/course.js';
import { AppError } from './errors.js';
export interface OfferingRow {
  id: string;
  payload: CourseInput;
  categories: string[];
  attendance: Offering['attendance'];
  count: string;
  mine: boolean;
}
export async function listOfferings(
  db: Queryable,
  term: string,
  userId?: string,
): Promise<Offering[]> {
  const { rows } = await db.query<OfferingRow>(
    `SELECT o.id,o.payload,o.categories,o.attendance, (SELECT count(*) FROM enrollments e WHERE e.offering_id=o.id) AS count, EXISTS(SELECT 1 FROM enrollments e WHERE e.offering_id=o.id AND e.user_id=$2) AS mine FROM offerings o WHERE term=$1 ORDER BY o.payload->>'name',o.section`,
    [term, userId ?? null],
  );
  return rows.map((row) => ({
    ...row.payload,
    id: row.id,
    categories: row.categories,
    attendance: row.attendance,
    count: Number(row.count),
    mine: row.mine,
  }));
}
export async function requireEnrollment(
  db: Queryable,
  userId: string,
  offeringId: string,
): Promise<void> {
  const { rows } = await db.query('SELECT 1 FROM enrollments WHERE user_id=$1 AND offering_id=$2', [
    userId,
    offeringId,
  ]);
  if (!rows.length) throw new AppError(403, '只有已登记的同班同学可以使用此功能');
}
export async function classmates(
  db: Queryable,
  viewer: Viewer,
  offeringId: string,
): Promise<{ nickname: string }[]> {
  await requireEnrollment(db, viewer.id, offeringId);
  return (
    await db.query<{ nickname: string }>(
      'SELECT u.nickname FROM users u JOIN enrollments e ON e.user_id=u.id WHERE e.offering_id=$1 ORDER BY e.created_at',
      [offeringId],
    )
  ).rows;
}
