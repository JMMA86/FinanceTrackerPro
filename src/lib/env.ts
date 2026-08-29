import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

// PRISMA_E2E=1 means the E2E webServer already received the correct DATABASE_URL
// from playwright.config.ts — skip override so the injected E2E URL wins.
// Without this guard, override: true would stomp the E2E database URL with the dev one.
if (!process.env.PRISMA_E2E) {
  dotenvExpand.expand(dotenv.config({ override: true }));
}

// ============================================================================
// JWT_SECRET fail-fast validation (Fix S3 — CRITICAL)
// ============================================================================
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: JWT_SECRET is required in production. Generate with: openssl rand -base64 48'
    );
  }
  console.warn('WARN: JWT_SECRET is not set. Using a temporary secret for development only.');
} else if (jwtSecret.length < 32) {
  throw new Error('FATAL: JWT_SECRET must be at least 32 characters long for HS256.');
}
