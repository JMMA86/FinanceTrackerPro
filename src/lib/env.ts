/**
 * Environment variable validation (fail-fast).
 * Pure module — NO dotenv, NO side effects — safe for any runtime (Node/Edge).
 * Executed at server boot via next.config.ts (Node runtime).
 */

export function validateJwtSecret(
  jwtSecret: string | undefined,
  nodeEnv: string | undefined
): void {
  if (!jwtSecret) {
    if (nodeEnv === 'production') {
      throw new Error(
        'FATAL: JWT_SECRET is required in production. Generate with: openssl rand -base64 48'
      );
    }
    console.warn('WARN: JWT_SECRET is not set. Using a temporary secret for development only.');
    return;
  }

  if (jwtSecret.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be at least 32 characters long for HS256.');
  }
}
