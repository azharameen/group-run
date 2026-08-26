import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'src/__tests__/**/*.test.{ts,tsx}'],
    exclude: process.env.FIRESTORE_EMULATOR_HOST
      ? []
      : ['src/__tests__/firestore.rules.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/__tests__/**/*.{ts,tsx}',
        'src/setupTests.ts',
        'src/**/*.d.ts',
      ],
      thresholds: {
        statements: 30,
        branches: 20,
        functions: 25,
        lines: 30,
      },
    },
  },
});
