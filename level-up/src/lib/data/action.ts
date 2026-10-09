import { ZodError } from "zod";
import { notifyChange } from "@/db/events";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string; fields?: Record<string, string>; meta?: Record<string, unknown> };

/** Plain-language messages for the errors the database raises deliberately. */
const SQLSTATE_MESSAGES: Record<string, string> = {
  LV001: "", // message comes from the database (it says what to log first)
  LV002: "", LV003: "", LV004: "", LV005: "", LV006: "",
  "23505": "That already exists.",
  "23503": "That refers to something that no longer exists.",
  "23514": "One of the values is outside the allowed range.",
  "42501": "That isn't allowed.",
  P0002: "Not found.",
  "22023": "That value isn't valid.",
};

type PgErr = { message?: string; code?: string; details?: string | null; hint?: string | null; meta?: Record<string, unknown> };

export function friendlyError(e: unknown): { error: string; fields?: Record<string, string>; meta?: Record<string, unknown> } {
  if (e instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of e.issues) {
      const key = issue.path.join(".") || "_";
      if (!fields[key]) fields[key] = issue.message;
    }
    return { error: Object.values(fields)[0] ?? "Please check the form.", fields };
  }
  const err = e as PgErr;
  if (err && typeof err === "object" && "code" in err && err.code) {
    const known = SQLSTATE_MESSAGES[err.code];
    if (known === "" && err.message) return { error: err.message, meta: err.meta };
    if (known) return { error: known };
    if (err.message?.includes("row-level security")) return { error: "That isn't allowed." };
  }
  console.error("[action]", e);
  return { error: "Something went wrong. Please try again." };
}

/**
 * Wrap an action body so every failure becomes a typed, user-readable result (never a stack trace).
 * A successful action tells every mounted page to re-read its data.
 */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    notifyChange();
    return { ok: true, data };
  } catch (e) {
    notifyChange(); // a failed multi-step action may still have changed something
    return { ok: false, ...friendlyError(e) };
  }
}

/** Throw a PostgREST error object as an Error that friendlyError understands. */
export function check<T>(res: { data: T; error: PgErr | null }): T {
  if (res.error) throw res.error;
  return res.data;
}
