import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/lib/research/affiliate.test.ts',
      'scripts/lib/data-writer.test.mjs',
      'scripts/lib/storage-uploader.test.mjs'
    ]
  }
});
