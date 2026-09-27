import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Pause, Pencil, Play, Plus, Repeat } from "lucide-react";
import { useApi, useDocumentTitle, useMutate, useProfile, useToday } from "../lib/hooks";
import type { HabitView } from "../lib/types";
import { Async, Button, Card, Empty, PageHeader, Seg } from "../components/ui";
import { FormModal } from "../components/ResourceForm";
import { habitFields } from "../lib/fields";
import { HabitDayControl, StreakBadge } from "../components/daily";
import { addDays, eachDay, startOfWeek, weekday } from "../../shared/dates";
import { isScheduled } from "../../shared/habits";
import { HABIT_FREQUENCIES, label } from "../../shared/constants";
import { pct } from "../lib/format";
import { useLookups } from "../components/entities";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function Habits() {
  useDocumentTitle("Habits");
  const [params, setParams] = useSearchParams();
  const q = useApi<HabitView[]>("/habits/overview?days=126");
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [show, setShow] = useState<"active" | "paused">("active");
  const today = useToday();

  useEffect(() => {
    if (params.get("new")) {
      setEditing({});
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const habits = (q.data ?? []).filter((h) => (show === "active" ? !h.paused : h.paused));
  return (
    <div className="page">
      <PageHeader
        title="Habits"
        subtitle="Consistency over intensity. The minimum version counts; skipping on purpose never breaks a streak."
        actions={
          <>
            <Seg label="Show" value={show} onChange={setShow} options={[["active", "Active"], ["paused", "Paused"]]} />
            <Button variant="primary" onClick={() => setEditing({})}>
              <Plus size={16} aria-hidden /> New habit
            </Button>
          </>
        }
      />
      <Async q={q}>
        {() =>
          habits.length === 0 ? (
            <div className="card">
              <Empty icon={<Repeat size={20} />} title={show === "active" ? "No habits yet" : "No paused habits"} action={show === "active" ? <Button variant="primary" onClick={() => setEditing({ frequency: "daily" })}>Create a habit</Button> : undefined}>
                Example: “Study Python” — minimum 10 minutes, target 60. On a bad day, 10 minutes still counts.
              </Empty>
            </div>
          ) : (
            <div className="col gap-16">
              {habits.map((h) => (
                <HabitCard key={h.id} h={h} today={today} onEdit={() => setEditing(h as unknown as Record<string, unknown>)} />
              ))}
            </div>
          )
        }
      </Async>
      <FormModal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? "Edit habit" : "New habit"} resource="habits" fields={habitFields} initial={editing ?? {}} wide deleteConfirm={{ title: "Delete this habit?", body: "Its whole history is deleted too. To stop tracking but keep history, pause or archive it instead." }} footerExtra={editing?.id ? <ArchiveButton id={editing.id as string} onDone={() => setEditing(null)} /> : undefined} />
    </div>
  );
}

function ArchiveButton({ id, onDone }: { id: string; onDone: () => void }) {
  const mut = useMutate();
  return (
    <Button
      onClick={async () => {
        await mut.update("habits", id, { archived: true }, { success: "Habit archived — history kept" }).catch(() => {});
        onDone();
      }}
    >
      Archive
    </Button>
  );
}

function HabitCard({ h, today, onEdit }: { h: HabitView; today: string; onEdit: () => void }) {
  const mut = useMutate();
  const profile = useProfile();
  const lk = useLookups();
  const goal = h.goal_id ? lk.goal.get(h.goal_id) : null;
  const weekStart = profile.data?.week_start ?? 1;
  const last7 = eachDay(addDays(today, -6), today);
  const s = h.stats;
  return (
    <Card>
      <div className="row between top wrap gap-12">
        <div className="col gap-4" style={{ minWidth: 220, flex: "1 1 260px" }}>
          <div className="row wrap">
            <h2>{h.title}</h2>
            <StreakBadge habit={h} />
          </div>
          <div className="meta">
            <span>{h.frequency === "days" ? h.days.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ") : h.frequency === "weekly" ? `${h.times_per_week}× per week` : label(HABIT_FREQUENCIES, h.frequency)}</span>
            {(h.minimum_value != null || h.target_value != null) && (
              <span>
                Minimum {h.minimum_value ?? "—"} · Target {h.target_value ?? "—"} {h.unit ?? ""}
              </span>
            )}
            {h.cue && <span>Cue: {h.cue}</span>}
            {goal && <span>→ {goal.title}</span>}
          </div>
        </div>
        <div className="row">
          <Button size="sm" variant="ghost" onClick={() => mut.update("habits", h.id, { paused: !h.paused }, { success: h.paused ? "Habit resumed" : "Habit paused" })}>
            {h.paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />} {h.paused ? "Resume" : "Pause"}
          </Button>
          <Button size="sm" variant="ghost" icon onClick={onEdit} aria-label={`Edit ${h.title}`}>
            <Pencil size={14} />
          </Button>
        </div>
      </div>

      <div className="row wrap gap-16 mt-12" style={{ alignItems: "flex-start" }}>
        <div className="stats-row" style={{ flex: "1 1 280px" }}>
          <div className="stat">
            <span className="stat-label">Current streak</span>
            <span className="stat-value">
              {s.currentStreak}
              <small>{s.streakUnit}</small>
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Best</span>
            <span className="stat-value">
              {s.bestStreak}
              <small>{s.streakUnit}</small>
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Consistency (30d)</span>
            <span className="stat-value">{pct(s.consistency30)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Full / minimum</span>
            <span className="stat-value">
              {s.done30}
              <small>/ {s.minimum30}</small>
            </span>
          </div>
        </div>
        {h.frequency === "weekly" && s.weekProgress && (
          <div className="badge accent" style={{ height: 26 }}>
            This week: {s.weekProgress.done}/{s.weekProgress.target}
          </div>
        )}
      </div>

      {!h.paused && (
        <div className="mt-16" style={{ overflowX: "auto" }}>
          <div className="row gap-8" style={{ minWidth: 560 }}>
            {last7.map((d) => {
              const scheduled = isScheduled(h as never, d);
              return (
                <div key={d} className="col gap-4" style={{ alignItems: "center", flex: 1 }}>
                  <span className={`tiny ${d === today ? "strong" : "muted"}`}>
                    {DAYS[weekday(d)]} {Number(d.slice(8))}
                  </span>
                  {scheduled ? <HabitDayControl habit={h} date={d} compact /> : <span className="tiny muted" style={{ height: 30, display: "grid", placeItems: "center" }}>rest</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <Heatmap h={h} today={today} weekStart={weekStart} />
    </Card>
  );
}

function Heatmap({ h, today, weekStart }: { h: HabitView; today: string; weekStart: number }) {
  const start = startOfWeek(addDays(today, -17 * 7 + 1), weekStart);
  const days = eachDay(start, today);
  const byDate = new Map(h.logs.map((l) => [l.date, l.status]));
  const created = h.created_at.slice(0, 10);
  const firstLog = h.logs[0]?.date;
  const origin = firstLog && firstLog < created ? firstLog : created;
  return (
    <div className="mt-16">
      <div className="heatmap" role="img" aria-label={`${h.title}: last 18 weeks. Darker squares are full completions, lighter are minimum versions, striped are intentional skips.`}>
        {days.map((d) => {
          const s = byDate.get(d);
          const cls = s === "done" ? "l3" : s === "minimum" ? "l1" : s === "skipped" ? "skip" : d < origin || !isScheduled(h as never, d) ? "off" : "";
          return <span key={d} className={`cell ${cls}`} title={`${d}: ${s ?? (isScheduled(h as never, d) ? "not logged" : "not scheduled")}`} />;
        })}
      </div>
      <div className="row tiny muted mt-8" style={{ gap: 12 }}>
        <span className="row gap-4">
          <span className="heat-strip">
            <span className="cell l3" />
          </span>
          Done
        </span>
        <span className="row gap-4">
          <span className="heat-strip">
            <span className="cell l1" />
          </span>
          Minimum
        </span>
        <span className="row gap-4">
          <span className="heat-strip">
            <span className="cell skip" />
          </span>
          Skipped
        </span>
        <span className="row gap-4">
          <span className="heat-strip">
            <span className="cell" />
          </span>
          Missed
        </span>
      </div>
    </div>
  );
}
