import { defineConfig, Plugin } from "vite";
import dts from "vite-plugin-dts";
import esbuild from "esbuild";
import path from "path";

/**
 * Custom plugin to compile and inline the Guest Logic script.
 * Intercepts imports ending in '?inline-js' and returns the
 * minified IIFE code as a default string export.
 */
const inlineJsPlugin = (): Plugin => {
  return {
    name: "vite-plugin-inline-js",
    resolveId(id) {
      if (id.endsWith("?inline-js")) {
        return id;
      }
    },
    async load(id) {
      if (id.endsWith("?inline-js")) {
        const filePath = id.slice(0, -"?inline-js".length);
        
        // Resolve the actual file path on disk
        // We assume the import comes from src/core/local-bridge.ts usually
        // but let's try to resolve it relative to the process cwd or use simple logic
        // For robustness in this environment, we assume strict relative paths aren't tricky.
        
        // In a real plugin we might use this.resolve to get the absolute path,
        // but here we just strip the suffix and read.
        
        // Since we are running in a build context, we need to read the source file.
        // We will read the file content using standard fs.
        // NOTE: In the context of this specific environment, we need to be careful about paths.
        // For now, we assume standard resolution.
        
        try {
            // We need to find the file. If the import was "./guest-logic.ts?inline-js"
            // we assume it is in the same dir.
            // However, esbuild needs an absolute entry point or content.
            
            const result = await esbuild.build({
              entryPoints: [filePath],
              write: false,
              bundle: true,
              format: 'iife',
              minify: true,
              target: 'es2020',
              // We must exclude internal imports if we had any, 
              // but guest-logic should be self-contained or only import types.
            });
            
            const code = result.outputFiles[0].text;
            
            // Export the string as the default export
            return `export default ${JSON.stringify(code)};`;
            
        } catch (e) {
            console.error("Failed to inline script:", e);
            throw e;
        }
      }
    }
  };
};

export default defineConfig({
  plugins: [
    dts({ 
      insertTypesEntry: true,
      include: ["src"] 
    }),
    inlineJsPlugin()
  ],
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      name: "ActualExtLib",
      fileName: "index",
      formats: ["es"]
    },
    rollupOptions: {
      external: ["webextension-polyfill"],
      output: {
        globals: {
          "webextension-polyfill": "browser"
        }
      }
    }
  }
});
