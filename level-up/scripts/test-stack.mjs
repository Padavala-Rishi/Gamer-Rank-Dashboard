#!/usr/bin/env node
// Local verification stack for Level Up (Linux only, no Docker, no Supabase account).
//
//   real PostgreSQL 16  +  real PostgREST  +  a tiny stand-in for Supabase Auth (GoTrue)  +  a gateway
//
// The stand-in implements just enough of /auth/v1 for @supabase/supabase-js and @supabase/ssr:
// signup, password sign-in, refresh, get-user, logout. It is NOT Supabase Auth. Real email confirmation,
// password-reset mails, OAuth and rate limiting are therefore untested here.
//
// Usage: node scripts/test-stack.mjs up [--fresh] | down | status | env
import { spawn, execFileSync } from "node:child_process";
import { createHmac, randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STACK = process.env.STACK_DIR || "/tmp/levelup-stack";
const PG_BIN = process.env.PG_BIN || "/usr/lib/postgresql/16/bin";
const PG_PORT = 54322;
const REST_PORT = 54323;
const GATEWAY_PORT = 54321;
const DB = "levelup";
const JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const POSTGREST_VERSION = "v12.2.3";

const b64 = (b) => Buffer.from(b).toString("base64url");
export function signJwt(payload, secret = JWT_SECRET) {
  const h = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64(JSON.stringify(payload));
  const s = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
export function verifyJwt(token, secret = JWT_SECRET) {
  const [h, p, s] = String(token || "").split(".");
  if (!h || !p || !s) return null;
  const expect = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  const a = Buffer.from(s), b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
const FAR = 4102444800;
export const ANON_KEY = signJwt({ role: "anon", iss: "level-up-test-stack", exp: FAR });
export const stackEnv = {
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${GATEWAY_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  DATABASE_URL: `postgres://postgres@127.0.0.1:${PG_PORT}/${DB}`,
};

const asPostgres = (cmd, args, opts = {}) =>
  process.getuid?.() === 0
    ? execFileSync("runuser", ["-u", "postgres", "--", cmd, ...args], { stdio: "pipe", ...opts })
    : execFileSync(cmd, args, { stdio: "pipe", ...opts });

function sh(cmd, args, opts = {}) { return execFileSync(cmd, args, { stdio: "pipe", ...opts }).toString(); }

function ensureDirs() {
  mkdirSync(STACK, { recursive: true });
  chmodSync(STACK, 0o755);
  mkdirSync(path.join(STACK, "bin"), { recursive: true });
}

function ensurePostgrest() {
  const bin = path.join(STACK, "bin", "postgrest");
  if (existsSync(bin)) return bin;
  console.log("[stack] downloading PostgREST", POSTGREST_VERSION);
  const url = `https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x64.tar.xz`;
  sh("curl", ["-sSL", "-m", "180", "-o", path.join(STACK, "bin", "pgrest.tar.xz"), url]);
  sh("tar", ["-xJf", path.join(STACK, "bin", "pgrest.tar.xz"), "-C", path.join(STACK, "bin")]);
  return bin;
}

const BOOTSTRAP = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz default now(),
  raw_app_meta_data jsonb not null default '{"provider":"email","providers":["email"]}',
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as
  $$ select nullif(coalesce(current_setting('request.jwt.claim.role', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')), '') $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`;

const PG_ARGS = ["-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"];

function psql(db, sqlText) {
  return sh(path.join(PG_BIN, "psql"), [...PG_ARGS, "-d", db, "-c", sqlText]);
}
function psqlFile(db, file) {
  return sh(path.join(PG_BIN, "psql"), [...PG_ARGS, "-d", db, "-f", file]);
}

function initCluster(fresh) {
  const data = path.join(STACK, "pgdata");
  if (fresh && existsSync(data)) rmSync(data, { recursive: true, force: true });
  if (!existsSync(path.join(data, "PG_VERSION"))) {
    console.log("[stack] initdb");
    if (process.getuid?.() === 0) sh("chown", ["-R", "postgres", STACK]);
    asPostgres(path.join(PG_BIN, "initdb"), ["-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8"]);
  }
  return data;
}

async function startPostgres(data) {
  try { sh(path.join(PG_BIN, "pg_isready"), ["-h", "127.0.0.1", "-p", String(PG_PORT)]); return; } catch {}
  console.log("[stack] starting postgres");
  if (process.getuid?.() === 0) sh("chown", ["-R", "postgres", STACK]);
  asPostgres(path.join(PG_BIN, "pg_ctl"), [
    "-D", data, "-l", path.join(STACK, "postgres.log"), "-w", "-t", "60",
    "-o", `-p ${PG_PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${STACK} -c fsync=off -c synchronous_commit=off -c max_connections=100`,
    "start",
  ]);
}

function ensureDatabase() {
  const exists = psql("postgres", `select 1 from pg_database where datname='${DB}'`).includes("1 row") ||
    sh(path.join(PG_BIN, "psql"), [...PG_ARGS, "-d", "postgres", "-tA", "-c", `select 1 from pg_database where datname='${DB}'`]).trim() === "1";
  if (exists) return false;
  console.log("[stack] creating database and applying migrations");
  psql("postgres", `create database ${DB}`);
  psql(DB, BOOTSTRAP);
  const dir = path.join(ROOT, "supabase", "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    console.log("[stack]   ", f);
    psqlFile(DB, path.join(dir, f));
  }
  return true;
}

// ── stand-in for Supabase Auth ──
function hashPassword(pw) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(pw, salt, 32).toString("hex")}`;
}
function checkPassword(pw, stored) {
  const [, salt, hash] = String(stored || "").split("$");
  if (!salt) return false;
  const a = scryptSync(pw, Buffer.from(salt, "hex"), 32), b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
const json = (res, status, body) => {
  const s = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(s) });
  res.end(s);
};
const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}")); } catch { resolve({}); } });
});

function userJson(u) {
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    email_confirmed_at: u.email_confirmed_at, phone: "", confirmed_at: u.email_confirmed_at,
    last_sign_in_at: u.last_sign_in_at, app_metadata: u.raw_app_meta_data, user_metadata: u.raw_user_meta_data,
    identities: [], created_at: u.created_at, updated_at: u.updated_at, is_anonymous: false,
  };
}
function sessionJson(u) {
  const now = Math.floor(Date.now() / 1000);
  const expires_in = 3600;
  const access_token = signJwt({ aud: "authenticated", role: "authenticated", sub: u.id, email: u.email, iat: now, exp: now + expires_in, session_id: randomUUID() });
  const refresh_token = signJwt({ typ: "refresh", sub: u.id, iat: now, exp: now + 60 * 60 * 24 * 30, jti: randomUUID() });
  return { access_token, token_type: "bearer", expires_in, expires_at: now + expires_in, refresh_token, user: userJson(u) };
}

async function startGateway() {
  const pool = new pg.Pool({ connectionString: stackEnv.DATABASE_URL, max: 4 });
  const getUser = async (id) => (await pool.query("select * from auth.users where id=$1", [id])).rows[0];
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      if (url.pathname.startsWith("/rest/v1")) {
        const proxy = http.request({
          host: "127.0.0.1", port: REST_PORT, method: req.method,
          path: url.pathname.replace(/^\/rest\/v1/, "") + url.search,
          headers: { ...req.headers, host: `127.0.0.1:${REST_PORT}` },
        }, (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); });
        proxy.on("error", () => json(res, 502, { message: "PostgREST unavailable" }));
        req.pipe(proxy);
        return;
      }
      if (url.pathname === "/health") return json(res, 200, { ok: true });
      if (!url.pathname.startsWith("/auth/v1")) return json(res, 404, { message: "not found" });
      const route = url.pathname.replace("/auth/v1", "");
      const bearer = (req.headers.authorization || "").replace(/^Bearer /i, "");

      if (route === "/signup" && req.method === "POST") {
        const { email, password, data } = await readBody(req);
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json(res, 422, { code: 422, error_code: "validation_failed", msg: "Unable to validate email address: invalid format" });
        if (!password || password.length < 8) return json(res, 422, { code: 422, error_code: "weak_password", msg: "Password should be at least 8 characters." });
        const dup = await pool.query("select 1 from auth.users where lower(email)=lower($1)", [email]);
        if (dup.rowCount) return json(res, 422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
        const { rows } = await pool.query(
          "insert into auth.users (email, encrypted_password, raw_user_meta_data, last_sign_in_at) values ($1,$2,$3,now()) returning *",
          [email.toLowerCase(), hashPassword(password), data || {}]);
        return json(res, 200, sessionJson(rows[0]));
      }
      if (route === "/token" && req.method === "POST") {
        const grant = url.searchParams.get("grant_type");
        const body = await readBody(req);
        if (grant === "password") {
          const { rows } = await pool.query("select * from auth.users where lower(email)=lower($1)", [body.email || ""]);
          if (!rows[0] || !checkPassword(body.password || "", rows[0].encrypted_password))
            return json(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
          await pool.query("update auth.users set last_sign_in_at=now() where id=$1", [rows[0].id]);
          return json(res, 200, sessionJson(rows[0]));
        }
        if (grant === "refresh_token") {
          const claims = verifyJwt(body.refresh_token);
          const u = claims?.typ === "refresh" ? await getUser(claims.sub) : null;
          if (!u) return json(res, 400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
          return json(res, 200, sessionJson(u));
        }
        return json(res, 400, { code: 400, msg: "unsupported grant_type" });
      }
      if (route === "/user") {
        const claims = verifyJwt(bearer);
        const u = claims?.sub && claims.role === "authenticated" ? await getUser(claims.sub) : null;
        if (!u) return json(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
        if (req.method === "PUT") {
          const body = await readBody(req);
          if (body.password) await pool.query("update auth.users set encrypted_password=$2 where id=$1", [u.id, hashPassword(body.password)]);
          if (body.data) await pool.query("update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb where id=$1", [u.id, body.data]);
          return json(res, 200, userJson(await getUser(u.id)));
        }
        return json(res, 200, userJson(u));
      }
      if (route === "/logout") { res.writeHead(204); return res.end(); }
      if (route === "/recover") return json(res, 200, {});
      return json(res, 404, { message: "not implemented in the test stack: " + route });
    } catch (e) {
      console.error("[gateway]", e);
      json(res, 500, { message: String(e.message || e) });
    }
  });
  await new Promise((r) => server.listen(GATEWAY_PORT, "127.0.0.1", r));
  return { server, pool };
}

async function waitFor(fn, label, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    try { if (await fn()) return; } catch {}
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function serve(fresh) {
  ensureDirs();
  const postgrest = ensurePostgrest();
  const data = initCluster(fresh);
  await startPostgres(data);
  ensureDatabase();
  writeFileSync(path.join(STACK, "postgrest.conf"), [
    `db-uri = "postgres://authenticator@127.0.0.1:${PG_PORT}/${DB}"`,
    `db-schemas = "public"`,
    `db-anon-role = "anon"`,
    `jwt-secret = "${JWT_SECRET}"`,
    `server-host = "127.0.0.1"`,
    `server-port = ${REST_PORT}`,
    `db-pool = 20`,
    `log-level = "warn"`,
  ].join("\n"));
  const rest = spawn(postgrest, [path.join(STACK, "postgrest.conf")], { stdio: ["ignore", "inherit", "inherit"] });
  const { server, pool } = await startGateway();
  await waitFor(async () => (await fetch(`http://127.0.0.1:${REST_PORT}/`, { headers: { apikey: ANON_KEY } })).status < 500, "PostgREST");
  writeFileSync(path.join(STACK, "ready"), String(process.pid));
  console.log(`[stack] ready  → ${stackEnv.NEXT_PUBLIC_SUPABASE_URL}`);
  const stop = async () => {
    rmSync(path.join(STACK, "ready"), { force: true });
    rest.kill("SIGTERM");
    server.close();
    await pool.end().catch(() => {});
    try { asPostgres(path.join(PG_BIN, "pg_ctl"), ["-D", data, "-m", "fast", "-w", "stop"]); } catch {}
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

async function up(fresh) {
  ensureDirs();
  const readyFile = path.join(STACK, "ready");
  if (existsSync(readyFile) && !fresh) {
    try { if ((await fetch(`http://127.0.0.1:${GATEWAY_PORT}/health`)).ok) return console.log("[stack] already running"); } catch {}
  }
  if (fresh) await down();
  rmSync(readyFile, { force: true });
  const log = path.join(STACK, "serve.log");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "serve", ...(fresh ? ["--fresh"] : [])], {
    detached: true, stdio: ["ignore", openLog(log), openLog(log)],
  });
  child.unref();
  await waitFor(() => existsSync(readyFile), "stack to become ready (see " + log + ")", 120000);
  console.log("[stack] up →", stackEnv.NEXT_PUBLIC_SUPABASE_URL);
}
import { openSync } from "node:fs";
function openLog(f) { return openSync(f, "a"); }

async function down() {
  const readyFile = path.join(STACK, "ready");
  if (existsSync(readyFile)) {
    const pid = Number(readFileSync(readyFile, "utf8"));
    try { process.kill(pid, "SIGTERM"); } catch {}
    await waitFor(() => !existsSync(readyFile), "stack to stop", 20000).catch(() => {});
  }
  try { asPostgres(path.join(PG_BIN, "pg_ctl"), ["-D", path.join(STACK, "pgdata"), "-m", "immediate", "-w", "stop"]); } catch {}
}

const [, , cmd, ...flags] = process.argv;
if (import.meta.url === `file://${process.argv[1]}`) {
  const fresh = flags.includes("--fresh");
  if (cmd === "serve") await serve(fresh);
  else if (cmd === "up") await up(fresh);
  else if (cmd === "down") { await down(); console.log("[stack] stopped"); }
  else if (cmd === "env") console.log(Object.entries(stackEnv).map(([k, v]) => `${k}=${v}`).join("\n"));
  else if (cmd === "status") console.log(existsSync(path.join(STACK, "ready")) ? "running" : "stopped");
  else { console.log("usage: test-stack.mjs up [--fresh] | down | status | env"); process.exit(1); }
}
