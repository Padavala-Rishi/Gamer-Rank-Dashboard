import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { openDatabase } from "./db";
import { createApp } from "./app";

// Minimal .env loader (no dependency). Real environment variables take precedence.
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT) || 3001;
const dbPath = resolve(process.env.DATABASE_PATH || "./data/human-os.db");
const here = dirname(fileURLToPath(import.meta.url));
// In production the bundle lives in dist/server, and the client in dist/client.
const staticDir = resolve(here, "../client");

const db = openDatabase(dbPath);
const app = createApp(db, {
  production,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  staticDir: production ? staticDir : undefined,
  trustProxy: process.env.TRUST_PROXY === "1",
});

const server = app.listen(port, () => {
  console.log(`Human OS API listening on http://localhost:${port}${production ? "" : " (dev — open the Vite URL, usually http://localhost:5173)"}`);
  if (!process.env.ANTHROPIC_API_KEY) console.log("AI features disabled (ANTHROPIC_API_KEY not set). Everything else works.");
});

const shutdown = () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
