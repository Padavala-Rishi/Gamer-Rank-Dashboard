// "What should I do now?" — one recommended action, with its reasons, and the user in control.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarPlus, Check, Clock, Play, Shuffle, SkipForward, Sparkles, Target, Zap } from "lucide-react";
import { useApi, useLocalState, useMutate, useToday } from "../lib/hooks";
import { get, qs, ApiError } from "../lib/api";
import { fmtMin } from "../lib/format";
import { Button, ErrorState, Modal, Seg, Skeleton } from "../components/ui";
import type { Recommendation } from "../lib/types";
import { useToast } from "../components/Toast";

interface NextAction {
  primary: Recommendation | null;
  alternatives: Recommendation[];
  context: string;
  available_min: number;
  energy: string | null;
  in_commitment: { title: string; ends_at: string } | null;
  day_over: boolean;
}

export function NowContent({ onClose, compact = false }: { onClose?: () => void; compact?: boolean }) {
  const today = useToday();
  const [skips, setSkips] = useLocalState<{ date: string; keys: string[] }>("now-skips", { date: today, keys: [] });
  const keys = skips.date === today ? skips.keys : [];
  const [energy, setEnergy] = useState<string>("");
  const [available, setAvailable] = useState<string>("");
  const [chosen, setChosen] = useState<Recommendation | null>(null);
  const [showAlts, setShowAlts] = useState(false);
  const q = useApi<NextAction>(`/next-action${qs({ exclude: keys.join(","), energy, available })}`);
  const mut = useMutate();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const rec = chosen ?? q.data?.primary ?? null;
  const go = (path: string) => {
    onClose?.();
    nav(path);
  };

  const start = async (r: Recommendation) => {
    setBusy("start");
    try {
      if (r.kind === "recovery") {
        // Rest isn't a focus session: acknowledge it and don't suggest it again today.
        setSkips({ date: today, keys: [...keys, r.key] });
        setChosen(null);
        toast.show("Good call. Enjoy the rest.");
      } else if (r.kind === "task") {
        await mut.call("/focus/start", { kind: "custom", planned_min: Math.max(1, Math.min(600, r.minutes)), task_id: r.task_id ?? null, objective: r.action });
        go("/focus");
      } else if (r.kind === "session") go("/focus");
      else if (r.kind === "habit" && r.habit_id) {
        await mut.create("habit-logs", { habit_id: r.habit_id, date: today, status: "done" }, { success: "Habit logged — nice." });
        setChosen(null);
      } else if (r.link) go(r.link);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) go("/focus");
    } finally {
      setBusy(null);
    }
  };

  const schedule = async (r: Recommendation) => {
    setBusy("schedule");
    try {
      const slots = await get<{ start: string; end: string; minutes: number }[]>(`/free-slots${qs({ min: Math.min(r.minutes, 240) })}`);
      if (!slots.length) {
        toast.show("No free slot left today that fits. Try tomorrow from the planner.", { kind: "error" });
        return;
      }
      const s = slots[0];
      const [h, m] = s.start.split(":").map(Number);
      const endMin = h * 60 + m + Math.min(r.minutes, s.minutes);
      const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
      await mut.call("/plan/commit", { date: today, mit_ids: [], scheduled_ids: r.task_id ? [r.task_id] : [], blocks: [{ task_id: r.task_id ?? null, title: r.title, start: s.start, end }] }, "POST", {
        success: `Scheduled ${s.start}–${end} today`,
      });
    } catch {
      /* toast shown */
    } finally {
      setBusy(null);
    }
  };

  const skip = (r: Recommendation) => {
    setSkips({ date: today, keys: [...keys, r.key] });
    setChosen(null);
    setShowAlts(false);
  };

  return (
    <div className="col gap-12">
      <div className="row wrap gap-12">
        <Seg
          label="Energy right now"
          value={energy}
          onChange={setEnergy}
          options={[
            ["", "Energy: auto"],
            ["low", "Low"],
            ["medium", "Medium"],
            ["high", "High"],
          ]}
        />
        <label className="row small ink-2">
          <Clock size={14} aria-hidden /> I have
          <select className="select" style={{ width: "auto", minHeight: 30, padding: "2px 8px" }} value={available} onChange={(e) => setAvailable(e.target.value)} aria-label="Time available">
            <option value="">until my next commitment</option>
            <option value="10">10 minutes</option>
            <option value="25">25 minutes</option>
            <option value="45">45 minutes</option>
            <option value="90">90 minutes</option>
            <option value="180">3 hours</option>
          </select>
        </label>
      </div>

      {q.isLoading ? (
        <Skeleton lines={5} />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !rec ? (
        <div className="empty">
          <h3>Nothing left to suggest</h3>
          <p>You've skipped every suggestion for today. That's fine — rest is a valid choice.</p>
          <Button size="sm" onClick={() => setSkips({ date: today, keys: [] })}>
            Reset skipped suggestions
          </Button>
        </div>
      ) : (
        <>
          <p className="muted small">{q.data?.context}</p>
          <div>
            <div className="now-action">{rec.action}</div>
            {rec.action !== rec.title && <div className="muted small mt-4">{rec.title}</div>}
          </div>
          <dl className="kv">
            <dt>Why</dt>
            <dd>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {rec.why.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </dd>
            <dt>Time</dt>
            <dd>{fmtMin(rec.minutes)}</dd>
            <dt>Result</dt>
            <dd>{rec.expected}</dd>
          </dl>
          <div className="row wrap">
            <Button variant="primary" onClick={() => start(rec)} loading={busy === "start"}>
              {rec.kind === "habit" || rec.kind === "recovery" ? <Check size={16} aria-hidden /> : rec.kind === "task" || rec.kind === "session" ? <Play size={16} aria-hidden /> : <ArrowRight size={16} aria-hidden />}
              {rec.kind === "habit" ? "Mark done" : rec.kind === "recovery" ? "OK, I'll rest" : rec.kind === "task" ? "Start" : rec.kind === "session" ? "Open session" : "Go"}
            </Button>
            {rec.kind === "task" && (
              <Button onClick={() => schedule(rec)} loading={busy === "schedule"}>
                <CalendarPlus size={16} aria-hidden /> Schedule
              </Button>
            )}
            <Button onClick={() => skip(rec)}>
              <SkipForward size={16} aria-hidden /> Skip
            </Button>
            <Button onClick={() => setShowAlts((s) => !s)} aria-expanded={showAlts}>
              <Shuffle size={16} aria-hidden /> Change
            </Button>
            {rec.kind === "task" && rec.task_id && (
              <Button variant="ghost" onClick={() => go(`/focus?two=${rec.task_id}`)} title="Shrink it to the smallest possible first step">
                <Zap size={16} aria-hidden /> 2-minute start
              </Button>
            )}
          </div>
          {showAlts && (
            <div className="card flat" style={{ padding: 8 }}>
              {(q.data?.alternatives ?? []).filter((a) => a.key !== rec.key).length === 0 && <p className="muted small" style={{ padding: 8 }}>No other suggestions right now.</p>}
              {[q.data?.primary, ...(q.data?.alternatives ?? [])]
                .filter((a): a is Recommendation => !!a && a.key !== rec.key)
                .map((a) => (
                  <button
                    key={a.key}
                    className="palette-item"
                    style={{ width: "100%", border: 0, background: "none", textAlign: "left" }}
                    onClick={() => {
                      setChosen(a);
                      setShowAlts(false);
                    }}
                  >
                    <Target size={14} aria-hidden />
                    <span className="grow">
                      <span className="strong">{a.title}</span>
                      <span className="muted small"> · {fmtMin(a.minutes)} · {a.why[0]}</span>
                    </span>
                  </button>
                ))}
              <button className="palette-item" style={{ width: "100%", border: 0, background: "none", textAlign: "left" }} onClick={() => go("/tasks")}>
                <ArrowRight size={14} aria-hidden /> Pick something myself…
              </button>
            </div>
          )}
          {!compact && (
            <p className="tiny muted">
              <Sparkles size={11} aria-hidden /> Suggested from your priorities, deadlines, goals, calendar and energy. It's a starting point — you decide.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export function NowModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="What should I do now?">
      {open && <NowContent onClose={onClose} />}
    </Modal>
  );
}
