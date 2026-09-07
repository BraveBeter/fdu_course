import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  PUBLIC_ORIGIN: z.string().url().default('http://127.0.0.1:5173'),
  DATABASE_URL: z.string().default('pglite:.local/db'),
  IDENTITY_SECRET: z.string().min(32).default('local-development-only-do-not-use-in-production'),
  ADMIN_UIS_IDS: z.string().default(''),
  CURRENT_TERM: z.string().default('2026-2027学年 第一学期'),
  UIS_ENABLED: z.enum(['true', 'false']).default('false'),
  CONNECTOR_URL: z.string().url().default('http://127.0.0.1:3002'),
  CONNECTOR_SECRET: z.string().default(''),
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
});
export type Config = z.infer<typeof schema>;
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = schema.parse(env);
  if (config.NODE_ENV === 'production') {
    if (
      config.IDENTITY_SECRET.startsWith('local-') ||
      config.DATABASE_URL.startsWith('pglite:') ||
      config.DEMO_MODE === 'true' ||
      !config.PUBLIC_ORIGIN.startsWith('https://')
    )
      throw new Error('生产环境需要独立身份密钥、PostgreSQL 与 HTTPS，且禁止演示登录');
  }
  if (config.UIS_ENABLED === 'true' && config.CONNECTOR_SECRET.length < 32)
    throw new Error('启用 UIS 需要至少 32 字符连接器密钥');
  return config;
}
