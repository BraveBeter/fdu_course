import { createHash, randomUUID } from 'node:crypto';
import type { CourseInput, CourseSnapshot, ImportPreview } from '../shared/course.js';
import type { Database, Queryable } from './database/database.js';
import { listOfferings } from './catalog.js';
import { AppError } from './errors.js';

interface Batch {
  id: string;
  user_id: string;
  term: string;
  snapshot: CourseSnapshot;
  expires_at: Date;
  committed_at: Date | null;
}
export function courseFingerprint(course: CourseInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        name: course.name,
        teachers: course.teachers,
        department: course.department,
        credits: course.credits,
        schedule: course.schedule,
        meetings: course.meetings,
      }),
    )
    .digest('hex');
}
async function batchFor(db: Queryable, userId: string, id: string, lock = false): Promise<Batch> {
  const batch = (
    await db.query<Batch>(
      `SELECT * FROM imports WHERE id=$1 AND user_id=$2${lock ? ' FOR UPDATE' : ''}`,
      [id, userId],
    )
  ).rows[0];
  if (!batch) throw new AppError(404, '导入记录不存在');
  if (!batch.committed_at && new Date(batch.expires_at).getTime() <= Date.now())
    throw new AppError(410, '导入预览已过期，请重新查询');
  return batch;
}
export async function createImport(
  db: Database,
  userId: string,
  snapshot: CourseSnapshot,
): Promise<string> {
  const id = randomUUID();
  await db.query(
    'INSERT INTO imports(id,user_id,term,snapshot,expires_at) VALUES($1,$2,$3,$4,$5)',
    [id, userId, snapshot.term, JSON.stringify(snapshot), new Date(Date.now() + 600000)],
  );
  return id;
}
export async function previewImport(
  db: Queryable,
  userId: string,
  id: string,
): Promise<ImportPreview> {
  const batch = await batchFor(db, userId, id);
  const existing = await listOfferings(db, batch.term, userId);
  const bySection = new Map(existing.map((offering) => [offering.section, offering]));
  const sections = new Set(batch.snapshot.courses.map((course) => course.section));
  return {
    id,
    snapshot: batch.snapshot,
    expiresAt: new Date(batch.expires_at).toISOString(),
    committed: !!batch.committed_at,
    additions: batch.snapshot.courses
      .filter((course) => !bySection.get(course.section)?.mine)
      .map((course) => course.section),
    changes: batch.snapshot.courses
      .filter((course) => {
        const old = bySection.get(course.section);
        return old && courseFingerprint(old) !== courseFingerprint(course);
      })
      .map((course) => course.section),
    removals: batch.snapshot.complete
      ? existing
          .filter((course) => course.mine && !sections.has(course.section))
          .map((course) => ({ id: course.id, name: course.name }))
      : [],
  };
}
export async function commitImport(
  db: Database,
  userId: string,
  id: string,
  removeMissing: boolean,
): Promise<{ imported: number; removed: number; alreadyCommitted: boolean }> {
  return db.transaction(async (tx) => {
    await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    const batch = await batchFor(tx, userId, id, true);
    if (batch.committed_at)
      return { imported: batch.snapshot.courses.length, removed: 0, alreadyCommitted: true };
    if (removeMissing && !batch.snapshot.complete)
      throw new AppError(409, '课表不完整，不能取消已有登记');
    const offeringIds: string[] = [];
    for (const course of batch.snapshot.courses) {
      await tx.query('INSERT INTO courses(code,name) VALUES($1,$2) ON CONFLICT DO NOTHING', [
        course.code,
        course.name,
      ]);
      await tx.query(
        'INSERT INTO offerings(id,term,section,code,payload,categories) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(school,term,section) DO NOTHING',
        [
          randomUUID(),
          course.term,
          course.section,
          course.code,
          JSON.stringify(course),
          JSON.stringify([course.category]),
        ],
      );
      const row = (
        await tx.query<{ id: string; payload: CourseInput; categories: string[] }>(
          'SELECT id,payload,categories FROM offerings WHERE school=$1 AND term=$2 AND section=$3 FOR UPDATE',
          ['fudan', course.term, course.section],
        )
      ).rows[0]!;
      offeringIds.push(row.id);
      if (courseFingerprint(row.payload) !== courseFingerprint(course))
        await tx.query(
          'INSERT INTO course_changes(id,offering_id,user_id,proposed,fingerprint) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
          [randomUUID(), row.id, userId, JSON.stringify(course), courseFingerprint(course)],
        );
      await tx.query('UPDATE offerings SET categories=$2 WHERE id=$1', [
        row.id,
        JSON.stringify([...new Set([...row.categories, course.category])]),
      ]);
      await tx.query(
        'INSERT INTO enrollments(user_id,offering_id,category) VALUES($1,$2,$3) ON CONFLICT(user_id,offering_id) DO UPDATE SET category=EXCLUDED.category',
        [userId, row.id, course.category],
      );
    }
    let removed = 0;
    if (removeMissing) {
      const result = await tx.query(
        'DELETE FROM enrollments WHERE user_id=$1 AND offering_id IN (SELECT id FROM offerings WHERE term=$2) AND NOT(offering_id=ANY($3::uuid[])) RETURNING offering_id',
        [userId, batch.term, offeringIds],
      );
      removed = result.rows.length;
    }
    await tx.query('UPDATE imports SET committed_at=now() WHERE id=$1', [id]);
    return { imported: offeringIds.length, removed, alreadyCommitted: false };
  });
}
