import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Config } from './config.js';
import type { Database } from './database/database.js';
import type { SchoolResult } from '../connector/login.js';
import type { Viewer } from '../shared/course.js';
import { accountKey, ensureAccount, createSession } from './accounts.js';
import { createImport } from './imports.js';
import { AppError } from './errors.js';

export type SchoolLogin = (
  username: string,
  password: string,
  signal: AbortSignal,
) => Promise<SchoolResult>;
interface Job {
  id: string;
  owner: string;
  expires: number;
  state: 'pending' | 'done' | 'error';
  viewer?: Viewer;
  session?: string;
  previewId?: string;
  message?: string;
  controller: AbortController;
  work?: Promise<void>;
}
export function createAuthJobs(db: Database, config: Config, login: SchoolLogin) {
  const jobs = new Map<string, Job>();
  const sweep = () => {
    for (const [id, job] of jobs)
      if (job.expires < Date.now()) {
        job.controller.abort();
        jobs.delete(id);
      }
  };
  const timer = setInterval(sweep, 30000);
  timer.unref();
  return {
    start(owner: string, username: string, password: string, existingUser?: string): string {
      sweep();
      if (
        [...jobs.values()].filter((job) => job.state === 'pending').length >= 4 ||
        [...jobs.values()].some((job) => job.owner === owner && job.state === 'pending')
      )
        throw new AppError(429, '查询正在进行，请稍后再试');
      const id = randomUUID();
      const controller = new AbortController();
      const job: Job = { id, owner, controller, state: 'pending', expires: Date.now() + 300000 };
      jobs.set(id, job);
      job.work = (async () => {
        const deadline = setTimeout(() => controller.abort(), 90000);
        try {
          const result = await login(username, password, controller.signal);
          if (controller.signal.aborted) throw new Error('aborted');
          if (result.studentNo !== username) throw new AppError(502, '学校返回的身份不一致');
          if (existingUser) {
            const verified = await db.query(
              'SELECT id FROM users WHERE id=$1 AND identity_key=$2',
              [existingUser, accountKey(result.studentNo, config)],
            );
            if (!verified.rows.length) throw new AppError(409, '请使用当前登录同学的 UIS 账号同步');
          }
          job.viewer = await ensureAccount(db, result.studentNo, config);
          job.session = await createSession(db, job.viewer.id);
          if (result.snapshot) {
            if (
              result.snapshot.term !== config.CURRENT_TERM ||
              result.snapshot.courses.some((course) => course.term !== config.CURRENT_TERM)
            )
              throw new Error('Unexpected term');
            job.previewId = await createImport(db, job.viewer.id, result.snapshot);
          }
          job.message = result.queryError;
          job.state = 'done';
        } catch (error) {
          job.state = 'error';
          job.message =
            error instanceof AppError
              ? error.message
              : '学校登录或课程查询未完成，请核对账号密码，处理学校验证要求后重试。已有登记保持不变。';
        } finally {
          password = '';
          clearTimeout(deadline);
        }
      })();
      return id;
    },
    get(owner: string, id: string): Job {
      sweep();
      const job = jobs.get(id);
      if (!job || job.owner !== owner) throw new AppError(404, '查询任务不存在或已过期');
      return job;
    },
    revoke(owner: string) {
      for (const [id, job] of jobs)
        if (job.owner === owner) {
          job.controller.abort();
          jobs.delete(id);
        }
    },
    async close() {
      clearInterval(timer);
      const active = [...jobs.values()];
      for (const job of active) job.controller.abort();
      await Promise.allSettled(active.map((job) => job.work));
      jobs.clear();
    },
  };
}

const meeting = z.object({
  weeks: z.array(z.number().int().min(1).max(30)),
  day: z.number().int().min(1).max(7),
  start: z.number().int().min(1).max(20),
  end: z.number().int().min(1).max(20),
  room: z.string(),
  teacher: z.string(),
  raw: z.string(),
});
const course = z.object({
  term: z.string(),
  code: z.string(),
  section: z.string(),
  name: z.string(),
  credits: z.number().nonnegative(),
  teachers: z.string(),
  department: z.string(),
  category: z.string(),
  schedule: z.string(),
  meetings: z.array(meeting),
});
const resultSchema = z.object({
  studentNo: z.string().regex(/^\d{8,15}$/),
  snapshot: z
    .object({
      term: z.string(),
      courses: z.array(course).max(1000),
      issues: z.array(z.string()),
      excluded: z.number().int().nonnegative(),
      complete: z.boolean(),
      total: z.number().int().nonnegative(),
    })
    .optional(),
  queryError: z.string().optional(),
});
export function schoolClient(config: Config): SchoolLogin {
  return async (username, password, signal) => {
    const response = await fetch(new URL('/login', config.CONNECTOR_URL), {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.CONNECTOR_SECRET}`,
      },
      body: JSON.stringify({ username, password, term: config.CURRENT_TERM }),
    });
    if (!response.ok)
      throw new AppError(502, '学校登录未完成，可能需要验证码或二次认证，请稍后重试');
    return resultSchema.parse(await response.json());
  };
}
