import Link from "next/link";
import type { ReactNode } from "react";
import { CATEGORIES, CATEGORY_KEYS, type CategoryKey } from "@/lib/constants";
import type { LevelProgress } from "@/lib/game/xp";
import { AddQuestButton } from "./add-button";
import { Icon } from "./icon";
import { DOMAIN_COLOR, DomainIcon } from "./ui";
import { XpBar } from "./xp-bar";

/** Level card at the top of each module, plus quick hops between the four modules. */
export function DomainHeader({ category, level, weekXp, goal, actions }: { category: CategoryKey; level: LevelProgress; weekXp: number; goal?: string | null; actions?: ReactNode }) {
  const c = CATEGORIES[category];
  return (
    <>
      <nav className="mb-4 flex gap-1 overflow-x-auto scroll-hide" aria-label="Areas">
        {CATEGORY_KEYS.map((k) => (
          <Link key={k} href={CATEGORIES[k].href} className="tab inline-flex items-center gap-1.5" aria-current={k === category ? "page" : undefined}>
            <Icon name={CATEGORIES[k].icon} size={15} style={{ color: k === category ? DOMAIN_COLOR[k] : undefined }} />{CATEGORIES[k].short}
          </Link>
        ))}
      </nav>
      <header className="card mb-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${DOMAIN_COLOR[category]} 15%, var(--surface-2))` }}><DomainIcon category={category} size={24} /></span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">{c.attribute}</div>
              <h1 className="text-xl font-semibold leading-tight sm:text-2xl">{c.name}</h1>
              <div className="text-sm text-muted">{c.blurb}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AddQuestButton defaults={{ category }} className="btn btn-sm" />
            {actions}
          </div>
        </div>
        <div className="mt-4 flex items-end gap-4">
          <div><div className="text-[11px] font-semibold uppercase tracking-wider text-faint">Level</div><div className="num text-4xl font-bold leading-none">{level.level}</div></div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex justify-between text-xs text-muted"><span><span className="num text-ink">{level.into}</span> / <span className="num">{level.needed}</span> XP</span><span>{weekXp > 0 ? `+${weekXp} XP this week` : "no XP this week"}</span></div>
            <XpBar value={level.pct} color={DOMAIN_COLOR[category]} label={`${c.name} progress to next level`} />
          </div>
        </div>
        {goal && <p className="mt-3 border-t border-line pt-3 text-sm text-muted"><span className="font-semibold text-ink">Goal:</span> {goal}</p>}
      </header>
    </>
  );
}

export function SubTabs({ base, tabs, current }: { base: string; tabs: readonly (readonly [string, string])[]; current: string }) {
  return (
    <nav className="tabs mb-5" aria-label="Sections">
      {tabs.map(([k, l]) => <Link key={k} href={k === tabs[0][0] ? base : `${base}?tab=${k}`} className="tab" aria-current={current === k ? "page" : undefined}>{l}</Link>)}
    </nav>
  );
}
