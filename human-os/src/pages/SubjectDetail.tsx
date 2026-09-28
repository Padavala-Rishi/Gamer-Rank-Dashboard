import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Layers, Pencil, Play, Plus } from "lucide-react";
import { useDocumentTitle, useMutate, useOne, useResource, useToday } from "../lib/hooks";
import type { Assessment, Flashcard, FocusSession, LearningResource, Subject, Topic } from "../lib/types";
import { Button, Card, ErrorState, Progress, Skeleton, Stat, Tabs } from "../components/ui";
import { FormModal } from "../components/ResourceForm";
import { assessmentFields, flashcardFields, resourceFields, subjectFields, topicFields } from "../lib/fields";
import { ASSESSMENT_KINDS, MASTERY_LEVELS, RESOURCE_KINDS, RESOURCE_STATUSES, label } from "../../shared/constants";
import { fmtDate, fmtMin } from "../lib/format";
import { LinkedNotes } from "../components/TaskEditor";
import { ApiError } from "../lib/api";

export default function SubjectDetail() {
  const { id } = useParams();
  const q = useOne<Subject>("subjects", id);
  const topics = useResource<Topic>("topics", { subject_id: id ?? "" }, { enabled: !!id });
  const resources = useResource<LearningResource>("resources", { subject_id: id ?? "" }, { enabled: !!id });
  const cards = useResource<Flashcard>("flashcards", { subject_id: id ?? "" }, { enabled: !!id });
  const assessments = useResource<Assessment>("assessments", { subject_id: id ?? "" }, { enabled: !!id });
  const sessions = useResource<FocusSession>("focus-sessions", { subject_id: id ?? "", limit: 50 }, { enabled: !!id });
  const [tab, setTab] = useState<"topics" | "resources" | "cards" | "assessments" | "sessions">("topics");
  const [modal, setModal] = useState<null | { kind: string; initial: Record<string, unknown> }>(null);
  const mut = useMutate();
  const nav = useNavigate();
  const today = useToday();
  useDocumentTitle(q.data?.title ?? "Subject");

  if (q.isLoading) return <div className="page"><Skeleton lines={8} /></div>;
  if (q.error || !q.data) return <div className="page"><ErrorState error={q.error ?? new Error("Not found")} /></div>;
  const s = q.data;
  const ts = topics.data ?? [];
  const mastery = ts.length ? ts.reduce((a, t) => a + t.mastery, 0) / (ts.length * 4) : null;
  const due = (cards.data ?? []).filter((c) => c.due_date <= today).length;
  const totalMin = (sessions.data ?? []).filter((x) => x.status === "completed").reduce((a, x) => a + (x.actual_min ?? 0), 0);

  const studyTopic = async (t: Topic) => {
    try {
      await mut.call("/focus/start", { kind: "study", planned_min: 45, subject_id: s.id, topic_id: t.id, objective: `${s.title}: ${t.title}` }, "POST", { silentError: true });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 409)) return;
    }
    nav("/focus");
  };

  const forms: Record<string, { title: string; resource: string; fields: typeof topicFields }> = {
    subject: { title: "Edit subject", resource: "subjects", fields: subjectFields },
    topic: { title: "Topic", resource: "topics", fields: topicFields },
    resource: { title: "Resource", resource: "resources", fields: resourceFields },
    card: { title: "Flashcard", resource: "flashcards", fields: flashcardFields },
    assessment: { title: "Exam or assignment", resource: "assessments", fields: assessmentFields },
  };
  const form = modal ? forms[modal.kind] : null;

  return (
    <div className="page">
      <Link to="/learning" className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}>
        <ArrowLeft size={14} aria-hidden /> Learning
      </Link>
      <header className="page-header">
        <div>
          <h1>{s.title}</h1>
          <p className="subtitle">{[s.kind === "course" ? "Course" : "Subject", s.provider].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="row wrap">
          {due > 0 && (
            <Link className="btn btn-primary" to={`/learning/review?subject=${s.id}`}>
              <Layers size={15} aria-hidden /> Review {due} cards
            </Link>
          )}
          <Button onClick={() => setModal({ kind: "subject", initial: s as unknown as Record<string, unknown> })}>
            <Pencil size={15} aria-hidden /> Edit
          </Button>
        </div>
      </header>
      <div className="grid grid-4" style={{ marginBottom: "var(--space)" }}>
        <Card pad>
          <Stat label="Mastery" value={mastery == null ? "—" : `${Math.round(mastery * 100)}%`} />
          <div className="mt-8">
            <Progress value={mastery ?? 0} />
          </div>
        </Card>
        <Card pad>
          <Stat label="Topics" value={`${ts.filter((t) => t.mastery >= 4).length}/${ts.length}`} unit="mastered" />
        </Card>
        <Card pad>
          <Stat label="Studied (recent sessions)" value={fmtMin(totalMin)} />
        </Card>
        <Card pad>
          <Stat label="Flashcards" value={(cards.data ?? []).length} delta={due ? `${due} due` : "none due"} />
        </Card>
      </div>
      <Tabs
        label="Subject sections"
        value={tab}
        onChange={setTab}
        options={[
          ["topics", `Topics (${ts.length})`],
          ["resources", `Resources (${(resources.data ?? []).length})`],
          ["cards", `Flashcards (${(cards.data ?? []).length})`],
          ["assessments", `Assessments (${(assessments.data ?? []).length})`],
          ["sessions", "Study log"],
        ]}
      />
      {tab === "topics" && (
        <Card actions={<Button size="sm" onClick={() => setModal({ kind: "topic", initial: { subject_id: s.id, sort_order: ts.length } })}><Plus size={15} aria-hidden /> Topic</Button>} title="Topics & mastery">
          {ts.length === 0 && <p className="small muted">Break the subject into topics (units, chapters, concepts) to track mastery.</p>}
          <div className="list">
            {ts.map((t) => (
              <div key={t.id} className="item wrap" style={{ flexWrap: "wrap" }}>
                <button className="grow" style={{ background: "none", border: 0, textAlign: "left", padding: 0, cursor: "pointer", minWidth: 180 }} onClick={() => setModal({ kind: "topic", initial: t as unknown as Record<string, unknown> })}>
                  <div className="item-title">{t.title}</div>
                  <div className="meta">
                    {t.last_studied && <span>Studied {fmtDate(t.last_studied, today)}</span>}
                    {t.next_review && <span>Revise {fmtDate(t.next_review, today)}</span>}
                  </div>
                </button>
                <select className="select" style={{ width: "auto", minHeight: 30, padding: "2px 8px" }} value={t.mastery} onChange={(e) => mut.update("topics", t.id, { mastery: Number(e.target.value) })} aria-label={`Mastery of ${t.title}`}>
                  {MASTERY_LEVELS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={() => studyTopic(t)}>
                  <Play size={13} aria-hidden /> Study
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
      {tab === "resources" && (
        <Card title="Resources" actions={<Button size="sm" onClick={() => setModal({ kind: "resource", initial: { subject_id: s.id } })}><Plus size={15} aria-hidden /> Resource</Button>}>
          {(resources.data ?? []).length === 0 && <p className="small muted">Books, courses, videos and practice sets for this subject.</p>}
          <div className="list">
            {(resources.data ?? []).map((r) => (
              <div key={r.id} className="item">
                <button className="grow" style={{ background: "none", border: 0, textAlign: "left", padding: 0, cursor: "pointer" }} onClick={() => setModal({ kind: "resource", initial: r as unknown as Record<string, unknown> })}>
                  <div className="item-title">{r.title}</div>
                  <div className="meta">
                    <span>{label(RESOURCE_KINDS, r.kind)}</span>
                  </div>
                </button>
                <select className="select" style={{ width: "auto", minHeight: 30, padding: "2px 8px" }} value={r.status} onChange={(e) => mut.update("resources", r.id, { status: e.target.value })} aria-label={`Status of ${r.title}`}>
                  {RESOURCE_STATUSES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                {r.url && (
                  <a className="btn btn-sm btn-ghost btn-icon" href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${r.title}`}>
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
      {tab === "cards" && (
        <Card title="Flashcards" actions={<Button size="sm" onClick={() => setModal({ kind: "card", initial: { subject_id: s.id } })}><Plus size={15} aria-hidden /> Card</Button>}>
          {(cards.data ?? []).length === 0 && <p className="small muted">Write questions you want to be able to answer from memory. Spaced repetition schedules the reviews.</p>}
          <div className="list">
            {(cards.data ?? []).map((c) => (
              <button key={c.id} className="item clickable" style={{ background: "none", border: 0, borderBottom: "1px solid var(--border)", width: "100%", textAlign: "left" }} onClick={() => setModal({ kind: "card", initial: c as unknown as Record<string, unknown> })}>
                <span className="grow">
                  <span className="item-title">{c.front}</span>
                  <span className="meta">
                    <span>Next review {fmtDate(c.due_date, today)}</span>
                    <span>Interval {c.interval_days}d</span>
                    {c.lapses > 0 && <span>{c.lapses} lapses</span>}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}
      {tab === "assessments" && (
        <Card title="Assessments" actions={<Button size="sm" onClick={() => setModal({ kind: "assessment", initial: { subject_id: s.id } })}><Plus size={15} aria-hidden /> Add</Button>}>
          <div className="list">
            {(assessments.data ?? []).map((a) => (
              <button key={a.id} className="item clickable" style={{ background: "none", border: 0, borderBottom: "1px solid var(--border)", width: "100%", textAlign: "left" }} onClick={() => setModal({ kind: "assessment", initial: a as unknown as Record<string, unknown> })}>
                <span className="grow">
                  <span className="item-title">{a.title}</span>
                  <span className="meta">
                    <span>{label(ASSESSMENT_KINDS, a.kind)}</span>
                    <span>{fmtDate(a.due_date, today)}</span>
                    {a.score != null && a.max_score ? <span>Score {a.score}/{a.max_score} ({Math.round((a.score / a.max_score) * 100)}%)</span> : null}
                  </span>
                </span>
                <span className="badge">{a.status}</span>
              </button>
            ))}
            {(assessments.data ?? []).length === 0 && <p className="small muted">No exams or assignments for this subject.</p>}
          </div>
        </Card>
      )}
      {tab === "sessions" && (
        <Card title="Study sessions">
          <div className="list">
            {(sessions.data ?? []).map((x) => (
              <div key={x.id} className="item">
                <span className="grow">
                  <span className="item-title">{x.objective ?? "Study"}</span>
                  {x.accomplished && <span className="meta"><span>{x.accomplished}</span></span>}
                </span>
                <span className="small muted">{x.local_date}</span>
                <span className="small num">{fmtMin(x.actual_min)}</span>
              </div>
            ))}
            {(sessions.data ?? []).length === 0 && <p className="small muted">Start a study session from a topic to build your study log.</p>}
          </div>
        </Card>
      )}
      <div className="mt-16">
        <LinkedNotes type="subject" id={s.id} />
      </div>
      {form && modal && (
        <FormModal
          open
          onClose={() => setModal(null)}
          title={modal.initial.id ? form.title : `New ${form.title.toLowerCase()}`}
          resource={form.resource}
          fields={form.fields.filter((f) => f.name !== "subject_id")}
          initial={modal.initial}
          extra={{ subject_id: s.id }}
          wide
          onDeleted={modal.kind === "subject" ? () => nav("/learning") : undefined}
          deleteConfirm={modal.kind === "subject" ? { title: "Delete this subject?", body: "Its topics, resources, flashcards and assessments are deleted too." } : undefined}
        />
      )}
    </div>
  );
}
