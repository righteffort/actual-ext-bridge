import { defineConfig, Plugin } from "vite";
import dts from "vite-plugin-dts";
import esbuild from "esbuild";
import path from "path";

const INJECTED_SCRIPT_ENTRY = path.resolve(__dirname, "src/core/guest-logic.ts");
const INJECTED_OUTPUT_FILENAME = "content/guest-logic.js";

/**
 * Build injected script and emit in dist/ for use as web-accessible resource.
 */
const sidecarScriptPlugin = (): Plugin => {
  return {
    name: "vite-plugin-sidecar-script",

    // 1. Tell Vite to watch this file, so changes trigger a rebuild in watch mode
    buildStart() {
      this.addWatchFile(INJECTED_SCRIPT_ENTRY);
    },

    // 2. Generate the bundle during the build phase
    async generateBundle() {
      try {
        const result = await esbuild.build({
          entryPoints: [INJECTED_SCRIPT_ENTRY],
          bundle: true,     // Bundle all dependencies inside this file
          // minify: true,     // Minify for production
          format: 'iife',   // IIFE is best for Main World injection (prevents var leaks)
          target: 'es2020',
          write: false,
        });

        const code = result.outputFiles[0].text;

        // 3. Emit the file to the dist folder
        this.emitFile({
          type: 'asset',
          fileName: INJECTED_OUTPUT_FILENAME,
          source: code
        });

        console.log(`[Sidecar] Generated ${INJECTED_OUTPUT_FILENAME}`);

      } catch (e) {
        console.error("Failed to build sidecar script:", e);
        // We throw to fail the build if this critical file is broken
        throw e;
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
    sidecarScriptPlugin()
  ],
  build: {
    minify: false,
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
