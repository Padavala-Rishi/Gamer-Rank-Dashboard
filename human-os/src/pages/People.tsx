import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Gift, HeartHandshake, MessageCircle, Pencil, Plus, Star, Users } from "lucide-react";
import { useApi, useDocumentTitle, useMutate, useResource, useToday } from "../lib/hooks";
import type { Interaction, Person } from "../lib/types";
import { Async, Button, Card, Empty, Modal, PageHeader } from "../components/ui";
import { FormModal, ResourceForm } from "../components/ResourceForm";
import { interactionFields, personFields } from "../lib/fields";
import { INTERACTION_KINDS, RELATIONS, label } from "../../shared/constants";
import { diffDays } from "../../shared/dates";
import { fmtDate } from "../lib/format";

interface Overview {
  to_contact: { id: string; name: string; days: number; important: boolean }[];
  birthdays: { id: string; name: string; date: string; inDays: number }[];
  follow_ups: Person[];
}

export default function People() {
  useDocumentTitle("People");
  const [params, setParams] = useSearchParams();
  const q = useResource<Person>("people");
  const ov = useApi<Overview>("/people/overview");
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [quickLog, setQuickLog] = useState<string | null>(null);
  const today = useToday();

  useEffect(() => {
    const open = params.get("open");
    if (open) {
      setViewing(open);
      params.delete("open");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const person = (q.data ?? []).find((p) => p.id === viewing) ?? null;
  return (
    <div className="page">
      <PageHeader
        title="People"
        subtitle="The relationships that matter — tended on purpose, not scored."
        actions={
          <>
            <Link to="/journal?new=relationships" className="btn">
              <HeartHandshake size={15} aria-hidden /> Relationship check-in
            </Link>
            <Button variant="primary" onClick={() => setEditing({})}>
              <Plus size={15} aria-hidden /> Person
            </Button>
          </>
        }
      />
      <Async q={q}>
        {(people) =>
          people.length === 0 ? (
            <Card>
              <Empty icon={<Users size={20} />} title="Who matters to you?" action={<Button variant="primary" onClick={() => setEditing({})}>Add someone</Button>}>
                Add the people you want to stay close to. Set a gentle rhythm (e.g. every 7 days) and you'll be reminded before they drift.
              </Empty>
            </Card>
          ) : (
            <div className="dash">
              <div className="col" style={{ gap: "var(--space)" }}>
                {RELATIONS.map(([r, l]) => {
                  const ps = people.filter((p) => p.relation === r);
                  if (!ps.length) return null;
                  return (
                    <Card key={r} title={l}>
                      <div className="list">
                        {ps.map((p) => {
                          const since = p.last_interaction ? diffDays(p.last_interaction, today) : null;
                          const overdue = p.contact_every_days != null && (since ?? Infinity) >= p.contact_every_days;
                          return (
                            <div key={p.id} className="item">
                              <button className="grow" style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer" }} onClick={() => setViewing(p.id)}>
                                <span className="row gap-4">
                                  <span className="item-title">{p.name}</span>
                                  {p.important && <Star size={12} fill="currentColor" style={{ color: "var(--warn)" }} aria-label="Important" />}
                                </span>
                                <span className="meta">
                                  <span className={overdue ? "today" : ""}>{since == null ? "No interactions logged" : since === 0 ? "Talked today" : `Last contact ${since} day${since === 1 ? "" : "s"} ago`}</span>
                                  {p.contact_every_days && <span>every {p.contact_every_days}d</span>}
                                  {p.follow_up && <span>Follow up: {p.follow_up}</span>}
                                </span>
                              </button>
                              <Button size="sm" onClick={() => setQuickLog(p.id)}>
                                <MessageCircle size={14} aria-hidden /> Log
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  );
                })}
              </div>
              <div className="col" style={{ gap: "var(--space)" }}>
                <Card title="Reach out" icon={<HeartHandshake size={15} aria-hidden />}>
                  {(ov.data?.to_contact ?? []).length === 0 ? (
                    <p className="small muted">Everyone is within the rhythm you chose.</p>
                  ) : (
                    <div className="list">
                      {ov.data!.to_contact.map((p) => (
                        <div key={p.id} className="item">
                          <span className="grow">
                            {p.name} <span className="small muted">· {p.days} days</span>
                          </span>
                          <Button size="sm" onClick={() => setQuickLog(p.id)}>
                            Log contact
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
                <Card title="Birthdays (30 days)" icon={<Gift size={15} aria-hidden />}>
                  {(ov.data?.birthdays ?? []).length === 0 ? (
                    <p className="small muted">None coming up.</p>
                  ) : (
                    <div className="list">
                      {ov.data!.birthdays.map((b) => (
                        <div key={b.id} className="item">
                          <span className="grow">{b.name}</span>
                          <span className="small muted">{b.inDays === 0 ? "Today 🎉" : `${fmtDate(b.date, today)} (in ${b.inDays}d)`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )
        }
      </Async>
      <FormModal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? "Edit person" : "Add a person"} resource="people" fields={personFields} initial={editing ?? {}} wide deleteConfirm={{ title: "Remove this person?", body: "Their interaction history is deleted too." }} />
      <Modal open={quickLog !== null} onClose={() => setQuickLog(null)} title={`Log contact with ${(q.data ?? []).find((p) => p.id === quickLog)?.name ?? ""}`}>
        {quickLog && <ResourceForm resource="interactions" fields={interactionFields} extra={{ person_id: quickLog }} onDone={() => setQuickLog(null)} submitLabel="Log" />}
      </Modal>
      {person && <PersonView p={person} onClose={() => setViewing(null)} onEdit={() => { setEditing(person as unknown as Record<string, unknown>); setViewing(null); }} />}
    </div>
  );
}

function PersonView({ p, onClose, onEdit }: { p: Person; onClose: () => void; onEdit: () => void }) {
  const q = useResource<Interaction>("interactions", { person_id: p.id });
  const [logging, setLogging] = useState(false);
  const mut = useMutate();
  const today = useToday();
  return (
    <Modal open onClose={onClose} title={p.name} wide>
      <div className="col gap-16">
        <div className="row wrap">
          <span className="badge">{label(RELATIONS, p.relation)}</span>
          {p.birthday && <span className="badge">🎂 {p.birthday.startsWith("--") ? p.birthday.slice(2) : fmtDate(p.birthday, undefined, { year: true })}</span>}
          {p.contact_every_days && <span className="badge">Every {p.contact_every_days} days</span>}
          {p.how_to_reach && <span className="small muted">{p.how_to_reach}</span>}
        </div>
        {p.follow_up && (
          <div className="card flat card-pad row between wrap">
            <span>
              <strong>Follow up:</strong> {p.follow_up}
            </span>
            <Button size="sm" onClick={() => mut.update("people", p.id, { follow_up: null }, { success: "Follow-up cleared" })}>
              Done
            </Button>
          </div>
        )}
        {p.notes && <p className="pre-wrap small">{p.notes}</p>}
        <div className="row between">
          <h3>Interactions</h3>
          <Button size="sm" onClick={() => setLogging((l) => !l)}>
            <Plus size={14} aria-hidden /> Log
          </Button>
        </div>
        {logging && <ResourceForm resource="interactions" fields={interactionFields} extra={{ person_id: p.id }} onDone={() => setLogging(false)} submitLabel="Log" />}
        <div className="list">
          {(q.data ?? []).map((i) => (
            <div key={i.id} className="item">
              <span className="small muted" style={{ width: 90 }}>
                {fmtDate(i.occurred_on, today)}
              </span>
              <span className="badge">{label(INTERACTION_KINDS, i.kind)}</span>
              <span className="grow small">{i.note}</span>
            </div>
          ))}
          {(q.data ?? []).length === 0 && <p className="small muted">No interactions logged yet.</p>}
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button onClick={onEdit}>
            <Pencil size={14} aria-hidden /> Edit
          </Button>
        </div>
      </div>
    </Modal>
  );
}
