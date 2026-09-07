import { randomUUID } from 'node:crypto';
import { openDatabase, type Database } from '../../server/database/database.js';
export async function openTestDatabase(): Promise<Database> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return openDatabase('pglite:');
  const admin = await openDatabase(url);
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const connection = new URL(url);
  connection.searchParams.set('options', `-c search_path=${schema}`);
  const db = await openDatabase(connection.toString());
  return {
    ...db,
    async close() {
      await db.close();
      try {
        await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      } finally {
        await admin.close();
      }
    },
  };
}
