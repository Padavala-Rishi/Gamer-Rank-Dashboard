import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TaskEditor } from "../components/TaskEditor";
import { patch } from "../lib/api";
import { useProfile } from "../lib/hooks";
import { CommandPalette } from "./CommandPalette";
import { NowModal } from "./NowPanel";
import { QuickCapture, type CaptureKind } from "./QuickCapture";

interface UI {
  openCapture: (kind?: CaptureKind) => void;
  openNow: () => void;
  openPalette: () => void;
  openTask: (initial?: Record<string, unknown>) => void;
  toggleTheme: () => void;
}
const Ctx = createContext<UI>({ openCapture: () => {}, openNow: () => {}, openPalette: () => {}, openTask: () => {}, toggleTheme: () => {} });
export const useUI = () => useContext(Ctx);

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [capture, setCapture] = useState<CaptureKind | null>(null);
  const [now, setNow] = useState(false);
  const [palette, setPalette] = useState(false);
  const [task, setTask] = useState<Record<string, unknown> | null>(null);
  const profile = useProfile();
  const qc = useQueryClient();

  const toggleTheme = useCallback(async () => {
    const current = profile.data?.theme ?? "system";
    const dark = current === "dark" || (current === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    try {
      await patch("/profile", { theme: dark ? "light" : "dark" });
      qc.invalidateQueries({ queryKey: ["api", "/profile"] });
    } catch {
      /* ignore */
    }
  }, [profile.data?.theme, qc]);

  const ui = useMemo<UI>(
    () => ({
      openCapture: (k = "task") => setCapture(k),
      openNow: () => setNow(true),
      openPalette: () => setPalette(true),
      openTask: (initial = {}) => setTask(initial),
      toggleTheme,
    }),
    [toggleTheme],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
        return;
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (e.key === "c") {
        e.preventDefault();
        setCapture("task");
      } else if (e.key === "w") {
        e.preventDefault();
        setNow(true);
      } else if (e.key === "/") {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Ctx.Provider value={ui}>
      {children}
      <QuickCapture open={capture !== null} initialKind={capture ?? "task"} onClose={() => setCapture(null)} />
      <NowModal open={now} onClose={() => setNow(false)} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <TaskEditor open={task !== null} onClose={() => setTask(null)} initial={task} />
    </Ctx.Provider>
  );
}
