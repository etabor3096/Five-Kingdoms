import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        // Pure modules and measurements run in plain Node.
        test: { name: 'unit', include: ['test/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        // Real Worker + Durable Object in workerd.
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: { bindings: { GRACE_MS: '400', EXPIRY_MS: '1500', TURN_MS: '500' } },
          }),
        ],
        test: { name: 'worker', include: ['test/integration/**/*.test.ts'], testTimeout: 30_000 },
      },
    ],
  },
});
