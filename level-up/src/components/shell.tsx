import Link from "next/link";
import type { ReactNode } from "react";
import type { Character } from "@/lib/game/xp";
import type { Profile } from "@/lib/types";
import { Avatar } from "./avatar";
import { Icon } from "./icon";
import { BottomNav, QuickAddButton, SidebarNav, ThemeToggle } from "./nav-client";
import { ProgressBar } from "./ui";

export function AppShell({ profile, character, theme, children }: { profile: Profile; character: Character; theme: "dark" | "light"; children: ReactNode }) {
  const o = character.overall;
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16.5rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">Skip to content</a>
      <aside className="sticky top-0 hidden h-dvh flex-col gap-5 overflow-y-auto border-r border-line px-4 py-5 md:flex">
        <Link href="/" className="flex items-center gap-3 px-1">
          <div className="grid size-9 place-items-center rounded-xl bg-accent text-accent-ink"><Icon name="swords" size={18} /></div>
          <span className="display text-lg font-semibold">Level Up</span>
        </Link>
        <QuickAddButton />
        <SidebarNav />
        <div className="mt-auto space-y-3">
          <Link href="/settings" className="card-inset block p-3 hover:border-faint">
            <div className="flex items-center gap-3">
              <Avatar avatar={profile.avatar} size={38} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{profile.character_name}</div>
                <div className="truncate text-xs text-muted">{profile.active_title ?? "Rookie"} · Lv <span className="num">{o.level}</span></div>
              </div>
            </div>
            <ProgressBar value={o.pct} className="mt-2.5" small label="Progress to next level" />
            <div className="mt-1 text-[11px] text-faint"><span className="num">{o.remaining}</span> XP to level {o.level + 1}</div>
          </Link>
          <div className="flex items-center justify-between">
            <ThemeToggle theme={theme} />
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur md:hidden" style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}>
          <Link href="/settings" aria-label="Profile and settings"><Avatar avatar={profile.avatar} size={34} /></Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold">{profile.character_name}</span>
              <span className="num text-xs font-semibold text-accent">Lv {o.level}</span>
            </div>
            <ProgressBar value={o.pct} small className="mt-1" label="Progress to next level" />
          </div>
          <ThemeToggle theme={theme} />
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-32 pt-5 md:px-8 md:pb-14 md:pt-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
