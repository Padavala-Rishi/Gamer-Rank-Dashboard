import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Columns3, Flag, GanttChart, List, Pencil, Plus } from "lucide-react";
import { useDocumentTitle, useMutate, useOne, useResource, useToday } from "../lib/hooks";
import type { Project, Task } from "../lib/types";
import { Button, Card, Empty, ErrorState, Progress, Seg, Skeleton, Stat, useConfirm } from "../components/ui";
import { FormModal } from "../components/ResourceForm";
import { projectFields } from "../lib/fields";
import { TaskRow, useLookups } from "../components/entities";
import { Markdown } from "../components/Markdown";
import { LinkedNotes } from "../components/TaskEditor";
import { Kanban } from "./Tasks";
import { PROJECT_STATUSES, PRIORITIES, label } from "../../shared/constants";
import { fmtDate, fmtMin } from "../lib/format";
import { addDays, diffDays } from "../../shared/dates";
import { useUI } from "../layout/UIContext";

export default function ProjectDetail() {
  const { id } = useParams();
  const q = useOne<Project>("projects", id);
  const tasks = useResource<Task>("tasks", { project_id: id ?? "" }, { enabled: !!id });
  const [layout, setLayout] = useState<"list" | "board" | "timeline" | "priority">("list");
  const [editing, setEditing] = useState(false);
  const [quick, setQuick] = useState("");
  const mut = useMutate();
  const nav = useNavigate();
  const confirm = useConfirm();
  const today = useToday();
  const ui = useUI();
  const lk = useLookups();
  useDocumentTitle(q.data?.title ?? "Project");

  if (q.isLoading) return <div className="page"><Skeleton lines={8} /></div>;
  if (q.error || !q.data) return <div className="page"><ErrorState error={q.error ?? new Error("Project not found")} /></div>;
  const p = q.data;
  const all = (tasks.data ?? []).filter((t) => !t.parent_id);
  const open = all.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const goal = p.goal_id ? lk.goal.get(p.goal_id) : null;

  const addQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quick.trim()) return;
    try {
      await mut.create("tasks", { title: quick.trim(), project_id: p.id });
      setQuick("");
    } catch {
      /* toast */
    }
  };

  const del = async () => {
    const r = await confirm({ title: `Delete “${p.title}”?`, body: `Its ${all.length} task(s) will move to your inbox unless you delete them too. This can't be undone.`, confirm: "Delete project, keep tasks", danger: true, alt: "Delete project and tasks" });
    if (!r) return;
    await mut.remove("projects", p.id, r === "alt" ? { with_tasks: "1" } : {}, { success: "Project deleted" });
    nav("/projects");
  };

  return (
    <div className="page">
      <Link to="/projects" className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}>
        <ArrowLeft size={14} aria-hidden /> Projects
      </Link>
      <header className="page-header">
        <div>
          <div className="row wrap">
            <h1>{p.title}</h1>
            <span className="badge">{label(PROJECT_STATUSES, p.status)}</span>
          </div>
          <p className="subtitle">
            {goal ? <Link to={`/goals/${goal.id}`}>Serves: {goal.title}</Link> : "Not linked to a goal"}
            {p.deadline ? ` · Due ${fmtDate(p.deadline, today)}` : ""}
          </p>
        </div>
        <div className="row">
          <Button onClick={() => setEditing(true)}>
            <Pencil size={15} aria-hidden /> Edit
          </Button>
          <Button variant="danger" onClick={del}>
            Delete
          </Button>
        </div>
      </header>

      <div className="grid grid-4" style={{ marginBottom: "var(--space)" }}>
        <Card pad>
          <Stat label="Tasks done" value={`${p.task_done}/${p.task_total}`} />
          <div className="mt-8">
            <Progress value={p.task_total ? p.task_done / p.task_total : 0} />
          </div>
        </Card>
        <Card pad>
          <Stat label="Estimated time left" value={fmtMin(p.remaining_min)} />
        </Card>
        <Card pad>
          <Stat label="Time spent (tracked)" value={fmtMin(p.actual_min)} />
        </Card>
        <Card pad>
          <Stat label="Days to deadline" value={p.deadline ? diffDays(today, p.deadline) : "—"} delta={p.deadline && p.remaining_min > 0 && diffDays(today, p.deadline) > 0 ? `≈ ${fmtMin(Math.ceil(p.remaining_min / Math.max(1, diffDays(today, p.deadline))))} per day needed` : null} />
        </Card>
      </div>

      {p.status === "active" && open.length === 0 && (
        <div className="badge warn" style={{ height: "auto", padding: "8px 12px", marginBottom: 12 }}>
          This active project has no next task. What's the very next physical action?
        </div>
      )}

      <div className="row between wrap" style={{ marginBottom: 12 }}>
        <form onSubmit={addQuick} className="row" style={{ flex: "1 1 300px" }}>
          <input className="input" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Add a task to this project…" aria-label="New task title" maxLength={300} />
          <Button type="submit">
            <Plus size={15} aria-hidden /> Add
          </Button>
          <Button variant="ghost" onClick={() => ui.openTask({ project_id: p.id })}>
            Details…
          </Button>
        </form>
        <Seg
          label="Layout"
          value={layout}
          onChange={setLayout}
          options={[
            ["list", <><List size={14} aria-hidden /> List</>],
            ["board", <><Columns3 size={14} aria-hidden /> Board</>],
            ["timeline", <><GanttChart size={14} aria-hidden /> Timeline</>],
            ["priority", <><Flag size={14} aria-hidden /> Priority</>],
          ]}
        />
      </div>

      {tasks.isLoading ? (
        <Skeleton lines={5} />
      ) : all.length === 0 ? (
        <div className="card">
          <Empty title="No tasks yet">Break the project into concrete next actions.</Empty>
        </div>
      ) : layout === "board" ? (
        <Kanban tasks={all} />
      ) : layout === "timeline" ? (
        <TaskTimeline tasks={all} />
      ) : layout === "priority" ? (
        <div className="grid grid-2">
          {PRIORITIES.map(([pr, l]) => (
            <Card key={pr} title={l}>
              <div className="list">{open.filter((t) => t.priority === pr).map((t) => <TaskRow key={t.id} task={t} showProject={false} />)}</div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="col gap-16">
          <Card title={`Open (${open.length})`}>
            <div className="list">{open.map((t) => <TaskRow key={t.id} task={t} showProject={false} />)}</div>
          </Card>
          {all.length > open.length && (
            <Card title={`Done (${all.length - open.length})`}>
              <div className="list">{all.filter((t) => !open.includes(t)).map((t) => <TaskRow key={t.id} task={t} showProject={false} />)}</div>
            </Card>
          )}
        </div>
      )}

      {(p.description || p.notes) && (
        <div className="grid grid-2 mt-16">
          {p.description && (
            <Card title="Outcome">
              <Markdown text={p.description} />
            </Card>
          )}
          {p.notes && (
            <Card title="Notes">
              <Markdown text={p.notes} />
            </Card>
          )}
        </div>
      )}
      <div className="mt-16">
        <LinkedNotes type="project" id={p.id} />
      </div>
      <FormModal open={editing} onClose={() => setEditing(false)} title="Edit project" resource="projects" fields={projectFields} initial={p as unknown as Record<string, unknown>} deletable={false} wide />
    </div>
  );
}

function TaskTimeline({ tasks }: { tasks: Task[] }) {
  const today = useToday();
  const dated = tasks.filter((t) => t.due_date || t.scheduled_date);
  const { lo, days } = useMemo(() => {
    const ds = dated.map((t) => (t.due_date ?? t.scheduled_date)!).concat(today).sort();
    const lo = addDays(ds[0], -1);
    const hi = addDays(ds[ds.length - 1], 2);
    return { lo, days: Math.max(7, diffDays(lo, hi) + 1) };
  }, [dated, today]);
  if (!dated.length) return <p className="muted">Give tasks due dates to see them on a timeline.</p>;
  const pos = (d: string) => `${(diffDays(lo, d) / days) * 100}%`;
  return (
    <div className="card card-pad" style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 600 }}>
        {dated
          .sort((a, b) => (a.due_date ?? a.scheduled_date)!.localeCompare((b.due_date ?? b.scheduled_date)!))
          .map((t) => {
            const end = (t.due_date ?? t.scheduled_date)!;
            const dur = Math.max(1, Math.ceil((t.estimate_min ?? 60) / 120));
            const start = t.scheduled_date && t.due_date && t.scheduled_date < t.due_date ? t.scheduled_date : addDays(end, -dur + 1);
            return (
              <div key={t.id} className="row" style={{ height: 30 }}>
                <span className="ellipsis small" style={{ width: 200, flex: "none", textDecoration: t.status === "done" ? "line-through" : undefined }}>
                  {t.title}
                </span>
                <div style={{ position: "relative", flex: 1, height: 14 }}>
                  <div style={{ position: "absolute", left: pos(today), top: -8, bottom: -8, width: 1, background: "var(--bad)" }} aria-hidden />
                  <div title={`${start} → ${end}`} style={{ position: "absolute", left: pos(start), width: `calc(${pos(addDays(end, 1))} - ${pos(start)})`, height: 12, top: 1, borderRadius: 6, background: t.status === "done" ? "var(--surface-3)" : "var(--accent)" }} />
                </div>
              </div>
            );
          })}
        <p className="tiny muted mt-8">Each bar ends on the task's due date. The red line is today.</p>
      </div>
    </div>
  );
}
