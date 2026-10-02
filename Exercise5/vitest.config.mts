import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests share one test database, so run files one at a time
    fileParallelism: false,
    testTimeout: 15_000,
    env: {
      // A separate database so tests never touch your real data
      MONGODB_URI: 'mongodb://127.0.0.1:27017/exercise5_test',
    },
  },
});
