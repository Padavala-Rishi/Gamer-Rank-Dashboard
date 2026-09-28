import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CalendarClock, GraduationCap, Layers, Play, Plus } from "lucide-react";
import { useApi, useDocumentTitle, useResource, useToday } from "../lib/hooks";
import type { Assessment, Subject, Topic } from "../lib/types";
import { Async, Button, Card, Empty, PageHeader, Progress } from "../components/ui";
import { FormModal } from "../components/ResourceForm";
import { assessmentFields, subjectFields } from "../lib/fields";
import { ASSESSMENT_KINDS, MASTERY_LEVELS, label } from "../../shared/constants";
import { fmtDate, fmtMin, relDays } from "../lib/format";
import { addDays, diffDays } from "../../shared/dates";

interface Overview {
  subjects: (Subject & { topic_count: number; mastered: number; mastery: number | null; week_min: number; cards_due: number; card_count: number; next_assessment: Assessment | null })[];
  upcoming_assessments: Assessment[];
  cards_due_total: number;
  week_start: string;
}

export default function Learning() {
  useDocumentTitle("Learning");
  const q = useApi<Overview>("/learning/overview");
  const topics = useResource<Topic>("topics");
  const [newSubject, setNewSubject] = useState(false);
  const [assess, setAssess] = useState<Record<string, unknown> | null>(null);
  const today = useToday();

  const subjectName = (id: string | null | undefined) => q.data?.subjects.find((s) => s.id === id)?.title ?? "";
  const revision = (topics.data ?? [])
    .filter((t) => t.mastery < 4)
    .map((t) => {
      const due = t.next_review ?? (t.last_studied ? addDays(t.last_studied, 7 + t.mastery * 5) : null);
      return { t, due };
    })
    .filter((x) => x.due && x.due <= addDays(today, 7))
    .sort((a, b) => a.due!.localeCompare(b.due!))
    .slice(0, 10);

  return (
    <div className="page">
      <PageHeader
        title="Learning"
        subtitle="Learning goal → subject → topics → resources → study sessions → assessments → mastery."
        actions={
          <>
            <Link className="btn" to="/focus?kind=study">
              <Play size={15} aria-hidden /> Study session
            </Link>
            <Link className={`btn ${q.data?.cards_due_total ? "btn-primary" : ""}`} to="/learning/review">
              <Layers size={15} aria-hidden /> Review cards{q.data?.cards_due_total ? ` (${q.data.cards_due_total})` : ""}
            </Link>
            <Button onClick={() => setNewSubject(true)}>
              <Plus size={15} aria-hidden /> Subject
            </Button>
          </>
        }
      />
      <Async q={q}>
        {(d) =>
          d.subjects.length === 0 ? (
            <div className="card">
              <Empty icon={<GraduationCap size={20} />} title="Nothing to study yet" action={<Button variant="primary" onClick={() => setNewSubject(true)}>Add a subject or course</Button>}>
                Add a subject, break it into topics, and track your mastery as you study.
              </Empty>
            </div>
          ) : (
            <div className="dash">
              <div className="grid grid-auto" style={{ alignContent: "start" }}>
                {d.subjects.map((s) => {
                  const target = s.weekly_target_min ?? 0;
                  return (
                    <Link key={s.id} to={`/learning/${s.id}`} className="card card-pad col gap-8" style={{ textDecoration: "none", borderTop: `3px solid ${s.color ?? "var(--accent)"}` }}>
                      <div className="row between top">
                        <h2 className="clamp-2">{s.title}</h2>
                        <span className="badge">{s.kind === "course" ? "Course" : "Subject"}</span>
                      </div>
                      <div className="small muted">
                        {s.topic_count ? `${s.mastered}/${s.topic_count} topics mastered` : "No topics yet"}
                        {s.mastery != null ? ` · ${Math.round(s.mastery * 100)}% overall mastery` : ""}
                      </div>
                      <Progress value={s.mastery ?? 0} label={`${s.title} mastery`} />
                      <div className="meta">
                        <span>
                          This week: {fmtMin(s.week_min)}
                          {target ? ` / ${fmtMin(target)}` : ""}
                        </span>
                        {s.cards_due > 0 && <span className="today">{s.cards_due} cards due</span>}
                        {s.next_assessment && (
                          <span className={diffDays(today, s.next_assessment.due_date) <= 3 ? "overdue" : ""}>
                            {label(ASSESSMENT_KINDS, s.next_assessment.kind)} {relDays(s.next_assessment.due_date, today)}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
              <div className="col" style={{ gap: "var(--space)" }}>
                <Card title="Exams & assignments" icon={<CalendarClock size={16} aria-hidden />} actions={<Button size="sm" variant="ghost" onClick={() => setAssess({})}><Plus size={15} aria-hidden /> Add</Button>}>
                  {d.upcoming_assessments.length === 0 ? (
                    <p className="small muted">No upcoming exams or deadlines.</p>
                  ) : (
                    <div className="list">
                      {d.upcoming_assessments.map((a) => {
                        const days = diffDays(today, a.due_date);
                        return (
                          <button key={a.id} className="item clickable" style={{ background: "none", border: 0, borderBottom: "1px solid var(--border)", width: "100%", textAlign: "left" }} onClick={() => setAssess(a as unknown as Record<string, unknown>)}>
                            <div className="grow">
                              <div className="item-title">{a.title}</div>
                              <div className="meta">
                                <span>{label(ASSESSMENT_KINDS, a.kind)}</span>
                                <span>{subjectName(a.subject_id)}</span>
                                {a.weight != null && <span>{a.weight}% of grade</span>}
                              </div>
                            </div>
                            <span className={`badge ${days < 0 ? "bad" : days <= 3 ? "warn" : ""}`}>{days < 0 ? "Past" : fmtDate(a.due_date, today)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Card>
                <Card title="Revision schedule" icon={<BookOpen size={16} aria-hidden />}>
                  {revision.length === 0 ? (
                    <p className="small muted">Nothing due for revision this week. Topics come back based on their mastery and when you last studied them.</p>
                  ) : (
                    <div className="list">
                      {revision.map(({ t, due }) => (
                        <Link key={t.id} to={`/learning/${t.subject_id}`} className="item" style={{ textDecoration: "none" }}>
                          <span className="grow">
                            <span className="item-title">{t.title}</span>
                            <span className="meta">
                              <span>{subjectName(t.subject_id)}</span>
                              <span>{label(MASTERY_LEVELS, String(t.mastery))}</span>
                            </span>
                          </span>
                          <span className={`small ${due! < today ? "" : "muted"}`} style={due! < today ? { color: "var(--bad)" } : undefined}>
                            {fmtDate(due!, today)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )
        }
      </Async>
      <FormModal open={newSubject} onClose={() => setNewSubject(false)} title="New subject or course" resource="subjects" fields={subjectFields} wide />
      <FormModal open={assess !== null} onClose={() => setAssess(null)} title={assess?.id ? "Edit" : "New exam or assignment"} resource="assessments" fields={assessmentFields} initial={assess ?? {}} wide />
    </div>
  );
}
