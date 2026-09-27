import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Dumbbell, GraduationCap, HeartHandshake, Leaf, Repeat, Target, TimerReset, Users, Zap } from "lucide-react";
import { useApi, useMutate, useToday } from "../lib/hooks";
import { qs } from "../lib/api";
import { fmtDate, fmtMin } from "../lib/format";
import { addDays } from "../../shared/dates";
import { Button, ErrorState, Modal, Seg, Skeleton } from "./ui";
import type { PlanSuggestion, ScoredTask, GoalView } from "../lib/types";
import { PaceBadge } from "./entities";

interface PlanResponse {
  date: string;
  energy: string | null;
  capacity: { windowMin: number; busyMin: number; freeMin: number; usableMin: number };
  plan: {
    mits: ScoredTask[];
    fits: ScoredTask[];
    overflow: ScoredTask[];
    committedMin: number;
    usableMin: number;
    overloaded: boolean;
    warnings: string[];
    suggestions: PlanSuggestion[];
  };
  blocks: { task_id: string; title: string; start: string; end: string }[];
  events: { title: string; start_at: string; end_at: string; all_day: boolean; kind: string }[];
}

const SUGG_ICON: Record<string, typeof Zap> = {
  deep_work: Target,
  study: GraduationCap,
  exercise: Dumbbell,
  admin: TimerReset,
  relationships: Users,
  development: Repeat,
  recovery: Leaf,
  free_time: HeartHandshake,
};

export function PlannerModal({ open, onClose, initialDate }: { open: boolean; onClose: () => void; initialDate?: "today" | "tomorrow" }) {
  return (
    <Modal open={open} onClose={onClose} title="Plan your day" wide>
      {open && <Planner onClose={onClose} initialDate={initialDate} />}
    </Modal>
  );
}

