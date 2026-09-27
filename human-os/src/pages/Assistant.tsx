import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, MessageSquare, Plus, Send, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { useApi, useDocumentTitle, useMutate } from "../lib/hooks";
import { ApiError, get, post } from "../lib/api";
import { Button, Card, Empty, ErrorState, Modal, PageHeader, Skeleton, Tabs, useConfirm } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { AUDIT_AREAS, label } from "../../shared/constants";
import { fmtDate } from "../lib/format";
import { useQueryClient } from "@tanstack/react-query";

interface AiStatus {
  configured: boolean;
  enabled: boolean;
  model: string;
  include_journal: boolean;
}

export default function Assistant() {
  useDocumentTitle("Assistant");
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as "chat" | "audit" | "insights") || "chat";
  const setTab = (t: string) => {
    params.set("tab", t);
    setParams(params, { replace: true });
  };
  const status = useApi<AiStatus>("/ai/status");
  const [preview, setPreview] = useState(false);
  const ready = !!status.data?.configured && !!status.data?.enabled;
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <PageHeader
        title="Assistant"
        subtitle="Help with planning, breaking down goals, spotting bottlenecks and reflecting. It suggests; you decide."
        actions={
          <Button onClick={() => setPreview(true)}>
            <Eye size={15} aria-hidden /> What the AI sees
          </Button>
        }
      />
      {status.data && !status.data.configured && (
        <div className="card card-pad" style={{ marginBottom: 16, background: "var(--info-soft)", color: "var(--info)" }}>
          <strong>AI isn't configured on this server.</strong> Chat and AI interpretation are unavailable. The Life Audit below still works — it uses transparent rules on your own data. To enable AI, the administrator sets <code>ANTHROPIC_API_KEY</code>.
        </div>
      )}
      {status.data?.configured && !status.data.enabled && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          AI features are turned off in your settings. <Link to="/settings?tab=ai">Turn them on</Link>
        </div>
      )}
      <Tabs label="Assistant sections" value={tab} onChange={setTab} options={[["chat", "Chat"], ["audit", "Life audit"], ["insights", "Quick insights"]]} />
      {tab === "chat" && <Chat ready={ready} />}
      {tab === "audit" && <Audit aiReady={ready} />}
      {tab === "insights" && <Insights ready={ready} />}
      <p className="tiny muted mt-24">
        <ShieldCheck size={12} aria-hidden /> The assistant is not a doctor, therapist or financial adviser, and can be wrong. It only sees a summary of your data{status.data?.include_journal ? " (including recent journal entries, which you allowed)" : " — journal text is not shared unless you allow it in Settings"}.
      </p>
      <Modal open={preview} onClose={() => setPreview(false)} title="What the AI sees" wide>
        {preview && <ContextPreview />}
      </Modal>
    </div>
  );
}

function ContextPreview() {
  const q = useApi<{ text: string }>("/ai/context-preview");
  if (q.isLoading) return <Skeleton lines={8} />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <div className="col gap-8">
      <p className="small muted">This summary is sent with each AI request. Nothing else from your account is shared.</p>
      <pre className="small" style={{ whiteSpace: "pre-wrap", background: "var(--surface-2)", padding: 12, borderRadius: 8, maxHeight: 460, overflow: "auto" }}>{q.data?.text}</pre>
    </div>
  );
}

interface Conv {
  id: string;
  title: string;
  updated_at: string;
}
interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const STARTERS = ["What should I focus on this week?", "Which of my goals conflict with each other?", "Help me plan a realistic study schedule for my exams", "I keep procrastinating on my most important task. Help me start.", "What's my biggest bottleneck right now?"];

