import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckSquare, Columns3, Flag, List, Plus, Search } from "lucide-react";
import { useDocumentTitle, useMutate, useResource, useToday } from "../lib/hooks";
import type { Task } from "../lib/types";
import { Async, Button, Empty, PageHeader, Seg, Tabs } from "../components/ui";
import { TaskRow, useLookups } from "../components/entities";
import { useUI } from "../layout/UIContext";
import { PRIORITIES, TASK_STATUSES, label } from "../../shared/constants";
import { addDays } from "../../shared/dates";
import { fmtDate } from "../lib/format";
import { get } from "../lib/api";

type View = "today" | "upcoming" | "overdue" | "inbox" | "all" | "done";
type Layout = "list" | "kanban" | "priority";

const PAGE = 150;

export default function Tasks() {
  useDocumentTitle("Tasks");
  const [params, setParams] = useSearchParams();
  const view = (params.get("view") as View) || "today";
  const [layout, setLayout] = useState<Layout>("list");
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [energy, setEnergy] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const today = useToday();
  const ui = useUI();
  const lk = useLookups();
  const q = useResource<Task>("tasks", view === "done" ? { status: "done", limit: 1000 } : { status: layout === "kanban" ? "todo,doing,done" : "todo,doing" });

  // Deep links: /tasks?open=<id>
  useEffect(() => {
    const id = params.get("open");
    if (!id) return;
    params.delete("open");
    setParams(params, { replace: true });
    get<Task>(`/r/tasks/${id}`)
      .then((t) => ui.openTask(t as unknown as Record<string, unknown>))
      .catch(() => {});
  }, [params, setParams, ui]);

  const filtered = useMemo(() => {
    let ts = (q.data ?? []).filter((t) => !t.parent_id);
    const s = search.trim().toLowerCase();
    if (s) ts = ts.filter((t) => t.title.toLowerCase().includes(s) || (t.notes ?? "").toLowerCase().includes(s));
    if (projectId) ts = ts.filter((t) => (projectId === "none" ? !t.project_id : t.project_id === projectId));
    if (goalId) ts = ts.filter((t) => t.goal_id === goalId || (t.project_id && lk.project.get(t.project_id)?.goal_id === goalId));
    if (energy) ts = ts.filter((t) => t.energy === energy);
    if (layout === "kanban" || view === "done" || view === "all") return ts;
    switch (view) {
      case "today":
        return ts.filter((t) => t.status === "doing" || t.mit_date === today || t.scheduled_date === today || (t.due_date && t.due_date <= today));
      case "upcoming":
        return ts.filter((t) => (t.due_date && t.due_date > today && t.due_date <= addDays(today, 14)) || (t.scheduled_date && t.scheduled_date > today));
      case "overdue":
        return ts.filter((t) => t.due_date && t.due_date < today);
      case "inbox":
        return ts.filter((t) => !t.project_id && !t.goal_id && !t.due_date && !t.scheduled_date);
    }
    return ts;
  }, [q.data, search, projectId, goalId, energy, view, today, layout, lk.project]);

  const setView = (v: View) => {
    params.set("view", v);
    setParams(params, { replace: true });
    setLimit(PAGE);
  };

  const newTaskDefaults = view === "today" ? { scheduled_date: today } : projectId && projectId !== "none" ? { project_id: projectId } : {};

  return (
    <div className="page">
      <PageHeader
        title="Tasks"
        subtitle="Capture everything; commit to a few."
        actions={
          <>
            <Seg
              label="Layout"
              value={layout}
              onChange={setLayout}
              options={[
                ["list", <><List size={14} aria-hidden /> List</>],
                ["kanban", <><Columns3 size={14} aria-hidden /> Board</>],
                ["priority", <><Flag size={14} aria-hidden /> Priority</>],
              ]}
            />
            <Button variant="primary" onClick={() => ui.openTask(newTaskDefaults)}>
              <Plus size={16} aria-hidden /> New task
            </Button>
          </>
        }
      />
      {layout !== "kanban" && (
        <Tabs
          label="Task views"
          value={view}
          onChange={setView}
          options={[
            ["today", "Today"],
            ["upcoming", "Upcoming"],
            ["overdue", "Overdue"],
            ["inbox", "Inbox"],
            ["all", "All open"],
            ["done", "Completed"],
          ]}
        />
      )}
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="row" style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={15} className="muted" style={{ position: "absolute", left: 10 }} aria-hidden />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Filter tasks" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Filter tasks" />
        </div>
        <select className="select" style={{ width: "auto" }} value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project filter">
          <option value="">All projects</option>
          <option value="none">No project</option>
          {[...lk.project.values()].map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <select className="select" style={{ width: "auto" }} value={goalId} onChange={(e) => setGoalId(e.target.value)} aria-label="Goal filter">
          <option value="">All goals</option>
          {[...lk.goal.values()]
            .filter((g) => g.status === "active")
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
        </select>
        <select className="select" style={{ width: "auto" }} value={energy} onChange={(e) => setEnergy(e.target.value)} aria-label="Energy filter">
          <option value="">Any energy</option>
          <option value="low">Low energy</option>
          <option value="medium">Medium energy</option>
          <option value="high">High energy</option>
        </select>
      </div>
      <Async q={q}>
        {() =>
          filtered.length === 0 ? (
            <div className="card">
              <Empty icon={<CheckSquare size={20} />} title={emptyTitle(view, !!(search || projectId || goalId || energy))} action={<Button variant="primary" onClick={() => ui.openTask(newTaskDefaults)}>Add a task</Button>}>
                {view === "today" ? "Nothing scheduled or due today. Plan your day, or pick something from Upcoming." : view === "overdue" ? "You're on top of your deadlines." : view === "inbox" ? "Tasks without a project, goal or date land here until you sort them." : "Try a different filter."}
              </Empty>
            </div>
          ) : layout === "kanban" ? (
            <Kanban tasks={filtered} />
          ) : layout === "priority" ? (
            <PriorityView tasks={filtered} />
          ) : (
            <ListView tasks={filtered.slice(0, limit)} view={view} today={today} more={filtered.length - limit} onMore={() => setLimit((l) => l + PAGE)} />
          )
        }
      </Async>
    </div>
  );
}

function emptyTitle(view: View, filtered: boolean) {
  if (filtered) return "No tasks match these filters";
  return { today: "A clear day", upcoming: "Nothing coming up", overdue: "Nothing overdue", inbox: "Inbox zero", all: "No open tasks", done: "Nothing completed yet" }[view];
}

function ListView({ tasks, view, today, more, onMore }: { tasks: Task[]; view: View; today: string; more: number; onMore: () => void }) {
  const groups = useMemo(() => {
    if (view === "done") {
      const m = new Map<string, Task[]>();
      for (const t of [...tasks].sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))) {
        const k = (t.completed_at ?? "").slice(0, 10);
        m.set(k, [...(m.get(k) ?? []), t]);
      }
      return [...m.entries()].map(([k, v]) => [k ? `Completed ${fmtDate(k, today)}` : "Completed", v] as const);
    }
    const g: Record<string, Task[]> = { Overdue: [], Today: [], Tomorrow: [], "This week": [], Later: [], "No date": [] };
    for (const t of tasks) {
      const d = t.due_date ?? t.scheduled_date;
      if (!d) g["No date"].push(t);
      else if (t.due_date && t.due_date < today) g.Overdue.push(t);
      else if (d <= today) g.Today.push(t);
      else if (d === addDays(today, 1)) g.Tomorrow.push(t);
      else if (d <= addDays(today, 7)) g["This week"].push(t);
      else g.Later.push(t);
    }
    return Object.entries(g).filter(([, v]) => v.length);
  }, [tasks, view, today]);
  return (
    <div className="col gap-16">
      {groups.map(([name, ts]) => (
        <section key={name} className="card">
          <div className="card-header">
            <h2>
              {name} <span className="muted small">{ts.length}</span>
            </h2>
          </div>
          <div className="card-body list">
            {ts.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </section>
      ))}
      {more > 0 && (
        <Button onClick={onMore} style={{ alignSelf: "center" }}>
          Show {Math.min(more, PAGE)} more ({more} hidden)
        </Button>
      )}
    </div>
  );
}

function PriorityView({ tasks }: { tasks: Task[] }) {
  return (
    <div className="grid grid-2">
      {PRIORITIES.map(([p]) => {
        const ts = tasks.filter((t) => t.priority === p);
        return (
          <section key={p} className="card">
            <div className="card-header">
              <h2 className="row">
                <span className={`pri pri-${p}`} style={{ height: 14 }} aria-hidden />
                {label(PRIORITIES, p)} <span className="muted small">{ts.length}</span>
              </h2>
            </div>
            <div className="card-body list">
              {ts.length ? ts.map((t) => <TaskRow key={t.id} task={t} />) : <p className="muted small">None</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function Kanban({ tasks }: { tasks: Task[] }) {
  const mut = useMutate();
  const ui = useUI();
  const [over, setOver] = useState<string | null>(null);
  const cols = TASK_STATUSES.filter(([s]) => s !== "cancelled");
  const move = async (id: string, status: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    try {
      await mut.update("tasks", id, { status });
    } catch {
      /* toast */
    }
  };
  return (
    <div className="kanban">
      {cols.map(([s, l]) => {
        const ts = tasks.filter((t) => t.status === s).slice(0, s === "done" ? 50 : 500);
        return (
          <section
            key={s}
            className={`kanban-col ${over === s ? "drop" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(s);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              move(e.dataTransfer.getData("text/task"), s);
            }}
            aria-label={`${l} column`}
          >
            <h3 className="row between" style={{ padding: "2px 4px 10px" }}>
              {l} <span className="muted small">{tasks.filter((t) => t.status === s).length}</span>
            </h3>
            {ts.map((t) => (
              <div
                key={t.id}
                className="kanban-card"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/task", t.id)}
                onClick={() => ui.openTask(t as unknown as Record<string, unknown>)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") ui.openTask(t as unknown as Record<string, unknown>);
                  // Keyboard alternative to drag-and-drop.
                  const idx = cols.findIndex(([c]) => c === t.status);
                  if (e.key === "ArrowRight" && idx < cols.length - 1) move(t.id, cols[idx + 1][0]);
                  if (e.key === "ArrowLeft" && idx > 0) move(t.id, cols[idx - 1][0]);
                }}
                tabIndex={0}
                role="button"
                aria-label={`${t.title}. Press Enter to open, arrow keys to move between columns.`}
              >
                <div className="row top gap-8">
                  <span className={`pri pri-${t.priority}`} aria-hidden />
                  <div className="grow">
                    <div className="strong" style={{ fontWeight: 500 }}>
                      {t.title}
                    </div>
                    <div className="meta mt-4">
                      {t.due_date && <span>{t.due_date}</span>}
                      {t.estimate_min && <span>{t.estimate_min}m</span>}
                      {t.blocked && <span style={{ color: "var(--warn)" }}>Blocked</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
