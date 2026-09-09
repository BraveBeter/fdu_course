import { readConfig } from '../../server/config.js';
import { openDatabase, migrate } from '../../server/database/database.js';
import { seedDemo } from '../../server/demo.js';
import { createAdmin } from '../../server/admin-accounts.js';
import { buildApp } from '../../server/app.js';
const config = readConfig();
if (config.NODE_ENV !== 'test' || config.DATABASE_URL !== 'pglite:' || config.DEMO_MODE !== 'true')
  throw new Error('浏览器测试只允许独立内存演示环境');
const db = await openDatabase(config.DATABASE_URL);
await migrate(db);
await seedDemo(db, config);
await createAdmin(db, 'site.manager', 'synthetic-admin-password-for-tests', '站点维护员');
const app = await buildApp(db, config);
app.addHook('onClose', () => db.close());
await app.listen({ host: config.HOST, port: config.PORT });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void app.close());
