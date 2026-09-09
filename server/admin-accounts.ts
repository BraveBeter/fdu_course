import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Database } from './database/database.js';
import type { Viewer } from '../shared/course.js';
import { AppError } from './errors.js';
import { createSession } from './accounts.js';

export const adminUsername = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9._-]{2,63}$/);
export const adminPassword = z.string().min(15).max(256);
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, options, (error, key) => (error ? reject(error) : resolve(key))),
  );
}
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
async function verifyPassword(password: string, encoded?: string): Promise<boolean> {
  const parts = encoded?.split('$');
  const valid =
    parts?.length === 3 &&
    parts[0] === 'scrypt-v1' &&
    /^[a-f0-9]{32}$/.test(parts[1]!) &&
    /^[a-f0-9]{128}$/.test(parts[2]!);
  // Unknown usernames still perform the same expensive derivation.
  const key = await derive(password, valid ? parts[1]! : '00000000000000000000000000000000');
  return timingSafeEqual(key, valid ? Buffer.from(parts[2]!, 'hex') : Buffer.alloc(64)) && !!valid;
}
export async function createAdmin(
  db: Database,
  username: string,
  password: string,
  nickname: string,
): Promise<Viewer> {
  username = adminUsername.parse(username);
  adminPassword.parse(password);
  nickname = z
    .string()
    .trim()
    .min(1)
    .max(24)
    .refine((v) => !/[\u0000-\u001f\u007f]/.test(v))
    .parse(nickname);
  const hash = await hashPassword(password);
  const id = randomUUID();
  return db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO users(id,identity_key,nickname,role,auth_provider) VALUES($1,$2,$3,'admin','local')",
      [id, `local-admin:${id}`, nickname],
    );
    const inserted = await tx.query(
      'INSERT INTO admin_credentials(user_id,username,password_hash) VALUES($1,$2,$3) ON CONFLICT(username) DO NOTHING RETURNING user_id',
      [id, username, hash],
    );
    if (!inserted.rows.length) throw new AppError(409, '该管理员用户名已存在');
    return { id, nickname, role: 'admin', authProvider: 'local' };
  });
}
export async function resetAdminPassword(db: Database, username: string, password: string) {
  username = adminUsername.parse(username);
  adminPassword.parse(password);
  const hash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const result = await tx.query<{ user_id: string }>(
      'UPDATE admin_credentials SET password_hash=$2,failed_attempts=0,blocked_until=NULL WHERE username=$1 RETURNING user_id',
      [username, hash],
    );
    if (!result.rows.length) throw new AppError(404, '管理员账号不存在');
    await tx.query('DELETE FROM sessions WHERE user_id=$1', [result.rows[0]!.user_id]);
  });
}
export async function disableAdmin(db: Database, username: string) {
  username = adminUsername.parse(username);
  await db.transaction(async (tx) => {
    const result = await tx.query<{ user_id: string }>(
      'UPDATE admin_credentials SET enabled=false WHERE username=$1 RETURNING user_id',
      [username],
    );
    if (!result.rows.length) throw new AppError(404, '管理员账号不存在');
    await tx.query('DELETE FROM sessions WHERE user_id=$1', [result.rows[0]!.user_id]);
  });
}
interface Credential {
  user_id: string;
  password_hash: string;
  enabled: boolean;
  failed_attempts: number;
  blocked_until: Date | null;
}
export async function loginAdmin(
  db: Database,
  username: string,
  password: string,
): Promise<{ user: Viewer; session: string }> {
  username = adminUsername.parse(username);
  z.string().min(1).max(256).parse(password);
  const credential = (
    await db.query<Credential>('SELECT * FROM admin_credentials WHERE username=$1', [username])
  ).rows[0];
  const valid = await verifyPassword(password, credential?.password_hash);
  const user = await db.transaction(async (tx) => {
    const current = (
      await tx.query<Credential & { nickname: string; role: string; auth_provider: string }>(
        'SELECT a.*,u.nickname,u.role,u.auth_provider FROM admin_credentials a JOIN users u ON u.id=a.user_id WHERE a.username=$1 FOR UPDATE OF a',
        [username],
      )
    ).rows[0];
    if (
      !current ||
      !current.enabled ||
      current.role !== 'admin' ||
      current.auth_provider !== 'local' ||
      (current.blocked_until && current.blocked_until.getTime() > Date.now())
    )
      return null;
    if (!valid || current.password_hash !== credential?.password_hash) {
      await tx.query(
        "UPDATE admin_credentials SET failed_attempts=CASE WHEN blocked_until <= now() THEN 1 ELSE failed_attempts+1 END,blocked_until=CASE WHEN blocked_until <= now() THEN NULL WHEN failed_attempts+1 >= 5 THEN now()+interval '15 minutes' ELSE NULL END WHERE user_id=$1",
        [current.user_id],
      );
      return null;
    }
    await tx.query(
      'UPDATE admin_credentials SET failed_attempts=0,blocked_until=NULL WHERE user_id=$1',
      [current.user_id],
    );
    const viewer: Viewer = {
      id: current.user_id,
      nickname: current.nickname,
      role: 'admin',
      authProvider: 'local',
    };
    // Session issuance shares the credential lock with password reset and disable.
    const session = await createSession(tx, viewer.id);
    return { user: viewer, session };
  });
  if (!user) throw new AppError(401, '账号或密码不正确，或账号暂时不可用');
  return user;
}
