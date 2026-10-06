# Human OS

A personal operating system for human development. It connects **who you want to become** with **what you do today**, and shows honestly whether it's working.

```
VISION → GOALS → PLAN → EXECUTE → MEASURE → REFLECT → ADAPT → VISION
```

Every part of the app maps to one of five questions:

| Question | Where it lives |
|---|---|
| Who am I trying to become? | **Compass** (vision, values, life areas), onboarding |
| What matters most? | **Goals** (hierarchy, focus goals, SMART check), **Projects** |
| What should I do today? | **Today**, the **daily planner**, **“What should I do now?”**, **Tasks**, **Calendar**, **Habits**, **Focus** |
| Am I actually making progress? | **Analytics**, goal pace, habit consistency, **Finance**, **Learning** mastery |
| What should I change? | **Journal**, **Decision journal**, **Reviews** (weekly/monthly/quarterly), **Life Audit**, **Assistant** |

## Quick start

Requires Node.js ≥ 20.11.

```bash
cd human-os
npm install
cp .env.example .env          # optional; add ANTHROPIC_API_KEY to enable AI features
npm run dev                   # API on :3001, app on http://localhost:5173
```

Create an account, go through onboarding (≈5 minutes, every step skippable), and optionally tick **“Also load demo data”** to explore every feature with a realistic example persona. Demo rows are flagged and can be removed in one click without touching your own data.

### Production

```bash
npm run build                 # client → dist/client, server → dist/server
NODE_ENV=production PORT=3001 DATABASE_PATH=./data/human-os.db npm start
```

One Node process serves the API and the built app. Put it behind HTTPS (cookies are `Secure` in production). If you run behind a reverse proxy, set `TRUST_PROXY=1` and add your public URL to `ALLOWED_ORIGINS`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (tsx watch) + Vite dev server with proxy |
| `npm run typecheck` | Strict TypeScript over client, server and shared code |
| `npm test` | 39 tests: API integration (auth, cross-user isolation, domain rules, export/import) and pure-logic units (DST-safe dates, recurrence, SM-2, streaks, planner, calendar, finance) |
| `node scripts/e2e.mjs` | Browser smoke test (Playwright): registers, onboards with demo data, visits every page on desktop + mobile, exercises planner / palette / capture / focus flows; fails on any console error, failed API call or mobile horizontal overflow |
| `npm run build` / `npm start` | Production build / run |


## Free phone version (no server, no account)

`npm run build:local` builds a version where the whole app, including the database (SQLite compiled to JavaScript), runs inside the browser and saves to the device. It installs to a phone's home screen and works offline. There is no sign-in, no sync between devices and no AI assistant.

Deploy it free on Netlify: connect the repository (branch `claude/human-os-productivity-app-2heqwy`). The `netlify.toml` at the repository root sets the build command and folder, so no settings need typing. Then open the site in Safari and use **Share → Add to Home Screen**.

Notes: on iPhone, the Home Screen app has its own storage, separate from Safari — create your data inside the Home Screen app. Export a backup now and then (Settings → Data & privacy).

## Architecture

```
human-os/
├── shared/      Pure TypeScript used by both server and client
│   ├── schemas.ts      zod schemas for every entity (single source of validation truth)
│   ├── constants.ts    enums + labels, prompts, defaults
│   ├── dates.ts        timezone/DST-safe date maths (no dependencies)
│   ├── planner.ts      daily planner + “what should I do now” engine
│   ├── habits.ts goals.ts calendar.ts recurrence.ts sm2.ts finance.ts capture.ts
├── server/      Express 5 + SQLite (better-sqlite3)
│   ├── migrations.ts   ordered schema migrations (50 tables)
│   ├── repo.ts         user-scoped data access (the authorization core)
│   ├── resources.ts    36 resources + their domain rules (recurrence, cycles, upserts…)
│   ├── auth.ts         scrypt passwords, hashed session tokens, lockout, rate limits
│   ├── routes/         account (profile, vision, onboarding, export/import, demo),
│   │                   domain (calendar, focus, flashcards, finance, search, capture…),
│   │                   insight (today, planner, next action, analytics, reviews, audit,
│   │                   notifications), ai (Claude)
│   ├── services.ts analytics.ts audit.ts demo.ts
├── src/         React 19 + Vite client (react-router, TanStack Query, lucide icons)
│   ├── layout/         shell, sidebar/bottom nav, command palette, quick capture, now panel
│   ├── components/     design-system primitives, config-driven forms, charts (SVG), planner
│   └── pages/          one lazily-loaded file per page
└── tests/
```

**Why this stack.** A single deployable process with a file database is the simplest thing that is genuinely production-capable for highly private, single-user-scale data: no external database to run, trivial backups (one file), fast (synchronous SQLite, WAL mode). The data-access layer is centralised in `server/repo.ts`, so moving to Postgres later is a contained change.

### Authorization model (the “row-level security” equivalent)

SQLite has no RLS, so the guarantee is enforced in one place instead of in every endpoint:

- Every user-owned table has `user_id` (FK → `users`, `ON DELETE CASCADE`).
- `repo.ts` builds every query with `user_id = ?` from the authenticated session — handlers never write their own ownership SQL for generic resources.
- Every foreign key a client sends (e.g. `goal_id`, `depends_on`, note links) is checked to belong to the same user before writing, with the same “not found” response whether the row doesn't exist or belongs to someone else (no information leak).
- Hierarchies and dependency graphs reject cycles.
- Import regenerates every id, so an import file can never reference or overwrite another user's rows.
- Tests (`tests/api.test.ts`) assert that one user cannot read, update, delete, link to, or search another user's data.

