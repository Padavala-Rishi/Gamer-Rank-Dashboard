import type { DB } from "./db";
import { newId, nowIso } from "./db";
import { profileSchema, profilePatchSchema, type Profile } from "../shared/schemas";
import { DEFAULT_LIFE_AREAS, DEFAULT_WIDGETS } from "../shared/constants";
import { isValidTimeZone } from "../shared/dates";

export function defaultProfile(timezone?: string): Profile {
  return {
    display_name: null,
    timezone: timezone && isValidTimeZone(timezone) ? timezone : "UTC",
    week_start: 1,
    currency: "INR",
    units: "metric",
    theme: "system",
    accent: "#2f6f5e",
    density: "comfortable",
    reduced_motion: "system",
    day_start: "07:00",
    day_end: "22:00",
    default_focus_min: 25,
    pomodoro_break_min: 5,
    dashboard_widgets: [...DEFAULT_WIDGETS],
    hidden_nav: [],
    notification_prefs: {
      enabled: true,
      kinds: {},
      quiet_start: "22:00",
      quiet_end: "07:00",
      max_per_day: 8,
      browser: false,
    },
    ai_enabled: true,
    ai_include_journal: false,
    habit_show_paused: false,
    onboarded: false,
  };
}

export function getProfile(db: DB, userId: string): Profile {
  const row = db.prepare("SELECT data FROM profiles WHERE user_id = ?").get(userId) as { data: string } | undefined;
  const base = defaultProfile();
  if (!row) return base;
  // Merge with defaults so profiles written by older versions gain new settings.
  const stored = JSON.parse(row.data) as Partial<Profile>;
  const merged = { ...base, ...stored, notification_prefs: { ...base.notification_prefs, ...(stored.notification_prefs ?? {}) } };
  const parsed = profileSchema.safeParse(merged);
  return parsed.success ? parsed.data : base;
}

export function saveProfile(db: DB, userId: string, profile: Profile): void {
  db.prepare(
    "INSERT INTO profiles (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
  ).run(userId, JSON.stringify(profile), nowIso());
}

export function patchProfile(db: DB, userId: string, patch: unknown): Profile {
  const p = profilePatchSchema.parse(patch);
  const current = getProfile(db, userId);
  const next = profileSchema.parse({
    ...current,
    ...p,
    notification_prefs: { ...current.notification_prefs, ...(p.notification_prefs ?? {}) },
  });
  saveProfile(db, userId, next);
  return next;
}

/** Everything a brand-new account gets: a profile and the default life areas. */
export function initializeUser(db: DB, userId: string, timezone?: string): void {
  saveProfile(db, userId, defaultProfile(timezone));
  const now = nowIso();
  const insert = db.prepare(
    "INSERT INTO life_areas (id, user_id, is_demo, created_at, updated_at, name, description, color, icon, focus, sort_order, archived) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, 'maintain', ?, 0)",
  );
  DEFAULT_LIFE_AREAS.forEach((a, i) => insert.run(newId(), userId, now, now, a.name, a.description, a.color, a.icon, i));
}
