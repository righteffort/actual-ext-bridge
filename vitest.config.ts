import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        // Set the URL so window.origin matches the security check expected by the code
        url: 'https://app.actualbudget.org/',
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
