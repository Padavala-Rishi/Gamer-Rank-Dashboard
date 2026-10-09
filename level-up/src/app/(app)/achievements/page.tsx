import Link from "next/link";
import { AchievementList } from "@/components/achievement-list";
import { Icon } from "@/components/icon";
import { ResourceButton } from "@/components/resource-form";
import { EmptyState, Notice, PageHeader, ProgressBar, Section, Stat } from "@/components/ui";
import { CATEGORIES, DIFFICULTIES, DIFFICULTY_LABEL, type AnyCategory } from "@/lib/constants";
import { formatDay } from "@/lib/dates";
import { rewardProgress } from "@/lib/game/rewards";
import { rewardFields } from "@/lib/forms";
import { getContext, getProgress } from "@/lib/server/context";
import { getCompletions } from "@/lib/server/queries";
import type { AchievementDef, Reward } from "@/lib/types";
import { ClaimButton, EquipTitle } from "./client";

export const metadata = { title: "Achievements" };
const TABS = [["badges", "Badges"], ["titles", "Titles"], ["rewards", "Rewards"], ["collection", "Collection"]] as const;

export default async function Achievements({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await getContext();
  const { supabase, today, profile } = ctx;
  const sp = await searchParams;
  const tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? "badges";
  const [progress, defs, unlockedRows, rewards] = await Promise.all([
    getProgress(),
    supabase.from("achievement_defs").select("*").order("sort").then((r) => (r.data ?? []) as AchievementDef[]),
    supabase.from("user_achievements").select("key,unlocked_at"),
    supabase.from("rewards").select("*").order("created_at").then((r) => (r.data ?? []) as Reward[]),
  ]);
  const unlocked = new Map((unlockedRows.data ?? []).map((u) => [u.key as string, u.unlocked_at as string]));
  const unlockedKeys = new Set(unlocked.keys());
  const tabs = (
    <nav className="tabs mb-5" aria-label="Sections">
      {TABS.map(([k, l]) => <Link key={k} href={k === "badges" ? "/achievements" : `/achievements?tab=${k}`} className="tab" aria-current={tab === k ? "page" : undefined}>{l}</Link>)}
    </nav>
  );

  if (tab === "badges") {
    const groups: (AnyCategory | null)[] = [null, "basketball", "college", "dev", "health"];
    return (
      <>
        <PageHeader title="Achievements" subtitle={`${unlocked.size} of ${defs.length} badges unlocked. Progress bars use the same numbers the server checks.`} />
        {tabs}
        {groups.map((g) => {
          const list = defs.filter((d) => d.category === g);
          if (!list.length) return null;
          return <Section key={g ?? "all"} title={g ? CATEGORIES[g].name : "General"}><AchievementList defs={list} unlocked={unlocked} metrics={progress.metrics} /></Section>;
        })}
      </>
    );
  }

  if (tab === "titles") {
    const titles = defs.filter((d) => d.title && unlocked.has(d.key));
    const locked = defs.filter((d) => d.title && !unlocked.has(d.key));
    return (
      <>
        <PageHeader title="Titles" subtitle="Earned by unlocking badges. Equip one to show it on your character." />
        {tabs}
        <ul className="mb-6 space-y-2">
          <li className="card flex items-center justify-between gap-3 p-3.5"><div><div className="font-semibold">Rookie</div><div className="text-xs text-muted">Everyone starts here</div></div><EquipTitle title="Rookie" active={(profile.active_title ?? "Rookie") === "Rookie"} /></li>
          {titles.map((d) => <li key={d.key} className="card flex items-center justify-between gap-3 p-3.5"><div className="flex items-center gap-3"><Icon name={d.icon} size={18} className="text-accent" /><div><div className="font-semibold">{d.title}</div><div className="text-xs text-muted">From “{d.name}” · {formatDay(unlocked.get(d.key)!.slice(0, 10))}</div></div></div><EquipTitle title={d.title} active={profile.active_title === d.title} /></li>)}
        </ul>
        {locked.length > 0 && <Section title="Still to earn"><ul className="grid gap-2 sm:grid-cols-2">{locked.map((d) => <li key={d.key} className="card-inset flex items-center gap-3 px-3 py-2.5 text-sm opacity-80"><Icon name="lock" size={15} className="text-faint" /><span><b>{d.title}</b> <span className="text-muted">· {d.name}</span></span></li>)}</ul></Section>}
      </>
    );
  }

  if (tab === "rewards") {
    const achOpts = defs.map((d) => ({ value: d.key, label: d.name }));
    return (
      <>
        <PageHeader title="Rewards" subtitle="Real-world treats you set for real milestones." actions={<ResourceButton resource="rewards" title="New reward" fields={rewardFields(achOpts)} className="btn btn-primary btn-sm" />} />
        {tabs}
        <Notice className="mb-5">Rewards are cosmetic and self-defined. They unlock when you reach a milestone, never by spending XP, so they can't become a way around the work. No chance, no loot boxes.</Notice>
        {rewards.length === 0 ? <EmptyState icon="gift" title="No rewards yet" action={<ResourceButton resource="rewards" title="New reward" fields={rewardFields(achOpts)} className="btn btn-primary btn-sm" />}>Pick something you'd genuinely enjoy and tie it to a milestone, like a level, a streak or a badge.</EmptyState> : (
          <ul className="space-y-2.5">
            {rewards.map((r) => {
              const p = rewardProgress(r, progress.metrics, unlockedKeys);
              const claimed = !!r.claimed_at;
              return (
                <li key={r.id} className="card p-3.5" data-testid="reward" data-state={claimed ? "claimed" : p.ready ? "ready" : "locked"}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><div className="font-semibold">{r.title} {r.is_sample && <span className="badge ml-1">Sample</span>}</div>{r.note && <div className="text-xs text-muted">{r.note}</div>}</div>
                    <div className="flex items-center gap-1">
                      {claimed ? <span className="badge" style={{ color: "var(--good)" }}>Claimed {formatDay(r.claimed_at!.slice(0, 10))}</span> : p.ready ? <ClaimButton id={r.id} title={r.title} /> : <span className="badge"><Icon name="lock" size={11} />Locked</span>}
                      <ResourceButton resource="rewards" title={r.title} fields={rewardFields(achOpts)} initial={r as unknown as Record<string, unknown>} id={r.id} />
                    </div>
                  </div>
                  {!claimed && (
                    <div className="mt-2.5 text-xs text-muted">
                      <div className="mb-1 flex justify-between"><span>{r.unlock_kind === "achievement" ? `Unlock the “${defs.find((d) => d.key === r.unlock_key)?.name ?? "achievement"}” badge` : `Reach ${Number(r.unlock_value)} ${p.label}${r.unlock_kind === "category_level" ? ` in ${CATEGORIES[r.unlock_category as AnyCategory]?.name}` : ""}`}</span><span className="num">{r.unlock_kind === "achievement" ? (p.ready ? "done" : "not yet") : `${Math.round(p.have)} / ${p.need}`}</span></div>
                      <ProgressBar value={p.pct} small label={`${r.title} progress`} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  }

  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 365 * 86400000).toISOString().slice(0, 10);
  const done = await getCompletions(ctx, from, today);
  const bosses = done.filter((d) => d.tasks?.difficulty === "boss");
  return (
    <>
      <PageHeader title="Quest collection" subtitle="Everything you've completed in the last year." />
      {tabs}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {DIFFICULTIES.map((d) => <Stat key={d} label={DIFFICULTY_LABEL[d]} value={done.filter((x) => x.tasks?.difficulty === d).length} />)}
      </div>
      <Section title="Boss quests defeated">
        {bosses.length === 0 ? <p className="text-sm text-muted">No Boss Quests completed yet. They're worth the most XP for a reason.</p> : <ul className="space-y-1.5">{bosses.map((b) => <li key={b.id} className="card flex items-center justify-between gap-3 px-3.5 py-3 text-sm"><span className="flex items-center gap-2"><Icon name="swords" size={16} className="text-accent" />{b.tasks?.title}</span><span className="text-xs text-muted">{formatDay(b.completed_on)} · <span className="num text-accent">+{b.xp_awarded} XP</span></span></li>)}</ul>}
      </Section>
      <Section title="By area">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">{(Object.keys(CATEGORIES) as AnyCategory[]).map((k) => <Stat key={k} label={CATEGORIES[k].short} value={done.filter((x) => x.category === k).length} />)}</div>
      </Section>
      <Link className="btn btn-sm" href="/quests?view=done">Browse completed quests by day</Link>
    </>
  );
}
