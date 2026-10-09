import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CoachError, COACH_MODE_KEYS, coachRateVerdict, DEFAULT_MODEL, runCoach, type CoachClient } from "@/lib/coach/run";
import { loadCoachContext } from "@/lib/coach/load";
import { aiConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Settings } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ mode: z.enum(COACH_MODE_KEYS), input: z.string().trim().max(400).optional() });
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

async function session() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const [p, s] = await Promise.all([supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle(), supabase.from("user_settings").select("*").eq("user_id", data.user.id).maybeSingle()]);
  if (!p.data || !s.data) return null;
  return { supabase, profile: p.data as Profile, settings: s.data as Settings };
}

/** GET ?preview=1 returns exactly what the coach would be sent. It never contacts the AI provider. */
export async function GET(req: NextRequest) {
  const s = await session();
  if (!s) return json({ error: "Not signed in" }, 401);
  if (req.nextUrl.searchParams.get("preview") !== "1") return json({ error: "Bad request" }, 400);
  return json({ context: await loadCoachContext(s.supabase, s.profile, s.settings) });
}

export async function POST(req: NextRequest) {
  // Same-origin only. Cookies are SameSite=Lax; this is a second, explicit guard.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return json({ error: "Cross-origin request refused" }, 403);
  if (!req.headers.get("content-type")?.includes("application/json")) return json({ error: "Expected JSON" }, 415);

  const s = await session();
  if (!s) return json({ error: "Not signed in" }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request" }, 400);
  const { mode, input } = parsed.data;
  if (mode === "breakdown" && !input) return json({ error: "Describe the goal you want broken down." }, 400);

  if (!aiConfigured()) return json({ error: "not_configured", message: "The AI coach isn't set up on this server (no ANTHROPIC_API_KEY)." }, 501);
  if (!s.settings.ai_consent) return json({ error: "consent_required", message: "Turn on the AI coach in Settings first. You choose what's shared." }, 403);

  const now = Date.now();
  const since = (ms: number) => new Date(now - ms).toISOString();
  const [h, d] = await Promise.all([
    s.supabase.from("coach_runs").select("id", { count: "exact", head: true }).gte("created_at", since(3600_000)),
    s.supabase.from("coach_runs").select("id", { count: "exact", head: true }).gte("created_at", since(86_400_000)),
  ]);
  const verdict = coachRateVerdict(h.count ?? 0, d.count ?? 0);
  if (!verdict.ok) return json({ error: "rate_limited", message: verdict.message }, 429);

  try {
    const context = await loadCoachContext(s.supabase, s.profile, s.settings);
    const client = new Anthropic({ maxRetries: 1, timeout: 55_000 });
    const result = await runCoach(client as unknown as CoachClient, mode, context, input, process.env.ANTHROPIC_MODEL || DEFAULT_MODEL);
    await s.supabase.from("coach_runs").insert({ mode, response: result });
    return json({ result });
  } catch (e) {
    if (e instanceof CoachError) return json({ error: e.kind, message: e.message }, e.kind === "refused" ? 422 : 502);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "busy", message: "The AI provider is busy. Try again in a minute." }, 503);
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) { console.error("[coach] provider rejected the API key"); return json({ error: "provider_auth", message: "The server's AI key was rejected. Tell the owner of this deployment." }, 502); }
    if (e instanceof Anthropic.APIConnectionError) return json({ error: "unreachable", message: "Couldn't reach the AI provider." }, 503);
    console.error("[coach] unexpected error", e instanceof Error ? e.message : e);
    return json({ error: "failed", message: "The coach couldn't answer. Try again." }, 502);
  }
}
