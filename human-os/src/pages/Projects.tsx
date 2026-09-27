import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, GanttChart, LayoutGrid, Plus } from "lucide-react";
import { useDocumentTitle, useResource, useToday } from "../lib/hooks";
import type { Project } from "../lib/types";
import { Async, Button, Empty, PageHeader, Progress, Seg, Tabs } from "../components/ui";
import { FormModal } from "../components/ResourceForm";
import { projectFields } from "../lib/fields";
import { useLookups } from "../components/entities";
import { PROJECT_STATUSES, label } from "../../shared/constants";
import { addDays, diffDays, startOfMonth, addMonths } from "../../shared/dates";
import { fmtDate, fmtMin, relDays } from "../lib/format";

export default function Projects() {
  useDocumentTitle("Projects");
  const [status, setStatus] = useState("active");
  const [layout, setLayout] = useState<"cards" | "timeline">("cards");
  const [creating, setCreating] = useState(false);
  const q = useResource<Project>("projects");
  const filtered = (q.data ?? []).filter((p) => status === "all" || p.status === status);
  return (
    <div className="page">
      <PageHeader
        title="Projects"
        subtitle="Multi-step outcomes that serve your goals."
        actions={
          <>
            <Seg label="Layout" value={layout} onChange={setLayout} options={[["cards", <><LayoutGrid size={14} aria-hidden /> Cards</>], ["timeline", <><GanttChart size={14} aria-hidden /> Timeline</>]]} />
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} aria-hidden /> New project
            </Button>
          </>
        }
      />
      <Tabs label="Project status" value={status} onChange={setStatus} options={[...PROJECT_STATUSES, ["all", "All"]] as unknown as [string, string][]} />
      <Async q={q}>
        {() =>
          filtered.length === 0 ? (
            <div className="card">
              <Empty icon={<FolderKanban size={20} />} title={`No ${status === "all" ? "" : label(PROJECT_STATUSES, status).toLowerCase() + " "}projects`} action={<Button variant="primary" onClick={() => setCreating(true)}>Create a project</Button>}>
                A project is anything that takes more than one step. Link it to a goal so your daily work adds up.
              </Empty>
            </div>
          ) : layout === "cards" ? (
            <div className="grid grid-auto">
              {filtered.map((p) => (
                <ProjectCard key={p.id} p={p} />
              ))}
            </div>
          ) : (
            <Timeline projects={filtered} />
          )
        }
      </Async>
      <FormModal open={creating} onClose={() => setCreating(false)} title="New project" resource="projects" fields={projectFields} wide />
    </div>
  );
}

function ProjectCard({ p }: { p: Project }) {
  const today = useToday();
  const lk = useLookups();
  const goal = p.goal_id ? lk.goal.get(p.goal_id) : null;
  const progress = p.task_total ? p.task_done / p.task_total : 0;
  const overdue = p.deadline && p.deadline < today && p.status !== "done";
  return (
    <Link to={`/projects/${p.id}`} className="card card-pad col gap-8" style={{ textDecoration: "none", borderTop: `3px solid ${p.color ?? "var(--border)"}` }}>
      <div className="row between top">
        <h2 className="clamp-2">{p.title}</h2>
        <span className="badge">{label(PROJECT_STATUSES, p.status)}</span>
      </div>
      {goal && <span className="small muted">→ {goal.title}</span>}
      <Progress value={progress} label={`${p.title} progress`} />
      <div className="meta">
        <span>
          {p.task_done}/{p.task_total} tasks
        </span>
        {p.remaining_min > 0 && <span>{fmtMin(p.remaining_min)} left</span>}
        {p.deadline && <span className={overdue ? "overdue" : ""}>Due {fmtDate(p.deadline, today)} ({relDays(p.deadline, today)})</span>}
        {p.status === "active" && p.task_total === p.task_done && <span style={{ color: "var(--warn)" }}>No next task</span>}
      </div>
    </Link>
  );
}

function Timeline({ projects }: { projects: Project[] }) {
  const today = useToday();
  const withDates = projects.filter((p) => p.deadline || p.start_date);
  const range = useMemo(() => {
    const dates = withDates.flatMap((p) => [p.start_date ?? (p.created_at as string).slice(0, 10), p.deadline ?? addDays(p.start_date!, 30)]);
    const lo = startOfMonth([...dates, today].sort()[0]);
    const hiRaw = [...dates, addDays(today, 30)].sort().pop()!;
    const hi = addDays(addMonths(startOfMonth(hiRaw), 1), -1);
    return { lo, hi, days: diffDays(lo, hi) + 1 };
  }, [withDates, today]);
  if (!withDates.length) return <p className="muted">Add start dates or deadlines to see projects on a timeline.</p>;
  const pos = (d: string) => `${(diffDays(range.lo, d) / range.days) * 100}%`;
  const months: string[] = [];
  for (let m = range.lo; m <= range.hi; m = addMonths(m, 1)) months.push(m);
  return (
    <div className="card card-pad" style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 640, position: "relative" }}>
        <div style={{ position: "relative", height: 20, marginLeft: 180 }}>
          {months.map((m) => (
            <span key={m} className="tiny muted" style={{ position: "absolute", left: pos(m) }}>
              {new Date(m + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" })}
            </span>
          ))}
        </div>
        {withDates.map((p) => {
          const start = p.start_date ?? (p.created_at as string).slice(0, 10);
          const end = p.deadline ?? addDays(start, 30);
          const progress = p.task_total ? p.task_done / p.task_total : 0;
          return (
            <div key={p.id} className="row" style={{ height: 34 }}>
              <Link to={`/projects/${p.id}`} className="ellipsis small" style={{ width: 172, flex: "none", textDecoration: "none" }}>
                {p.title}
              </Link>
              <div style={{ position: "relative", flex: 1, height: 18 }}>
                <div style={{ position: "absolute", left: pos(today), top: -8, bottom: -8, width: 1, background: "var(--bad)" }} aria-hidden />
                <div
                  title={`${start} → ${end} · ${Math.round(progress * 100)}% of tasks done`}
                  style={{ position: "absolute", left: pos(start), width: `calc(${pos(end)} - ${pos(start)})`, minWidth: 6, top: 3, height: 12, borderRadius: 6, background: "color-mix(in oklab, var(--accent) 22%, var(--surface-2))", overflow: "hidden" }}
                >
                  <div style={{ width: `${progress * 100}%`, height: "100%", background: p.color ?? "var(--accent)", borderRadius: 6 }} />
                </div>
              </div>
            </div>
          );
        })}
        <p className="tiny muted mt-8">Bars run from start to deadline; the filled part is the share of tasks done. The red line is today.</p>
      </div>
    </div>
  );
}
