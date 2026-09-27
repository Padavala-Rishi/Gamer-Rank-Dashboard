import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Pencil, Plus } from "lucide-react";
import { useApi, useDocumentTitle, useMutate } from "../lib/hooks";
import type { GoalView, LifeArea, Value, Vision } from "../lib/types";
import { Async, Button, Card, PageHeader } from "../components/ui";
import { FormModal } from "../components/ResourceForm";
import { lifeAreaFields, valueFields } from "../lib/fields";
import { LIFE_AREA_FOCUS, label } from "../../shared/constants";
import { put } from "../lib/api";

interface CompassData {
  vision: Vision;
  values: (Value & { goal_count: number })[];
  areas: (LifeArea & { goal_count: number })[];
  goals: GoalView[];
}

const VISION_FIELDS: [keyof Vision, string, string][] = [
  ["identity", "Who do I want to become?", "Describe the person — character, habits, how you treat people."],
  ["ideal_life", "What kind of life do I want?", ""],
  ["what_matters", "What matters most?", ""],
  ["non_negotiables", "What do I refuse to compromise?", ""],
  ["success_definition", "What does success mean to me?", ""],
  ["regrets", "What would I regret not doing?", ""],
  ["current_reality", "Where am I now?", ""],
  ["constraints", "What limits me?", ""],
];

const LOOP: [string, string, string][] = [
  ["Vision", "/compass", "Who you're becoming"],
  ["Goals", "/goals", "What matters most"],
  ["Plan", "/?plan=today", "What to do today"],
  ["Execute", "/focus", "Do the work"],
  ["Measure", "/analytics", "Are you progressing?"],
  ["Reflect", "/reviews", "What happened?"],
  ["Adapt", "/assistant?tab=audit", "What should change?"],
];

