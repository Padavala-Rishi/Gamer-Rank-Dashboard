#!/usr/bin/env node
// Renders the app icon to the PNG sizes iOS/Android need. Output is committed (public/*.png); re-run only if the icon changes.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GLYPH = `<path d="M22 42l20-20M24 22h-4v4l8 8M40 42h4v-4l-8-8" fill="none" stroke="#1b1405" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b0c0f"/><rect x="4" y="4" width="56" height="56" rx="11" fill="#e8b84a"/>${GLYPH}</svg>`;
// iOS rounds the corners itself, so the home-screen icon is a full-bleed square; maskable keeps the glyph inside the safe zone.
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#e8b84a"/>${GLYPH}</svg>`;
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#e8b84a"/><g transform="translate(12.8 12.8) scale(0.6)">${GLYPH}</g></svg>`;

const jobs = [
  ["apple-touch-icon.png", square, 180],
  ["icon-192.png", rounded, 192],
  ["icon-512.png", rounded, 512],
  ["icon-maskable-512.png", maskable, 512],
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
mkdirSync(path.join(ROOT, "public"), { recursive: true });
for (const [name, svg, size] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  writeFileSync(path.join(ROOT, "public", name), await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  await page.close();
}
await browser.close();
console.log("wrote", jobs.map((j) => j[0]).join(", "));
