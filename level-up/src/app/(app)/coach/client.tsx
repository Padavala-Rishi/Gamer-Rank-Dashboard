"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createTask } from "@/app/actions/tasks";
import { saveSettings } from "@/app/actions/profile";
import { Icon } from "@/components/icon";
import { Notice } from "@/components/ui";
import { useUI } from "@/components/ui-context";
import { CATEGORIES, DIFFICULTY_LABEL, type AnyCategory, type Difficulty } from "@/lib/constants";
import { addDays } from "@/lib/dates";
import type { CoachResult } from "@/lib/coach/run";

type Mode = { key: string; label: string; blurb: string };

export function CoachPanel({ today, enabled, reason, modes }: { today: string; enabled: boolean; reason: "not_configured" | "no_consent" | null; modes: Mode[] }) {
  const { toast } = useUI();
  const [mode, setMode] = useState(modes[0].key);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<(CoachResult & { mode: string }) | null>(null);
  const [added, setAdded] = useState<Record<number, boolean>>({});
  const [pending, start] = useTransition();
  const needsInput = mode === "breakdown";

  const ask = async () => {
    setBusy(true); setErr(null); setResult(null); setAdded({});
    try {
      const res = await fetch("/api/coach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, input: input.trim() || undefined }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body.message ?? "The coach couldn't answer."); return; }
      setResult({ ...body.result, mode });
    } catch { setErr("Couldn't reach the server."); } finally { setBusy(false); }
  };

  const add = (i: number) => {
    const a = result!.actions[i];
    const date = a.when === "today" ? today : a.when === "tomorrow" ? addDays(today, 1) : a.when === "this_week" ? addDays(today, 2) : null;
    start(async () => {
      const r = await createTask({ title: a.title, category: a.category, difficulty: a.difficulty, est_minutes: a.est_minutes, scheduled_date: date, quest_type: a.difficulty === "boss" ? "boss" : "daily", priority: 2 });
      if (!r.ok) { toast(r.error, "bad"); return; }
      setAdded((s) => ({ ...s, [i]: true })); toast("Added to your quests", "good");
    });
  };

  return (
    <section aria-label="Ask the coach">
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="What do you want help with?">
        {modes.map((m) => (
          <button key={m.key} role="radio" aria-checked={mode === m.key} className="card-inset p-3 text-left transition-colors" style={mode === m.key ? { borderColor: "var(--accent)" } : undefined} onClick={() => setMode(m.key)} data-testid={`mode-${m.key}`}>
            <div className="text-sm font-semibold">{m.label}</div><div className="mt-0.5 text-xs text-muted">{m.blurb}</div>
          </button>
        ))}
      </div>
      {needsInput && (
        <div className="mb-3"><label className="label" htmlFor="coach-in">Your goal</label><input id="coach-in" className="input" maxLength={400} value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Build and deploy a habit-tracker API by the end of the month" /></div>
      )}
      {!needsInput && <div className="mb-3"><label className="label" htmlFor="coach-note">Anything the coach should know? <span className="font-normal text-faint">(optional)</span></label><input id="coach-note" className="input" maxLength={400} value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. I have little energy today" /></div>}
      <button className="btn btn-primary" onClick={ask} disabled={!enabled || busy || (needsInput && !input.trim())} data-testid="coach-ask">
        <Icon name="bot" size={16} />{busy ? "Thinking…" : "Ask the coach"}
      </button>
      {reason === "not_configured" && <p className="mt-2 text-sm text-muted">Unavailable: no AI key is configured on the server.</p>}
      {reason === "no_consent" && <p className="mt-2 text-sm text-muted">Turn on the coach above to use it.</p>}
      {err && <Notice tone="warn" className="mt-4">{err}</Notice>}

      {result && (
        <div className="card mt-5 p-4 sm:p-5" aria-live="polite" data-testid="coach-result">
          <h2 className="text-lg font-semibold">{result.headline}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{result.summary}</p>
          {result.insights.length > 0 && (
            <ul className="mt-4 space-y-2">{result.insights.map((i, k) => <li key={k} className="card-inset px-3 py-2.5 text-sm"><div>{i.text}</div><div className="mt-0.5 text-xs text-faint">Based on: {i.evidence}</div></li>)}</ul>
          )}
          {result.actions.length > 0 && (
            <div className="mt-4"><div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-faint">Suggested quests</div>
              <ul className="space-y-2">
                {result.actions.map((a, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
                    <div className="min-w-0"><div className="text-sm font-medium">{a.title}</div><div className="text-xs text-muted">{CATEGORIES[a.category as AnyCategory].short} · {DIFFICULTY_LABEL[a.difficulty as Difficulty]}{a.est_minutes ? ` · ${a.est_minutes} min` : ""} · {a.when.replace("_", " ")}</div><div className="mt-0.5 text-xs text-faint">{a.why}</div></div>
                    <button className="btn btn-sm shrink-0" disabled={pending || added[i]} onClick={() => add(i)}>{added[i] ? "Added" : "Add quest"}</button>
                  </li>
                ))}
              </ul>
              <p className="hint">Suggestions only. Nothing is added until you press the button, and the planner still keeps your day realistic.</p>
            </div>
          )}
          {result.caution && <Notice className="mt-4">{result.caution}</Notice>}
        </div>
      )}
    </section>
  );
}

export function ConsentSwitch({ consent }: { consent: boolean }) {
  const { toast } = useUI();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={consent} disabled={pending} data-testid="coach-consent"
        onChange={(e) => start(async () => { const r = await saveSettings({ ai_consent: e.target.checked }); if (!r.ok) toast(r.error, "bad"); else { toast(e.target.checked ? "Coach enabled. Data is sent only when you ask." : "Coach disabled", "info"); router.refresh(); } })} />
      I agree to share the data above with the AI provider when I ask the coach
    </label>
  );
}

export function Preview() {
  const [data, setData] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="w-full">
      <button className="btn btn-sm" disabled={busy} onClick={async () => { setBusy(true); try { const r = await fetch("/api/coach?preview=1"); const b = await r.json(); setData(JSON.stringify(b.context ?? b, null, 2)); } finally { setBusy(false); } }}>
        <Icon name="search" size={14} />Show exactly what would be sent
      </button>
      {data && <pre className="card-inset mt-3 max-h-80 overflow-auto p-3 text-xs" data-testid="coach-preview">{data}</pre>}
    </div>
  );
}
