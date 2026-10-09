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

**Stack:** Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth,
RLS) · Recharts · Lucide. The optional coach uses the Anthropic API from the server.

---

## 1. Run it (hosted Supabase — the normal way)

1. **Create a Supabase project** (free tier is fine).
2. **Create the schema.** In the project's SQL editor run, in order:
   `supabase/migrations/0001_schema.sql`, `0002_functions.sql`, `0003_seed_reference.sql`
   (or `supabase db push` with the Supabase CLI).
3. **Configure the app.** Copy `.env.example` to `.env.local` and fill in the two public values from
   *Project Settings → API*:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
   ```
4. **Auth settings** (*Authentication → URL Configuration*): set *Site URL* to your deployed URL and add
   `https://YOUR-SITE/auth/callback` to *Redirect URLs*. Email confirmation can stay on (the app handles both).
5. `npm install && npm run dev` → http://localhost:3000. Sign up, and the onboarding wizard starts.

If the two values are missing the app shows a **Setup required** page instead of pretending to work.

### Deploy to Vercel
Import the repository, set **Root Directory = `level-up`**, add the same environment variables, deploy.
Then add the deployed URL to Supabase's Site URL / Redirect URLs (step 4).

### Optional: the AI coach
Set `ANTHROPIC_API_KEY` **on the server only** (never `NEXT_PUBLIC_`). Without it, the coach page says plainly that it
is off and every other feature works the same. Each user must also switch the coach on in Settings. Model:
`claude-opus-5-5` by default; override with `ANTHROPIC_MODEL`.

## 2. Run it with no Supabase account (Linux, for development and testing)

`npm run stack` starts **real PostgreSQL 16 + real PostgREST** plus a small stand-in for Supabase Auth, all behind
`http://127.0.0.1:54321`, and applies the three migrations. It needs the PostgreSQL 16 server binaries
(`/usr/lib/postgresql/16/bin`) and downloads PostgREST on first run.

```bash
npm run stack                      # start (add -- --fresh to wipe)
node scripts/test-stack.mjs env > .env.local
npm run dev
```
**It is not Supabase Auth.** It implements sign-up, password sign-in, refresh, user lookup and sign-out only: no email
confirmation or reset mails, OAuth, or rate limiting. Do not use it in production.

---

## 3. How it works

### The XP engine is in the database
Clients never send an XP amount. `complete_task(task_id)` and `undo_task(task_id)` are `SECURITY DEFINER` functions that
read the caller from `auth.uid()`, lock the quest row, and write an **append-only ledger** (`xp_transactions`).
* **Idempotent and race-safe:** the row lock plus unique constraints (`xp_one_award_per_round`, `unique(reverses_id)`)
  mean ten simultaneous requests pay once.
* **Undo** writes linked reversal rows, so history is preserved and re-completing pays once overall. Level-up events
  are recorded once per level, so undo/redo cannot replay a celebration.
* **No farming:** a quest instance completes once; quests dated in the future cannot be completed early; Boss Quests wait
  for their open sub-quests; completed quests cannot be edited to a bigger reward or deleted (undo first).
* **Auto-checked quests** (`verify` rules: protein, water, sleep, mobility, bodyweight, workout, rest day, practice,
  focused minutes, shot attempts) pay only after the matching data exists. Sleeping less than your healthy range is
  refused, and rest days are a rewarded quest type.
* **Focused-work bonus:** +25% when ≥80% of a quest's planned time was logged against it with the timer.
* Totals and levels are **derived** from the ledger. The curve is `XP to reach level L = base × (L−1)^exponent`,
  stored per user in `user_settings`; the TypeScript and SQL implementations are proven identical by tests.

### Security model
* Every table has row-level security; every row carries `user_id`; cross-table references are composite
  `(id, user_id)` foreign keys, so a row can never point at another user's data.
* The ledger, completions, activity and achievements are **read-only to clients**; only the definer functions write them.
  Titles can only be equipped if earned; rewards can only be claimed if the milestone is reached.
* Server Actions validate every input with Zod, derive `user_id` from the session, and map database errors to
  plain-language messages. Redirect targets are allow-listed (`safeNext`). API routes require same-origin JSON.
* The Supabase service-role key is not used anywhere. The AI key never reaches the browser.
* The coach receives a **shaped summary** (see `src/lib/coach/context.ts`): no email, notes, contact details, lead
  names, payments or body measurements. Settings → *Show exactly what would be sent* previews the real payload.

### Planning rules
Free hours per weekday are yours to set. Recommended load is 80% of them; over 115% (or over your daily quest limit) is
refused with a suggested better day. Repeating quests warn rather than block. Missing a quest is never penalised:
skip, reschedule or discard. **Minimum Viable Day** keeps ≤3 quests within a time budget, and rest days (marked, or
configured weekdays) never break a streak.

### Time zones
A "day" is a calendar date in your profile time zone. Completions store the local date at the moment they happen
(computed in the database), so streaks respect midnight where you live. Dates are formatted with fixed tables, not
`Intl`, because Node and browsers disagree on punctuation and that breaks hydration.

### Money
Income exists only as invoices and payments **you record**. Learning or coding hours are never converted into income;
currencies are never mixed or converted.

---

## 4. Testing

```bash
npm run typecheck
npm run test:unit      # 94 tests: curve, streaks, recurrence, planner, timer, analytics, coach privacy…
npm run test:db        # 45 tests against real Postgres (starts the local stack): RLS, XP, races, parity with TS
npm run test:e2e       # 61 browser tests (production build + local stack): see below
```
The e2e suite drives Chromium through sign-up, onboarding, XP/undo/double-click races, auth-gated quests, the planner
limit, every module, charts, rewards, settings, export, the coach with no key, direct cross-user REST attacks,
keyboard use, accessibility checks, and phone (390px) and tablet (820px) layouts, failing on any console error or
failed request. Screenshots land in `e2e-shots/`.

### What has **not** been verified
* **Real Supabase Auth** (email confirmation, password-reset mails, OAuth) — only the stand-in was exercised.
  Those code paths (`/auth/callback`, `/forgot-password`, `/reset-password`) follow Supabase's documented SSR flow
  but have not been run against a live project.
* **A live Anthropic call.** The coach request is built, validated and error-handled and is tested with a fake client
  (including privacy of the payload), but no real API key was available. The refusal-fallback parameter in particular
  is untested against the live API.
* **Real devices** (iOS Safari, Android) — only emulated viewports/touch in Chromium.
* Load and scale; offline use (this is not a PWA with offline support).

### Known limitations
* Progress is **self-reported**. The server can check that you logged something before paying XP, not that it truly
  happened, and you can set your own XP values. It is a personal tool, not an anti-cheat system.
* Badges are withdrawn if undoing work (or removing sample data) drops a metric below its threshold. This keeps them
  consistent with the ledger, and is deliberate.
* Account deletion is not self-service (it needs the Supabase admin API); *Reset all progress* wipes your data.
* No data import (export is JSON only).
* Deleting a repeating quest removes future copies; past copies and their XP stay.

## 5. Layout

```
supabase/migrations/   schema + RLS, trusted functions, reference seeds
src/app/               routes: (app) screens, (auth), (onboarding), api/export, api/coach, actions/
src/lib/game/          pure logic: xp, streaks, recurrence, planner, timer, analytics, domain helpers
src/lib/coach/         what the AI may see, prompt, request, rate limits
src/components/        UI primitives, charts, quest item, forms, focus timer
scripts/               test-stack.mjs (local Postgres+PostgREST+auth stand-in), e2e.mjs
tests/                 unit/ and db/
```
