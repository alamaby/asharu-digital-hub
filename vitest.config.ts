import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'server-only': fileURLToPath(new URL('./vitest.server-only-stub.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.tsx'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    globals: true,
    // Coverage untuk logika inti saja (`src/lib`), diukur dari test `src/lib`
    // lewat `npm run test:coverage` (sengaja tidak seluruh suite: komponen
    // meng-import lib yang sama sehingga angka menjadi campur dan test UI yang
    // sensitif waktu jadi flaky di bawah instrumentasi).
    // Threshold = lantai ratchet, diukur 2026-10-07: 50.51% stmts/lines,
    // 73.46% branches, 78.51% functions.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts'],
      thresholds: {
        statements: 48,
        lines: 48,
        branches: 70,
        functions: 75
      }
    }
  }
});
