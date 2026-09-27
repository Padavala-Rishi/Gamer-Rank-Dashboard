import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarPlus, CheckSquare, Dumbbell, FileSearch, HeartPulse, Moon, NotebookPen, Plus, Search, Sparkles, Target, Timer, GraduationCap, RotateCcw, Zap } from "lucide-react";
import { get, qs } from "../lib/api";
import { ALL_NAV } from "./nav";
import { useUI } from "./UIContext";

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
  keywords?: string;
}

interface SearchHit {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  link: string;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const nav = useNavigate();
  const ui = useUI();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const root = document.getElementById("root");
    const prev = document.activeElement as HTMLElement | null;
    if (root) root.inert = true;
    return () => {
      if (root && !document.querySelector('[aria-modal="true"]:not(.palette)')) root.inert = false;
      prev?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setHits([]);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const t = setTimeout(() => {
      get<SearchHit[]>(`/search${qs({ q: q.trim() })}`)
        .then((r) => !ctrl.signal.aborted && setHits(r))
        .catch(() => !ctrl.signal.aborted && setHits([]))
        .finally(() => !ctrl.signal.aborted && setSearching(false));
    }, 160);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q, open]);

  const go = (path: string) => () => {
    onClose();
    nav(path);
  };
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const commands: Item[] = useMemo(
    () => [
      { id: "now", group: "Actions", label: "What should I do now?", icon: <Zap size={16} />, run: act(ui.openNow), keywords: "next recommend" },
      { id: "task", group: "Actions", label: "Create task", icon: <CheckSquare size={16} />, run: act(() => ui.openTask()), keywords: "new add todo" },
      { id: "capture", group: "Actions", label: "Quick capture", hint: "C", icon: <Plus size={16} />, run: act(() => ui.openCapture()), keywords: "idea note reminder" },
      { id: "focus", group: "Actions", label: "Start focus session", icon: <Timer size={16} />, run: go("/focus"), keywords: "pomodoro deep work timer" },
      { id: "study", group: "Actions", label: "Start study session", icon: <GraduationCap size={16} />, run: go("/focus?kind=study"), keywords: "learn" },
      { id: "workout", group: "Actions", label: "Log workout", icon: <Dumbbell size={16} />, run: go("/health?new=workout"), keywords: "exercise gym run" },
      { id: "checkin", group: "Actions", label: "Daily check-in", icon: <HeartPulse size={16} />, run: go("/health?checkin=1"), keywords: "sleep mood energy" },
      { id: "journal", group: "Actions", label: "Add journal entry", icon: <NotebookPen size={16} />, run: go("/journal?new=daily"), keywords: "reflect write" },
      { id: "goal", group: "Actions", label: "Create goal", icon: <Target size={16} />, run: go("/goals?new=1"), keywords: "new objective" },
      { id: "plan", group: "Actions", label: "Plan today", icon: <CalendarPlus size={16} />, run: go("/?plan=today"), keywords: "daily planner mit" },
      { id: "plan-tmr", group: "Actions", label: "Plan tomorrow", icon: <CalendarPlus size={16} />, run: go("/?plan=tomorrow"), keywords: "evening planner" },
      { id: "review", group: "Actions", label: "Start weekly review", icon: <RotateCcw size={16} />, run: go("/reviews?kind=weekly"), keywords: "reflect" },
      { id: "audit", group: "Actions", label: "Run a life audit", icon: <Sparkles size={16} />, run: go("/assistant?tab=audit"), keywords: "assessment ai" },
      { id: "theme", group: "Actions", label: "Toggle dark mode", icon: <Moon size={16} />, run: act(ui.toggleTheme), keywords: "theme appearance light" },
      ...ALL_NAV.map((n) => ({ id: `nav:${n.to}`, group: "Go to", label: n.label, icon: <n.icon size={16} />, run: go(n.to), keywords: n.keywords })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ui],
  );

  const items: Item[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const cmd = needle ? commands.filter((c) => `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(needle)) : commands;
    const found = hits.map<Item>((h) => ({ id: `hit:${h.type}:${h.id}`, group: "Search results", label: h.title, hint: `${h.type}${h.subtitle ? ` · ${h.subtitle.replace(/_/g, " ")}` : ""}`, icon: <FileSearch size={16} />, run: go(h.link) }));
    return [...cmd, ...found];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, hits, commands]);

  useEffect(() => setSel(0), [q, hits.length]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[sel]?.run();
    } else if (e.key === "Escape") onClose();
  };
  let lastGroup = "";
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="row" style={{ paddingLeft: 16 }}>
          <Search size={18} className="muted" aria-hidden />
          <input
            ref={inputRef}
            className="palette-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search everything or type a command…"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[sel] ? `pi-${sel}` : undefined}
            aria-label="Search or run a command"
          />
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {items.length === 0 && <div className="empty small">{searching ? "Searching…" : q.trim().length < 2 ? "Type to search" : "No matches"}</div>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? <div className="palette-group">{it.group}</div> : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {header}
                <div id={`pi-${i}`} role="option" aria-selected={i === sel} className="palette-item" onMouseEnter={() => setSel(i)} onClick={it.run}>
                  <span className="muted">{it.icon}</span>
                  <span className="grow ellipsis">{it.label}</span>
                  {it.hint && <span className="small muted ellipsis" style={{ maxWidth: 200 }}>{it.hint}</span>}
                  {i === sel && <ArrowRight size={14} aria-hidden />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="row small muted" style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", gap: 14 }}>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>Esc</kbd> close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
