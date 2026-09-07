import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { loginAndQuery } from './login.js';
const env = z
  .object({
    CONNECTOR_SECRET: z.string().min(32),
    CONNECTOR_PORT: z.coerce.number().default(3002),
    CONNECTOR_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(2),
  })
  .parse(process.env);
const app = Fastify({ logger: false, bodyLimit: 8192 });
let active = 0;
app.get('/health', async () => ({ ok: true }));
app.post('/login', async (request, reply) => {
  const received = Buffer.from(String(request.headers.authorization ?? ''));
  const expected = Buffer.from(`Bearer ${env.CONNECTOR_SECRET}`);
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    return reply.code(401).send({ message: 'Unauthorized' });
  const parsed = z
    .object({
      username: z.string().regex(/^\d{8,15}$/),
      password: z.string().min(1).max(256),
      term: z.string().min(1).max(80),
    })
    .safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ message: '登录信息格式不正确' });
  if (active >= env.CONNECTOR_CONCURRENCY)
    return reply.code(429).send({ message: '正在查询的同学较多，请稍后重试' });
  active++;
  try {
    return await loginAndQuery(parsed.data.username, parsed.data.password, parsed.data.term);
  } catch {
    return reply
      .code(502)
      .send({ message: 'UIS 登录未完成，请核对账号，或处理学校要求的验证码/二次认证。' });
  } finally {
    active--;
    parsed.data.password = '';
  }
});
await app.listen({ host: '0.0.0.0', port: env.CONNECTOR_PORT });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void app.close());
