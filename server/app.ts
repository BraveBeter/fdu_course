import { attendanceRoutes } from './attendance-routes.js';
import { demoStudent, demoAdmin, demoConfig, demoSnapshot } from './demo.js';
import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { randomBytes } from 'node:crypto';
import { z, ZodError } from 'zod';
import type { Config } from './config.js';
import type { Database } from './database/database.js';
import { getViewer, tokenHash, ensureAccount, createSession } from './accounts.js';
import { AppError } from './errors.js';
import { listOfferings, classmates } from './catalog.js';
import { previewImport, commitImport, createImport } from './imports.js';
import { createAuthJobs, schoolClient, type SchoolLogin } from './auth-jobs.js';

export async function buildApp(
  db: Database,
  config: Config,
  login: SchoolLogin = schoolClient(config),
) {
  const app = Fastify({
    logger: false,
    bodyLimit: 16384,
    trustProxy:
      config.NODE_ENV === 'production' ? (_address: string, hop: number) => hop === 0 : false,
  });
  await app.register(cookie);
  await app.register(rateLimit, { max: 240, timeWindow: 60000 });
  const jobs = createAuthJobs(db, config, login);
  app.addHook('onClose', () => jobs.close());
  const cookieOptions = {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
  async function viewer(request: FastifyRequest) {
    const user = await getViewer(db, request.cookies.session);
    if (!user) throw new AppError(401, '请先登录');
    return user;
  }
  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'same-origin');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      if (
        request.headers.origin !== new URL(config.PUBLIC_ORIGIN).origin ||
        request.headers['x-requested-with'] !== 'fdu-course'
      )
        throw new AppError(403, '请求来源不正确，请刷新页面重试');
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) return reply.code(error.status).send({ message: error.message });
    if (error instanceof ZodError)
      return reply.code(400).send({ message: '输入信息格式不正确，请检查后重试' });
    if (
      error instanceof Error &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode < 500
    )
      return reply.code(error.statusCode).send({
        message: error.statusCode === 429 ? '操作过于频繁，请稍后重试' : '请求格式不正确',
      });
    // Do not serialize exception objects: upstream errors may contain credentials or query data.
    console.error(
      JSON.stringify({
        event: 'request_failed',
        requestId: request.id,
        route: request.routeOptions.url,
      }),
    );
    return reply.code(500).send({ message: '服务暂时不可用，请稍后重试' });
  });
  app.get('/api/health', async () => {
    await db.query('SELECT 1');
    return { ok: true };
  });
  app.get('/api/meta', async () => ({
    term: config.CURRENT_TERM,
    uisEnabled: config.UIS_ENABLED === 'true',
    demo: config.DEMO_MODE === 'true',
  }));
  app.get('/api/me', async (request) => ({ user: await getViewer(db, request.cookies.session) }));
  app.patch('/api/me', async (request) => {
    const user = await viewer(request);
    const { nickname } = z
      .object({
        nickname: z
          .string()
          .trim()
          .min(1)
          .max(24)
          .refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
      })
      .parse(request.body);
    await db.query('UPDATE users SET nickname=$2 WHERE id=$1', [user.id, nickname]);
    return { user: { ...user, nickname } };
  });
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 5, timeWindow: 60000 } } },
    async (request, reply) => {
      if (config.UIS_ENABLED !== 'true')
        throw new AppError(503, 'UIS 自动导入尚在验证中，请等待管理员开放');
      const { username, password } = z
        .object({ username: z.string().regex(/^\d{8,15}$/), password: z.string().min(1).max(256) })
        .parse(request.body);
      const owner = request.cookies.auth_flow ?? randomBytes(32).toString('hex');
      const current = await getViewer(db, request.cookies.session);
      const id = jobs.start(owner, username, password, current?.id);
      reply.setCookie('auth_flow', owner, { ...cookieOptions, maxAge: 300 });
      return { id };
    },
  );
  app.get('/api/auth/jobs/:id', async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const job = jobs.get(request.cookies.auth_flow ?? '', id);
    if (job.state === 'done' && job.session)
      reply.setCookie('session', job.session, { ...cookieOptions, maxAge: 604800 });
    return { state: job.state, user: job.viewer, previewId: job.previewId, message: job.message };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    if (request.cookies.session)
      await db.query('DELETE FROM sessions WHERE token_hash=$1', [
        tokenHash(request.cookies.session),
      ]);
    jobs.revoke(request.cookies.auth_flow ?? '');
    reply.clearCookie('session', cookieOptions).clearCookie('auth_flow', cookieOptions);
    return { ok: true };
  });
  app.get('/api/offerings', async (request) => {
    const query = z
      .object({ term: z.string().min(1).max(80).default(config.CURRENT_TERM) })
      .parse(request.query);
    const user = await getViewer(db, request.cookies.session);
    return { offerings: await listOfferings(db, query.term, user?.id) };
  });
  app.get('/api/terms', async () => ({
    terms: [
      ...new Set([
        config.CURRENT_TERM,
        ...(
          await db.query<{ term: string }>('SELECT DISTINCT term FROM offerings ORDER BY term DESC')
        ).rows.map((row) => row.term),
      ]),
    ],
  }));
  app.get('/api/offerings/:id/classmates', async (request) => {
    const user = await viewer(request);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    return { classmates: await classmates(db, user, id) };
  });
  app.get('/api/imports/:id', async (request) => {
    const user = await viewer(request);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    return previewImport(db, user.id, id);
  });
  app.post('/api/imports/:id/commit', async (request) => {
    const user = await viewer(request);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { removeMissing } = z
      .object({ removeMissing: z.boolean().default(false) })
      .parse(request.body);
    return commitImport(db, user.id, id, removeMissing);
  });
  app.delete('/api/offerings/:id/enrollment', async (request) => {
    const user = await viewer(request);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    await db.query('DELETE FROM enrollments WHERE user_id=$1 AND offering_id=$2', [user.id, id]);
    return { ok: true };
  });
  attendanceRoutes(app, db, viewer);
  if (config.DEMO_MODE === 'true' && config.NODE_ENV !== 'production') {
    app.post('/api/auth/demo', async (request, reply) => {
      const { role } = z.object({ role: z.enum(['student', 'admin']) }).parse(request.body);
      const user = await ensureAccount(
        db,
        role === 'admin' ? demoAdmin : demoStudent,
        demoConfig(config),
      );
      const session = await createSession(db, user.id);
      reply.setCookie('session', session, { ...cookieOptions, maxAge: 604800 });
      return { user };
    });
    app.post('/api/demo/preview', async (request) => {
      const user = await viewer(request);
      return { id: await createImport(db, user.id, demoSnapshot(config.CURRENT_TERM)) };
    });
  }
  return app;
}
