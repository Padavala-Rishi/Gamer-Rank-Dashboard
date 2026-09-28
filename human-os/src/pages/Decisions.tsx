import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Scale as ScaleIcon } from "lucide-react";
import { useDocumentTitle, useResource, useToday } from "../lib/hooks";
import type { Decision, DecisionReview } from "../lib/types";
import { Async, Button, Card, Empty, Modal, PageHeader, Tabs } from "../components/ui";
import { FormModal, ResourceForm } from "../components/ResourceForm";
import { decisionFields, decisionReviewFields } from "../lib/fields";
import { fmtDate } from "../lib/format";
import { get } from "../lib/api";

const OUTCOME: Record<string, string> = { better: "Better than expected", as_expected: "As expected", mixed: "Mixed", worse: "Worse than expected" };

export default function Decisions() {
  useDocumentTitle("Decision journal");
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<"open" | "reviewed">("open");
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [viewing, setViewing] = useState<Decision | null>(null);
  const q = useResource<Decision>("decisions");
  const reviews = useResource<DecisionReview>("decision-reviews");
  const today = useToday();

  useEffect(() => {
    const open = params.get("open");
    if (!open) return;
    params.delete("open");
    setParams(params, { replace: true });
    get<Decision>(`/r/decisions/${open}`).then(setViewing).catch(() => {});
  }, [params, setParams]);

  const all = q.data ?? [];
  const rv = reviews.data ?? [];
  const reviewed = rv.length;
  const better = rv.filter((r) => r.outcome_vs_expected === "better" || r.outcome_vs_expected === "as_expected").length;
  const same = rv.filter((r) => r.would_decide_same).length;
  const avgConfidence = (() => {
    const ds = all.filter((d) => d.status === "reviewed" && d.confidence != null);
    return ds.length ? Math.round(ds.reduce((a, d) => a + (d.confidence ?? 0), 0) / ds.length) : null;
  })();

  return (
    <div className="page page-narrow" style={{ maxWidth: 960 }}>
      <Link to="/journal" className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}>
        <ArrowLeft size={14} aria-hidden /> Journal
      </Link>
      <PageHeader
        title="Decision journal"
        subtitle="Record the reasoning before you know the outcome. Compare prediction with reality later."
        actions={
          <Button variant="primary" onClick={() => setEditing({})}>
            <Plus size={15} aria-hidden /> New decision
          </Button>
        }
      />
      {reviewed > 0 && (
        <Card className="mt-4" pad>
          <div className="stats-row">
            <div className="stat">
              <span className="stat-label">Decisions reviewed</span>
              <span className="stat-value">{reviewed}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Met or beat expectations</span>
              <span className="stat-value">{Math.round((better / reviewed) * 100)}%</span>
            </div>
            <div className="stat">
              <span className="stat-label">Avg. stated confidence</span>
              <span className="stat-value">{avgConfidence == null ? "—" : `${avgConfidence}%`}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Would decide the same</span>
              <span className="stat-value">{Math.round((same / reviewed) * 100)}%</span>
            </div>
          </div>
          {avgConfidence != null && <p className="tiny muted mt-8">Calibration check: if your stated confidence is much higher than how often outcomes met expectations, you may be overconfident — or vice versa.</p>}
        </Card>
      )}
      <div className="mt-16">
        <Tabs label="Decisions" value={tab} onChange={setTab} options={[["open", `Awaiting review (${all.filter((d) => d.status === "open").length})`], ["reviewed", `Reviewed (${all.filter((d) => d.status === "reviewed").length})`]]} />
      </div>
      <Async q={q}>
        {() => {
          const list = all.filter((d) => d.status === tab);
          return list.length === 0 ? (
            <Card>
              <Empty icon={<ScaleIcon size={20} />} title={tab === "open" ? "No open decisions" : "Nothing reviewed yet"} action={tab === "open" ? <Button variant="primary" onClick={() => setEditing({})}>Record a decision</Button> : undefined}>
                For important choices: write the options, your reasoning, assumptions, and what you expect to happen. Set a date to review.
              </Empty>
            </Card>
          ) : (
            <div className="col gap-12">
              {list.map((d) => (
                <button key={d.id} className="card card-pad col gap-4" style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }} onClick={() => setViewing(d)}>
                  <div className="row between">
                    <span className="strong">{d.title}</span>
                    {d.status === "open" && d.review_on && <span className={`badge ${d.review_on <= today ? "warn" : ""}`}>{d.review_on <= today ? "Ready to review" : `Review ${fmtDate(d.review_on, today)}`}</span>}
                  </div>
                  <span className="small muted">
                    Decided {fmtDate(d.decided_on, today)}
                    {d.chosen ? ` · Chose: ${d.chosen}` : ""}
                    {d.confidence != null ? ` · ${d.confidence}% confident` : ""}
                  </span>
                </button>
              ))}
            </div>
          );
        }}
      </Async>
      <FormModal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? "Edit decision" : "New decision"} resource="decisions" fields={decisionFields} initial={editing ?? {}} wide />
      {viewing && <DecisionView d={viewing} reviews={rv.filter((r) => r.decision_id === viewing.id)} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing as unknown as Record<string, unknown>); setViewing(null); }} />}
    </div>
  );
}

