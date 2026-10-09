#!/usr/bin/env node
// End-to-end suite: real browser → production Next server → PostgREST → Postgres (local test stack).
// Usage: node scripts/e2e.mjs [--no-build] [--only=<substring>]
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { ANON_KEY } from "./test-stack.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3100;
const BASE = `http://127.0.0.1:${PORT}`;
const SUPABASE = "http://127.0.0.1:54321";
const SHOTS = path.join(ROOT, "e2e-shots");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
mkdirSync(SHOTS, { recursive: true });

// ───────────── tiny test framework ─────────────
const results = [];
const problems = []; // console errors / failed requests seen by any page
let current = "";
async function test(name, fn) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) return;
  current = name;
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ✓ ${name}  (${Date.now() - t0}ms)`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, error: e });
    console.log(`  ✗ ${name}\n      ${String(e.message ?? e).split("\n").slice(0, 6).join("\n      ")}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

// ───────────── servers ─────────────
let nextProc;
const stopNext = () => { try { process.kill(-nextProc.pid, "SIGTERM"); } catch { /* already gone */ } };
async function boot() {
  execFileSync(process.execPath, [path.join(ROOT, "scripts/test-stack.mjs"), "up", "--fresh"], { stdio: "inherit" });
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: SUPABASE, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY, PORT: String(PORT) };
  delete env.ANTHROPIC_API_KEY; // the coach must work "off" in tests
  if (!args.includes("--no-build")) execFileSync("npx", ["next", "build"], { cwd: ROOT, env, stdio: "pipe" });
  nextProc = spawn("npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let log = "";
  nextProc.stdout.on("data", (d) => (log += d));
  nextProc.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(BASE + "/login")).ok) return () => log; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Next server did not start:\n" + log);
}

