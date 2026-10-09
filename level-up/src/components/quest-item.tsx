"use client";
import { useRef, useState, useTransition } from "react";
import { breakDown, completeTask, deleteTask, rescheduleTask, setQuestStatus, undoTask, updateTask } from "@/app/actions/tasks";
import { CATEGORIES, DIFFICULTY_LABEL, QUEST_TYPE_LABEL } from "@/lib/constants";
import { addDays, formatMinutes, relativeDay } from "@/lib/dates";
import { describeRecurrence, isRecurrence } from "@/lib/game/recurrence";
import type { Task } from "@/lib/types";
import { Icon } from "./icon";
import { Sheet } from "./sheet";
import { TaskForm } from "./task-form";
import { DomainIcon } from "./ui";
import { useUI } from "./ui-context";

export type QuestView = Task & { childOpen?: number; childTotal?: number };

type Props = {
  task: QuestView;
  today: string;
  /** shown for completed quests */
  doneXp?: number;
  /** position helpers for keyboard/touch reordering */
  onMove?: (dir: -1 | 1) => void;
  draggable?: boolean;
  dragProps?: React.HTMLAttributes<HTMLLIElement>;
  hideDomain?: boolean;
  /** extra controls shown before the menu button */
  extra?: React.ReactNode;
};

export function QuestItem({ task, today, doneXp, onMove, draggable, dragProps, hideDomain, extra }: Props) {
  const { celebrate, toast, xp } = useUI();
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(false);
  const [split, setSplit] = useState(false);
  const [pending, start] = useTransition();
  const btn = useRef<HTMLButtonElement>(null);
  const done = task.status === "done";
  const template = task.status === "template";
  const overdue = !done && task.scheduled_date != null && task.scheduled_date < today && !task.template_id;

  const complete = () => {
    const r = btn.current?.getBoundingClientRect();
    start(async () => {
      const res = await completeTask(task.id);
      if (!res.ok) { toast(res.error, "bad"); return; }
      celebrate(res.data, r ? { x: r.left + r.width / 2, y: r.top } : undefined);
    });
  };
  const undo = () => start(async () => {
    const res = await undoTask(task.id);
    if (!res.ok) toast(res.error, "bad"); else if (res.data.undone) toast(`Undone. −${res.data.xp_removed} XP, nothing lost for good.`, "info");
  });
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) => start(async () => {
    const res = await fn();
    if (!res.ok) { toast(res.error ?? "Couldn't do that", "bad"); return; }
    if (ok) toast(ok, "good");
    setMenu(false);
  });

  const rec = isRecurrence(task.recurrence) ? describeRecurrence(task.recurrence) : null;

  return (
    <li {...dragProps} className={`group flex items-start gap-3 rounded-xl border border-line bg-surface px-3 py-3 transition-colors hover:border-faint/60 ${done ? "opacity-70" : ""} ${pending ? "opacity-60" : ""}`} data-testid="quest" data-status={task.status}>
      {draggable && <span className="mt-1 hidden cursor-grab text-faint md:block" aria-hidden title="Drag to reorder"><Icon name="ellipsis" size={14} className="rotate-90" /></span>}
      {template ? (
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-line text-muted" aria-hidden><Icon name="repeat" size={14} /></span>
      ) : (
        <button ref={btn} onClick={done ? undo : complete} disabled={pending} aria-label={done ? `Undo: ${task.title}` : `Complete: ${task.title}`}
          className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors ${done ? "check-pop border-accent bg-accent text-accent-ink" : "border-faint hover:border-accent hover:bg-accent/10"}`}>
          {done && <Icon name="check" size={16} strokeWidth={3} />}
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={`font-medium leading-snug ${done ? "text-muted line-through decoration-faint" : ""}`}>{task.title}</span>
          {task.is_sample && <span className="badge">Sample</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {!hideDomain && task.category !== "life" && <span className="inline-flex items-center gap-1"><DomainIcon category={task.category} size={13} />{CATEGORIES[task.category].short}</span>}
          <span className="font-semibold" style={{ color: task.difficulty === "boss" ? "var(--accent)" : undefined }}>
            {DIFFICULTY_LABEL[task.difficulty]} · <span className="num">+{done && doneXp != null ? doneXp : xp[task.difficulty]} XP</span>
          </span>
          {task.est_minutes != null && <span className="inline-flex items-center gap-1"><Icon name="clock" size={12} />{formatMinutes(task.est_minutes)}</span>}
          {task.scheduled_time && <span>{task.scheduled_time.slice(0, 5)}</span>}
          {task.quest_type !== "daily" && <span className="badge">{QUEST_TYPE_LABEL[task.quest_type]}</span>}
          {task.due_date && <span className={task.due_date < today && !done ? "text-bad" : ""}>Due {relativeDay(task.due_date, today)}</span>}
          {overdue && <span className="text-warn">Carried over from {relativeDay(task.scheduled_date!, today).toLowerCase()}</span>}
          {rec && <span className="inline-flex items-center gap-1"><Icon name="repeat" size={12} />{rec}</span>}
          {task.template_id && !template && <span className="inline-flex items-center gap-1" title="Part of a repeating quest"><Icon name="repeat" size={12} /></span>}
          {task.verify && !done && <span className="inline-flex items-center gap-1" title="XP is awarded once the app finds what you logged"><Icon name="lock" size={12} />auto-checked</span>}
          {(task.childTotal ?? 0) > 0 && <span>{(task.childTotal ?? 0) - (task.childOpen ?? 0)}/{task.childTotal} steps</span>}
          {done && task.actual_minutes != null && <span>{formatMinutes(task.actual_minutes)} spent</span>}
        </div>
      </div>
      {extra}
      <button className="btn btn-ghost btn-icon btn-sm shrink-0" onClick={() => setMenu(true)} aria-label={`Actions for ${task.title}`} aria-haspopup="dialog"><Icon name="ellipsis" size={18} /></button>

      <Sheet open={menu} onClose={() => setMenu(false)} title={task.title.length > 38 ? task.title.slice(0, 36) + "…" : task.title}>
        <div className="grid gap-1.5">
          {done ? (
            <button className="btn justify-start" onClick={() => { setMenu(false); undo(); }}><Icon name="undo-2" size={16} />Undo completion (removes its XP)</button>
          ) : (
            <>
              <button className="btn justify-start" onClick={() => { setMenu(false); setEdit(true); }}><Icon name="pencil" size={16} />Edit</button>
              {!template && (
                <>
                  <button className="btn justify-start" onClick={() => act(() => rescheduleTask(task.id, today), "Moved to today")}><Icon name="arrow-right" size={16} />Do today</button>
                  <button className="btn justify-start" onClick={() => act(() => rescheduleTask(task.id, addDays(today, 1)), "Moved to tomorrow")}><Icon name="calendar-clock" size={16} />Tomorrow</button>
                  <div className="flex gap-2">
                    <input type="date" className="input" aria-label="Pick a date" min={today} onChange={(e) => e.target.value && act(() => rescheduleTask(task.id, e.target.value), "Rescheduled")} />
                  </div>
                  <button className="btn justify-start" onClick={() => act(() => rescheduleTask(task.id, null), "Moved to backlog")}><Icon name="inbox" size={16} />Backlog</button>
                  {(task.childTotal ?? 0) === 0 && <button className="btn justify-start" onClick={() => { setMenu(false); setSplit(true); }}><Icon name="wand-sparkles" size={16} />Break into smaller quests</button>}
                  {onMove && (
                    <div className="flex gap-2">
                      <button className="btn flex-1" onClick={() => { onMove(-1); setMenu(false); }}><Icon name="arrow-up" size={16} />Move up</button>
                      <button className="btn flex-1" onClick={() => { onMove(1); setMenu(false); }}><Icon name="arrow-down" size={16} />Move down</button>
                    </div>
                  )}
                  <button className="btn justify-start" onClick={() => act(() => setQuestStatus(task.id, "skipped"), "Skipped. No penalty.")}><Icon name="skip-forward" size={16} />Skip (not today, not now)</button>
                  <button className="btn justify-start" onClick={() => act(() => setQuestStatus(task.id, "discarded"), "Discarded")}><Icon name="x" size={16} />Discard (no longer relevant)</button>
                </>
              )}
              <button className="btn btn-danger justify-start" onClick={() => { if (confirm(template ? "Stop this repeating quest? Upcoming copies are removed; your history stays." : "Delete this quest?")) act(() => deleteTask(task.id), "Deleted"); }}>
                <Icon name="trash-2" size={16} />{template ? "Stop repeating" : "Delete"}
              </button>
            </>
          )}
        </div>
      </Sheet>

      <Sheet open={edit} onClose={() => setEdit(false)} title="Edit quest">
        {edit && <TaskForm today={today} initial={task} onDone={() => setEdit(false)} />}
      </Sheet>
      <Sheet open={split} onClose={() => setSplit(false)} title="Break it down">
        {split && <BreakDown task={task} today={today} onDone={() => setSplit(false)} />}
      </Sheet>
    </li>
  );
}

function BreakDown({ task, today, onDone }: { task: Task; today: string; onDone: () => void }) {
  const { toast } = useUI();
  const [steps, setSteps] = useState(["", "", ""]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Turn “{task.title}” into small steps. The big quest is completed after its steps are done.</p>
      {steps.map((s, i) => (
        <input key={i} className="input" aria-label={`Step ${i + 1}`} placeholder={`Step ${i + 1}`} value={s} maxLength={160} onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
      ))}
      <button className="btn btn-sm" onClick={() => setSteps((l) => (l.length < 12 ? [...l, ""] : l))}><Icon name="plus" size={14} /> Add step</button>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn btn-ghost" onClick={onDone}>Cancel</button>
        <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => {
          const res = await breakDown(task.id, steps, task.scheduled_date && task.scheduled_date >= today ? task.scheduled_date : null);
          if (!res.ok) { setErr(res.error); return; }
          toast(`Created ${res.data.created} steps`, "good"); onDone();
        })}>Create steps</button>
      </div>
    </div>
  );
}

