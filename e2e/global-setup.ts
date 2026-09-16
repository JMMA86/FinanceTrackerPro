import { execSync } from 'child_process';

async function globalSetup() {
  console.log('\n[E2E] Resetting e2e database...');
  execSync('npm run db:reset:e2e', { stdio: 'inherit' });

  console.log('\n[E2E] Seeding e2e test data...');
  execSync('npm run db:seed:e2e', { stdio: 'inherit' });

  console.log('[E2E] Database ready.\n');
}

export default globalSetup;
