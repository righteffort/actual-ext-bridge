import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        // Set the URL so window.origin matches that used in guest-logic.test.ts
        url: 'https://test.example.com/',
      }
    },
    setupFiles: ['./test/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
	'src/index.ts',
	'src/types.ts',
      ]
    }
  },
  resolve: {
    alias: {
      'webextension-polyfill': new URL('./test/mocks/webextension-polyfill.js', import.meta.url).pathname,
    },
  },
});