function DecisionView({ d, reviews, onClose, onEdit }: { d: Decision; reviews: DecisionReview[]; onClose: () => void; onEdit: () => void }) {
  const [reviewing, setReviewing] = useState(false);
  const today = useToday();
  const Row = ({ k, v }: { k: string; v: string | null | undefined }) =>
    v ? (
      <div>
        <div className="tiny muted strong" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {k}
        </div>
        <p className="pre-wrap">{v}</p>
      </div>
    ) : null;
  return (
    <Modal open onClose={onClose} title={d.title} wide>
      {reviewing ? (
        <ResourceForm resource="decision-reviews" fields={decisionReviewFields} extra={{ decision_id: d.id }} onDone={() => { setReviewing(false); onClose(); }} submitLabel="Save review" />
      ) : (
        <div className="col gap-12">
          <p className="small muted">
            Decided {fmtDate(d.decided_on, today)} · confidence {d.confidence ?? "—"}%
          </p>
          <div className="grid grid-2">
            <div className="col gap-12">
              <Row k="Context" v={d.context} />
              <Row k="Options" v={d.options} />
              <Row k="Chosen" v={d.chosen} />
              <Row k="Reasoning" v={d.reasoning} />
            </div>
            <div className="col gap-12">
              <Row k="Assumptions" v={d.assumptions} />
              <Row k="Risks" v={d.risks} />
              <Row k="Prediction" v={d.expected_outcome} />
            </div>
          </div>
          {reviews.map((r) => (
            <Card key={r.id} title={`Review · ${fmtDate(r.reviewed_on, today)}`} className="accent">
              <div className="col gap-8">
                <span className="badge">{OUTCOME[r.outcome_vs_expected]}</span>
                <div className="grid grid-2">
                  <div>
                    <div className="tiny muted strong">PREDICTED</div>
                    <p className="pre-wrap small">{d.expected_outcome ?? "—"}</p>
                  </div>
                  <div>
                    <div className="tiny muted strong">ACTUAL</div>
                    <p className="pre-wrap small">{r.actual_outcome ?? "—"}</p>
                  </div>
                </div>
                {r.assumptions_held && <p className="small"><strong>Assumptions:</strong> {r.assumptions_held}</p>}
                {r.lessons && <p className="small"><strong>Lessons:</strong> {r.lessons}</p>}
                {r.would_decide_same != null && <p className="small muted">{r.would_decide_same ? "Would make the same decision again." : "Would decide differently now."}</p>}
              </div>
            </Card>
          ))}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Button onClick={onEdit}>Edit</Button>
            <Button variant="primary" onClick={() => setReviewing(true)}>
              Review outcome
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
