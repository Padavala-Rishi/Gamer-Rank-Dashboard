import Link from "next/link";
import { Notice, PageHeader, Section } from "@/components/ui";
import { COACH_DISCLOSURE } from "@/lib/coach/context";
import { COACH_MODES, type CoachResult } from "@/lib/coach/run";
import { formatTimestamp } from "@/lib/dates";
import { getContext } from "@/lib/data/context";
import { CoachPanel, ConsentSwitch, Preview } from "./client";

export const metadata = { title: "AI Coach" };

export default async function CoachPage() {
  const { supabase, today, settings, profile } = await getContext();
  const { data: runs } = await supabase.from("coach_runs").select("id,mode,response,created_at").order("created_at", { ascending: false }).limit(8);
  const modes = Object.entries(COACH_MODES).map(([key, m]) => ({ key, label: m.label, blurb: m.blurb }));

  return (
    <>
      <PageHeader title="AI Coach" subtitle="Optional advice based on what you've actually recorded." />
      <Section title="What gets sent, and what doesn't" hint="You're always in control: nothing is sent until you turn the coach on and press a button." >
        <div className="card p-4" id="data">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-good">Sent to the AI provider</div><ul className="list-disc space-y-1 pl-4 text-sm text-muted">{COACH_DISCLOSURE.sent.map((s) => <li key={s}>{s}</li>)}</ul></div>
            <div><div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-bad">Never sent</div><ul className="list-disc space-y-1 pl-4 text-sm text-muted">{COACH_DISCLOSURE.never.map((s) => <li key={s}>{s}</li>)}</ul></div>
          </div>
          <p className="mt-3 text-xs text-muted">There is no Level Up server. When you press the button, this device sends the summary straight to Anthropic's API using your own key (saved only on this device, see <Link className="text-accent" href="/settings#ai">Settings</Link>). Each answer is saved here so you can re-read it.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3"><ConsentSwitch consent={settings.ai_consent} /><Preview /></div>
        </div>
      </Section>
      <CoachPanel today={today} consent={settings.ai_consent} modes={modes} />
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
