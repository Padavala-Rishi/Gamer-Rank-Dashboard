# Level Up — a personal life RPG

Complete real quests, earn XP, level up. Four areas, each with its own attribute:

| Area | Attribute | What it tracks |
|---|---|---|
| 🏀 Basketball | SKILL | point-guard practice plans, drills, shooting %, personal bests |
| 🎓 College | KNOWLEDGE | subjects, syllabus tree, exams, focus timer, spaced revision |
| 💻 Development | CAREER | learning roadmap, projects, freelance pipeline, real income |
| 💪 Health & Physique | VITALITY | workouts and PRs, bodyweight, protein, water, sleep, rest days |

Plus a daily quest board with a realistic-workload planner, a Minimum Viable Day mode, statistics that refuse to
invent insights, badges/titles/self-defined rewards, and an optional AI coach.

## It runs entirely on your device

There is **no server, no database service and no account**. The whole app is static files. Your data lives in a
Postgres database that runs inside the browser (PGlite, Postgres compiled to WebAssembly) and is saved to the browser's
IndexedDB. Nothing is sent anywhere unless you turn on the optional AI coach.

**Stack:** Next.js 16 (static export) · React 19 · TypeScript · Tailwind CSS 4 · PGlite (Postgres in WebAssembly) ·
Recharts · Lucide. No environment variables.

