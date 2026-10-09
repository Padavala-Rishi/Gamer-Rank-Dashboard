import Anthropic from "@anthropic-ai/sdk";
import { getContext } from "@/lib/data/context";
import { CoachError, COACH_MODE_KEYS, coachRateVerdict, DEFAULT_MODEL, runCoach, type CoachClient, type CoachMode, type CoachResult } from "./run";
import { loadCoachContext } from "./load";

// The optional coach, run from the browser with the person's OWN Anthropic API key.
// The key lives only in this browser's localStorage and goes only to api.anthropic.com. There is no server.

const KEY = "lu:anthropic-key";

export function getApiKey(): string | null {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}
export function saveApiKey(key: string): void {
  const k = key.trim();
  if (!/^sk-ant-[\w-]{20,}$/.test(k)) throw new Error("That doesn't look like an Anthropic API key (it starts with sk-ant-).");
  try { localStorage.setItem(KEY, k); } catch { throw new Error("This browser won't let the app store the key."); }
}
export function clearApiKey(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing stored */ }
}

export type CoachOutcome = { ok: true; result: CoachResult } | { ok: false; error: string };

/** Exactly what would be sent to the provider. Never makes a network request. */
export async function previewCoachContext() {
  const { supabase, profile, settings } = await getContext();
  return loadCoachContext(supabase, profile, settings);
}

export async function askCoach(mode: CoachMode, input?: string, makeClient: (key: string) => CoachClient = defaultClient): Promise<CoachOutcome> {
  if (!COACH_MODE_KEYS.includes(mode)) return { ok: false, error: "Unknown request." };
  const text = input?.trim().slice(0, 400) || undefined;
  if (mode === "breakdown" && !text) return { ok: false, error: "Describe the goal you want broken down." };

  const { supabase, profile, settings } = await getContext();
  const key = getApiKey();
  if (!key) return { ok: false, error: "Add your Anthropic API key in Settings first." };
  if (!settings.ai_consent) return { ok: false, error: "Turn on the AI coach in Settings first. You choose what's shared." };

  const since = (ms: number) => new Date(Date.now() - ms).toISOString();
  const [h, d] = await Promise.all([
    supabase.from("coach_runs").select("id", { count: "exact", head: true }).gte("created_at", since(3600_000)),
    supabase.from("coach_runs").select("id", { count: "exact", head: true }).gte("created_at", since(86_400_000)),
  ]);
  const verdict = coachRateVerdict(h.count ?? 0, d.count ?? 0);
  if (!verdict.ok) return { ok: false, error: verdict.message };

  try {
    const context = await loadCoachContext(supabase, profile, settings);
    const result = await runCoach(makeClient(key), mode, context, text, DEFAULT_MODEL);
    await supabase.from("coach_runs").insert({ mode, response: result });
    return { ok: true, result };
  } catch (e) {
    if (e instanceof CoachError) return { ok: false, error: e.message };
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return { ok: false, error: "Anthropic rejected your API key. Check it in Settings." };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "The AI provider is busy. Try again in a minute." };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, error: "Couldn't reach the AI provider. Are you online?" };
    return { ok: false, error: "The coach couldn't answer. Try again." };
  }
}

function defaultClient(apiKey: string): CoachClient {
  // dangerouslyAllowBrowser: the key is the person's own, kept on their own device, sent only to Anthropic.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 55_000 }) as unknown as CoachClient;
}
