import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
  transaction<T>(run: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function openDatabase(url: string): Promise<Database> {
  if (url.startsWith('pglite:')) {
    const client = new PGlite(url.slice(7) || undefined);
    await client.waitReady;
    return {
      query: (sql, params) => client.query(sql, params),
      transaction: (run) =>
        client.transaction((tx) => run({ query: (sql, params) => tx.query(sql, params) })),
      close: () => client.close(),
    };
  }
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  return {
    query: async <T>(sql: string, params?: unknown[]) => ({
      rows: (await pool.query(sql, params)).rows as T[],
    }),
    transaction: async (run) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await run({
          query: async <T>(sql: string, params?: unknown[]) => ({
            rows: (await client.query(sql, params)).rows as T[],
          }),
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export async function migrate(db: Database): Promise<void> {
  const files = ['001_initial.sql', '002_sync.sql', '003_local_admin.sql'];
  await db.transaction(async (tx) => {
    await tx.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz DEFAULT now())',
    );
    await tx.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
    for (const [index, file] of files.entries()) {
      const version = index + 1;
      const existing = await tx.query('SELECT version FROM schema_migrations WHERE version=$1', [
        version,
      ]);
      if (existing.rows.length) continue;
      const migration = await readFile(new URL(file, import.meta.url), 'utf8');
      for (const statement of migration
        .split(';')
        .map((value) => value.trim())
        .filter(Boolean))
        await tx.query(statement);
      await tx.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
    }
  });
}
