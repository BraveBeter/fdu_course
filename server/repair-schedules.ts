import { parseSchedule } from '../shared/schedule.js';
import type { CourseInput, Meeting } from '../shared/course.js';
import type { Database } from './database/database.js';

/** Rebuild missing derived meetings from unchanged source text; retain all registration data. */
export async function repairMissingSchedules(
  db: Database,
): Promise<{ repaired: number; unresolved: number }> {
  return db.transaction(async (tx) => {
    const candidates = await tx.query<{ id: string; payload: CourseInput }>(
      "SELECT id,payload FROM offerings WHERE payload->'meetings'='[]'::jsonb ORDER BY id FOR UPDATE",
    );
    let repaired = 0;
    let unresolved = 0;
    for (const row of candidates.rows) {
      let meetings: Meeting[];
      try {
        meetings = parseSchedule(row.payload.schedule);
      } catch {
        unresolved++;
        continue;
      }
      if (!meetings.length) continue;
      await tx.query(
        "UPDATE offerings SET payload=jsonb_set(payload,'{meetings}',$2::jsonb) WHERE id=$1",
        [row.id, JSON.stringify(meetings)],
      );
      repaired++;
    }
    return { repaired, unresolved };
  });
}
