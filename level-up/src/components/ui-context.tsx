"use client";
import { createContext, useContext } from "react";
import type { CompleteResult } from "@/lib/types";
import type { QuickAddDefaults } from "./task-form";

export type Tone = "good" | "bad" | "info";

export type UI = {
  toast: (text: string, tone?: Tone) => void;
  /** XP float, level-up screen and badge toasts for a completed quest. */
  celebrate: (res: CompleteResult, origin?: { x: number; y: number }) => void;
  openQuickAdd: (defaults?: QuickAddDefaults) => void;
  /** values the forms need, supplied once by the layout */
  xp: Record<string, number>;
  subjects: { id: string; name: string }[];
  projects: { id: string; name: string }[];
};

export const UICtx = createContext<UI | null>(null);
export function useUI(): UI {
  const c = useContext(UICtx);
  if (!c) throw new Error("useUI outside provider");
  return c;
}
