import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev:test',
    url: 'http://127.0.0.1:5174/api/health',
    reuseExistingServer: false,
    timeout: 45000,
    env: {
      NODE_ENV: 'test',
      DEMO_MODE: 'true',
      UIS_ENABLED: 'false',
      DATABASE_URL: 'pglite:',
      PORT: '3003',
      PUBLIC_ORIGIN: 'http://127.0.0.1:5174',
      API_TARGET: 'http://127.0.0.1:3003',
    },
  },
});