function Planner({ onClose, initialDate = "today" }: { onClose: () => void; initialDate?: "today" | "tomorrow" }) {
  const today = useToday();
  const [which, setWhich] = useState<"today" | "tomorrow">(initialDate);
  const date = which === "today" ? today : addDays(today, 1);
  const [energy, setEnergy] = useState("");
  const q = useApi<PlanResponse>(`/plan${qs({ date, energy })}`);
  const goals = useApi<GoalView[]>("/goals/overview");
  const mut = useMutate();
  const [mits, setMits] = useState<string[]>([]);
  const [also, setAlso] = useState<string[]>([]);
  const [defer, setDefer] = useState<Record<string, string | null>>({});
  const [addBlocks, setAddBlocks] = useState(true);

  useEffect(() => {
    if (!q.data) return;
    setMits(q.data.plan.mits.map((m) => m.task.id));
    setAlso(q.data.plan.fits.map((m) => m.task.id));
    setDefer({});
  }, [q.data]);

  const all = useMemo(() => (q.data ? [...q.data.plan.mits, ...q.data.plan.fits, ...q.data.plan.overflow] : []), [q.data]);
  const est = (ids: string[]) => all.filter((r) => ids.includes(r.task.id)).reduce((s, r) => s + r.estimate, 0);
  const committed = est([...mits, ...also]);
  const usable = q.data?.capacity.usableMin ?? 0;
  const over = committed > usable;

  const toggle = (list: string[], set: (v: string[]) => void, id: string, limit?: number) => {
    if (list.includes(id)) set(list.filter((x) => x !== id));
    else if (!limit || list.length < limit) set([...list, id]);
  };

  const commit = async () => {
    if (!q.data) return;
    const blocks = addBlocks ? q.data.blocks.filter((b) => mits.includes(b.task_id)) : [];
    try {
      await mut.call(
        "/plan/commit",
        {
          date,
          mit_ids: mits,
          scheduled_ids: also.filter((id) => !mits.includes(id)),
          defer: Object.entries(defer)
            .filter(([, d]) => d !== undefined)
            .map(([id, d]) => ({ id, date: d })),
          blocks,
        },
        "POST",
        { success: which === "today" ? "Today is planned" : "Tomorrow is planned" },
      );
      onClose();
    } catch {
      /* toast shown */
    }
  };

  const focusGoals = (goals.data ?? []).filter((g) => g.is_focus && g.status === "active");

  return (
    <div className="col gap-16">
      <div className="row wrap between">
        <Seg label="Which day" value={which} onChange={setWhich} options={[["today", "Today"], ["tomorrow", "Tomorrow"]]} />
        <Seg
          label="Energy"
          value={energy}
          onChange={setEnergy}
          options={[
            ["", "Energy: from check-in"],
            ["low", "Low"],
            ["medium", "Medium"],
            ["high", "High"],
          ]}
        />
      </div>
      {q.isLoading ? (
        <Skeleton lines={8} />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : q.data ? (
        <>
          <section>
            <div className="section-title" style={{ marginTop: 0 }}>1 · Your direction</div>
            {focusGoals.length ? (
              <div className="col gap-4">
                {focusGoals.map((g) => (
                  <div key={g.id} className="row between small">
                    <span className="row gap-4">
                      <Target size={13} aria-hidden /> {g.title}
                    </span>
                    <PaceBadge pace={g.pace} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="small muted">No focus goals yet. Marking 1–3 goals as focus helps the planner prioritise.</p>
            )}
          </section>

          <section>
            <div className="section-title">2 · Time available {which === "today" ? "(from now)" : ""}</div>
            <div className="stats-row">
              <div className="stat">
                <span className="stat-label">Scheduled</span>
                <span className="stat-value">{fmtMin(q.data.capacity.busyMin)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Free</span>
                <span className="stat-value">{fmtMin(q.data.capacity.freeMin)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Realistic focus time</span>
                <span className="stat-value">{fmtMin(usable)}</span>
              </div>
              <div className="stat">
                <span className="stat-label">You've selected</span>
                <span className="stat-value" style={{ color: over ? "var(--bad)" : undefined }}>
                  {fmtMin(committed)}
                </span>
              </div>
            </div>
            <p className="tiny muted mt-8">Realistic focus time is ~70% of free time — the rest absorbs meals, transitions, and the unexpected.</p>
            {over && (
              <div className="form-error mt-8 row" role="alert">
                <AlertTriangle size={16} aria-hidden /> This is about {fmtMin(committed - usable)} more than you can realistically do. Remove something or defer it — an honest plan beats a heroic one.
              </div>
            )}
            {q.data.plan.warnings.map((w, i) => (
              <div key={i} className="badge warn mt-8" style={{ height: "auto", padding: "6px 10px", whiteSpace: "normal", lineHeight: 1.4 }}>
                {w}
              </div>
            ))}
          </section>

          <section>
            <div className="section-title">3 · Most important (pick up to 3)</div>
            {all.length === 0 && <p className="small muted">No open tasks. Capture what matters, or enjoy a lighter day.</p>}
            <div className="list">
              {all.map((r) => (
                <PlanRow key={r.task.id} r={r} today={today} checked={mits.includes(r.task.id)} onToggle={() => toggle(mits, setMits, r.task.id, 3)} disabled={!mits.includes(r.task.id) && mits.length >= 3} mode="mit" />
              ))}
            </div>
          </section>

          <section>
            <div className="section-title">4 · Also on the plan</div>
            <div className="list">
              {all
                .filter((r) => !mits.includes(r.task.id))
                .map((r) => (
                  <PlanRow key={r.task.id} r={r} today={today} checked={also.includes(r.task.id)} onToggle={() => toggle(also, setAlso, r.task.id)} mode="also" defer={defer[r.task.id]} onDefer={(d) => setDefer((s) => ({ ...s, [r.task.id]: d }))} tomorrow={addDays(date, 1)} />
                ))}
            </div>
          </section>

          <section>
            <div className="section-title">5 · A balanced day</div>
            <div className="grid grid-2" style={{ gap: 8 }}>
              {q.data.plan.suggestions.map((s, i) => {
                const Icon = SUGG_ICON[s.category] ?? Zap;
                return (
                  <div key={i} className="card flat card-pad" style={{ padding: "10px 12px" }}>
                    <div className="row between">
                      <span className="row strong">
                        <Icon size={14} aria-hidden /> {s.title}
                      </span>
                      {s.minutes ? <span className="small muted">{fmtMin(s.minutes)}</span> : null}
                    </div>
                    <p className="small muted mt-4">{s.detail}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {q.data.blocks.some((b) => mits.includes(b.task_id)) && (
            <section>
              <div className="section-title">6 · Time blocks</div>
              <label className="check small">
                <input type="checkbox" checked={addBlocks} onChange={(e) => setAddBlocks(e.target.checked)} />
                <CalendarClock size={14} aria-hidden /> Add focus blocks for my most important tasks to the calendar
              </label>
              {addBlocks && (
                <div className="col gap-4 mt-8 small">
                  {q.data.blocks
                    .filter((b) => mits.includes(b.task_id))
                    .map((b, i) => (
                      <div key={i} className="row">
                        <span className="num strong" style={{ width: 96 }}>
                          {b.start}–{b.end}
                        </span>
                        <span className="ellipsis">{b.title}</span>
                      </div>
                    ))}
                </div>
              )}
            </section>
          )}

          <div className="row between wrap">
            <span className="small muted">You can change any of this later.</span>
            <div className="row">
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={commit} loading={mut.pending}>
                Commit plan
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function PlanRow({
  r,
  today,
  checked,
  onToggle,
  disabled,
  mode,
  defer,
  onDefer,
  tomorrow,
}: {
  r: ScoredTask;
  today: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  mode: "mit" | "also";
  defer?: string | null;
  onDefer?: (d: string | null) => void;
  tomorrow?: string;
}) {
  return (
    <div className="item">
      <label className="check grow" style={{ alignItems: "flex-start", fontWeight: 400 }}>
        <input type="checkbox" checked={checked} onChange={onToggle} disabled={disabled} style={{ marginTop: 2 }} />
        <span className="grow">
          <span className="item-title">{r.task.title}</span>
          <span className="meta">
            <span>{fmtMin(r.estimate)}</span>
            {r.task.due_date && <span className={r.task.due_date < today ? "overdue" : r.task.due_date === today ? "today" : ""}>due {fmtDate(r.task.due_date, today)}</span>}
            {r.reasons.slice(0, 2).map((x, i) => (
              <span key={i}>{x}</span>
            ))}
          </span>
        </span>
      </label>
      {mode === "also" && !checked && onDefer && (
        <select className="select" style={{ width: "auto", minHeight: 28, padding: "2px 6px", fontSize: 12 }} value={defer === undefined ? "" : (defer ?? "none")} onChange={(e) => onDefer(e.target.value === "" ? (undefined as never) : e.target.value === "none" ? null : e.target.value)} aria-label={`When to do “${r.task.title}”`}>
          <option value="">Leave as is</option>
          <option value={tomorrow}>Move to tomorrow</option>
          <option value={addDays(tomorrow!, 6)}>Next week</option>
          <option value="none">Unschedule</option>
        </select>
      )}
    </div>
  );
}
