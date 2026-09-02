import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The module builds DOM nodes directly, in the enricher and in every
    // sheet, so the tests need a document even where they never render one.
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
});
