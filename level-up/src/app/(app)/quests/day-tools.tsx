"use client";
import { useState, useTransition } from "react";
import { rescheduleTask, saveDayReview, setMinimumViableDay } from "@/app/actions/tasks";
import { Icon } from "@/components/icon";
import { Sheet } from "@/components/sheet";
import { Field } from "@/components/ui";
import { useUI } from "@/components/ui-context";

export function MvdToggle({ day, on }: { day: string; on: boolean }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  return (
    <button className="chip" aria-pressed={on} disabled={pending} title="A tough day? Keep only the smallest set of quests that still counts."
      onClick={() => start(async () => { const r = await setMinimumViableDay(day, !on); if (!r.ok) toast(r.error, "bad"); else toast(on ? "Back to the full plan" : "Minimum Viable Day on: just the essentials today", "info"); })}>
      <Icon name="shield" size={14} /> Minimum Viable Day
    </button>
  );
}

type Left = { id: string; title: string; overdue: boolean };
type Action = "tomorrow" | "backlog" | "discard" | "keep";

export function ReviewButton({ day, left, doneCount, xpToday, existing }: { day: string; left: Left[]; doneCount: number; xpToday: number; existing: { wins?: string; friction?: string; tomorrow?: string } | null }) {
  const { toast } = useUI();
  const [open, setOpen] = useState(false);
  const [wins, setWins] = useState(existing?.wins ?? "");
  const [friction, setFriction] = useState(existing?.friction ?? "");
  const [tomorrow, setTomorrow] = useState(existing?.tomorrow ?? "");
  const [choice, setChoice] = useState<Record<string, Action>>(() => Object.fromEntries(left.map((l) => [l.id, "tomorrow" as Action])));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () => start(async () => {
    setErr(null);
    const live = Object.fromEntries(Object.entries(choice).filter(([id]) => left.some((l) => l.id === id)));
    const res = await saveDayReview({ day, wins, friction, tomorrow, leftovers: live });
    if (!res.ok) { setErr(res.error); return; }
    const { moved, backlogged, discarded } = res.data;
    toast(`Day saved${moved ? ` · ${moved} moved to tomorrow` : ""}${backlogged ? ` · ${backlogged} to backlog` : ""}${discarded ? ` · ${discarded} discarded` : ""}`, "good");
    setOpen(false);
  });

  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}><Icon name="moon" size={14} />{existing ? "Edit day review" : "End-of-day review"}</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="End-of-day review" footer={<><button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save and close the day"}</button></>}>
        <div className="space-y-4">
          <p className="text-sm text-muted">Today: <b className="text-ink">{doneCount}</b> quest{doneCount === 1 ? "" : "s"} done, <b className="num text-accent">+{xpToday} XP</b>. Anything unfinished simply moves on; there is no penalty.</p>
          {left.length > 0 && (
            <div>
              <div className="label">What happens to the rest?</div>
              <ul className="space-y-2">
                {left.map((l) => (
                  <li key={l.id} className="card-inset flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 text-sm">{l.title}{l.overdue && <span className="ml-1 text-xs text-warn">(carried over)</span>}</span>
                    <select className="select !w-auto !min-h-9" aria-label={`What to do with ${l.title}`} value={choice[l.id] ?? "tomorrow"} onChange={(e) => setChoice((c) => ({ ...c, [l.id]: e.target.value as Action }))}>
                      <option value="tomorrow">Move to tomorrow</option><option value="backlog">Back to backlog</option><option value="discard">Discard</option><option value="keep">Leave as is</option>
                    </select>
                  </li>
                ))}
              </ul>
              <p className="hint">If tomorrow can't realistically fit them, extras go to the backlog instead.</p>
            </div>
          )}
          <Field label="What went well?" htmlFor="rv-wins"><textarea id="rv-wins" className="textarea" rows={2} value={wins} onChange={(e) => setWins(e.target.value)} maxLength={500} /></Field>
          <Field label="What got in the way?" htmlFor="rv-fr"><textarea id="rv-fr" className="textarea" rows={2} value={friction} onChange={(e) => setFriction(e.target.value)} maxLength={500} /></Field>
          <Field label="One focus for tomorrow" htmlFor="rv-to"><input id="rv-to" className="input" value={tomorrow} onChange={(e) => setTomorrow(e.target.value)} maxLength={500} /></Field>
          {err && <p className="err" role="alert">{err}</p>}
        </div>
      </Sheet>
    </>
  );
}

/** Pull a backlog/upcoming quest into a day; the planner refuses if that day is already full. */
export function PullButton({ id, title, day }: { id: string; title: string; day: string }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  return (
    <button className="btn btn-sm" disabled={pending} aria-label={`Add “${title}” to today`}
      onClick={() => start(async () => {
        const res = await rescheduleTask(id, day);
        if (!res.ok) toast(res.error, "bad");
        else if (res.data.warning) toast(res.data.warning, "info");
      })}>
      <Icon name="plus" size={13} /> Today
    </button>
  );
}