### Security

- Passwords: scrypt (N=16384) with per-user salt; timing-equalised login for unknown emails; lockout after 8 failures; per-IP and per-email rate limits.
- Sessions: 256-bit random tokens in `HttpOnly; SameSite=Lax` cookies (`Secure` in production); only SHA-256 hashes stored; sliding 30-day expiry; “sign out other devices”; password change revokes other sessions.
- CSRF: SameSite cookies + JSON-only bodies + Origin check on state-changing requests.
- Headers: strict CSP (`script-src 'self'`, no third-party origins at all — fonts are self-hosted), HSTS, `X-Frame-Options: DENY`, `nosniff`, restrictive Permissions-Policy.
- Validation: every write passes a zod schema; errors return per-field messages. Markdown is rendered with `marked` and sanitised with DOMPurify.
- Secrets: only via environment variables (`.env` is git-ignored). The AI key never reaches the browser.
- Account deletion cascades through every table.

## Key design decisions (where I deviated from the brief, and why)

1. **“What should I do now?” and the daily planner are deterministic, not AI.** They combine priority, deadlines, focus goals and their pace, calendar gaps, energy, habits, and flashcards with transparent scoring — and every recommendation shows its reasons. This is instant, works without an API key or network, is testable, and doesn't pretend to know you better than you do. AI is layered on top for open-ended help.
2. **Realistic capacity.** Plans assume ~70% of free time is usable for focused work; anything that doesn't fit is listed explicitly as *won't fit today* with defer options, and at most three MITs are allowed.
3. **Fewer, deeper concepts instead of one table per bullet point:**
   - *Study sessions* are focus sessions linked to a subject/topic (one timer, one history).
   - *Courses* and *subjects* are one entity with a kind; *exams & assignments* are assessments.
   - *Career skills* and *personal-development areas* share the skill model (levels, prerequisites, evidence).
   - *Certifications, portfolio, practice sessions, achievements* are skill evidence. *Target roles* are goals; *networking contacts* are people.
   - *Reminders* are dated tasks; *ideas* are notes; health and mental check-ins share one daily check-in.
4. **Anti all-or-nothing habits.** The minimum version keeps a streak alive; intentional skips are neutral; today never breaks a streak until it's over.
5. **No single “productivity score”.** Snapshot, reviews and analytics show separate dimensions, and every analytics card states the decision it supports. Pattern insights require ≥5 days on each side and are phrased as correlations.
6. **Life Audit works without AI.** Findings are rule-based and every item is tagged **You said** / **Your data** / **Interpretation**. The optional AI write-up follows the same labelling.
7. **Notifications are generated, deduplicated and capped** (default 8/day, per-kind toggles) — shown in-app, and optionally as browser notifications while the app is open.

## AI assistant

Set `ANTHROPIC_API_KEY` (and optionally `AI_MODEL`, default `claude-opus-5`). Features: chat, goal breakdown into editable draft milestones/tasks/habits (nothing is saved until you accept), audit interpretation, quick insights (plan the rest of the day, bottleneck, conflicting goals, weekly-review prep, journal summary). The server uses the official Anthropic SDK with adaptive thinking and server-side refusal fallbacks.

Privacy: the assistant receives a compact summary (goals, open tasks, habit stats, 14-day aggregates). Journal text is **only** included if you opt in under Settings → AI. The Assistant page has a **“What the AI sees”** preview showing the exact text sent. The system prompt forbids medical, therapeutic and financial directives, shaming, and false certainty.

## Accessibility & responsive design

Semantic landmarks, skip link, labelled controls, visible focus rings, `role`/`aria-*` on custom controls (checkboxes, segmented controls, tabs, timers), modals with focus trap/restore and an inert background, keyboard alternatives to drag-and-drop (arrow keys on the task board), reduced-motion support (system or per-user), light/dark themes, charts with text labels and tooltips (never colour alone). Mobile has its own layout: bottom navigation with a central **Now** button, a “More” sheet, a capture button, bottom-sheet dialogs and a day view for the calendar.

Keyboard: `⌘/Ctrl K` command palette and global search · `C` quick capture · `W` what should I do now · `/` search · `1–4` grade flashcards.

## Not implemented / known limitations

Being explicit, per the brief:

- **Email verification and password reset by email** — there is no email service. Password change (while signed in) and session revocation are implemented.
- **Push notifications when the app is closed / native mobile apps** — only in-app and in-tab browser notifications.
- **Blocking distracting apps or sites** — a web app can't do this; the Focus page offers environment guidance and the distraction log instead.
- **External calendar sync** (Google/Outlook/ICS); editing a single occurrence of a recurring event (edits apply to the series); touch drag-and-drop on the calendar (use the event dialog on phones).
- **File attachments** in notes (links and Markdown only). **Automatic screen-time import** (entered manually in the check-in).
- **Offline writes** — cached data stays readable and the app shows an offline banner, but changes need a connection.
- Import *adds* data (it never overwrites), so importing the same file twice duplicates it.
- Rate limits are in-memory (fine for one instance; use a shared store if you scale out). Money is stored as decimals rounded to 2 places; one currency per user.
- AI replies are not streamed.
