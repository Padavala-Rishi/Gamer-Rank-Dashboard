"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CATEGORIES, type AnyCategory } from "@/lib/constants";
import type { CompleteResult } from "@/lib/types";
import { Icon } from "./icon";
import { QuickAdd } from "./quick-add";
import type { QuickAddDefaults } from "./task-form";
import { UICtx, type Tone, type UI } from "./ui-context";

type Toast = { id: number; text: string; tone: Tone };
type FloatXp = { id: number; x: number; y: number; text: string };
type LevelUp = { scope: string; level: number }[];
type Ach = CompleteResult["achievements"];

export function Providers({ children, today, xp, subjects, projects }: { children: ReactNode; today: string; xp: Record<string, number>; subjects: UI["subjects"]; projects: UI["projects"] }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [floats, setFloats] = useState<FloatXp[]>([]);
  const [levelUp, setLevelUp] = useState<{ ups: LevelUp; achievements: Ach } | null>(null);
  const [qa, setQa] = useState<{ open: boolean; defaults?: QuickAddDefaults }>({ open: false });
  const seq = useRef(0);

  const toast = useCallback((text: string, tone: Tone = "info") => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "bad" ? 6000 : 3800);
  }, []);

  const celebrate = useCallback((res: CompleteResult, origin?: { x: number; y: number }) => {
    if (res.already_done) return;
    const id = ++seq.current;
    const x = origin?.x ?? window.innerWidth / 2, y = origin?.y ?? window.innerHeight / 2;
    setFloats((f) => [...f, { id, x, y, text: `+${res.xp} XP` }]);
    setTimeout(() => setFloats((f) => f.filter((v) => v.id !== id)), 1200);
    if (res.level_ups.length) setLevelUp({ ups: res.level_ups, achievements: res.achievements });
    else if (res.achievements.length) {
      for (const a of res.achievements) toast(`Badge unlocked: ${a.name}${a.title ? ` · title “${a.title}”` : ""}`, "good");
    }
    if (res.bonus && res.bonus > 0) toast(`Focused-work bonus +${res.bonus} XP`, "good");
  }, [toast]);

  const openQuickAdd = useCallback((defaults?: QuickAddDefaults) => setQa({ open: true, defaults }), []);

  // "n" opens quick-add when you are not typing somewhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      setQa({ open: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<UI>(() => ({ toast, celebrate, openQuickAdd, xp, subjects, projects }), [toast, celebrate, openQuickAdd, xp, subjects, projects]);

  return (
    <UICtx.Provider value={value}>
      {children}
      <QuickAdd open={qa.open} defaults={qa.defaults} today={today} onClose={() => setQa({ open: false })} />
      {floats.map((f) => (
        <div key={f.id} className="xp-float text-xl" style={{ left: f.x, top: f.y }} aria-hidden>{f.text}</div>
      ))}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div key={t.id} className="pop pointer-events-auto flex max-w-md items-center gap-2 rounded-xl border border-line bg-raised px-4 py-2.5 text-sm shadow-xl">
            <Icon name={t.tone === "good" ? "circle-check" : t.tone === "bad" ? "alert-triangle" : "info"} size={16} style={{ color: t.tone === "good" ? "var(--good)" : t.tone === "bad" ? "var(--bad)" : "var(--muted)" }} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      {levelUp && <LevelUpScreen ups={levelUp.ups} achievements={levelUp.achievements} onClose={() => setLevelUp(null)} />}
    </UICtx.Provider>
  );
}

function LevelUpScreen({ ups, achievements, onClose }: { ups: LevelUp; achievements: Ach; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const overall = ups.filter((u) => u.scope === "overall").at(-1);
  const attrs = ups.filter((u) => u.scope !== "overall");
  return (
    <dialog ref={ref} className="sheet" style={{ width: "min(26rem, calc(100vw - 2rem))", textAlign: "center" }} aria-labelledby="lu-title" onCancel={(e) => { e.preventDefault(); onClose(); }} onClose={onClose}>
      <div className="relative px-6 pb-6 pt-9">
        <div className="relative mx-auto grid size-28 place-items-center">
          <span className="levelup-ring" /><span className="levelup-ring" />
          <div className="pop relative grid size-24 place-items-center rounded-full border-2 border-accent bg-raised">
            <span className="num text-4xl font-bold text-accent">{overall ? overall.level : (attrs.at(-1)?.level ?? "")}</span>
          </div>
        </div>
        <h2 id="lu-title" className="mt-5 text-2xl font-semibold">{overall ? "Level up!" : "Attribute level up!"}</h2>
        <p className="mt-1 text-sm text-muted">{overall ? `You reached level ${overall.level}.` : "Your effort is showing."}</p>
        {attrs.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-left">
            {attrs.map((u) => (
              <li key={u.scope} className="card-inset flex items-center gap-2.5 px-3 py-2 text-sm">
                <Icon name={CATEGORIES[u.scope as AnyCategory]?.icon ?? "star"} size={16} />
                <span className="flex-1">{CATEGORIES[u.scope as AnyCategory]?.attribute ?? u.scope} · {CATEGORIES[u.scope as AnyCategory]?.name}</span>
                <span className="num font-semibold text-accent">Lv {u.level}</span>
              </li>
            ))}
          </ul>
        )}
        {achievements.length > 0 && (
          <div className="mt-4 text-left">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-faint">Unlocked</div>
            <ul className="space-y-1.5">
              {achievements.map((a) => (
                <li key={a.key} className="card-inset flex items-center gap-2.5 px-3 py-2 text-sm">
                  <Icon name={a.icon} size={16} className="text-accent" />
                  <span className="flex-1"><b>{a.name}</b>{a.title && <span className="text-muted"> · title “{a.title}”</span>}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button className="btn btn-primary mt-6 w-full" onClick={onClose} autoFocus>Keep going</button>
      </div>
    </dialog>
  );
}
