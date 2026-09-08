import { readConfig } from '../server/config.js';
import { openDatabase } from '../server/database/database.js';
import { repairMissingSchedules } from '../server/repair-schedules.js';

const db = await openDatabase(readConfig().DATABASE_URL);
try {
  console.log(JSON.stringify(await repairMissingSchedules(db)));
} finally {
  await db.close();
}
