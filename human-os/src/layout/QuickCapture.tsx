import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BookOpen, CheckSquare, Lightbulb, StickyNote, Target } from "lucide-react";
import { Button, Modal } from "../components/ui";
import { useMutate, useToday } from "../lib/hooks";
import { parseCapture } from "../../shared/capture";
import { fmtDate } from "../lib/format";
import { useToast } from "../components/Toast";
import { ApiError } from "../lib/api";

export type CaptureKind = "task" | "idea" | "note" | "goal" | "reminder" | "journal";

const KINDS: [CaptureKind, string, typeof CheckSquare][] = [
  ["task", "Task", CheckSquare],
  ["reminder", "Reminder", Bell],
  ["idea", "Idea", Lightbulb],
  ["note", "Note", StickyNote],
  ["goal", "Goal", Target],
  ["journal", "Journal", BookOpen],
];

const PLACEHOLDER: Record<CaptureKind, string> = {
  task: "e.g. Submit assignment friday !high",
  reminder: "e.g. Call the bank tomorrow 10am",
  idea: "Capture the idea before it's gone",
  note: "Note title",
  goal: "e.g. Read 12 books this year",
  journal: "What's on your mind?",
};

export function QuickCapture({ open, onClose, initialKind = "task" }: { open: boolean; onClose: () => void; initialKind?: CaptureKind }) {
  return (
    <Modal open={open} onClose={onClose} title="Quick capture">
      {open && <CaptureForm onClose={onClose} initialKind={initialKind} />}
    </Modal>
  );
}

function CaptureForm({ onClose, initialKind }: { onClose: () => void; initialKind: CaptureKind }) {
  const [kind, setKind] = useState<CaptureKind>(initialKind);
  const [text, setText] = useState("");
  const [details, setDetails] = useState("");
  const [showDetails, setShowDetails] = useState(initialKind === "journal");
  const [error, setError] = useState<string | null>(null);
  const today = useToday();
  const mut = useMutate();
  const nav = useNavigate();
  const toast = useToast();
  const parsed = useMemo(() => (kind === "task" || kind === "reminder" ? parseCapture(text, today) : null), [kind, text, today]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!text.trim()) {
      setError("Write something first.");
      return;
    }
    try {
      const res = await mut.call<{ link: string; kind: string }>("/capture", { kind, text, details: details || undefined }, "POST", { silentError: true });
      toast.show(`${KINDS.find((k) => k[0] === kind)![1]} captured`, { action: { label: "Open", onClick: () => nav(res.link) } });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields?.text ?? err.message) : "Couldn't save. Check your connection.");
    }
  };

  return (
    <form onSubmit={submit} className="col gap-12">
      <div className="chips" role="radiogroup" aria-label="What are you capturing?">
        {KINDS.map(([k, label, Icon]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
            <Icon size={14} aria-hidden /> {label}
          </button>
        ))}
      </div>
      <input className="input" style={{ fontSize: 16, minHeight: 44 }} autoFocus data-autofocus value={text} onChange={(e) => setText(e.target.value)} placeholder={PLACEHOLDER[kind]} aria-label="Capture text" maxLength={5000} />
      {parsed && (parsed.date || parsed.time || parsed.priority) && (
        <div className="row wrap small ink-2" aria-live="polite">
          <span className="badge accent">{parsed.title || "…"}</span>
          {parsed.date && <span className="badge">Due {fmtDate(parsed.date, today)}</span>}
          {parsed.time && <span className="badge">{parsed.time}</span>}
          {parsed.priority && <span className="badge warn">{parsed.priority} priority</span>}
        </div>
      )}
      {showDetails ? (
        <textarea className="textarea" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Details (optional)" aria-label="Details" />
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setShowDetails(true)}>
          + Add details
        </button>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <div className="row between">
        <span className="tiny muted">Tip: “tomorrow 6pm”, “friday”, “!high” are understood for tasks.</span>
        <Button type="submit" variant="primary" loading={mut.pending}>
          Capture
        </Button>
      </div>
    </form>
  );
}