function Chat({ ready }: { ready: boolean }) {
  const convs = useApi<Conv[]>("/ai/conversations");
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const mut = useMutate();

  useEffect(() => {
    if (!active) {
      setMessages([]);
      return;
    }
    get<{ messages: Msg[] }>(`/ai/conversations/${active}`)
      .then((c) => setMessages(c.messages))
      .catch(() => setError("Couldn't load that conversation."));
  }, [active]);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages, sending]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || sending) return;
    setError(null);
    setSending(true);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: t }]);
    setInput("");
    try {
      const r = await post<{ conversation_id: string; reply: string }>("/ai/chat", { conversation_id: active, message: t });
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: r.reply }]);
      if (!active) setActive(r.conversation_id);
      qc.invalidateQueries({ queryKey: ["api", "/ai/conversations"] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't reach the assistant.");
      setMessages((m) => m.slice(0, -1));
      setInput(t);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="notes-layout">
      <aside className="card">
        <div className="card-body col gap-8">
          <Button onClick={() => setActive(null)} block>
            <Plus size={15} aria-hidden /> New conversation
          </Button>
          <div className="list">
            {(convs.data ?? []).map((c) => (
              <div key={c.id} className="item" style={{ padding: 0 }}>
                <button className="grow ellipsis small" style={{ background: c.id === active ? "var(--accent-soft)" : "none", border: 0, padding: "8px", borderRadius: 6, textAlign: "left", cursor: "pointer" }} onClick={() => setActive(c.id)} aria-current={c.id === active ? "true" : undefined}>
                  <MessageSquare size={12} aria-hidden /> {c.title}
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon
                  aria-label={`Delete conversation ${c.title}`}
                  onClick={async () => {
                    if (!(await confirm({ title: "Delete this conversation?", confirm: "Delete", danger: true }))) return;
                    await mut.call(`/ai/conversations/${c.id}`, undefined, "DELETE").catch(() => {});
                    if (active === c.id) setActive(null);
                  }}
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
            {(convs.data ?? []).length === 0 && <p className="tiny muted">No conversations yet.</p>}
          </div>
        </div>
      </aside>
      <Card>
        <div className="col gap-12" style={{ minHeight: 420 }}>
          {messages.length === 0 && !sending ? (
            <div className="col gap-12">
              <Empty icon={<Sparkles size={20} />} title="Ask for help thinking something through">
                The assistant sees a summary of your goals, tasks, habits and recent trends.
              </Empty>
              <div className="chips" style={{ justifyContent: "center" }}>
                {STARTERS.map((s) => (
                  <button key={s} className="chip" disabled={!ready} onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat" aria-live="polite">
              {messages.map((m) => (
                <div key={m.id} className={`bubble ${m.role}`}>
                  {m.role === "assistant" ? <Markdown text={m.content} /> : <span className="pre-wrap">{m.content}</span>}
                </div>
              ))}
              {sending && (
                <div className="bubble assistant muted">
                  <span className="spinner" aria-hidden /> Thinking…
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
          {error && <ErrorState error={new Error(error)} />}
          <form
            className="row"
            style={{ marginTop: "auto" }}
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              className="textarea"
              rows={2}
              style={{ minHeight: 44 }}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={ready ? "Ask anything about your plans, goals or week…" : "AI is not available"}
              disabled={!ready}
              aria-label="Message the assistant"
              maxLength={8000}
            />
            <Button type="submit" variant="primary" icon disabled={!ready || !input.trim()} loading={sending} aria-label="Send">
              <Send size={16} />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}

function Insights({ ready }: { ready: boolean }) {
  const [out, setOut] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const items: [string, string, string][] = [
    ["plan_day", "Plan the rest of my day", "1–3 priorities with time estimates, and what not to do."],
    ["bottlenecks", "Find my bottleneck", "What's limiting progress, plus one small experiment."],
    ["conflicts", "Check for conflicting goals", "Tensions in time, energy, money or values."],
    ["weekly_review", "Prepare my weekly review", "What moved you forward and suggested priorities."],
    ["journal_summary", "Summarise my journal", "Recurring themes (only if journal sharing is on)."],
  ];
  const run = async (k: string) => {
    setLoading(k);
    setErr(null);
    try {
      const r = await post<{ text: string }>("/ai/reflect", { kind: k });
      setOut((o) => ({ ...o, [k]: r.text }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't reach the assistant.");
    } finally {
      setLoading(null);
    }
  };
  return (
    <div className="col gap-12">
      {err && <ErrorState error={new Error(err)} />}
      {items.map(([k, t, d]) => (
        <Card key={k} title={t} actions={<Button size="sm" onClick={() => run(k)} loading={loading === k} disabled={!ready}>{out[k] ? "Regenerate" : "Run"}</Button>}>
          <p className="small muted">{d}</p>
          {out[k] && (
            <div className="mt-12">
              <span className="badge info">AI-generated — may be wrong</span>
              <div className="mt-8">
                <Markdown text={out[k]} />
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

interface AuditRow {
  id: string;
  created_at: string;
  ratings: Record<string, { score: number; note?: string | null }>;
}
interface AuditFull extends AuditRow {
  findings: Record<string, { text: string; source: string }[] | { text: string; link?: string }[]>;
  ai_interpretation: string | null;
}

const SECTIONS: [string, string][] = [
  ["current", "Current state"],
  ["strengths", "Strengths"],
  ["bottlenecks", "Bottlenecks"],
  ["neglected", "Neglected areas"],
  ["contradictions", "Contradictions"],
  ["opportunities", "Opportunities"],
];
const SOURCE_LABEL: Record<string, string> = { you_said: "You said", your_data: "Your data", interpretation: "Interpretation" };

function Audit({ aiReady }: { aiReady: boolean }) {
  const list = useApi<AuditRow[]>("/audits");
  const [openId, setOpenId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!openId && list.data?.length) setOpenId(list.data[0].id);
  }, [list.data, openId]);
  return (
    <div className="col gap-16">
      {running ? (
        <AuditForm
          onDone={(id) => {
            setRunning(false);
            if (id) setOpenId(id);
          }}
        />
      ) : (
        <Card className="accent">
          <div className="row between wrap">
            <div>
              <h2>Life audit</h2>
              <p className="small muted mt-4">Rate ten areas of life, then see what your ratings and your logged data say together — strengths, bottlenecks, contradictions and concrete actions for the next 7 days.</p>
            </div>
            <Button variant="primary" onClick={() => setRunning(true)}>
              Start a life audit
            </Button>
          </div>
        </Card>
      )}
      {(list.data ?? []).length > 1 && (
        <div className="chips">
          {list.data!.map((a) => (
            <button key={a.id} className="chip" aria-pressed={a.id === openId} onClick={() => setOpenId(a.id)}>
              {fmtDate(a.created_at.slice(0, 10), undefined, { year: true })}
            </button>
          ))}
        </div>
      )}
      {openId && !running && <AuditView id={openId} aiReady={aiReady} onDeleted={() => setOpenId(null)} />}
    </div>
  );
}

function AuditForm({ onDone }: { onDone: (id: string | null) => void }) {
  const [ratings, setRatings] = useState<Record<string, { score: number; note: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const mut = useMutate();
  const submit = async () => {
    setError(null);
    try {
      const r = await mut.call<{ id: string }>("/audits", { ratings: Object.fromEntries(Object.entries(ratings).map(([k, v]) => [k, { score: v.score, note: v.note || null }])) }, "POST", { silentError: true });
      onDone(r.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't run the audit.");
    }
  };
  return (
    <Card title="How is each area of your life, honestly?">
      <p className="small muted" style={{ marginBottom: 12 }}>
        1 = struggling, 10 = thriving. Skip any you'd rather not rate (at least three needed). A short note helps.
      </p>
      <div className="col gap-12">
        {AUDIT_AREAS.map(([k, l]) => {
          const r = ratings[k];
          return (
            <div key={k} className="row wrap gap-12" style={{ alignItems: "center" }}>
              <span className="strong" style={{ width: 150 }}>
                {l}
              </span>
              <input
                type="range"
                min={1}
                max={10}
                value={r?.score ?? 5}
                onChange={(e) => setRatings({ ...ratings, [k]: { score: Number(e.target.value), note: r?.note ?? "" } })}
                aria-label={`${l} rating`}
                style={{ flex: "1 1 160px", accentColor: "var(--accent)", opacity: r ? 1 : 0.4 }}
              />
              <span className="num strong" style={{ width: 36 }}>
                {r ? `${r.score}` : "—"}
              </span>
              <input className="input" style={{ flex: "2 1 220px" }} value={r?.note ?? ""} onChange={(e) => setRatings({ ...ratings, [k]: { score: r?.score ?? 5, note: e.target.value } })} placeholder="Why? (optional)" aria-label={`${l} note`} />
            </div>
          );
        })}
      </div>
      {error && <div className="form-error mt-12">{error}</div>}
      <div className="row mt-16" style={{ justifyContent: "flex-end" }}>
        <Button onClick={() => onDone(null)}>Cancel</Button>
        <Button variant="primary" onClick={submit} loading={mut.pending} disabled={Object.keys(ratings).length < 3}>
          Analyse
        </Button>
      </div>
    </Card>
  );
}

function AuditView({ id, aiReady, onDeleted }: { id: string; aiReady: boolean; onDeleted: () => void }) {
  const q = useApi<AuditFull>(`/audits/${id}`);
  const [interpreting, setInterpreting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutate();
  const confirm = useConfirm();
  if (q.isLoading) return <Skeleton lines={8} />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const a = q.data;
  const interpret = async () => {
    setInterpreting(true);
    setErr(null);
    try {
      await mut.call(`/ai/audits/${id}/interpret`, {}, "POST", { silentError: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't reach the assistant.");
    } finally {
      setInterpreting(false);
    }
  };
  const actions = (a.findings.next_actions ?? []) as { text: string; link?: string }[];
  return (
    <div className="col gap-16">
      <div className="row between wrap">
        <p className="small muted">
          Audit from {fmtDate(a.created_at.slice(0, 10), undefined, { year: true })} ·{" "}
          {Object.entries(a.ratings)
            .map(([k, v]) => `${label(AUDIT_AREAS, k)} ${v.score}`)
            .join(" · ")}
        </p>
        <div className="row">
          <span className="source-tag source-you_said">You said</span>
          <span className="source-tag source-your_data">Your data</span>
          <span className="source-tag source-interpretation">Interpretation</span>
          <Button
            size="sm"
            variant="ghost"
            icon
            aria-label="Delete audit"
            onClick={async () => {
              if (!(await confirm({ title: "Delete this audit?", confirm: "Delete", danger: true }))) return;
              await mut.call(`/audits/${id}`, undefined, "DELETE").catch(() => {});
              onDeleted();
            }}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
      <div className="grid grid-2">
        {SECTIONS.map(([k, l]) => {
          const items = (a.findings[k] ?? []) as { text: string; source: string }[];
          return (
            <Card key={k} title={l}>
              {items.length === 0 ? (
                <p className="small muted">Nothing notable.</p>
              ) : (
                <div className="col gap-8">
                  {items.map((f, i) => (
                    <div key={i} className="row top gap-8">
                      <span className={`source-tag source-${f.source}`} title={SOURCE_LABEL[f.source]}>
                        {SOURCE_LABEL[f.source]}
                      </span>
                      <span className="small">{f.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
      <Card title="Next 7 days" className="accent">
        <ol style={{ margin: 0, paddingLeft: 20 }} className="col gap-8">
          {actions.map((x, i) => (
            <li key={i}>
              {x.text} {x.link && <Link to={x.link} className="small">Go →</Link>}
            </li>
          ))}
        </ol>
      </Card>
      <Card title="AI interpretation" actions={aiReady && <Button size="sm" onClick={interpret} loading={interpreting}><Sparkles size={14} aria-hidden /> {a.ai_interpretation ? "Regenerate" : "Interpret"}</Button>}>
        {err && <p className="small" style={{ color: "var(--bad)" }}>{err}</p>}
        {a.ai_interpretation ? (
          <>
            <span className="badge info">AI-generated — the assistant only knows what's summarised here, and can be wrong</span>
            <div className="mt-8">
              <Markdown text={a.ai_interpretation} />
            </div>
          </>
        ) : (
          <p className="small muted">{aiReady ? "Optional: ask the assistant for a written interpretation. Every claim is labelled as what you said, your data, or interpretation." : "AI interpretation is unavailable. The rule-based findings above are complete on their own."}</p>
        )}
      </Card>
    </div>
  );
}
