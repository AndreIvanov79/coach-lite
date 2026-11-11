import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

// Strict CSP only in the built app: the dev server injects inline scripts for hot reload.
// No network at all apart from Telegram's own script: the data goes through Telegram.WebApp.CloudStorage.
const csp: Plugin = {
  name: "csp",
  apply: "build",
  transformIndexHtml: html => html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`)
};

export default defineConfig({
  root: new URL(".", import.meta.url).pathname,
  // Relative paths: the same build works at /coach-lite/ on GitHub Pages and at any other path.
  base: "./",
  plugins: [react(), csp],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { outDir: "dist", emptyOutDir: true, target: "es2020", assetsInlineLimit: 0 },
  server: { host: true }
});
