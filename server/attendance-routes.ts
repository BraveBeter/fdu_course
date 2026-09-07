import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from './database/database.js';
import { z } from 'zod';
import { attendanceColors, type Viewer } from '../shared/course.js';
import { requireAdmin, submitReport, reviewReport, reviewCourseChange } from './attendance.js';
export function attendanceRoutes(
  app: FastifyInstance,
  db: Database,
  viewer: (request: FastifyRequest) => Promise<Viewer>,
) {
  app.post('/api/offerings/:id/reports', async (request) => {
    const user = await viewer(request);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { color, note } = z
      .object({ color: z.enum(attendanceColors), note: z.string().trim().min(2).max(1000) })
      .parse(request.body);
    return submitReport(db, user, id, color, note);
  });
  app.get('/api/my/reports', async (request) => {
    const user = await viewer(request);
    return {
      reports: (
        await db.query(
          "SELECT r.id,r.color,r.note,r.status,r.created_at,o.payload->>'name' AS name FROM reports r JOIN offerings o ON o.id=r.offering_id WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 100",
          [user.id],
        )
      ).rows,
    };
  });
  app.get('/api/admin/reports', async (request) => {
    requireAdmin(await viewer(request));
    return {
      reports: (
        await db.query(
          "SELECT r.id,r.color,r.note,r.status,r.created_at,o.payload->>'name' AS name,o.attendance,o.section,u.nickname FROM reports r JOIN offerings o ON o.id=r.offering_id JOIN users u ON u.id=r.user_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 200",
        )
      ).rows,
    };
  });
  app.get('/api/admin/changes', async (request) => {
    requireAdmin(await viewer(request));
    return {
      changes: (
        await db.query(
          "SELECT c.id,c.proposed,o.payload AS current,u.nickname FROM course_changes c JOIN offerings o ON o.id=c.offering_id JOIN users u ON u.id=c.user_id WHERE c.status='pending' ORDER BY c.created_at LIMIT 200",
        )
      ).rows,
    };
  });
  app.get('/api/admin/history', async (request) => {
    requireAdmin(await viewer(request));
    return {
      decisions: (
        await db.query(
          "SELECT d.color,d.action,d.reason,d.created_at,o.payload->>'name' AS name FROM decisions d JOIN offerings o ON o.id=d.offering_id ORDER BY d.created_at DESC LIMIT 100",
        )
      ).rows,
    };
  });
  app.post('/api/admin/reports/:id/review', async (request) => {
    const user = await viewer(request);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { action, color, reason } = z
      .object({
        action: z.enum(['approved', 'rejected']),
        color: z.enum(attendanceColors),
        reason: z.string().trim().min(2).max(1000),
      })
      .parse(request.body);
    return reviewReport(db, user, id, action, color, reason);
  });
  app.post('/api/admin/changes/:id/review', async (request) => {
    const user = await viewer(request);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { action, reason } = z
      .object({
        action: z.enum(['approved', 'rejected']),
        reason: z.string().trim().min(2).max(1000),
      })
      .parse(request.body);
    return reviewCourseChange(db, user, id, action, reason);
  });
}
