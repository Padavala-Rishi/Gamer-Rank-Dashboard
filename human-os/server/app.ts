import express, { type RequestHandler } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DB } from "./db";
import { authRouter, requireAuth, sessionMiddleware, RateLimiter } from "./auth";
import { crudRouter } from "./crud";
import { errorHandler, HttpError } from "./http";
import { accountRouter } from "./routes/account";
import { domainRouter } from "./routes/domain";
import { insightRouter } from "./routes/insight";
import { aiRouter } from "./routes/ai";

export interface AppOptions {
  production: boolean;
  allowedOrigins?: string[];
  staticDir?: string;
  trustProxy?: boolean;
  /** Sign-in/registration attempts allowed per IP (and per email) per 15 minutes. */
  authAttemptsPer15Min?: number;
}

const securityHeaders =
  (production: boolean): RequestHandler =>
  (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    if (production) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ].join("; "),
      );
    }
    next();
  };

/**
 * CSRF defence in depth (cookies are already SameSite=Lax):
 *  - state-changing requests must send JSON (HTML forms cannot, without a CORS preflight)
 *  - when an Origin header is present it must match this host or an allowed origin
 */
const sameOrigin =
  (allowed: string[]): RequestHandler =>
  (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin) {
      const host = req.headers.host;
      let ok = allowed.includes(origin);
      try {
        ok ||= new URL(origin).host === host;
      } catch {
        ok = false;
      }
      if (!ok) return next(new HttpError(403, "Cross-origin request blocked"));
    }
    const len = Number(req.headers["content-length"] ?? 0);
    if (len > 0 && !req.is("application/json")) return next(new HttpError(415, "Send JSON"));
    next();
  };

export function createApp(db: DB, opts: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  if (opts.trustProxy) app.set("trust proxy", 1);
  app.use(securityHeaders(opts.production));

  const api = express.Router();
  const apiLimiter = new RateLimiter(600, 60_000);
  api.use((req, _res, next) => (apiLimiter.check(req.ip ?? "x") ? next() : next(new HttpError(429, "Too many requests — slow down a little."))));
  api.use(sameOrigin(opts.allowedOrigins ?? []));
  api.use(express.json({ limit: "5mb" }));
  api.use(sessionMiddleware(db));
  api.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  api.get("/health", (_req, res) => res.json({ ok: true }));
  api.use("/auth", authRouter(db, { secureCookies: opts.production, authAttemptsPer15Min: opts.authAttemptsPer15Min }));
  api.use(requireAuth);
  api.use("/r", crudRouter(db));
  api.use(accountRouter(db));
  api.use(domainRouter(db));
  api.use(insightRouter(db));
  api.use("/ai", aiRouter(db));
  api.use((_req, _res, next) => next(new HttpError(404, "Unknown API endpoint")));
  api.use(errorHandler);
  app.use("/api", api);

  if (opts.staticDir && existsSync(opts.staticDir)) {
    const dir = opts.staticDir;
    app.use(express.static(dir, { index: false, maxAge: "1y", immutable: true, setHeaders: (res, path) => {
      if (path.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
    } }));
    // Client-side routing: every non-API path serves the app shell.
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(join(dir, "index.html"));
    });
  }
  return app;
}
