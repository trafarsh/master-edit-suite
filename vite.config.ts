import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// CEP loads the panel from file:// in an embedded Chromium (CEF 88 in After Effects 2024,
// newer in later releases). ES module scripts are blocked on file://, so the panel is
// bundled as one classic IIFE script; scripts/postbuild.mjs rewrites the script tag.
export default defineConfig({
  root: "src/panel",
  base: "./",
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: "../../dist/cep",
    emptyOutDir: true,
    target: "chrome88",
    modulePreload: false,
    cssCodeSplit: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "assets/panel.js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  server: { port: 3000 },
  test: {
    root: ".",
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
