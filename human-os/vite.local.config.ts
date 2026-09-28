// On-device build: the API runs in the browser on SQLite (sql.js) saved to IndexedDB.
//   npm run build:local   → dist-local/  (installable app for Netlify / GitHub Pages; works offline)
//   EMBED=1 npm run build:local → dist-embed/ (self-contained preview that opens with demo data)
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const embed = process.env.EMBED === "1";
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Emits a service worker that precaches every built file, so the app works offline. */
function serviceWorker(): Plugin {
  return {
    name: "human-os-sw",
    apply: "build",
    generateBundle(_opts, bundle) {
      if (embed) return;
      const files = ["./", ...Object.keys(bundle).map((f) => `./${f}`), "./manifest.webmanifest", "./favicon.svg", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
      const version = Date.now().toString(36);
      const source = `// Generated at build time. Precaches the app shell so Human OS works offline.
const CACHE = "human-os-${version}";
const FILES = ${JSON.stringify(files)};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    // Network first for the page itself (to pick up updates), cached copy when offline.
    e.respondWith(fetch(req).catch(() => caches.match("./", { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`;
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), serviceWorker()],
  define: { __LOCAL_MODE__: true, __EMBED_MODE__: embed },
  resolve: {
    alias: {
      express: here("./src/local/mini-express.ts"),
      "better-sqlite3": here("./src/local/shims/better-sqlite3.ts"),
      "node:fs": here("./src/local/shims/fs.ts"),
      "node:path": here("./src/local/shims/path.ts"),
      "node:crypto": here("./src/local/shims/crypto.ts"),
    },
  },
  build: { outDir: embed ? "dist-embed" : "dist-local", sourcemap: false, chunkSizeWarningLimit: 2000 },
  preview: { port: 4173 },
});
