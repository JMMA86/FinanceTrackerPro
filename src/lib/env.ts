import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

// PRISMA_E2E=1 means the E2E webServer already received the correct DATABASE_URL
// from playwright.config.ts — skip override so the injected E2E URL wins.
// Without this guard, override: true would stomp the E2E database URL with the dev one.
if (!process.env.PRISMA_E2E) {
  dotenvExpand.expand(dotenv.config({ override: true }));
}
