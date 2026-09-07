import staticFiles from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { seedDemo } from './demo.js';
import { mkdir } from 'node:fs/promises';
import { readConfig } from './config.js';
import { openDatabase, migrate } from './database/database.js';
import { buildApp } from './app.js';
const config = readConfig();
if (config.DATABASE_URL.startsWith('pglite:.local/')) await mkdir('.local', { recursive: true });
const db = await openDatabase(config.DATABASE_URL);
await migrate(db);
if (config.DEMO_MODE === 'true') await seedDemo(db, config);
const app = await buildApp(db, config);
if (config.NODE_ENV === 'production') {
  await app.register(staticFiles, {
    root: fileURLToPath(new URL('../../client', import.meta.url)),
    maxAge: 0,
  });
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/'))
      return reply.sendFile('index.html');
    return reply.code(404).send({ message: '页面不存在' });
  });
}
app.addHook('onClose', () => db.close());
await app.listen({ host: config.HOST, port: config.PORT });
console.log(`API ready on ${config.HOST}:${config.PORT}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void app.close());
