import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, Star, Target } from "lucide-react";
import { useApi, useDocumentTitle, useResource, useToday } from "../lib/hooks";
import type { GoalView, Value } from "../lib/types";
import { Async, Button, Empty, PageHeader, Seg, Tabs } from "../components/ui";
import { FormModal } from "../components/ResourceForm";
import { goalFields } from "../lib/fields";
import { AreaTag, GoalProgressLine, useLookups } from "../components/entities";
import { GOAL_HORIZONS, HORIZON_ORDER, label } from "../../shared/constants";
import { fmtDate } from "../lib/format";

export default function Goals() {
  useDocumentTitle("Goals");
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState("active");
  const [group, setGroup] = useState<"tree" | "horizon" | "area">("tree");
  const q = useApi<GoalView[]>("/goals/overview");
  const lk = useLookups();

  useEffect(() => {
    if (params.get("new")) {
      setCreating({});
      params.delete("new");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const goals = useMemo(() => (q.data ?? []).filter((g) => (status === "all" ? true : g.status === status)), [q.data, status]);
  const focusCount = (q.data ?? []).filter((g) => g.is_focus && g.status === "active").length;

  return (
    <div className="page">
      <PageHeader
        title="Goals"
        subtitle="Vision → long-term → yearly → quarterly → monthly → weekly → projects → tasks."
        actions={
          <>
            <Seg label="Group by" value={group} onChange={setGroup} options={[["tree", "Hierarchy"], ["horizon", "Horizon"], ["area", "Life area"]]} />
            <Button variant="primary" onClick={() => setCreating({})}>
              <Target size={16} aria-hidden /> New goal
            </Button>
          </>
        }
      />
      {focusCount > 3 && (
        <div className="badge warn" style={{ height: "auto", padding: "8px 12px", marginBottom: 12, whiteSpace: "normal" }}>
          You have {focusCount} focus goals. Focus works best with 1–3 — consider pausing some.
        </div>
      )}
      <Tabs label="Goal status" value={status} onChange={setStatus} options={[["active", "Active"], ["paused", "Paused"], ["achieved", "Achieved"], ["dropped", "Dropped"], ["all", "All"]]} />
      <Async q={q}>
        {() =>
          goals.length === 0 ? (
            <div className="card">
              <Empty icon={<Target size={20} />} title="No goals here" action={<Button variant="primary" onClick={() => setCreating({})}>Create a goal</Button>}>
                Start with one meaningful goal. Write why it matters, set a deadline, and link it to a value.
              </Empty>
            </div>
          ) : group === "tree" ? (
            <div className="card card-pad">
              <Tree goals={goals} all={q.data ?? []} onAddChild={(g) => setCreating({ parent_id: g.id, life_area_id: g.life_area_id, horizon: nextHorizon(g.horizon) })} />
            </div>
          ) : group === "horizon" ? (
            <div className="col gap-16">
              {GOAL_HORIZONS.map(([h, l]) => {
                const gs = goals.filter((g) => g.horizon === h);
                if (!gs.length) return null;
                return (
                  <section key={h}>
                    <h2 className="section-title">{l}</h2>
                    <div className="grid grid-auto">{gs.map((g) => <GoalCard key={g.id} g={g} />)}</div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="col gap-16">
              {[...lk.areas, null].map((a) => {
                const gs = goals.filter((g) => (a ? g.life_area_id === a.id : !g.life_area_id));
                if (!gs.length) return null;
                return (
                  <section key={a?.id ?? "none"}>
                    <h2 className="section-title row">{a ? <AreaTag area={a} /> : "No life area"}</h2>
                    <div className="grid grid-auto">{gs.map((g) => <GoalCard key={g.id} g={g} />)}</div>
                  </section>
                );
              })}
            </div>
          )
        }
      </Async>
      <FormModal open={creating !== null} onClose={() => setCreating(null)} title="New goal" resource="goals" fields={goalFields} initial={creating ?? {}} wide />
    </div>
  );
}

function nextHorizon(h: string): string {
  const order = GOAL_HORIZONS.map((x) => x[0]) as string[];
  return order[Math.min(order.length - 1, order.indexOf(h) + 1)];
}

function Tree({ goals, all, onAddChild }: { goals: GoalView[]; all: GoalView[]; onAddChild: (g: GoalView) => void }) {
  const ids = new Set(goals.map((g) => g.id));
  // A goal is a root if its parent isn't in the current (filtered) set.
  const roots = goals.filter((g) => !g.parent_id || !ids.has(g.parent_id)).sort((a, b) => HORIZON_ORDER[a.horizon] - HORIZON_ORDER[b.horizon]);
  const children = (id: string) => goals.filter((g) => g.parent_id === id).sort((a, b) => HORIZON_ORDER[a.horizon] - HORIZON_ORDER[b.horizon]);
  void all;
  const Node = ({ g, depth }: { g: GoalView; depth: number }) => (
    <div>
      <GoalRow g={g} onAddChild={depth < 5 ? () => onAddChild(g) : undefined} />
      {children(g.id).length > 0 && (
        <div className="tree-children">
          {children(g.id).map((c) => (
            <Node key={c.id} g={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
  return (
    <div className="col gap-4">
      {roots.map((g) => (
        <Node key={g.id} g={g} depth={0} />
      ))}
    </div>
  );
}

function GoalRow({ g, onAddChild }: { g: GoalView; onAddChild?: () => void }) {
  const today = useToday();
  return (
    <div className="item" style={{ alignItems: "flex-start" }}>
      <div className="grow col gap-4">
        <div className="row wrap gap-8">
          {g.is_focus && <Star size={14} fill="currentColor" style={{ color: "var(--warn)" }} aria-label="Focus goal" />}
          <Link to={`/goals/${g.id}`} className="strong" style={{ textDecoration: "none" }}>
            {g.title}
          </Link>
          <span className="badge">{label(GOAL_HORIZONS, g.horizon).split(" ")[0]}</span>
          {g.deadline && <span className="small muted">by {fmtDate(g.deadline, today)}</span>}
        </div>
        <div style={{ maxWidth: 420 }}>
          <GoalProgressLine goal={g} />
        </div>
      </div>
      {onAddChild && (
        <Button size="sm" variant="ghost" onClick={onAddChild} title="Break down into a sub-goal">
          + Sub-goal
        </Button>
      )}
      <Link to={`/goals/${g.id}`} className="btn btn-sm btn-ghost btn-icon" aria-label={`Open ${g.title}`}>
        <ChevronRight size={15} />
      </Link>
    </div>
  );
}

function GoalCard({ g }: { g: GoalView }) {
  const today = useToday();
  const values = useResource<Value>("values");
  const vals = (values.data ?? []).filter((v) => g.value_ids.includes(v.id));
  return (
    <Link to={`/goals/${g.id}`} className="card card-pad col gap-8" style={{ textDecoration: "none" }}>
      <div className="row between top">
        <h3 className="clamp-2">{g.title}</h3>
        {g.is_focus && <Star size={14} fill="currentColor" style={{ color: "var(--warn)", flex: "none" }} aria-label="Focus goal" />}
      </div>
      {g.why && <p className="small muted clamp-2 serif">{g.why}</p>}
      <GoalProgressLine goal={g} />
      <div className="meta">
        {g.deadline && <span>Due {fmtDate(g.deadline, today)}</span>}
        <span>{g.tasks_total} tasks</span>
        {g.milestones_total > 0 && (
          <span>
            {g.milestones_done}/{g.milestones_total} milestones
          </span>
        )}
        {vals.map((v) => (
          <span key={v.id} className="badge accent">
            {v.name}
          </span>
        ))}
      </div>
    </Link>
  );
}
