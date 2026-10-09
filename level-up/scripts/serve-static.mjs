#!/usr/bin/env node
// Minimal static file server for ./out that behaves like Vercel for a Next static export:
// /quests -> quests.html, / -> index.html, correct MIME types (wasm!), 404.html for unknown paths.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".wasm": "application/wasm", ".data": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2", ".ico": "image/x-icon",
};

export function startStaticServer(port = 0, root = ROOT) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    let rel = decodeURIComponent(url.pathname);
    if (rel.includes("..")) { res.writeHead(400).end(); return; }
    const candidates = rel === "/" ? ["index.html"] : [rel.slice(1), `${rel.slice(1)}.html`, path.join(rel.slice(1), "index.html")];
    const file = candidates.map((c) => path.join(root, c)).find((f) => existsSync(f) && statSync(f).isFile());
    const send = (f, status) => {
      const body = readFileSync(f);
      const immutable = f.includes(`${path.sep}_next${path.sep}static${path.sep}`);
      res.writeHead(status, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream", "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache", "x-content-type-options": "nosniff" });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    if (file) return send(file, 200);
    const nf = path.join(root, "404.html");
    return existsSync(nf) ? send(nf, 404) : void res.writeHead(404).end("Not found");
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { port } = await startStaticServer(Number(process.env.PORT || 3000));
  console.log(`serving ${ROOT} on http://127.0.0.1:${port}`);
}
