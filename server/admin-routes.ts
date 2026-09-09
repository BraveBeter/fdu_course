import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Database } from './database/database.js';
import type { Viewer } from '../shared/course.js';
import type { AdminDashboard, AdminStudent, SyncStatus } from '../shared/admin.js';
import { requireAdmin } from './attendance.js';
import { listOfferings } from './catalog.js';

export function adminRoutes(
  app: FastifyInstance,
  db: Database,
  viewer: (r: FastifyRequest) => Promise<Viewer>,
) {
  const query = z.object({ term: z.string().min(1).max(80) });
  app.get('/api/my/sync-status', async (request): Promise<SyncStatus> => {
    const user = await viewer(request);
    const { term } = query.parse(request.query);
    const row = (
      await db.query<{ synced: Date | null; imported: Date | null }>(
        'SELECT max(committed_at) FILTER (WHERE reconciled) AS synced,max(committed_at) AS imported FROM imports WHERE user_id=$1 AND term=$2',
        [user.id, term],
      )
    ).rows[0]!;
    return {
      lastSyncedAt: row.synced?.toISOString() ?? null,
      lastImportedAt: row.imported?.toISOString() ?? null,
    };
  });
  app.get('/api/admin/dashboard', async (request): Promise<AdminDashboard> => {
    requireAdmin(await viewer(request));
    const { term } = query.parse(request.query);
    return db.transaction(async (tx) => {
      await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const courses = await listOfferings(tx, term);
      const pending = await tx.query<{ id: string; reports: string; changes: string }>(
        `SELECT o.id,(SELECT count(*) FROM reports r WHERE r.offering_id=o.id AND r.status='pending') AS reports,
      (SELECT count(*) FROM course_changes c WHERE c.offering_id=o.id AND c.status='pending') AS changes FROM offerings o WHERE o.term=$1`,
        [term],
      );
      const counts = new Map(pending.rows.map((row) => [row.id, row]));
      const students = await tx.query<
        Omit<AdminStudent, 'lastSyncedAt'> & { lastSyncedAt: Date | null }
      >(
        `SELECT u.id,u.nickname,u.role,
      COALESCE((SELECT jsonb_agg(e.offering_id ORDER BY e.offering_id) FROM enrollments e JOIN offerings o ON o.id=e.offering_id WHERE e.user_id=u.id AND o.term=$1),'[]') AS "courseIds",
      (SELECT max(i.committed_at) FROM imports i WHERE i.user_id=u.id AND i.term=$1 AND i.reconciled) AS "lastSyncedAt"
      FROM users u ORDER BY u.nickname,u.id`,
        [term],
      );
      return {
        courses: courses.map((course) => ({
          ...course,
          pendingReports: Number(counts.get(course.id)?.reports ?? 0),
          pendingChanges: Number(counts.get(course.id)?.changes ?? 0),
        })),
        students: students.rows.map((student) => ({
          ...student,
          lastSyncedAt: student.lastSyncedAt?.toISOString() ?? null,
        })),
      };
    });
  });
}