export default function Compass() {
  useDocumentTitle("Compass");
  const q = useApi<CompassData>("/compass");
  const [editingVision, setEditingVision] = useState(false);
  const [value, setValue] = useState<Record<string, unknown> | null>(null);
  const [area, setArea] = useState<Record<string, unknown> | null>(null);
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <PageHeader title="Compass" subtitle="Vision, values and the areas of your life. Everything else in the app should trace back to here." />
      <nav aria-label="The Human OS loop" className="card card-pad" style={{ marginBottom: "var(--space)" }}>
        <div className="row wrap" style={{ gap: 6 }}>
          {LOOP.map(([l, to, hint], i) => (
            <span key={l} className="row gap-4">
              <Link to={to} className="chip" title={hint} style={{ textDecoration: "none" }}>
                {l}
              </Link>
              {i < LOOP.length - 1 && <ArrowRight size={13} className="muted" aria-hidden />}
            </span>
          ))}
          <ArrowRight size={13} className="muted" aria-hidden />
          <span className="small muted">and back to Vision</span>
        </div>
      </nav>
      <Async q={q}>
        {(d) => (
          <div className="col gap-16">
            <Card title="Vision" actions={!editingVision && <Button size="sm" onClick={() => setEditingVision(true)}><Pencil size={14} aria-hidden /> Edit</Button>}>
              {editingVision ? <VisionEditor vision={d.vision} onDone={() => setEditingVision(false)} /> : <VisionView vision={d.vision} onEdit={() => setEditingVision(true)} />}
            </Card>
            <div className="grid grid-2">
              <Card title="Values" actions={<Button size="sm" variant="ghost" onClick={() => setValue({ sort_order: d.values.length })}><Plus size={14} aria-hidden /> Value</Button>}>
                {d.values.length === 0 ? (
                  <p className="small muted">Name the 3–7 values you want to live by. Goals can then be linked to them, and the app will point out values no goal serves.</p>
                ) : (
                  <div className="list">
                    {d.values.map((v) => (
                      <button key={v.id} className="item clickable" style={{ background: "none", border: 0, borderBottom: "1px solid var(--border)", width: "100%", textAlign: "left" }} onClick={() => setValue(v as unknown as Record<string, unknown>)}>
                        <span className="grow">
                          <span className="item-title">{v.name}</span>
                          {v.description && <span className="meta serif"><span>{v.description}</span></span>}
                        </span>
                        <span className={`small ${v.goal_count ? "muted" : ""}`} style={!v.goal_count ? { color: "var(--warn)" } : undefined}>
                          {v.goal_count ? `${v.goal_count} goal${v.goal_count === 1 ? "" : "s"}` : "No active goal"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
              <Card title="Life areas" actions={<Button size="sm" variant="ghost" onClick={() => setArea({ sort_order: d.areas.length })}><Plus size={14} aria-hidden /> Area</Button>}>
                <div className="list">
                  {d.areas.map((a) => (
                    <button key={a.id} className="item clickable" style={{ background: "none", border: 0, borderBottom: "1px solid var(--border)", width: "100%", textAlign: "left", opacity: a.archived ? 0.5 : 1 }} onClick={() => setArea(a as unknown as Record<string, unknown>)}>
                      <span className="dot" style={{ background: a.color }} aria-hidden />
                      <span className="grow item-title">{a.name}</span>
                      <span className="small muted">{a.goal_count} goals</span>
                      <span className={`badge ${a.focus === "attention" ? "warn" : a.focus === "thriving" ? "good" : ""}`}>{label(LIFE_AREA_FOCUS, a.focus)}</span>
                    </button>
                  ))}
                </div>
                <p className="tiny muted mt-8">
                  Personal development areas (communication, discipline, confidence…) live in <Link to="/career">Career & growth</Link>.
                </p>
              </Card>
            </div>
          </div>
        )}
      </Async>
      <FormModal open={value !== null} onClose={() => setValue(null)} title={value?.id ? "Edit value" : "New value"} resource="values" fields={valueFields} initial={value ?? {}} />
      <FormModal open={area !== null} onClose={() => setArea(null)} title={area?.id ? "Edit life area" : "New life area"} resource="life-areas" fields={lifeAreaFields} initial={area ?? {}} deleteConfirm={{ title: "Delete this life area?", body: "Goals, tasks and habits in it are kept but unassigned. Archiving hides it instead." }} />
    </div>
  );
}

function VisionView({ vision, onEdit }: { vision: Vision; onEdit: () => void }) {
  const filled = VISION_FIELDS.filter(([k]) => vision[k]);
  if (!filled.length)
    return (
      <div className="col gap-8">
        <p className="muted">Your vision isn't written yet. It's the “why” your goals and daily plans come back to.</p>
        <Button variant="primary" onClick={onEdit} style={{ alignSelf: "flex-start" }}>
          Write my vision
        </Button>
      </div>
    );
  return (
    <div className="grid grid-2" style={{ gap: 20 }}>
      {filled.map(([k, q]) => (
        <div key={k}>
          <div className="tiny muted strong" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {q}
          </div>
          <p className="serif pre-wrap mt-4" style={{ fontSize: 15.5, lineHeight: 1.6 }}>
            {vision[k]}
          </p>
        </div>
      ))}
    </div>
  );
}

function VisionEditor({ vision, onDone }: { vision: Vision; onDone: () => void }) {
  const [v, setV] = useState<Vision>(vision);
  const mut = useMutate();
  useEffect(() => setV(vision), [vision]);
  const save = async () => {
    const payload = Object.fromEntries(VISION_FIELDS.map(([k]) => [k, v[k] ?? null]));
    await mut.run(() => put("/vision", payload), { success: "Vision saved" }).catch(() => {});
    onDone();
  };
  return (
    <div className="col gap-16">
      {VISION_FIELDS.map(([k, q, hint]) => (
        <label key={k} className="col gap-4">
          <span className="prompt-q">{q}</span>
          {hint && <span className="small muted">{hint}</span>}
          <textarea className="textarea serif" rows={3} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} maxLength={4000} />
        </label>
      ))}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" onClick={save} loading={mut.pending}>
          Save vision
        </Button>
      </div>
    </div>
  );
}
