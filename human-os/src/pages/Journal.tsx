import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { NotebookPen, Plus, Scale as ScaleIcon, Search, Trash2 } from "lucide-react";
import { useDocumentTitle, useMutate, useResource, useToday } from "../lib/hooks";
import type { Goal, JournalEntry } from "../lib/types";
import { Async, Button, Card, Empty, Field, Modal, PageHeader, Scale, useConfirm } from "../components/ui";
import { JOURNAL_KINDS, JOURNAL_PROMPTS, label } from "../../shared/constants";
import { fmtDate } from "../lib/format";
import { get, ApiError } from "../lib/api";

export default function Journal() {
  useDocumentTitle("Journal");
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<JournalEntry> | null>(null);
  const q = useResource<JournalEntry>("journal", { kind, q: search.trim().length >= 2 ? search.trim() : undefined, limit: 300 });
  const today = useToday();

  useEffect(() => {
    const n = params.get("new");
    const open = params.get("open");
    if (n) {
      setEditing({ kind: (JOURNAL_KINDS.some(([k]) => k === n) ? n : "free") as JournalEntry["kind"], entry_date: today, goal_id: params.get("goal") ?? null, answers: {} });
      params.delete("new");
      params.delete("goal");
      setParams(params, { replace: true });
    } else if (open) {
      params.delete("open");
      setParams(params, { replace: true });
      get<JournalEntry>(`/r/journal/${open}`).then(setEditing).catch(() => {});
    }
  }, [params, setParams, today]);

  return (
    <div className="page page-narrow" style={{ maxWidth: 960 }}>
      <PageHeader
        title="Journal"
        subtitle="Reflection that leads to adaptation."
        actions={
          <>
            <Link to="/journal/decisions" className="btn">
              <ScaleIcon size={15} aria-hidden /> Decision journal
            </Link>
            <Link to="/reviews" className="btn">
              Reviews
            </Link>
            <Button variant="primary" onClick={() => setEditing({ kind: "daily", entry_date: today, answers: {} })}>
              <Plus size={15} aria-hidden /> New entry
            </Button>
          </>
        }
      />
      <div className="chips" style={{ marginBottom: 12 }}>
        {JOURNAL_KINDS.map(([k, l]) => (
          <button key={k} className="chip" onClick={() => setEditing({ kind: k, entry_date: today, answers: {} })}>
            + {l}
          </button>
        ))}
      </div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="row" style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={15} className="muted" style={{ position: "absolute", left: 10 }} aria-hidden />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Search your journal" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search journal" />
        </div>
        <select className="select" style={{ width: "auto" }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Entry type">
          <option value="">All types</option>
          {JOURNAL_KINDS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <Async q={q}>
        {(entries) =>
          entries.length === 0 ? (
            <Card>
              <Empty icon={<NotebookPen size={20} />} title={search || kind ? "No matching entries" : "Your journal is empty"} action={<Button variant="primary" onClick={() => setEditing({ kind: "daily", entry_date: today, answers: {} })}>Write today's reflection</Button>}>
                Five minutes in the evening: what went well, what didn't, and what matters tomorrow.
              </Empty>
            </Card>
          ) : (
            <div className="col gap-12">
              {entries.map((e) => {
                const preview = e.body || Object.values(e.answers ?? {}).filter(Boolean).join(" · ");
                return (
                  <button key={e.id} className="card card-pad col gap-4" style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }} onClick={() => setEditing(e)}>
                    <div className="row between">
                      <span className="row">
                        <span className="badge">{label(JOURNAL_KINDS, e.kind)}</span>
                        <span className="strong">{e.title || fmtDate(e.entry_date, today, { weekday: true })}</span>
                      </span>
                      {e.mood && <span className="small muted">Mood {e.mood}/5</span>}
                    </div>
                    <p className="small ink-2 clamp-2 serif">{preview || <span className="muted">Empty entry</span>}</p>
                  </button>
                );
              })}
            </div>
          )
        }
      </Async>
      <EntryEditor entry={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EntryEditor({ entry, onClose }: { entry: Partial<JournalEntry> | null; onClose: () => void }) {
  const [e, setE] = useState<Partial<JournalEntry>>({});
  const [error, setError] = useState<string | null>(null);
  const mut = useMutate();
  const confirm = useConfirm();
  const goals = useResource<Goal>("goals", { status: "active" });
  useEffect(() => {
    if (entry) {
      setE({ answers: {}, ...entry });
      setError(null);
    }
  }, [entry]);
  if (!entry) return null;
  const prompts = JOURNAL_PROMPTS[e.kind ?? "free"] ?? [];
  const setAnswer = (q: string, v: string) => setE((s) => ({ ...s, answers: { ...(s.answers ?? {}), [q]: v } }));
  const save = async () => {
    setError(null);
    const payload = { kind: e.kind, entry_date: e.entry_date, title: e.title || null, body: e.body || null, answers: Object.fromEntries(Object.entries(e.answers ?? {}).filter(([, v]) => v?.trim())), mood: e.mood ?? null, goal_id: e.goal_id || null };
    try {
      if (e.id) await mut.update("journal", e.id, payload, { success: "Saved", silentError: true });
      else await mut.create("journal", payload, { success: "Entry saved", silentError: true });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? Object.values(err.fields ?? {})[0] ?? err.message : "Couldn't save");
    }
  };
  const del = async () => {
    if (!(await confirm({ title: "Delete this entry?", confirm: "Delete", danger: true }))) return;
    await mut.remove("journal", e.id!, {}, { success: "Entry deleted" }).catch(() => {});
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={label(JOURNAL_KINDS, e.kind ?? "free")}
      wide
      footer={
        <>
          {e.id && (
            <Button variant="danger" onClick={del} style={{ marginRight: "auto" }}>
              <Trash2 size={15} aria-hidden /> Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={mut.pending}>
            Save
          </Button>
        </>
      }
    >
      <div className="col gap-16">
        <div className="form-grid">
          <Field label="Date" htmlFor="j-date">
            <input id="j-date" className="input" type="date" value={e.entry_date ?? ""} onChange={(ev) => setE({ ...e, entry_date: ev.target.value })} />
          </Field>
          <Field label="Type" htmlFor="j-kind">
            <select id="j-kind" className="select" value={e.kind} onChange={(ev) => setE({ ...e, kind: ev.target.value as JournalEntry["kind"] })}>
              {JOURNAL_KINDS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          {e.kind === "goal" && (
            <Field label="Goal" full htmlFor="j-goal">
              <select id="j-goal" className="select" value={e.goal_id ?? ""} onChange={(ev) => setE({ ...e, goal_id: ev.target.value || null })}>
                <option value="">— Choose a goal —</option>
                {(goals.data ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        {prompts.map((p, i) => (
          <label key={p} className="col gap-4">
            <span className="prompt-q">{p}</span>
            <textarea className="textarea serif" rows={2} value={e.answers?.[p] ?? ""} onChange={(ev) => setAnswer(p, ev.target.value)} autoFocus={i === 0} />
          </label>
        ))}
        <label className="col gap-4">
          <span className="prompt-q">{prompts.length ? "Anything else?" : "Write freely"}</span>
          <textarea className="textarea serif" rows={prompts.length ? 3 : 10} value={e.body ?? ""} onChange={(ev) => setE({ ...e, body: ev.target.value })} autoFocus={!prompts.length} />
        </label>
        <Field label="Mood">
          <Scale name="Mood" value={e.mood} onChange={(v) => setE({ ...e, mood: v })} labels={["Low", "Great"]} />
        </Field>
        {e.kind === "checkin" && <p className="small muted">This is a reflection tool, not a diagnosis. If you're struggling, reaching out to someone you trust or a mental-health professional is a strong step.</p>}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
