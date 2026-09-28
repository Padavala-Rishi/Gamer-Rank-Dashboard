import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Award, Briefcase, CheckCircle2, CircleDashed, Pencil, Plus, Sprout } from "lucide-react";
import { useApi, useDocumentTitle, useMutate, useResource, useToday } from "../lib/hooks";
import type { Application, Skill, SkillEvidence } from "../lib/types";
import { Async, Button, Card, Empty, PageHeader, Tabs } from "../components/ui";
import { FormModal } from "../components/ResourceForm";
import { applicationFields, evidenceFields, skillFields } from "../lib/fields";
import { APPLICATION_STATUSES, EVIDENCE_KINDS, label } from "../../shared/constants";
import { fmtDate, fmtMin } from "../lib/format";
import { useLookups } from "../components/entities";

type SkillView = Skill & { priority: number; priority_reasons: string[]; evidence_count: number; recent_practice_min: number; last_evidence: string | null; prerequisites_ready: boolean };

export default function Career() {
  useDocumentTitle("Career & growth");
  const [tab, setTab] = useState<"skills" | "personal" | "applications" | "evidence">("skills");
  const [modal, setModal] = useState<null | { kind: "skill" | "evidence" | "application"; initial: Record<string, unknown> }>(null);
  const forms = {
    skill: { title: "Skill", resource: "skills", fields: skillFields },
    evidence: { title: "Evidence", resource: "skill-evidence", fields: evidenceFields },
    application: { title: "Application", resource: "applications", fields: applicationFields },
  };
  const f = modal ? forms[modal.kind] : null;
  return (
    <div className="page">
      <PageHeader
        title="Career & growth"
        subtitle="Skills you're building, the evidence that proves them, and the opportunities they unlock."
        actions={
          <>
            <Button onClick={() => setModal({ kind: "application", initial: {} })}>
              <Briefcase size={15} aria-hidden /> Application
            </Button>
            <Button variant="primary" onClick={() => setModal({ kind: "skill", initial: { domain: tab === "personal" ? "personal" : "career" } })}>
              <Plus size={15} aria-hidden /> Skill
            </Button>
          </>
        }
      />
      <Tabs
        label="Career sections"
        value={tab}
        onChange={setTab}
        options={[
          ["skills", "Skill tree"],
          ["personal", "Personal development"],
          ["applications", "Applications"],
          ["evidence", "Portfolio & evidence"],
        ]}
      />
      {tab === "skills" && <Skills domain="career" onOpen={(k, i) => setModal({ kind: k, initial: i })} />}
      {tab === "personal" && <Skills domain="personal" onOpen={(k, i) => setModal({ kind: k, initial: i })} />}
      {tab === "applications" && <Applications onOpen={(i) => setModal({ kind: "application", initial: i })} />}
      {tab === "evidence" && <Evidence onOpen={(i) => setModal({ kind: "evidence", initial: i })} />}
      {f && modal && <FormModal open onClose={() => setModal(null)} title={modal.initial.id ? `Edit ${f.title.toLowerCase()}` : `New ${f.title.toLowerCase()}`} resource={f.resource} fields={f.fields} initial={modal.initial} extra={modal.kind === "evidence" ? { skill_id: modal.initial.skill_id } : undefined} wide />}
    </div>
  );
}

