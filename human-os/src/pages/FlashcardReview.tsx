import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Layers } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { get, post, qs } from "../lib/api";
import { useDocumentTitle } from "../lib/hooks";
import type { Flashcard } from "../lib/types";
import { Button, Card, Empty, ErrorState, Progress, Skeleton } from "../components/ui";
import { GRADES } from "../../shared/sm2";
import { useToast } from "../components/Toast";

export default function FlashcardReview() {
  useDocumentTitle("Review");
  const [params] = useSearchParams();
  const subject = params.get("subject");
  // Load the due queue once; reviewing a card must not reshuffle it mid-session.
  const q = useQuery({ queryKey: ["review-queue", subject], queryFn: () => get<Flashcard[]>(`/flashcards/due${qs({ subject_id: subject })}`), staleTime: Infinity, refetchOnWindowFocus: false });
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState<Flashcard[]>([]);
  const [counts, setCounts] = useState({ reviewed: 0, forgot: 0 });
  const toast = useToast();
  const queue = [...(q.data ?? []), ...again];
  const card = queue[i];

  const grade = async (g: number) => {
    if (!card || busy) return;
    setBusy(true);
    try {
      await post(`/flashcards/${card.id}/review`, { grade: g });
      setCounts((c) => ({ reviewed: c.reviewed + 1, forgot: c.forgot + (g < 3 ? 1 : 0) }));
      // Forgotten cards come back once more in this session.
      if (g < 3 && !again.some((a) => a.id === card.id)) setAgain((a) => [...a, card]);
      setShown(false);
      setI((x) => x + 1);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || document.querySelector('[aria-modal="true"]')) return;
      if (e.key === " " && !shown) {
        e.preventDefault();
        setShown(true);
      } else if (shown && ["1", "2", "3", "4"].includes(e.key)) grade(GRADES[Number(e.key) - 1].grade);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="page page-narrow">
      <Link to="/learning" className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}>
        <ArrowLeft size={14} aria-hidden /> Learning
      </Link>
      <h1 style={{ marginBottom: 16 }}>Flashcard review</h1>
      {q.isLoading ? (
        <Skeleton lines={5} />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !card ? (
        <Card>
          <Empty icon={<Layers size={20} />} title={counts.reviewed ? "Session complete" : "No cards due"} action={<Link className="btn" to="/learning">Back to learning</Link>}>
            {counts.reviewed ? `You reviewed ${counts.reviewed} card${counts.reviewed === 1 ? "" : "s"}${counts.forgot ? `, ${counts.forgot} will come back sooner` : ""}. Spaced repetition will bring each back right before you'd forget it.` : "Nothing to review right now. Add cards to your subjects, or come back tomorrow."}
          </Empty>
        </Card>
      ) : (
        <div className="col gap-16">
          <div className="row">
            <div className="grow">
              <Progress value={i / queue.length} label="Review progress" />
            </div>
            <span className="small muted num">
              {i + 1} / {queue.length}
            </span>
          </div>
          <Card>
            <div className="col gap-16" style={{ minHeight: 220, justifyContent: "center", textAlign: "center", padding: "16px 8px" }}>
              <p className="serif" style={{ fontSize: 20, whiteSpace: "pre-wrap" }}>
                {card.front}
              </p>
              {shown && (
                <>
                  <hr className="divider" />
                  <p style={{ fontSize: 17, whiteSpace: "pre-wrap" }} aria-live="polite">
                    {card.back}
                  </p>
                </>
              )}
            </div>
          </Card>
          {!shown ? (
            <Button variant="primary" size="lg" onClick={() => setShown(true)}>
              Show answer <kbd style={{ marginLeft: 8 }}>Space</kbd>
            </Button>
          ) : (
            <div className="grid grid-4" style={{ gap: 8 }}>
              {GRADES.map((g, k) => (
                <Button key={g.grade} size="lg" variant={g.grade === 4 ? "primary" : "default"} onClick={() => grade(g.grade)} disabled={busy} title={g.hint}>
                  {g.label} <kbd>{k + 1}</kbd>
                </Button>
              ))}
            </div>
          )}
          <p className="tiny muted" style={{ textAlign: "center" }}>
            Be honest with the grade — the schedule only works if it reflects what you actually remembered.
          </p>
        </div>
      )}
    </div>
  );
}