> **Read this once.** Because the data is only on your device: nothing is backed up for you, and there is no sync between
> devices. Clearing the site's data, uninstalling the home-screen app, or losing the phone loses your progress. Use
> **Settings → Back up everything** regularly. See [Your data](#your-data-and-its-limits).

---

## 1. Use it

### On your phone (recommended)
1. Deploy it once (below) and open the URL on your phone.
2. **iPhone:** Safari → Share → *Add to Home Screen*. **Android:** Chrome → menu → *Install app* / *Add to Home screen*.
3. Open it from the home screen. The first launch takes a few seconds while the database is created; after that it opens
   fast, and it works with no network at all.

### Deploy to Vercel (free)
Import the repository, set **Root Directory = `level-up`**, and deploy. No settings or environment variables are
needed: `vercel.json` already says to run `npm run build` and serve `out/`. Any static host works the same way
(Netlify, Cloudflare Pages, S3…): upload the contents of `out/` after `npm run build`.

### On your computer
```bash
npm install
npm run build      # writes the static site to ./out (and the offline service worker)
npm start          # serves ./out on http://127.0.0.1:3000
```
For development: `npm run dev`.

### Optional: the AI coach (bring your own key)
The coach is off until you paste **your own Anthropic API key** in *Settings → AI coach* and tick the consent box.
There is no Level Up server in the middle: when you press *Ask the coach*, your browser sends a summary of your recorded
progress straight to `api.anthropic.com` with your key, and the answer is saved on your device.
* The key is stored in this browser's local storage. Anyone who can use this browser profile could read it, so use a key
  with a spending limit. Requests are billed to your Anthropic account.
* The summary is shaped by `src/lib/coach/context.ts` and contains no email, notes, contact details, lead names,
  payments or body measurements. *Settings → Show exactly what would be sent* previews the real payload.
* Default model `claude-opus-5-5`. The coach has **not** been run against the live API (see below).

---

## 2. Your data and its limits

* **Where:** the browser's IndexedDB for this site (database name `level-up`). One browser profile = one set of data.
  A different phone, browser or private window starts as a brand-new install.
* **iPhone gotcha:** the Safari tab and the Home-Screen app keep *separate* data. Pick one (the Home-Screen app) and
  stay with it, or move between them with a backup file. Safari may also delete a site's data after a while without use
  if the site is not installed to the Home Screen.
* **Backup / restore:** *Settings → Your data*. The backup is a JSON file with every record. Restore replaces
  everything on the device with the file's contents, in one transaction (all or nothing), and does not pay any new XP.
  Files made by the earlier hosted version of this app can also be restored.
* **Only one tab at a time.** Two tabs writing the same browser database could corrupt it, so a second tab is shown
  "Level Up is open in another tab" instead of opening it.
* **Offline:** a service worker caches the whole app after the first visit (about 16 MB, mostly the database engine).
  New versions install in the background and take over the next time the app is fully closed and reopened.
* **Privacy:** there are no analytics, trackers or accounts. Anyone who can unlock your phone and open the app can read
  your data; there is no passcode inside the app.

## 3. How it works

### The XP engine is in the database
The original schema, row-level security and functions (`supabase/migrations/*.sql`) run **unchanged** in the in-browser
Postgres. Clients never send an XP amount. `complete_task(task_id)` and `undo_task(task_id)` are `SECURITY DEFINER`
functions that lock the quest row and write an **append-only ledger** (`xp_transactions`).
* **Idempotent:** unique constraints (`xp_one_award_per_round`, `unique(reverses_id)`) mean a double-click pays once.
* **Undo** writes linked reversal rows, so history is preserved and re-completing pays once overall. Level-up events are
  recorded once per level, so undo/redo cannot replay a celebration.
* **No farming:** a quest instance completes once; quests dated in the future cannot be completed early; Boss Quests wait
  for their open sub-quests; completed quests cannot be edited to a bigger reward or deleted (undo first).
* **Auto-checked quests** (`verify` rules: protein, water, sleep, mobility, bodyweight, workout, rest day, practice,
  focused minutes, shot attempts) pay only after the matching data exists. Sleeping less than your healthy range is
  refused, and rest days are a rewarded quest type.
* **Focused-work bonus:** +25% when ≥80% of a quest's planned time was logged against it with the timer.
* Totals and levels are **derived** from the ledger. The curve is `XP to reach level L = base × (L−1)^exponent`,
  stored in `user_settings`; the TypeScript and SQL implementations are proven identical by tests.

### How the app talks to the database
`src/db/` boots PGlite, applies the migrations (bundled into `migrations.generated.ts` by `npm run gen:sql`; a test fails
if the bundle drifts), and creates the one local user. `src/db/shim.ts` is a small supabase-js-shaped query builder
(`from().select/insert/update/upsert/delete`, filters, `order/limit/range`, `single`, `rpc`) over that database. Each call
runs in its own transaction as the `authenticated` role with the local user's claims, so **row-level security, the
trusted functions and the triggers behave exactly as they did against a server**. Pages are async functions that run in
the browser (`LivePage`) and re-read after every write.

On-device there is a single user and a single connection, so RLS and the composite `(id, user_id)` keys no longer defend
against other people. They are kept because they still stop bugs: the app can't write XP, mark a quest done, or claim a
reward except through the engine.

### Planning rules
Free hours per weekday are yours to set. Recommended load is 80% of them; over 115% (or over your daily quest limit) is
refused with a suggested better day. Repeating quests warn rather than block. Missing a quest is never penalised:
skip, reschedule or discard. **Minimum Viable Day** keeps ≤3 quests within a time budget, and rest days (marked, or
configured weekdays) never break a streak.

### Time zones
A "day" is a calendar date in your profile time zone. Completions store the local date at the moment they happen
(computed in the database), so streaks respect midnight where you live; pages refresh when the date rolls over. Dates are
formatted with fixed tables, not `Intl`, because Node and browsers disagree on punctuation and that breaks hydration.

### Money
Income exists only as invoices and payments **you record**. Learning or coding hours are never converted into income;
currencies are never mixed or converted.

---

## 4. Testing

```bash
npm run typecheck
npm run test:unit      # 95 tests: curve, streaks, recurrence, planner, timer, analytics, coach privacy, migration bundle…
npm run test:db        # 68 tests on the shipped engine (PGlite): RLS, XP engine, parity with TS, the query shim, backup/restore, coach
npm run test:e2e       # builds the static site and drives Chromium through it: see below
```
The e2e suite serves the production export as plain files and drives Chromium through first launch and onboarding,
XP/undo/double-click, the planner, every module, charts, rewards, settings, **backup and restore**, **persistence across
closing the tab**, **a second profile starting empty**, **the second-tab lock**, **offline use**, the coach without a key
(and with a fake key against a stubbed endpoint), keyboard use, accessibility checks, and phone (390px) and tablet
(820px) layouts. It fails on any console error or failed request. Screenshots land in `e2e-shots/`.

### What has **not** been verified
* **Real devices.** Only desktop Chromium (including emulated phone/tablet viewports and touch) was used. iOS Safari
  and Android Chrome have not been tried: IndexedDB persistence, the service worker, home-screen install and storage
  eviction behave differently there. Test *Add to Home Screen* on your phone before relying on it.
* **A Vercel deployment.** `vercel.json` is written to the documented static-export setup but I could not deploy from
  here. Any plain static host serving `out/` is the fallback.
* **A live Anthropic call.** The coach request is built, validated and error-handled and is tested with a fake client and
  a stubbed network endpoint (including the privacy of the payload), but no real API key was available. The
  refusal-fallback parameter in particular is untested against the live API.
* **Load and large data.** The database engine loads fully into memory; start-up is about 2 s on a warm launch and
  6 s on the very first one in the test sandbox, and will be slower on older phones. Years of data have not been tried.
* **Two devices.** There is no sync; that is by design.

### Known limitations
* Progress is **self-reported**. The database can check that you logged something before paying XP, not that it truly
  happened, and you can set your own XP values. It is a personal tool, not an anti-cheat system.
* Badges are withdrawn if undoing work (or removing sample data) drops a metric below its threshold. This keeps them
  consistent with the ledger, and is deliberate.
* Deleting a repeating quest removes future copies; past copies and their XP stay.
* The engine runs on one connection, so true concurrent writers are not exercised on-device (the second-tab lock exists
  for that reason).

## 5. Layout

```
supabase/migrations/   schema + RLS, trusted functions, reference seeds (run unchanged in the browser)
src/db/                the on-device database: PGlite boot, migrations bundle, supabase-style query shim, backup/restore
src/app/               routes: (app) screens (page.tsx = thin client wrapper, view.tsx = the screen), (onboarding), actions/
src/lib/game/          pure logic: xp, streaks, recurrence, planner, timer, analytics, domain helpers
src/lib/coach/         what the AI may see, prompt, request, rate limits, the browser-side runner
src/components/        UI primitives, charts, quest item, forms, focus timer, LivePage
scripts/               gen-sql (bundle migrations), gen-sw (offline worker), gen-icons, serve-static, e2e
tests/                 unit/ and db/ (the db tests run the real migrations on PGlite)
```
