"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { setTheme } from "@/app/actions/profile";
import { Icon } from "./icon";
import { GROUP_LABEL, NAV, isActive, type NavItem } from "./nav";
import { Sheet } from "./sheet";
import { useUI } from "./ui-context";

export function SidebarNav() {
  const path = usePathname();
  const groups = (["main", "domains", "progress", "system"] as const).map((g) => ({ g, items: NAV.filter((n) => n.group === g) }));
  return (
    <nav aria-label="Main" className="space-y-5">
      {groups.map(({ g, items }) => (
        <div key={g}>
          {GROUP_LABEL[g] && <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">{GROUP_LABEL[g]}</div>}
          <ul className="space-y-0.5">
            {items.map((n) => <li key={n.href}><NavLink item={n} active={isActive(path, n.href)} /></li>)}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-raised text-ink" : "text-muted hover:bg-raised/60 hover:text-ink"}`}>
      <Icon name={item.icon} size={18} className={active ? "text-accent" : ""} />
      {item.label}
    </Link>
  );
}

export function QuickAddButton({ className }: { className?: string }) {
  const { openQuickAdd } = useUI();
  return (
    <button className={className ?? "btn btn-primary w-full"} onClick={() => openQuickAdd()} aria-keyshortcuts="n">
      <Icon name="plus" size={16} /> New quest <kbd className="ml-auto hidden rounded bg-black/15 px-1.5 text-[11px] md:inline">N</kbd>
    </button>
  );
}

export function ThemeToggle({ theme }: { theme: "dark" | "light" }) {
  const [t, setT] = useState(theme);
  return (
    <button className="btn btn-ghost btn-icon btn-sm" aria-label={t === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => { const next = t === "dark" ? "light" : "dark"; setT(next); void setTheme(next); }}>
      <Icon name={t === "dark" ? "sun" : "moon"} size={16} />
    </button>
  );
}

export function BottomNav() {
  const path = usePathname();
  const { openQuickAdd } = useUI();
  const [more, setMore] = useState(false);
  const tab = (href: string, label: string, icon: string) => {
    const active = isActive(path, href);
    return (
      <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-accent" : "text-muted"}`}>
        <Icon name={icon} size={21} />{label}
      </Link>
    );
  };
  const moreActive = NAV.some((n) => !["/", "/quests", "/stats"].includes(n.href) && isActive(path, n.href));
  return (
    <>
      <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg items-center">
          {tab("/", "Home", "house")}
          {tab("/quests", "Quests", "list-todo")}
          <div className="flex flex-1 justify-center">
            <button className="-mt-5 grid size-14 place-items-center rounded-full bg-accent text-accent-ink shadow-lg ring-4 ring-bg" onClick={() => openQuickAdd()} aria-label="New quest"><Icon name="plus" size={26} /></button>
          </div>
          {tab("/stats", "Stats", "chart-column")}
          <button onClick={() => setMore(true)} className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${moreActive ? "text-accent" : "text-muted"}`} aria-haspopup="dialog">
            <Icon name="ellipsis" size={21} />More
          </button>
        </div>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="Menu">
        <ul className="grid grid-cols-2 gap-2">
          {NAV.filter((n) => !["/", "/quests", "/stats"].includes(n.href)).map((n) => (
            <li key={n.href}>
              <Link href={n.href} onClick={() => setMore(false)} className="card-inset flex items-center gap-3 px-3.5 py-3 text-sm font-semibold">
                <Icon name={n.icon} size={18} className="text-accent" />{n.label}
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
