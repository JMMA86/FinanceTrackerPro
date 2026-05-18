import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import * as dotenv from 'dotenv';
import * as dotenvExpand from 'dotenv-expand';

// Load .env.e2e with override:true so stale shell env vars never pollute expansion.
const env = dotenv.config({ path: '.env.e2e', override: true });
if (env.error) {
  console.warn('.env.e2e not found. Using environment variables directly.');
} else {
  dotenvExpand.expand(env);
}

const testDir = defineBddConfig({
  features: 'e2e/features/**/*.feature',
  steps: 'e2e/steps/**/*.ts',
});

export default defineConfig({
  testDir,
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ['json', { outputFile: 'e2e-results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    // Never reuse an existing server — it may be pointing at the dev database.
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL!,
      JWT_SECRET: process.env.JWT_SECRET!,
    },
  },
});
