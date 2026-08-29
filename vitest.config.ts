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
      // Measure every src file (not just modules imported by tests) so the local
      // report matches SonarQube's Zero Coverage view. Untested files appear as 0%.
      include: ['src/**'],
      exclude: [
        'src/app/**',
        'src/locales/**',
        'src/lib/errors/**',
        'src/lib/db/index.ts',
        'src/store/ui.store.ts',
        'src/actions/language.actions.ts',
        'src/actions/account-transactions.actions.ts',
        'src/config/navigation.ts',
        'src/lib/repositories/prisma/**',
        'src/actions/__tests__/**',
        'src/services/__tests__/**',
        'src/components/transactions/__tests__/**',
        'src/components/savings/__tests__/**',
        'src/components/investments/__tests__/**',
        'src/components/accounts/__tests__/**',
        'src/components/auth/__tests__/**',
        'src/components/dashboard/__tests__/**',
        'src/components/ui/__tests__/**',
        'src/components/i18n/__tests__/**',
        'coverage/**',
        '.next/**',
        'middleware.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
