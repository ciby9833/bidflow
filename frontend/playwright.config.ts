import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 30000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5189', locale: 'pt-BR', timezoneId: 'Asia/Jakarta', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5189', url: 'http://127.0.0.1:5189', reuseExistingServer: true },
});
