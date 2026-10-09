import Link from "next/link";
import { Notice, PageHeader, Section } from "@/components/ui";
import { COACH_DISCLOSURE } from "@/lib/coach/context";
import { COACH_MODES, type CoachResult } from "@/lib/coach/run";
import { aiConfigured } from "@/lib/env";
import { formatTimestamp } from "@/lib/dates";
import { getContext } from "@/lib/server/context";
import { CoachPanel, ConsentSwitch, Preview } from "./client";

export const metadata = { title: "AI Coach" };

export default async function CoachPage() {
  const { supabase, today, settings, profile } = await getContext();
  const { data: runs } = await supabase.from("coach_runs").select("id,mode,response,created_at").order("created_at", { ascending: false }).limit(8);
  const configured = aiConfigured();
  const modes = Object.entries(COACH_MODES).map(([key, m]) => ({ key, label: m.label, blurb: m.blurb }));

  return (
    <>
      <PageHeader title="AI Coach" subtitle="Optional advice based on what you've actually recorded." />
      {!configured && (
        <Notice tone="warn" className="mb-5">
          <b>The coach is switched off on this server.</b> No AI provider key is configured, so nothing here can run. The rest of Level Up works normally: your <Link className="text-accent" href="/">Next Best Action</Link> and <Link className="text-accent" href="/stats">Stats insights</Link> need no AI. To enable the coach, the owner sets <code className="rounded bg-raised px-1">ANTHROPIC_API_KEY</code> on the server.
        </Notice>
      )}
      <Section title="What gets sent, and what doesn't" hint="You're always in control: nothing is sent until you turn the coach on and press a button." >
        <div className="card p-4" id="data">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-good">Sent to the AI provider</div><ul className="list-disc space-y-1 pl-4 text-sm text-muted">{COACH_DISCLOSURE.sent.map((s) => <li key={s}>{s}</li>)}</ul></div>
            <div><div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-bad">Never sent</div><ul className="list-disc space-y-1 pl-4 text-sm text-muted">{COACH_DISCLOSURE.never.map((s) => <li key={s}>{s}</li>)}</ul></div>
          </div>
          <p className="mt-3 text-xs text-muted">The provider is called from the server, so the key is never in your browser. Requests go to Anthropic's API. Each answer is saved in your account so you can re-read it.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3"><ConsentSwitch consent={settings.ai_consent} /><Preview /></div>
        </div>
      </Section>
      <CoachPanel today={today} enabled={configured && settings.ai_consent} reason={!configured ? "not_configured" : !settings.ai_consent ? "no_consent" : null} modes={modes} />
      {(runs ?? []).length > 0 && (
        <Section title="Earlier answers" className="mt-6">
          <ul className="space-y-1.5">
            {(runs ?? []).map((r) => {
              const res = r.response as CoachResult | null;
              return (
                <li key={r.id}><details className="card-inset px-3.5 py-2.5"><summary className="cursor-pointer text-sm"><span className="font-medium">{res?.headline ?? "Answer"}</span> <span className="text-xs text-muted">· {COACH_MODES[r.mode as keyof typeof COACH_MODES]?.label ?? r.mode} · {formatTimestamp(r.created_at, profile.timezone)}</span></summary>
                  {res && <div className="mt-2 space-y-2 text-sm text-muted"><p>{res.summary}</p>{res.actions?.length > 0 && <ul className="list-disc pl-4">{res.actions.map((a, i) => <li key={i}>{a.title}</li>)}</ul>}</div>}
                </details></li>
              );
            })}
          </ul>
        </Section>
      )}
    </>
  );
}
