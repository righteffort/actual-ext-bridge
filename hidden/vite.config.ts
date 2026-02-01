import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import { transformSync } from 'esbuild';
import fs from 'fs';

// Custom plugin to transpile and inline the injected script
const inlineInjectedScript = () => {
  return {
    name: 'inline-injected-script',
    resolveId(id: string) {
      if (id.endsWith('?inline-js')) {
        return id;
      }
    },
    load(id: string) {
      if (id.endsWith('?inline-js')) {
        const filePath = id.replace('?inline-js', '');
        const tsCode = fs.readFileSync(filePath, 'utf-8');
        
        // Transpile TS -> Minified JS
        const result = transformSync(tsCode, {
          loader: 'ts',
          minify: true,
          target: 'es2020',
          format: 'iife' // Immediately Invoked Function Expression
        });

        // Export as a string
        return `export default ${JSON.stringify(result.code)};`;
      }
    }
  };
};

export default defineConfig({
  plugins: [
    dts({ 
      insertTypesEntry: true,
      rollupTypes: true
    }),
    inlineInjectedScript()
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ActualBridge',
      fileName: 'index',
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: ['webextension-polyfill'],
      output: {
        globals: {
          'webextension-polyfill': 'browser'
        }
      }
    }
  }
});
