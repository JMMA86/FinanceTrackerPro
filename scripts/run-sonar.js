import 'dotenv/config';
import { spawn, spawnSync } from 'child_process';

const scanner = spawn(`npx sonar-scanner -Dsonar.token=${process.env.SONAR_TOKEN}`, {
  stdio: 'inherit',
  shell: true,
});

scanner.on('exit', (scannerCode) => {
  const result = spawnSync('powershell', [
    '-ExecutionPolicy', 'Bypass',
    '-File', 'scripts/fetch-sonar.ps1',
  ], { stdio: 'inherit' });

  process.exit(scannerCode ?? result.status ?? 0);
});