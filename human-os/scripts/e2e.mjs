// End-to-end smoke test: registers a fresh user, onboards with demo data, visits every page on
// desktop and mobile, exercises the key flows, and fails on console errors, failed API calls
// or horizontal overflow on mobile. Screenshots are written to OUT.
//   npm run build && NODE_ENV=production PORT=3099 DATABASE_PATH=/tmp/e2e.db npm start
//   BASE=http://localhost:3099 OUT=/tmp/shots node scripts/e2e.mjs
// Requires Playwright (npm i -D playwright, or set PLAYWRIGHT_PATH to a global install).
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(process.env.PLAYWRIGHT_PATH ?? import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.BASE ?? "http://localhost:3099";
const OUT = process.env.OUT ?? "./test-results/e2e";
mkdirSync(OUT, { recursive: true });
const problems = [];
const browser = await chromium.launch({ executablePath: undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "Asia/Kolkata" });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") problems.push(`[console] ${page.url()} :: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`[pageerror] ${page.url()} :: ${e.message}`));
page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400 && !r.url().includes("/auth/me")) problems.push(`[http ${r.status()}] ${r.request().method()} ${r.url()}`); });

await page.goto(BASE);
await page.getByRole("button", { name: "Create an account" }).click();
await page.getByLabel("Email").fill(`e2e${Date.now()}@example.com`);
await page.getByLabel("Password").fill("correct horse battery staple");
await page.getByRole("button", { name: "Create account" }).click();
await page.getByRole("heading", { name: "Welcome" }).waitFor();
await page.screenshot({ path: `${OUT}/00-onboarding.png` });
await page.getByLabel("What should we call you?").fill("Ravi");
for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /Continue/ }).click();
await page.getByLabel("Fill the app with example data").check();
await page.getByRole("button", { name: "Get started" }).click();
await page.getByRole("heading", { name: /Good|Hello/ }).first().waitFor({ timeout: 15000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/01-today.png`, fullPage: true });

const routes = ["/tasks", "/tasks?view=all", "/calendar", "/projects", "/goals", "/habits", "/focus", "/learning", "/learning/review", "/career", "/health", "/finance", "/people", "/journal", "/journal/decisions", "/knowledge", "/reviews", "/reviews?kind=quarterly", "/analytics", "/assistant", "/assistant?tab=audit", "/compass", "/settings", "/settings?tab=data", "/nope"];
for (const r of routes) {
  await page.goto(BASE + r);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  const name = r.replace(/[/?=]/g, "_").replace(/^_/, "") || "root";
  await page.screenshot({ path: `${OUT}/d-${name}.png`, fullPage: true });
}
// Drill into detail pages
await page.goto(BASE + "/projects"); await page.waitForLoadState("networkidle");
await page.locator("a.card").first().click(); await page.waitForLoadState("networkidle"); await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/d-project-detail.png`, fullPage: true });
await page.goto(BASE + "/goals"); await page.waitForLoadState("networkidle");
await page.locator('a[href^="/goals/"]').first().click(); await page.waitForLoadState("networkidle"); await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/d-goal-detail.png`, fullPage: true });
await page.goto(BASE + "/learning"); await page.waitForLoadState("networkidle");
await page.locator('a[href^="/learning/"]').filter({ hasNotText: "Review" }).first().click(); await page.waitForLoadState("networkidle"); await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/d-subject-detail.png`, fullPage: true });

// Interactions: what-now, planner, palette, capture
await page.goto(BASE + "/");
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Plan my day" }).click();
await page.getByText("Realistic focus time", { exact: true }).waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/02-planner.png` });
await page.keyboard.press("Escape");
await page.keyboard.press("Control+k");
await page.getByPlaceholder("Search everything").fill("network");
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/03-palette.png` });
await page.keyboard.press("Escape");
await page.keyboard.press("c");
await page.getByLabel("Capture text").fill("Call mom tomorrow 6pm !high");
await page.waitForTimeout(200);
await page.screenshot({ path: `${OUT}/04-capture.png` });
await page.getByRole("dialog").getByRole("button", { name: "Capture", exact: true }).click();
await page.waitForTimeout(600);
await page.getByRole("button", { name: "What should I do now?" }).first().click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/05-now.png` });
await page.keyboard.press("Escape");

// Complete a task from Today
const cb = page.getByRole("checkbox", { name: /Complete/ }).first();
await cb.click(); await page.waitForTimeout(600);

// Focus flow
await page.goto(BASE + "/focus"); await page.waitForLoadState("networkidle");
await page.getByLabel("What will you accomplish?").fill("E2E focus");
await page.getByRole("button", { name: /^Start/ }).click();
await page.getByRole("timer").waitFor();
await page.getByRole("button", { name: "I got distracted" }).click();
await page.getByRole("button", { name: "Phone", exact: true }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/06-focus-running.png` });
await page.getByRole("button", { name: "Finish" }).click();
await page.getByLabel("What did you accomplish?").fill("Tested the flow");
await page.getByRole("button", { name: "Save session" }).click();
await page.waitForTimeout(800);

// Dark mode
await page.emulateMedia({ colorScheme: "dark" });
await page.goto(BASE + "/"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/07-today-dark.png`, fullPage: true });
await page.goto(BASE + "/analytics"); await page.waitForLoadState("networkidle"); await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/08-analytics-dark.png`, fullPage: true });
await page.emulateMedia({ colorScheme: "light" });

// Mobile
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, storageState: await ctx.storageState(), timezoneId: "Asia/Kolkata" });
const mp = await m.newPage();
mp.on("pageerror", (e) => problems.push(`[mobile pageerror] ${mp.url()} :: ${e.message}`));
for (const r of ["/", "/tasks", "/calendar", "/habits", "/finance", "/focus"]) {
  await mp.goto(BASE + r); await mp.waitForLoadState("networkidle"); await mp.waitForTimeout(400);
  await mp.screenshot({ path: `${OUT}/m-${r.replace(/\//g, "_") || "root"}.png`, fullPage: false });
}
await mp.getByRole("button", { name: "More" }).click(); await mp.waitForTimeout(300);
await mp.screenshot({ path: `${OUT}/m-more.png` });
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
if (overflow) problems.push("[mobile] horizontal overflow on " + mp.url());
await browser.close();
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("E2E OK — no console errors, failed requests or mobile overflow.");
