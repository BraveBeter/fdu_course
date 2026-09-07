import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Config } from './config.js';
import type { Database } from './database/database.js';
import type { Viewer } from '../shared/course.js';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function accountKey(studentNo: string, config: Config): string {
  return createHmac('sha256', config.IDENTITY_SECRET).update(studentNo).digest('hex');
}
export async function ensureAccount(
  db: Database,
  studentNo: string,
  config: Config,
): Promise<Viewer> {
  const role = config.ADMIN_UIS_IDS.split(',')
    .map((value) => value.trim())
    .includes(studentNo)
    ? 'admin'
    : 'student';
  const { rows } = await db.query<Viewer>(
    `INSERT INTO users(id,identity_key,nickname,role) VALUES($1,$2,$3,$4) ON CONFLICT(identity_key) DO UPDATE SET role=EXCLUDED.role RETURNING id,nickname,role`,
    [randomUUID(), accountKey(studentNo, config), `同学${randomBytes(3).toString('hex')}`, role],
  );
  return rows[0]!;
}
export async function createSession(db: Database, userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await db.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [
    tokenHash(token),
    userId,
    new Date(Date.now() + 7 * 86400000),
  ]);
  return token;
}
export async function getViewer(db: Database, token?: string): Promise<Viewer | null> {
  if (!token) return null;
  const result = await db.query<Viewer>(
    'SELECT u.id,u.nickname,u.role FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()',
    [tokenHash(token)],
  );
  return result.rows[0] ?? null;
}
