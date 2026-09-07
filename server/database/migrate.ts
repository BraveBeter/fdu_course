import { readConfig } from '../config.js';
import { openDatabase, migrate } from './database.js';
const db = await openDatabase(readConfig().DATABASE_URL);
try {
  await migrate(db);
  console.log('Database migration complete');
} finally {
  await db.close();
}
