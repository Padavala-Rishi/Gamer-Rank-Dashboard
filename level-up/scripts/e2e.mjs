#!/usr/bin/env node
// End-to-end suite: real Chromium → the production static export (./out) served as plain files.
// There is no server, API or database service: the app keeps its data in the browser, so these tests also prove
// persistence, isolation between browser profiles, backup/restore and offline use.
// Usage: node scripts/e2e.mjs [--no-build] [--only=<substring>]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { startStaticServer } from "./serve-static.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.E2E_PORT || 3100);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, "e2e-shots");
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium";
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
    try { await globalThis.__page?.screenshot({ path: path.join(SHOTS, `FAIL-${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.png`), fullPage: true }); } catch { /* page closed */ }
    console.log(`  ✗ ${name}\n      ${String(e.message ?? e).split("\n").slice(0, 6).join("\n      ")}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

// ───────────── server ─────────────
let staticServer;
async function boot() {
  if (!args.includes("--no-build")) execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "pipe" });
  ({ server: staticServer } = await startStaticServer(PORT));
}

// ───────────── helpers ─────────────
let browser;
const watch = (page, label) => {
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("caret-color") && !m.location()?.url?.startsWith("https://api.anthropic.com/")) problems.push(`[${label}] console @ ${page.url()}: ${m.text()} ${m.location()?.url ?? ""}`); });
  page.on("pageerror", (e) => problems.push(`[${label}] pageerror @ ${page.url()}: ${e.message}`));
  const stubbed = (u) => u.startsWith("https://api.anthropic.com/"); // the coach test answers these itself, with a 401
  page.on("response", (r) => { if (r.status() >= 400 && !stubbed(r.url())) problems.push(`[${label}] ${r.status()} ${r.url()}`); });
  page.on("requestfailed", (r) => { if (!["net::ERR_ABORTED", "net::ERR_INTERNET_DISCONNECTED"].includes(r.failure()?.errorText)) problems.push(`[${label}] request failed ${r.url()} ${r.failure()?.errorText}`); }); // OFFLINE is set on purpose in one test
  softNav(page);
};
/**
 * A full page load boots the on-device database (~2 s warm), which real users pay once per launch, not per screen.
 * So page.goto() inside the app uses the app's own client-side router, like tapping a link. Pass { hard: true } for a real load.
 */
function softNav(page) {
  const hardGoto = page.goto.bind(page);
  page.goto = async (url, opts = {}) => {
    const target = new URL(url, BASE);
    const live = !opts.hard && page.url().startsWith(BASE) && !page.isClosed() && (await page.evaluate(() => typeof window.next?.router?.push === "function").catch(() => false));
    if (!live || target.origin !== BASE) return hardGoto(url, opts);
    await page.evaluate((to) => window.next.router.push(to), target.pathname + target.search);
    await page.waitForURL((u) => u.pathname + u.search === target.pathname + target.search || (target.pathname === "/" && u.pathname === "/onboarding"), { timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]') && document.querySelector("h1"), null, { timeout: 30000 });
    return null;
  };
  const hardReload = page.reload.bind(page);
  const ready = () => page.waitForFunction(() => !document.querySelector('[aria-busy="true"]') && !document.querySelector('[data-testid="splash"]') && document.querySelector("h1"), null, { timeout: 60000 });
  page.reload = async (opts) => { const r = await hardReload(opts); await ready().catch(() => {}); return r; };
  page.hardGoto = async (url, opts) => { const r = await hardGoto(url, opts); await ready().catch(() => {}); return r; };
}
const newCtx = async (opts = {}) => browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
const text = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A brand-new install: the first load of a fresh browser profile boots the database and lands on onboarding. */
async function startFresh(page) {
  await page.hardGoto(BASE + "/");
  await page.waitForURL("**/onboarding", { timeout: 60000 });
  await page.getByLabel("Character name").waitFor();
}
async function onboard(page, { sample = true, name = "Rishi" } = {}) {
  await page.getByLabel("Character name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.fill('input[aria-label="Basketball goal"]', "Reliable point guard");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  const box = page.getByLabel(/Add sample quests/);
  if ((await box.isChecked()) !== sample) await box.click();
  await page.getByRole("button", { name: "Start playing" }).click();
  await page.waitForURL(BASE + "/", { timeout: 60000 });
  await page.waitForSelector("h1");
}
const xpOf = async (page) => { const t = await text(page); const m = t.match(/(\d+) \/ (\d+) XP/); return m ? Number(m[1]) : null; };
const toast = (page, re) => page.locator("[role=status]").getByText(re).first().waitFor({ timeout: 8000 });
const questRow = (page, title) => page.locator('[data-testid="quest"]').filter({ hasText: title }).first();

// ───────────── suites ─────────────
const U = { name: "Rishi" };

async function main() {
  await boot();
  browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const ctx = await newCtx();
  const page = await ctx.newPage();
  globalThis.__page = page;
  watch(page, "desktop");

  console.log("\nFirst launch (no account, no server)");
  await test("a fresh install opens straight into onboarding: no sign-up, no login", async () => {
    await startFresh(page);
    const t = await text(page);
    assert(!/sign in|sign up|log in|password|email/i.test(t), "found account UI: " + t.slice(0, 200));
    await page.hardGoto(BASE + "/quests");
    await page.waitForURL("**/onboarding", { timeout: 60000 }); // every screen waits for onboarding on a new install
  });
  await test("there is no server API: the old endpoints simply don't exist", async () => {
    for (const p of ["/api/export", "/api/coach", "/login", "/signup"]) eq((await fetch(BASE + p)).status, 404, p);
  });

  console.log("\nOnboarding");
  await test("onboarding wizard completes and lands on the character dashboard", async () => {
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
  await test("progress persists across a reload (the database is in this browser)", async () => {
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

  // remaining suites are in e2e-more
  const rest = await import("./e2e-more.mjs");
  await rest.run({ BASE, browser, ctx, page, newCtx, watch, test, assert, eq, text, shot, uid, startFresh, onboard, xpOf, toast, questRow, U, CHROME, SHOTS });

  await browser.close();
  staticServer.close();

  const failed = results.filter((r) => !r.ok);
  const uniqueProblems = [...new Set(problems)];
  writeFileSync(path.join(SHOTS, "problems.txt"), uniqueProblems.join("\n\n---\n\n"));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (uniqueProblems.length) console.log(`\nBrowser problems seen: ${uniqueProblems.length} (full text in e2e-shots/problems.txt)`);
  if (failed.length || uniqueProblems.length) process.exit(1);
}

main().catch(async (e) => { console.error(e); try { await browser?.close(); } catch {} staticServer?.close(); process.exit(1); });
