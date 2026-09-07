process.env.NODE_ENV = 'development';
process.env.DEMO_MODE = 'true';
process.env.UIS_ENABLED = 'false';
process.env.DATABASE_URL = 'pglite:';
await import('../server/main.js');
export {};
