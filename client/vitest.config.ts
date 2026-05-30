import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    // The default `forks` pool fails to spin up workers reliably on some
    // Windows hosts (worker start-up times out). The `threads` pool is stable
    // across platforms for this suite.
    pool: 'threads',
  },
});
