import { defineConfig } from 'prisma/config';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

// E2E scripts (db:reset:e2e, db:setup:e2e, db:seed:e2e, db:studio:e2e) run with
// dotenv --override so PRISMA_E2E=1 and all POSTGRES_* vars are already correctly
// set from .env.e2e. Skip loading .env to avoid overwriting them.
//
// Dev scripts have no PRISMA_E2E — load .env with override:true so stale shell
// env vars (from previous sessions) never pollute variable expansion.
if (!process.env.PRISMA_E2E) {
  dotenvExpand.expand(dotenv.config({ override: true }));
}

export default defineConfig({
  schema: 'src/lib/db/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