function Levels({ current, target }: { current: number; target: number }) {
  return (
    <span className="row gap-4" role="img" aria-label={`Level ${current} of 5, target ${target}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ width: 16, height: 6, borderRadius: 3, background: n <= current ? "var(--accent)" : n <= target ? "color-mix(in oklab, var(--accent) 25%, var(--surface-3))" : "var(--surface-3)" }} />
      ))}
    </span>
  );
}

function Skills({ domain, onOpen }: { domain: "career" | "personal"; onOpen: (k: "skill" | "evidence", initial: Record<string, unknown>) => void }) {
  const q = useApi<SkillView[]>("/skills/overview");
  const lk = useLookups();
  const skills = useMemo(() => (q.data ?? []).filter((s) => s.domain === domain), [q.data, domain]);
  const byId = new Map((q.data ?? []).map((s) => [s.id, s]));
  // Tier = longest prerequisite chain, so foundations appear first.
  const tier = (s: SkillView, seen = new Set<string>()): number => {
    if (seen.has(s.id)) return 0;
    seen.add(s.id);
    const ps = s.prerequisite_ids.map((id) => byId.get(id)).filter(Boolean) as SkillView[];
    return ps.length ? 1 + Math.max(...ps.map((p) => tier(p, seen))) : 0;
  };
  const tiers = new Map<number, SkillView[]>();
  for (const s of skills) tiers.set(tier(s), [...(tiers.get(tier(s)) ?? []), s]);
  const focus = skills.filter((s) => s.priority > 0).slice(0, 3);
  const mut = useMutate();
  return (
    <Async q={q}>
      {() =>
        skills.length === 0 ? (
          <div className="card">
            <Empty icon={domain === "career" ? <Award size={20} /> : <Sprout size={20} />} title={domain === "career" ? "No skills yet" : "No development areas yet"} action={<Button variant="primary" onClick={() => onOpen("skill", { domain })}>Add one</Button>}>
              {domain === "career"
                ? "List the skills your target role needs. Set current and target levels, and link them to a career goal — they'll be prioritised automatically."
                : "Communication, confidence, discipline, emotional intelligence, decision-making… define the qualities you're developing."}
            </Empty>
          </div>
        ) : (
          <div className="col gap-16">
            {focus.length > 0 && (
              <Card title="Focus on next" className="accent">
                <div className="grid grid-3">
                  {focus.map((s) => (
                    <div key={s.id} className="col gap-4">
                      <span className="strong">{s.title}</span>
                      <Levels current={s.current_level} target={s.target_level} />
                      <ul className="small muted" style={{ margin: 0, paddingLeft: 16 }}>
                        {s.priority_reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {[...tiers.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([t, ss]) => (
                <section key={t}>
                  <h2 className="section-title">{t === 0 ? "Foundations" : `Builds on tier ${t}`}</h2>
                  <div className="grid grid-auto">
                    {ss.map((s) => {
                      const goal = s.goal_id ? lk.goal.get(s.goal_id) : null;
                      return (
                        <Card key={s.id}>
                          <div className="col gap-8">
                            <div className="row between top">
                              <div>
                                <h3>{s.title}</h3>
                                {s.category && <span className="small muted">{s.category}</span>}
                              </div>
                              <Button size="sm" variant="ghost" icon aria-label={`Edit ${s.title}`} onClick={() => onOpen("skill", s as unknown as Record<string, unknown>)}>
                                <Pencil size={14} />
                              </Button>
                            </div>
                            <div className="row between">
                              <Levels current={s.current_level} target={s.target_level} />
                              <span className="small muted">
                                {s.current_level} → {s.target_level}
                              </span>
                            </div>
                            <div className="meta">
                              <span>{s.evidence_count} evidence</span>
                              {s.recent_practice_min > 0 && <span>{fmtMin(s.recent_practice_min)} practice (30d)</span>}
                              {goal && <span>→ {goal.title}</span>}
                            </div>
                            {s.prerequisite_ids.length > 0 && (
                              <div className="small">
                                <span className="muted">Needs: </span>
                                {s.prerequisite_ids.map((id) => {
                                  const p = byId.get(id);
                                  if (!p) return null;
                                  const ok = p.current_level >= Math.min(3, p.target_level);
                                  return (
                                    <span key={id} className="row gap-4" style={{ display: "inline-flex", marginRight: 8 }}>
                                      {ok ? <CheckCircle2 size={12} style={{ color: "var(--good)" }} aria-label="ready" /> : <CircleDashed size={12} className="muted" aria-label="not ready" />}
                                      {p.title}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            <div className="row wrap">
                              <Button size="sm" onClick={() => onOpen("evidence", { skill_id: s.id, kind: "practice" })}>
                                Log practice
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => onOpen("evidence", { skill_id: s.id, kind: "project" })}>
                                Add evidence
                              </Button>
                              {s.current_level < 5 && (
                                <Button size="sm" variant="ghost" onClick={() => mut.update("skills", s.id, { current_level: s.current_level + 1 }, { success: `${s.title}: level ${s.current_level + 1}` })}>
                                  Level up
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              ))}
            <p className="tiny muted">Priority = gap to target × importance of the linked goal, lowered when prerequisites aren't ready. Levels are your own honest assessment.</p>
          </div>
        )
      }
    </Async>
  );
}

function Applications({ onOpen }: { onOpen: (i: Record<string, unknown>) => void }) {
  const q = useResource<Application>("applications");
  const today = useToday();
  return (
    <Async q={q}>
      {(apps) =>
        apps.length === 0 ? (
          <div className="card">
            <Empty icon={<Briefcase size={20} />} title="No applications tracked" action={<Button variant="primary" onClick={() => onOpen({})}>Track an application</Button>}>
              Keep every opportunity, its next step and your contacts in one place.
            </Empty>
          </div>
        ) : (
          <div className="kanban" style={{ gridTemplateColumns: "repeat(6, minmax(200px, 1fr))" }}>
            {APPLICATION_STATUSES.map(([st, l]) => (
              <section key={st} className="kanban-col">
                <h3 className="row between" style={{ padding: "2px 4px 10px" }}>
                  {l} <span className="muted small">{apps.filter((a) => a.status === st).length}</span>
                </h3>
                {apps
                  .filter((a) => a.status === st)
                  .map((a) => (
                    <button key={a.id} className="kanban-card" style={{ width: "100%", textAlign: "left", cursor: "pointer" }} onClick={() => onOpen(a as unknown as Record<string, unknown>)}>
                      <div className="strong">{a.company}</div>
                      <div className="small muted">{a.role}</div>
                      {a.next_step && (
                        <div className={`tiny mt-4 ${a.next_step_on && a.next_step_on < today ? "" : "muted"}`} style={a.next_step_on && a.next_step_on < today ? { color: "var(--bad)" } : undefined}>
                          Next: {a.next_step}
                          {a.next_step_on ? ` · ${fmtDate(a.next_step_on, today)}` : ""}
                        </div>
                      )}
                    </button>
                  ))}
              </section>
            ))}
          </div>
        )
      }
    </Async>
  );
}

function Evidence({ onOpen }: { onOpen: (i: Record<string, unknown>) => void }) {
  const q = useResource<SkillEvidence>("skill-evidence");
  const skills = useResource<Skill>("skills");
  const today = useToday();
  const name = (id: string) => skills.data?.find((s) => s.id === id)?.title ?? "";
  return (
    <Async q={q}>
      {(ev) =>
        ev.length === 0 ? (
          <div className="card">
            <Empty icon={<Award size={20} />} title="No evidence yet">
              Projects, certifications, practice sessions and feedback — proof of competence you can show in interviews. Add it from a skill.
            </Empty>
          </div>
        ) : (
          <Card>
            <div className="list">
              {ev.map((e) => (
                <button key={e.id} className="item clickable" style={{ background: "none", border: 0, borderBottom: "1px solid var(--border)", width: "100%", textAlign: "left" }} onClick={() => onOpen(e as unknown as Record<string, unknown>)}>
                  <span className="badge">{label(EVIDENCE_KINDS, e.kind)}</span>
                  <span className="grow">
                    <span className="item-title">{e.title}</span>
                    <span className="meta">
                      <span>{name(e.skill_id)}</span>
                      {e.minutes ? <span>{fmtMin(e.minutes)}</span> : null}
                      {e.url && <span>{new URL(e.url).hostname}</span>}
                    </span>
                  </span>
                  <span className="small muted">{fmtDate(e.occurred_on, today)}</span>
                </button>
              ))}
            </div>
            <p className="tiny muted mt-12">
              Your target roles live in <Link to="/goals">Goals</Link> (Career area). Networking contacts live in <Link to="/people">People</Link>.
            </p>
          </Card>
        )
      }
    </Async>
  );
}
