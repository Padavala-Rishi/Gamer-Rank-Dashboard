import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, AlertTriangle, CheckCircle2, CircleDashed, Clock, Lock, MinusCircle, Repeat, TrendingUp, Zap } from "lucide-react";
import type { GoalView, LifeArea, Project, Task, Goal } from "../lib/types";
import { useMutate, useResource, useToday } from "../lib/hooks";
import { dueClass, fmtDate, fmtMin } from "../lib/format";
import { useUI } from "../layout/UIContext";
import { describeRecurrence } from "../../shared/recurrence";
import { burst } from "../lib/celebrate";
import { PACE_LABEL, type Pace } from "../../shared/goals";
import { useToast } from "./Toast";

export function useLookups() {
  const projects = useResource<Project>("projects");
  const goals = useResource<Goal>("goals");
  const areas = useResource<LifeArea>("life-areas");
  return useMemo(
    () => ({
      project: new Map((projects.data ?? []).map((p) => [p.id, p])),
      goal: new Map((goals.data ?? []).map((g) => [g.id, g])),
      area: new Map((areas.data ?? []).map((a) => [a.id, a])),
      areas: areas.data ?? [],
    }),
    [projects.data, goals.data, areas.data],
  );
}

export function AreaTag({ area }: { area?: LifeArea | null }) {
  if (!area) return null;
  return (
    <span className="row gap-4">
      <span className="dot" style={{ background: area.color }} aria-hidden />
      {area.name}
    </span>
  );
}

const PACE_TONE: Record<string, { cls: string; Icon: typeof CheckCircle2 }> = {
  achieved: { cls: "good", Icon: CheckCircle2 },
  on_track: { cls: "good", Icon: TrendingUp },
  at_risk: { cls: "warn", Icon: AlertTriangle },
  behind: { cls: "bad", Icon: AlertCircle },
  overdue: { cls: "bad", Icon: AlertCircle },
  no_deadline: { cls: "", Icon: CircleDashed },
  not_measured: { cls: "", Icon: CircleDashed },
  inactive: { cls: "", Icon: MinusCircle },
};

export function PaceBadge({ pace }: { pace: string }) {
  const t = PACE_TONE[pace] ?? PACE_TONE.not_measured;
  return (
    <span className={`badge ${t.cls}`} title="Progress compared with time elapsed — a prompt to look, not a verdict.">
      <t.Icon size={12} aria-hidden />
      {PACE_LABEL[pace as Pace] ?? pace}
    </span>
  );
}

export function TaskRow({ task, showProject = true, onOpen, compact = false }: { task: Task; showProject?: boolean; onOpen?: (t: Task) => void; compact?: boolean }) {
  const today = useToday();
  const mut = useMutate();
  const ui = useUI();
  const toast = useToast();
  const lk = useLookups();
  const done = task.status === "done";
  const [justDone, setJustDone] = useState(false);
  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = done ? "todo" : "done";
    if (next === "done") {
      burst(e.currentTarget);
      setJustDone(true);
    }
    try {
      await mut.update("tasks", task.id, { status: next }, { silentError: false });
      if (next === "done")
        toast.show(task.recurrence ? "Done — next one scheduled" : "Done", {
          action: { label: "Undo", onClick: () => mut.update("tasks", task.id, { status: "todo" }) },
        });
    } catch {
      /* toast shown */
    }
  };
  const project = task.project_id ? lk.project.get(task.project_id) : null;
  const goal = task.goal_id ? lk.goal.get(task.goal_id) : null;
  const open = () => (onOpen ? onOpen(task) : ui.openTask(task as unknown as Record<string, unknown>));
  const dc = dueClass(task.due_date, today);
  return (
    <div className={`item clickable ${done ? "done" : ""} ${justDone ? "just-done" : ""}`} onClick={open}>
      <span className={`pri pri-${task.priority}`} aria-hidden />
      <button
        className={`checkbox ${task.priority === "critical" ? "crit" : task.priority === "high" ? "high" : ""}`}
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark “${task.title}” as not done` : `Complete “${task.title}”`}
        onClick={toggle}
      >
        <CheckCircle2 size={14} aria-hidden />
      </button>
      <div className="grow">
        <button className="item-title" style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", font: "inherit" }} onClick={(e) => { e.stopPropagation(); open(); }}>
          {task.title}
        </button>
        {!compact && (
          <div className="meta">
            {task.due_date && (
              <span className={dc}>
                {dc === "overdue" ? "Overdue · " : ""}
                {fmtDate(task.due_date, today)}
                {task.due_time ? ` ${task.due_time}` : ""}
              </span>
            )}
            {task.estimate_min ? (
              <span className="row gap-4">
                <Clock size={11} aria-hidden />
                {fmtMin(task.estimate_min)}
              </span>
            ) : null}
            {task.energy === "high" && (
              <span className="row gap-4">
                <Zap size={11} aria-hidden />
                High energy
              </span>
            )}
            {task.recurrence && (
              <span className="row gap-4" title={describeRecurrence(task.recurrence)}>
                <Repeat size={11} aria-hidden />
                {describeRecurrence(task.recurrence)}
              </span>
            )}
            {task.blocked && (
              <span className="row gap-4" style={{ color: "var(--warn)" }}>
                <Lock size={11} aria-hidden />
                Blocked
              </span>
            )}
            {task.subtask_total > 0 && (
              <span>
                {task.subtask_done}/{task.subtask_total} subtasks
              </span>
            )}
            {showProject && project && (
              <Link to={`/projects/${project.id}`} onClick={(e) => e.stopPropagation()} style={{ textDecoration: "none" }}>
                {project.title}
              </Link>
            )}
            {goal && !project && <span>→ {goal.title}</span>}
            {task.context && <span>@{task.context}</span>}
            {task.is_demo && <span className="badge" style={{ height: 16 }}>demo</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function GoalProgressLine({ goal }: { goal: GoalView }) {
  const tone = goal.pace === "behind" || goal.pace === "overdue" ? "bad" : goal.pace === "at_risk" ? "warn" : undefined;
  return (
    <div className="col gap-4">
      <div className="row between small">
        <span className="muted">{goal.progress == null ? "No measure yet" : `${Math.round(goal.progress * 100)}%`}</span>
        <PaceBadge pace={goal.pace} />
      </div>
      <PaceProgress goal={goal} tone={tone} />
    </div>
  );
}

function PaceProgress({ goal, tone }: { goal: GoalView; tone?: "warn" | "bad" }) {
  const v = Math.max(0, Math.min(1, goal.progress ?? 0));
  return (
    <div className="progress-marker">
      <div className={`progress ${tone ?? ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={`${goal.title} progress`}>
        <span style={{ width: `${v * 100}%` }} />
      </div>
      {goal.expected != null && goal.pace !== "achieved" && <span className="expected" style={{ left: `calc(${Math.min(1, goal.expected) * 100}% - 1px)` }} title={`Expected by now if progress were linear: ${Math.round(goal.expected * 100)}%`} aria-hidden />}
    </div>
  );
}
