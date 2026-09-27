import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, CheckCircle2, Circle, HelpCircle, Pencil, Plus, Sparkles, Trash2, XCircle } from "lucide-react";
import { useApi, useDocumentTitle, useMutate, useResource, useToday } from "../lib/hooks";
import type { GoalView, Habit, Milestone, Project, Task, Value } from "../lib/types";
import { Button, Card, Empty, ErrorState, Modal, Skeleton, Stat, useConfirm } from "../components/ui";
import { FormModal } from "../components/ResourceForm";
import { goalFields, milestoneFields } from "../lib/fields";
import { GoalProgressLine, PaceBadge, TaskRow } from "../components/entities";
import { Markdown } from "../components/Markdown";
import { LinkedNotes } from "../components/TaskEditor";
import { GOAL_HORIZONS, GOAL_KINDS, label } from "../../shared/constants";
import { fmtDate } from "../lib/format";
import { addDays } from "../../shared/dates";
import { useUI } from "../layout/UIContext";
import { ApiError, post } from "../lib/api";

interface Breakdown {
  summary: string;
  milestones: { title: string; due_in_days: number | null }[];
  tasks: { title: string; estimate_min: number; priority: string; first_step: string }[];
  habits: { title: string; minimum: string }[];
  risks: string[];
}

export default function GoalDetail() {
  const { id } = useParams();
  const q = useApi<GoalView[]>("/goals/overview");
  const g = q.data?.find((x) => x.id === id);
  const milestones = useResource<Milestone>("milestones", { goal_id: id ?? "" }, { enabled: !!id });
  const tasks = useResource<Task>("tasks", { goal_id: id ?? "" }, { enabled: !!id });
  const projects = useResource<Project>("projects", { goal_id: id ?? "" }, { enabled: !!id });
  const habits = useResource<Habit>("habits", { goal_id: id ?? "" }, { enabled: !!id });
  const values = useResource<Value>("values");
  const [editing, setEditing] = useState(false);
  const [msNew, setMsNew] = useState(false);
  const [metric, setMetric] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const mut = useMutate();
  const nav = useNavigate();
  const confirm = useConfirm();
  const today = useToday();
  const ui = useUI();
  useDocumentTitle(g?.title ?? "Goal");

  if (q.isLoading) return <div className="page"><Skeleton lines={8} /></div>;
  if (q.error) return <div className="page"><ErrorState error={q.error} retry={() => q.refetch()} /></div>;
  if (!g) return <div className="page"><Empty title="Goal not found" action={<Link className="btn" to="/goals">Back to goals</Link>}>It may have been deleted.</Empty></div>;

  const parent = g.parent_id ? q.data?.find((x) => x.id === g.parent_id) : null;
  const kids = (q.data ?? []).filter((x) => x.parent_id === g.id);
  const vals = (values.data ?? []).filter((v) => g.value_ids.includes(v.id));
  const openTasks = (tasks.data ?? []).filter((t) => t.status !== "done" && t.status !== "cancelled" && !t.parent_id);

  const del = async () => {
    if (!(await confirm({ title: `Delete “${g.title}”?`, body: "Milestones are deleted. Linked tasks, projects and habits are kept but unlinked. Sub-goals become top-level.", confirm: "Delete goal", danger: true }))) return;
    await mut.remove("goals", g.id, {}, { success: "Goal deleted" });
    nav("/goals");
  };

  const toggleMs = (m: Milestone) => mut.update("milestones", m.id, { completed_at: m.completed_at ? null : new Date().toISOString() }).catch(() => {});

  return (
    <div className="page page-narrow" style={{ maxWidth: 1040 }}>
      <Link to="/goals" className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}>
        <ArrowLeft size={14} aria-hidden /> Goals
      </Link>
      <header className="page-header">
        <div className="grow">
          {parent && (
            <Link to={`/goals/${parent.id}`} className="small muted">
              Part of: {parent.title}
            </Link>
          )}
          <h1>{g.title}</h1>
          <div className="row wrap mt-8">
            <span className="badge">{label(GOAL_HORIZONS, g.horizon)}</span>
            <span className="badge">{label(GOAL_KINDS, g.kind).split(" — ")[0]}</span>
            <PaceBadge pace={g.pace} />
            {g.is_focus && <span className="badge warn">Focus</span>}
            {vals.map((v) => (
              <span key={v.id} className="badge accent">
                {v.name}
              </span>
            ))}
          </div>
        </div>
        <div className="row">
          <Button onClick={() => setAiOpen(true)}>
            <Sparkles size={15} aria-hidden /> Break down
          </Button>
          <Button onClick={() => setEditing(true)}>
            <Pencil size={15} aria-hidden /> Edit
          </Button>
          <Button variant="danger" icon onClick={del} aria-label="Delete goal">
            <Trash2 size={15} />
          </Button>
        </div>
      </header>

      {g.why && (
        <blockquote className="serif" style={{ fontSize: 17, margin: "0 0 20px", paddingLeft: 14, borderLeft: "3px solid var(--accent)", color: "var(--ink-2)" }}>
          {g.why}
        </blockquote>
      )}

      <div className="grid grid-3" style={{ marginBottom: "var(--space)" }}>
        <Card pad>
          <Stat label="Progress" value={g.progress == null ? "—" : `${Math.round(g.progress * 100)}%`} />
          <div className="mt-8">
            <GoalProgressLine goal={g} />
          </div>
        </Card>
        <Card pad>
          <Stat label="Deadline" value={g.deadline ? fmtDate(g.deadline, today) : "None"} delta={g.days_left != null ? (g.days_left >= 0 ? `${g.days_left} days left` : `${-g.days_left} days past`) : null} deltaGood={g.days_left == null ? null : g.days_left >= 0} />
        </Card>
        <Card pad>
          <Stat label="Linked work" value={`${g.tasks_done}/${g.tasks_total}`} unit="tasks" delta={`${g.project_count} projects · ${g.habit_count} habits · ${kids.length} sub-goals`} />
        </Card>
      </div>

      {g.progress_mode === "metric" && (
        <Card title={`Metric: ${g.metric_name ?? "value"}`} className="mt-16">
          <div className="row wrap">
            <span className="muted small">
              Start {g.metric_start ?? 0} → now <strong>{g.metric_current ?? "—"}</strong> → target {g.metric_target ?? "—"} {g.metric_unit ?? ""}
            </span>
            <form
              className="row"
              onSubmit={async (e) => {
                e.preventDefault();
                if (metric === "") return;
                await mut.update("goals", g.id, { metric_current: Number(metric) }, { success: "Progress updated" }).catch(() => {});
                setMetric("");
              }}
            >
              <input className="input" type="number" step="any" style={{ width: 120 }} value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="New value" aria-label="New metric value" />
              <Button type="submit" size="sm">
                Update
              </Button>
            </form>
          </div>
        </Card>
      )}

      <div className="dash mt-16">
        <div className="col" style={{ gap: "var(--space)" }}>
          <Card title="Milestones" actions={<Button size="sm" variant="ghost" onClick={() => setMsNew(true)}><Plus size={15} aria-hidden /> Add</Button>}>
            {(milestones.data ?? []).length === 0 ? (
              <p className="muted small">No milestones. Checkpoints make long goals feel finite — add 3–6.</p>
            ) : (
              <div className="list">
                {milestones.data!.map((m) => (
                  <div key={m.id} className={`item ${m.completed_at ? "done" : ""}`}>
                    <button className="checkbox" role="checkbox" aria-checked={!!m.completed_at} aria-label={`Toggle ${m.title}`} onClick={() => toggleMs(m)}>
                      <Check size={13} aria-hidden />
                    </button>
                    <span className="grow item-title">{m.title}</span>
                    {m.due_date && <span className={`small ${!m.completed_at && m.due_date < today ? "" : "muted"}`} style={!m.completed_at && m.due_date < today ? { color: "var(--bad)" } : undefined}>{fmtDate(m.due_date, today)}</span>}
                    <Button size="sm" variant="ghost" icon aria-label={`Delete milestone ${m.title}`} onClick={() => mut.remove("milestones", m.id)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title={`Next actions (${openTasks.length})`} actions={<Button size="sm" variant="ghost" onClick={() => ui.openTask({ goal_id: g.id, life_area_id: g.life_area_id })}><Plus size={15} aria-hidden /> Task</Button>}>
            {openTasks.length ? <div className="list">{openTasks.map((t) => <TaskRow key={t.id} task={t} />)}</div> : <p className="muted small">No open tasks directly linked. What's one concrete next step?</p>}
          </Card>
          {(projects.data ?? []).length > 0 && (
            <Card title="Projects">
              <div className="list">
                {projects.data!.map((p) => (
                  <Link key={p.id} to={`/projects/${p.id}`} className="item" style={{ textDecoration: "none" }}>
                    <span className="grow">{p.title}</span>
                    <span className="small muted">
                      {p.task_done}/{p.task_total} tasks
                    </span>
                  </Link>
                ))}
              </div>
            </Card>
          )}
          {kids.length > 0 && (
            <Card title="Sub-goals">
              <div className="col gap-12">
                {kids.map((k) => (
                  <Link key={k.id} to={`/goals/${k.id}`} style={{ textDecoration: "none" }} className="col gap-4">
                    <span className="strong">{k.title}</span>
                    <GoalProgressLine goal={k} />
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
        <div className="col" style={{ gap: "var(--space)" }}>
          <Card title="SMART check">
            <div className="list">
              {g.smart.map((s) => (
                <div key={s.key} className="item" style={{ alignItems: "flex-start" }}>
                  {s.ok === true ? <CheckCircle2 size={16} style={{ color: "var(--good)" }} aria-label="Yes" /> : s.ok === false ? <XCircle size={16} style={{ color: "var(--warn)" }} aria-label="Not yet" /> : <HelpCircle size={16} className="muted" aria-label="Your call" />}
                  <div>
                    <div className="strong">{s.label}</div>
                    {s.ok !== true && <div className="small muted">{s.hint}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          {(habits.data ?? []).length > 0 && (
            <Card title="Supporting habits">
              <div className="list">
                {habits.data!.map((h) => (
                  <div key={h.id} className="item">
                    <Circle size={10} aria-hidden />
                    {h.title}
                  </div>
                ))}
              </div>
            </Card>
          )}
          {(g.description || g.risks || g.dependencies) && (
            <Card title="Details">
              {g.description && <Markdown text={g.description} />}
              {g.risks && (
                <>
                  <h3 className="mt-12">Risks</h3>
                  <p className="small pre-wrap">{g.risks}</p>
                </>
              )}
              {g.dependencies && (
                <>
                  <h3 className="mt-12">Dependencies</h3>
                  <p className="small pre-wrap">{g.dependencies}</p>
                </>
              )}
            </Card>
          )}
          <LinkedNotes type="goal" id={g.id} />
          <Link to={`/journal?new=goal&goal=${g.id}`} className="btn">
            Reflect on this goal
          </Link>
        </div>
      </div>

      <FormModal open={editing} onClose={() => setEditing(false)} title="Edit goal" resource="goals" fields={goalFields} initial={g as unknown as Record<string, unknown>} deletable={false} wide />
      <FormModal open={msNew} onClose={() => setMsNew(false)} title="New milestone" resource="milestones" fields={milestoneFields} extra={{ goal_id: g.id, sort_order: (milestones.data ?? []).length }} />
      <BreakdownModal open={aiOpen} onClose={() => setAiOpen(false)} goal={g} />
    </div>
  );
}

function BreakdownModal({ open, onClose, goal }: { open: boolean; onClose: () => void; goal: GoalView }) {
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<Breakdown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<Record<string, boolean>>({});
  const mut = useMutate();
  const today = useToday();
  const status = useApi<{ configured: boolean; enabled: boolean }>("/ai/status");

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await post<{ draft: Breakdown }>("/ai/breakdown", { goal_id: goal.id, notes: notes || undefined });
      setDraft(r.draft);
      const p: Record<string, boolean> = {};
      r.draft.milestones.forEach((_, i) => (p[`m${i}`] = true));
      r.draft.tasks.forEach((_, i) => (p[`t${i}`] = i < 5));
      r.draft.habits.forEach((_, i) => (p[`h${i}`] = false));
      setPick(p);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't generate a plan.");
    } finally {
      setLoading(false);
    }
  };

  const edit = <K extends "milestones" | "tasks" | "habits">(k: K, i: number, field: string, v: string) =>
    setDraft((d) => (d ? { ...d, [k]: d[k].map((x, j) => (j === i ? { ...x, [field]: v } : x)) } : d));

  const accept = async () => {
    if (!draft) return;
    await mut
      .run(async () => {
        for (const [i, m] of draft.milestones.entries()) if (pick[`m${i}`] && m.title.trim()) await post("/r/milestones", { goal_id: goal.id, title: m.title, due_date: m.due_in_days != null ? addDays(today, m.due_in_days) : null, sort_order: 100 + i });
        for (const [i, t] of draft.tasks.entries()) if (pick[`t${i}`] && t.title.trim()) await post("/r/tasks", { title: t.title, goal_id: goal.id, estimate_min: Math.min(1440, Math.max(1, t.estimate_min)), priority: t.priority, first_step: t.first_step, life_area_id: goal.life_area_id });
        for (const [i, h] of draft.habits.entries()) if (pick[`h${i}`] && h.title.trim()) await post("/r/habits", { title: h.title, goal_id: goal.id, description: `Minimum: ${h.minimum}`, life_area_id: goal.life_area_id });
      }, { success: "Added to your goal" })
      .catch(() => {});
    onClose();
    setDraft(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Break down this goal" wide>
      {status.data && !status.data.configured ? (
        <div className="col gap-12">
          <p>The AI assistant isn't configured on this server, so automatic breakdown is unavailable.</p>
          <p className="small muted">You can still break the goal down yourself: add 3–6 milestones, then one concrete next task for the first milestone. The administrator can enable AI by setting <code>ANTHROPIC_API_KEY</code>.</p>
        </div>
      ) : !draft ? (
        <div className="col gap-12">
          <p className="small muted">The assistant drafts milestones, next actions and supporting habits. Nothing is added until you review and accept it.</p>
          <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything it should know? e.g. I can study 1h on weekdays, exams start in 6 weeks." aria-label="Notes for the assistant" />
          {error && <div className="form-error" role="alert">{error}</div>}
          <Button variant="primary" onClick={generate} loading={loading}>
            <Sparkles size={15} aria-hidden /> Draft a plan
          </Button>
        </div>
      ) : (
        <div className="col gap-16">
          <p className="badge info" style={{ height: "auto", padding: "6px 10px", whiteSpace: "normal" }}>
            AI-generated draft — edit anything, untick what you don't want.
          </p>
          <p className="small">{draft.summary}</p>
          <DraftSection title="Milestones">
            {draft.milestones.map((m, i) => (
              <DraftRow key={i} checked={!!pick[`m${i}`]} onCheck={(v) => setPick((p) => ({ ...p, [`m${i}`]: v }))}>
                <input className="input" value={m.title} onChange={(e) => edit("milestones", i, "title", e.target.value)} aria-label="Milestone" />
              </DraftRow>
            ))}
          </DraftSection>
          <DraftSection title="Next actions">
            {draft.tasks.map((t, i) => (
              <DraftRow key={i} checked={!!pick[`t${i}`]} onCheck={(v) => setPick((p) => ({ ...p, [`t${i}`]: v }))}>
                <div className="col gap-4 grow">
                  <input className="input" value={t.title} onChange={(e) => edit("tasks", i, "title", e.target.value)} aria-label="Task" />
                  <span className="tiny muted">
                    ~{t.estimate_min} min · {t.priority} · first step: {t.first_step}
                  </span>
                </div>
              </DraftRow>
            ))}
          </DraftSection>
          {draft.habits.length > 0 && (
            <DraftSection title="Supporting habits">
              {draft.habits.map((h, i) => (
                <DraftRow key={i} checked={!!pick[`h${i}`]} onCheck={(v) => setPick((p) => ({ ...p, [`h${i}`]: v }))}>
                  <div className="col gap-4 grow">
                    <input className="input" value={h.title} onChange={(e) => edit("habits", i, "title", e.target.value)} aria-label="Habit" />
                    <span className="tiny muted">Minimum: {h.minimum}</span>
                  </div>
                </DraftRow>
              ))}
            </DraftSection>
          )}
          {draft.risks.length > 0 && (
            <DraftSection title="Risks to plan for">
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {draft.risks.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </DraftSection>
          )}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Button onClick={() => setDraft(null)}>Start over</Button>
            <Button variant="primary" onClick={accept} loading={mut.pending}>
              Add selected
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function DraftSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      <div className="col gap-8">{children}</div>
    </section>
  );
}
function DraftRow({ checked, onCheck, children }: { checked: boolean; onCheck: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="row top">
      <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} style={{ marginTop: 10, accentColor: "var(--accent)" }} aria-label="Include" />
      {children}
    </div>
  );
}
