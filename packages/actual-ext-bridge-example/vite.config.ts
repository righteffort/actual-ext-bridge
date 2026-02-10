import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension, { readJsonFile } from "vite-plugin-web-extension";
import { viteStaticCopy } from "vite-plugin-static-copy";

function generateManifest() {
  const manifest = readJsonFile("src/manifest.json");
  const pkg = readJsonFile("package.json");
  return {
    name: manifest.name || pkg.name,
    description: manifest.description || pkg.description,
    version: pkg.version,
    ...manifest,
    web_accessible_resources: [
      ...(manifest.web_accessible_resources || []),
      {
        resources: ["src/content/injected-actual.js"],
        matches: ["<all_urls>"]
      }
    ]
  };
}

export default defineConfig({
  build: {
    minify: false,
  },
  plugins: [
    react(),
    webExtension({
      manifest: generateManifest,
      watchFilePaths: ["package.json", "src/manifest.json"],
      browser: process.env.TARGET || "chrome",
    }),
    viteStaticCopy({
      targets: [
        {
          src: "../actual-ext-bridge/dist/content/injected-actual.js",
          dest: "src/content"
        }
      ]
    })
  ],
});
