import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts', './vitest.db-setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.next', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      clean: true,
      exclude: [
        'src/app/**',
        'src/components/accounts/**',
        'src/components/auth/**',
        'src/components/dashboard/**',
        'src/components/transactions/**',
        'src/components/ui/**',
        'src/components/i18n/**',
        'src/lib/errors/**',
        'src/lib/db/index.ts',
        'src/store/ui.store.ts',
        'src/actions/language.actions.ts',
        'src/actions/account-transactions.actions.ts',
        'src/config/navigation.ts',
        'src/lib/repositories/prisma/**',
        'coverage/**',
        '.next/**',
        'proxy.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
