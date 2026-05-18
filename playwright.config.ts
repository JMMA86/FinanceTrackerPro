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
  // 150s: 3 parallel workers hit different cold routes simultaneously; the server must JIT-compile
  // each route for the first time, which can take 70-90s. The timeout also covers the browser
  // context teardown after a timeout (which inherits the same budget).
  timeout: 150_000,
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
    // In dev retries=0, so 'on-first-retry' records no video — eliminates 90s WebM encoding
    // overhead that doubles apparent test time on timeout failures.
    video: 'on-first-retry',
  },
  projects: [
    // Warmup project: runs a single test that navigates to each key route so Next.js
    // JIT-compiles them before the main suite starts. Without this, 3 parallel workers
    // all hit cold routes simultaneously, causing 60-90s compilation delays per test.
    {
      name: 'setup',
      testDir: './e2e/setup',
      use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3000' },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
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