// ───────────── helpers ─────────────
let browser;
const watch = (page, label) => {
  page.on("console", (m) => { if (m.type() === "error") problems.push(`[${label}] console: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`[${label}] ${r.status()} ${r.url()}`); });
  page.on("requestfailed", (r) => { if (!/_rsc|favicon/.test(r.url()) && r.failure()?.errorText !== "net::ERR_ABORTED") problems.push(`[${label}] request failed ${r.url()} ${r.failure()?.errorText}`); });
};
const newCtx = async (opts = {}) => browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
const text = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function signUp(page, email, name = "Tester", pw = "password123") {
  await page.goto(BASE + "/signup");
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await page.click("button[type=submit]");
  await page.waitForURL("**/onboarding", { timeout: 20000 });
}
async function onboard(page, { sample = true } = {}) {
  await page.getByRole("button", { name: "Continue" }).click();
  await page.fill('input[aria-label="Basketball goal"]', "Reliable point guard");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  const box = page.getByLabel(/Add sample quests/);
  if ((await box.isChecked()) !== sample) await box.click();
  await page.getByRole("button", { name: "Start playing" }).click();
  await page.waitForURL(BASE + "/", { timeout: 30000 });
  await page.waitForSelector("h1");
}
async function signIn(page, email, pw = "password123") {
  await page.goto(BASE + "/login");
  await page.fill("#email", email);
  await page.fill("#password", pw);
  await page.click("button[type=submit]");
  await page.waitForURL(BASE + "/", { timeout: 20000 });
}
const xpOf = async (page) => { const t = await text(page); const m = t.match(/(\d+) \/ (\d+) XP/); return m ? Number(m[1]) : null; };
const toast = (page, re) => page.locator("[role=status]").getByText(re).first().waitFor({ timeout: 8000 });
const questRow = (page, title) => page.locator('[data-testid="quest"]').filter({ hasText: title }).first();

// ───────────── suites ─────────────
const U = { email: `a_${uid()}@test.local`, name: "Rishi" };
const V = { email: `b_${uid()}@test.local`, name: "Other" };

async function main() {
  const getLog = await boot();
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const ctx = await newCtx();
  const page = await ctx.newPage();
  watch(page, "desktop");

  console.log("\nAuthentication and access control");
  await test("signed-out visitors are sent to the login page", async () => {
    await page.goto(BASE + "/quests");
    assert(page.url().includes("/login?next=%2Fquests"), "expected redirect to /login with next, got " + page.url());
    for (const p of ["/", "/stats", "/settings", "/coach", "/achievements", "/basketball"]) {
      await page.goto(BASE + p);
      assert(page.url().includes("/login"), `${p} did not redirect`);
    }
  });
  await test("API routes refuse signed-out requests", async () => {
    eq((await fetch(BASE + "/api/export")).status, 401);
    eq((await fetch(BASE + "/api/coach?preview=1")).status, 401);
    eq((await fetch(BASE + "/api/coach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "next" }) })).status, 401);
  });
  await test("sign-up validates input with clear messages", async () => {
    await page.goto(BASE + "/signup");
    await page.fill("#email", "not-an-email");
    await page.fill("#password", "password123");
    await page.click("button[type=submit]");
    await page.getByText("Enter a valid email address").waitFor();
    await page.fill("#email", `short_${uid()}@test.local`);
    await page.fill("#password", "abc");
    await page.click("button[type=submit]");
    await page.getByText("Use at least 8 characters").first().waitFor();
  });
  await test("sign-in with the wrong password fails without revealing which part was wrong", async () => {
    await page.goto(BASE + "/login");
    await page.fill("#email", "nobody@test.local");
    await page.fill("#password", "wrongwrong");
    await page.click("button[type=submit]");
    await page.getByText("That email and password don't match.").waitFor();
  });
  await test("open-redirect attempts via ?next= are neutralised", async () => {
    await signUp(page, U.email, U.name);
    await page.context().clearCookies();
    await page.goto(BASE + "/login?next=https://evil.example/");
    await page.fill("#email", U.email);
    await page.fill("#password", "password123");
    await page.click("button[type=submit]");
    await page.waitForURL(BASE + "/", { timeout: 15000 }); // lands on the safe default, never off-site
    assert(!page.url().includes("evil"), "redirected off-site: " + page.url());
  });

  console.log("\nOnboarding");
  await test("onboarding wizard completes and lands on the character dashboard", async () => {
    await page.goto(BASE + "/onboarding");
    await shot(page, "01-onboarding");
    await onboard(page);
    assert((await text(page)).includes("Rishi"), "character name missing");
  });
  await test("sample data is clearly marked", async () => {
    const n = await page.getByText("Sample", { exact: true }).count();
    assert(n >= 3, `expected sample badges, found ${n}`);
  });

  console.log("\nQuests, XP and undo");
  await test("dashboard shows level, XP, streak, attributes and a next best action", async () => {
    await shot(page, "02-dashboard");
    const t = await text(page);
    assert(/Level 1/.test(t) && /0 \/ 100 XP/.test(t), "XP bar text");
    for (const k of ["SKILL", "KNOWLEDGE", "CAREER", "VITALITY"]) assert(t.includes(k), `attribute ${k}`);
    assert(await page.getByTestId("nba").isVisible(), "next best action");
    assert(t.includes("Week consistency") && t.includes("Weekly streak"), "consistency tiles");
  });
  await test("completing a quest awards its XP once, updates the UI and shows a badge", async () => {
    await questRow(page, "100 stationary dribble").getByRole("button", { name: /^Complete:/ }).click();
    await toast(page, /Badge unlocked: First Steps/);
    await page.waitForFunction(() => /10 \/ 100 XP/.test(document.body.innerText), null, { timeout: 8000 });
    assert((await text(page)).includes("Recent activity"), "feed");
  });
  await test("progress persists across a reload", async () => {
    await page.reload();
    eq(await xpOf(page), 10, "xp after reload");
    assert((await text(page)).includes("First Steps"), "activity feed shows the badge");
  });
  await test("undo removes exactly that XP and the quest is open again", async () => {
    await page.goto(BASE + "/quests");
    await questRow(page, "100 stationary dribble").getByRole("button", { name: /^Undo:/ }).click();
    await toast(page, /Undone\. −10 XP/);
    await page.locator('[data-testid="quest"][data-status="open"]').filter({ hasText: "100 stationary" }).first().waitFor({ timeout: 8000 });
    await page.goto(BASE + "/");
    eq(await xpOf(page), 0, "xp after undo");
  });
  await test("re-completing after undo pays only once overall", async () => {
    await questRow(page, "100 stationary dribble").getByRole("button", { name: /^Complete:/ }).click();
    await page.waitForFunction(() => /10 \/ 100 XP/.test(document.body.innerText), null, { timeout: 8000 });
    await page.reload();
    eq(await xpOf(page), 10);
  });
  await test("rapid double-clicks do not double-pay", async () => {
    await page.goto(BASE + "/quests");
    const btn = questRow(page, "Learn and implement one React concept").getByRole("button", { name: /^Complete:/ });
    await Promise.all([btn.click({ clickCount: 2, delay: 0 }), page.waitForTimeout(0)]);
    await page.waitForTimeout(1500);
    await page.goto(BASE + "/");
    eq(await xpOf(page), 35, "10 + 25 exactly once");
  });
  await test("an auto-checked quest is refused until the data is logged, then pays", async () => {
    await page.goto(BASE + "/quests");
    await questRow(page, "Hit my protein target").getByRole("button", { name: /^Complete:/ }).click();
    await toast(page, /Log at least 120 g of protein first/);
    await page.goto(BASE + "/health");
    await page.getByRole("button", { name: "Log a meal" }).click();
    await page.fill("#rf-nutrition_entries-protein_g", "130");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await toast(page, /Added/);
    await page.goto(BASE + "/quests");
    await questRow(page, "Hit my protein target").getByRole("button", { name: /^Complete:/ }).click();
    await page.waitForFunction(() => /Done today/.test(document.body.innerText) && /protein target/i.test(document.body.innerText), null, { timeout: 8000 });
    await page.goto(BASE + "/");
    eq(await xpOf(page), 60, "10 + 25 + 25");
  });
  await test("a Boss Quest triggers the level-up celebration", async () => {
    await page.goto(BASE + "/quests");
    await page.getByRole("button", { name: "New quest" }).first().click();
    await page.fill("#tf-title", "Ship the portfolio");
    await page.getByRole("button", { name: /^Development|^Code$/ }).first().click();
    await page.getByRole("button", { name: /Boss Quest/ }).click();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await page.getByRole("button", { name: "Add quest" }).click();
    await toast(page, /Quest added/);
    await questRow(page, "Ship the portfolio").getByRole("button", { name: /^Complete:/ }).click();
    await page.getByRole("heading", { name: "Level up!" }).waitFor({ timeout: 8000 });
    await shot(page, "03-levelup");
    await page.getByRole("button", { name: "Keep going" }).click();
    await page.goto(BASE + "/");
    assert(/Level 2/.test(await text(page)), "level 2 shown");
  });

  // remaining suites are appended in e2e-2
  const rest = await import("./e2e-more.mjs");
  await rest.run({ BASE, SUPABASE, ANON_KEY, browser, ctx, page, newCtx, watch, test, assert, eq, text, shot, uid, signUp, onboard, signIn, xpOf, toast, questRow, U, V });

  await browser.close();
  stopNext();
  execFileSync(process.execPath, [path.join(ROOT, "scripts/test-stack.mjs"), "down"], { stdio: "ignore" });

  const failed = results.filter((r) => !r.ok);
  const uniqueProblems = [...new Set(problems)];
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (uniqueProblems.length) console.log("\nBrowser problems seen (console errors / failed requests):\n  " + uniqueProblems.join("\n  "));
  if (failed.length || uniqueProblems.length) { console.log("\nserver log tail:\n" + getLog().split("\n").slice(-15).join("\n")); process.exit(1); }
}

main().catch(async (e) => { console.error(e); try { await browser?.close(); } catch {} stopNext(); process.exit(1); });
