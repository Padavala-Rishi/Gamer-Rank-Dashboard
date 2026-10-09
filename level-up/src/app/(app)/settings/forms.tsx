"use client";
import { useState, useTransition, type ReactNode } from "react";
import { loadSample, removeSample, resetAllData } from "@/app/actions/data";
import { saveProfile, saveSettings, setTheme } from "@/app/actions/profile";
import { exportBackup, backupFilename, importBackup } from "@/db/backup";
import { clearApiKey, saveApiKey } from "@/lib/coach/browser";
import { useApiKey } from "@/lib/coach/use-api-key";
import { Avatar, AVATAR_TONE_COLORS } from "@/components/avatar";
import { Icon } from "@/components/icon";
import { Field, Notice } from "@/components/ui";
import { useUI } from "@/components/ui-context";
import { AVATAR_ICONS, AVATAR_TONES, CURRENCIES, DIFFICULTIES, DIFFICULTY_LABEL, WEEKDAY_LABELS, XP_PREFERENCES, type XpPreference } from "@/lib/constants";
import { WEEKDAY_KEYS } from "@/lib/dates";
import { xpToReach } from "@/lib/game/xp";
import type { Commitment, Profile, Settings } from "@/lib/types";

function Card({ title, hint, children, id }: { title: string; hint?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="card mb-4 p-4 sm:p-5" id={id} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} className="text-base font-semibold">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-sm text-muted">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

/** Save helper: runs a settings action, shows field errors inline, and confirms with a toast. */
function useSave() {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const save = (fn: () => Promise<{ ok: boolean; error?: string; fields?: Record<string, string> }>, ok = "Saved") => {
    setErr(null); setFe({});
    start(async () => {
      const r = await fn();
      if (!r.ok) { setErr(r.error ?? "Couldn't save"); setFe(r.fields ?? {}); } else toast(ok, "good");
    });
  };
  return { pending, err, fe, save };
}

const SaveBar = ({ pending, err, label = "Save" }: { pending: boolean; err: string | null; label?: string }) => (
  <div className="mt-4 flex flex-wrap items-center gap-3">
    <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : label}</button>
    {err && <span className="err !mt-0" role="alert">{err}</span>}
  </div>
);

export function ProfileForm({ profile, titles }: { profile: Profile; titles: string[] }) {
  const { pending, err, fe, save } = useSave();
  const { toast } = useUI();
  const [name, setName] = useState(profile.character_name);
  const [icon, setIcon] = useState(profile.avatar.icon);
  const [tone, setTone] = useState(profile.avatar.tone);
  const [tz, setTz] = useState(profile.timezone);
  return (
    <Card id="profile" title="Character">
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(() => saveProfile({ character_name: name, avatar: { icon, tone }, timezone: tz })); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Character name" htmlFor="st-name" error={fe.character_name}><input id="st-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></Field>
          <Field label="Time zone" htmlFor="st-tz" hint="Your days start and end at midnight here." error={fe.timezone}><input id="st-tz" className="input" value={tz} onChange={(e) => setTz(e.target.value)} /></Field>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <Avatar avatar={{ icon, tone }} size={56} />
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Avatar icon">{AVATAR_ICONS.map((i) => <button key={i} type="button" className="chip !px-2" aria-pressed={icon === i} aria-label={i} onClick={() => setIcon(i)}><Icon name={i} size={16} /></button>)}</div>
            <div className="flex gap-2" role="group" aria-label="Avatar colour">{AVATAR_TONES.map((t) => <button key={t} type="button" aria-label={t} aria-pressed={tone === t} onClick={() => setTone(t)} className="size-7 rounded-full border-2" style={{ background: AVATAR_TONE_COLORS[t], borderColor: tone === t ? "var(--text)" : "transparent" }} />)}</div>
          </div>
        </div>
        <SaveBar pending={pending} err={err} />
      </form>
      {titles.length > 0 && <p className="mt-3 text-xs text-muted">Titles you've earned are equipped on the <a className="text-accent" href="/achievements?tab=titles">Achievements</a> page.</p>}
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <span className="text-sm text-muted">Theme</span>
        <ThemeSwitch initial={"dark"} onChange={async (t) => { document.documentElement.dataset.theme = t; const r = await setTheme(t); if (!r.ok) toast(r.error, "bad"); }} />
      </div>
    </Card>
  );
}

function ThemeSwitch({ onChange }: { initial: "dark" | "light"; onChange: (t: "dark" | "light") => void }) {
  const [t, setT] = useState<"dark" | "light">(() => (typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark"));
  return (
    <div className="flex gap-1.5" role="group" aria-label="Theme">
      {(["dark", "light"] as const).map((k) => <button key={k} className="chip" aria-pressed={t === k} onClick={() => { setT(k); onChange(k); }}><Icon name={k === "dark" ? "moon" : "sun"} size={14} />{k === "dark" ? "Dark" : "Light"}</button>)}
    </div>
  );
}

export function PlanningForm({ s }: { s: Settings }) {
  const { pending, err, fe, save } = useSave();
  const [hours, setHours] = useState<Record<string, number>>(() => Object.fromEntries(WEEKDAY_KEYS.map((k) => [k, (s.availability?.[k] ?? 0) / 60])));
  const [limit, setLimit] = useState(String(s.daily_task_limit));
  const [mvd, setMvd] = useState(String(s.mvd_minutes));
  const [rest, setRest] = useState<number[]>(s.rest_weekdays ?? []);
  const [weekStart, setWeekStart] = useState<0 | 1>(s.week_starts_on);
  const [blocks, setBlocks] = useState<Commitment[]>(s.commitments ?? []);
  return (
    <Card id="planning" title="Planning" hint="The planner uses these to keep every day realistic: about 80% of your free time is the recommended load.">
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(() => saveSettings({
        availability: Object.fromEntries(WEEKDAY_KEYS.map((k) => [k, Math.round((hours[k] ?? 0) * 60)])), daily_task_limit: limit, mvd_minutes: mvd,
        rest_weekdays: rest, week_starts_on: weekStart, commitments: blocks.filter((b) => b.title.trim()),
      })); }}>
        <div className="label">Free hours per day <span className="font-normal text-faint">(after classes, work and everything else)</span></div>
        <div className="grid grid-cols-7 gap-1.5">{WEEKDAY_KEYS.map((k, i) => <div key={k}><label className="label !mb-1 text-center" htmlFor={`av-${k}`}>{WEEKDAY_LABELS[i]}</label><input id={`av-${k}`} className="input !px-1 text-center" type="number" min={0} max={16} step={0.5} value={hours[k]} onChange={(e) => setHours((h) => ({ ...h, [k]: Number(e.target.value) }))} /></div>)}</div>
        {fe.availability && <p className="err">{fe.availability}</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Most quests per day" htmlFor="st-limit" hint="A hard stop on over-planning." error={fe.daily_task_limit}><input id="st-limit" className="input" type="number" min={1} max={30} value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
          <Field label="Minimum Viable Day (min)" htmlFor="st-mvd" hint="Time budget for the bare essentials." error={fe.mvd_minutes}><input id="st-mvd" className="input" type="number" min={15} max={240} value={mvd} onChange={(e) => setMvd(e.target.value)} /></Field>
          <Field label="Week starts on" htmlFor="st-ws"><select id="st-ws" className="select" value={weekStart} onChange={(e) => setWeekStart(Number(e.target.value) as 0 | 1)}><option value={1}>Monday</option><option value={0}>Sunday</option></select></Field>
        </div>
        <div className="mt-4"><div className="label">Planned rest days <span className="font-normal text-faint">(never break your streak)</span></div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Rest weekdays">{WEEKDAY_LABELS.map((l, i) => <button key={l} type="button" className="chip" aria-pressed={rest.includes(i + 1)} onClick={() => setRest((r) => (r.includes(i + 1) ? r.filter((x) => x !== i + 1) : [...r, i + 1].sort()))}>{l}</button>)}</div>
          {fe.rest_weekdays && <p className="err">{fe.rest_weekdays}</p>}</div>
        <div className="mt-4"><div className="label">Recurring commitments <span className="font-normal text-faint">(classes, work: shown on your calendar)</span></div>
          <div className="space-y-2">
            {blocks.map((b, i) => (
              <div key={i} className="card-inset space-y-2 p-2.5">
                <div className="flex gap-2"><input className="input" aria-label="Commitment name" value={b.title} placeholder="Name" onChange={(e) => setBlocks((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /><button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Remove" onClick={() => setBlocks((l) => l.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button></div>
                <div className="flex flex-wrap gap-1.5">{WEEKDAY_LABELS.map((l, d) => <button key={l} type="button" className="chip" aria-pressed={b.days.includes(d + 1)} onClick={() => setBlocks((arr) => arr.map((x, j) => (j === i ? { ...x, days: x.days.includes(d + 1) ? x.days.filter((y) => y !== d + 1) : [...x.days, d + 1].sort() } : x)))}>{l}</button>)}</div>
                <div className="flex items-center gap-2"><input type="time" className="input" aria-label="Starts" value={b.start} onChange={(e) => setBlocks((l) => l.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} /><span className="text-muted">to</span><input type="time" className="input" aria-label="Ends" value={b.end} onChange={(e) => setBlocks((l) => l.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} /></div>
              </div>
            ))}
            <button type="button" className="btn btn-sm" onClick={() => setBlocks((l) => [...l, { title: "", days: [1, 2, 3, 4, 5], start: "09:00", end: "15:00" }])}><Icon name="plus" size={13} /> Add commitment</button>
          </div>
          {Object.entries(fe).filter(([k]) => k.startsWith("commitments")).map(([k, v]) => <p key={k} className="err">{v}</p>)}
        </div>
        <SaveBar pending={pending} err={err} />
      </form>
    </Card>
  );
}

export function XpForm({ s }: { s: Settings }) {
  const { pending, err, fe, save } = useSave();
  const [pref, setPref] = useState<XpPreference>(s.xp_preference);
  const [base, setBase] = useState(String(Number(s.level_base)));
  const [expo, setExpo] = useState(String(Number(s.level_exponent)));
  const [cbase, setCbase] = useState(String(Number(s.category_level_base)));
  const [xp, setXp] = useState<Record<string, string>>(() => Object.fromEntries(DIFFICULTIES.map((d) => [d, String(s.xp_values[d])])));
  const curve = { base: Number(base) || 100, exponent: Number(expo) || 1.6 };
  const preset = (p: XpPreference) => { setPref(p); setBase(String(XP_PREFERENCES[p].base)); setCbase(String(XP_PREFERENCES[p].category_base)); setExpo("1.6"); };
  return (
    <Card id="xp" title="XP & levels" hint="The level curve is configuration, not code: XP to reach level L = base × (L−1)^exponent. Changing it re-levels you from your recorded XP; nothing is lost.">
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(() => saveSettings({ xp_preference: pref, level_base: base, level_exponent: expo, category_level_base: cbase, xp_values: xp })); }}>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Pace">
          {(Object.keys(XP_PREFERENCES) as XpPreference[]).map((k) => <button key={k} type="button" role="radio" aria-checked={pref === k} className="card-inset p-3 text-left" style={pref === k ? { borderColor: "var(--accent)" } : undefined} onClick={() => preset(k)}><div className="text-sm font-semibold">{XP_PREFERENCES[k].label}</div><div className="text-xs text-muted">{XP_PREFERENCES[k].blurb}</div></button>)}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Overall base" htmlFor="xp-base" error={fe.level_base}><input id="xp-base" className="input" type="number" min={20} max={1000} step="any" value={base} onChange={(e) => setBase(e.target.value)} /></Field>
          <Field label="Attribute base" htmlFor="xp-cbase" error={fe.category_level_base}><input id="xp-cbase" className="input" type="number" min={10} max={1000} step="any" value={cbase} onChange={(e) => setCbase(e.target.value)} /></Field>
          <Field label="Exponent" htmlFor="xp-exp" hint="1.1–2.5; higher = steeper" error={fe.level_exponent}><input id="xp-exp" className="input" type="number" min={1.1} max={2.5} step="any" value={expo} onChange={(e) => setExpo(e.target.value)} /></Field>
        </div>
        <div className="mt-4"><div className="label">XP per quest difficulty</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{DIFFICULTIES.map((d) => <Field key={d} label={DIFFICULTY_LABEL[d]} htmlFor={`xp-${d}`}><input id={`xp-${d}`} className="input" type="number" min={1} max={500} value={xp[d]} onChange={(e) => setXp((x) => ({ ...x, [d]: e.target.value }))} /></Field>)}</div>
          {(fe["xp_values"] || fe["xp_values.easy"]) && <p className="err">{fe["xp_values"] ?? fe["xp_values.easy"]}</p>}
          <p className="hint">Applies to quests you complete from now on. Past awards keep the XP they earned.</p></div>
        <details className="mt-3"><summary className="cursor-pointer text-sm text-muted">Preview: XP needed per level</summary>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm sm:grid-cols-5">{[2, 3, 4, 5, 6, 8, 10, 15, 20, 30].map((l) => <div key={l} className="flex justify-between"><span className="text-muted">Lv {l}</span><span className="num">{xpToReach(l, curve)}</span></div>)}</div></details>
        <SaveBar pending={pending} err={err} />
      </form>
    </Card>
  );
}

export function TargetsForm({ s }: { s: Settings }) {
  const { pending, err, fe, save } = useSave();
  const t = s.targets;
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(t).map(([k, val]) => [k, val == null ? "" : String(val)])));
  const [currency, setCurrency] = useState(s.currency);
  const f = (k: string, label: string, hint?: string, step: string | number = 1) => (
    <Field label={label} htmlFor={`t-${k}`} hint={hint} error={fe[`targets.${k}`] ?? fe[k]}><input id={`t-${k}`} className="input" type="number" step={step} min={0} value={v[k] ?? ""} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} /></Field>
  );
  return (
    <Card id="targets" title="Targets" hint="Sensible defaults you can change. Health quests check against these, and the ranges protect you: undereating and under-sleeping are never rewarded.">
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(() => saveSettings({ currency, targets: v })); }}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {f("protein_g", "Protein (g/day)", undefined, "any")}{f("water_ml", "Water (ml/day)")}{f("calories", "Calories (optional)", "Leave empty to skip")}
          {f("sleep_min_h", "Healthy sleep from (h)", undefined, "any")}{f("sleep_max_h", "…up to (h)", undefined, "any")}{f("mobility_min", "Mobility (min/day)")}
          {f("workouts_weekly", "Workouts per week")}{f("practice_weekly", "Basketball days per week")}{f("study_weekly_min", "Study (min/week)")}
          {f("coding_weekly_min", "Coding (min/week)")}{f("income_monthly", "Income target / month", "A target only", "any")}
          <Field label="Currency" htmlFor="t-cur"><select id="t-cur" className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <SaveBar pending={pending} err={err} />
      </form>
    </Card>
  );
}

export function TimerForm({ s }: { s: Settings }) {
  const { pending, err, fe, save } = useSave();
  const [p, setP] = useState({ focus: String(s.pomodoro.focus), short: String(s.pomodoro.short), long: String(s.pomodoro.long), cycles: String(s.pomodoro.cycles) });
  return (
    <Card id="timer" title="Focus timer" hint="Pomodoro lengths used by the College and Development timers.">
      <form noValidate onSubmit={(e) => { e.preventDefault(); save(() => saveSettings({ pomodoro: p })); }}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["focus", "short", "long", "cycles"] as const).map((k) => <Field key={k} label={{ focus: "Focus (min)", short: "Short break", long: "Long break", cycles: "Blocks per set" }[k]} htmlFor={`pm-${k}`} error={fe[`pomodoro.${k}`]}><input id={`pm-${k}`} className="input" type="number" min={1} value={p[k]} onChange={(e) => setP((x) => ({ ...x, [k]: e.target.value }))} /></Field>)}
        </div>
        <SaveBar pending={pending} err={err} />
      </form>
    </Card>
  );
}

export function AiForm({ consent }: { consent: boolean }) {
  const { pending, err, save } = useSave();
  const { toast } = useUI();
  const [on, setOn] = useState(consent);
  const { hasKey, refresh } = useApiKey();
  const [key, setKey] = useState("");
  const [keyErr, setKeyErr] = useState<string | null>(null);
  return (
    <Card id="ai" title="AI coach" hint="Optional. The rest of the app works the same without it.">
      <Notice tone={hasKey ? "good" : "info"} className="mb-3">{hasKey ? "Your Anthropic API key is saved on this device." : "The coach needs your own Anthropic API key. There is no server in between: the app talks to Anthropic directly from this device."}</Notice>
      <div className="mb-4">
        <label className="label" htmlFor="ai-key">Anthropic API key</label>
        <div className="flex flex-wrap items-center gap-2">
          <input id="ai-key" className="input !w-72 max-w-full" type="password" autoComplete="off" spellCheck={false} placeholder={hasKey ? "Saved. Paste a new key to replace it" : "sk-ant-…"} value={key} onChange={(e) => setKey(e.target.value)} />
          <button type="button" className="btn btn-sm" disabled={!key.trim()} onClick={() => { try { saveApiKey(key); setKey(""); setKeyErr(null); refresh(); toast("API key saved on this device", "good"); } catch (e) { setKeyErr(e instanceof Error ? e.message : "Couldn't save the key"); } }}>Save key</button>
          {hasKey && <button type="button" className="btn btn-sm" onClick={() => { clearApiKey(); refresh(); toast("API key removed", "info"); }}>Remove key</button>}
        </div>
        {keyErr && <p className="err">{keyErr}</p>}
        <p className="hint">Stored only in this browser's local storage and sent only to api.anthropic.com. Anyone who can use this browser profile could read it, so use a key with a spending limit. Requests are billed to your Anthropic account.</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); save(() => saveSettings({ ai_consent: on }), on ? "AI coach enabled" : "AI coach disabled"); }}>
        <label className="flex cursor-pointer items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4 accent-[var(--accent)]" checked={on} onChange={(e) => setOn(e.target.checked)} /><span>Allow the coach to send a summary of my recorded progress to the AI provider when I ask for advice. <a className="text-accent" href="/coach#data">See exactly what's sent.</a></span></label>
        <SaveBar pending={pending} err={err} />
      </form>
    </Card>
  );
}

export function DataCard({ hasSample }: { hasSample: boolean }) {
  const { toast } = useUI();
  const [pending, start] = useTransition();
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card id="data" title="Your data">
      <div className="space-y-4">
        <div className="rounded-xl border border-line p-3 text-xs text-muted">Your data lives only in this browser on this device. There is no account and no server, so <b>nothing is backed up for you</b>: if you clear site data, uninstall the app or lose the phone, it is gone. Download a backup regularly. The Home-Screen app and the Safari tab on an iPhone keep <i>separate</i> data, so use a backup to move between them.</div>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-semibold">Back up everything</div><div className="text-xs text-muted">A JSON file with all your records. It contains personal data, so keep it safe.</div></div><button className="btn btn-sm" disabled={pending} onClick={() => start(async () => { try { const b = await exportBackup(); download(backupFilename(), JSON.stringify(b, null, 2)); toast("Backup downloaded", "good"); } catch { toast("Couldn't create the backup", "bad"); } })} data-testid="backup-download"><Icon name="download" size={14} />Download backup</button></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><div><div className="text-sm font-semibold">Restore from a backup</div><div className="text-xs text-muted">Replaces everything on this device with the file's contents.</div></div>
          <label className="btn btn-sm cursor-pointer"><Icon name="upload" size={14} />Choose backup file<input type="file" accept="application/json,.json" className="sr-only" data-testid="backup-file" disabled={pending} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (!confirm("Replace everything on this device with this backup?")) return; start(async () => { try { const r = await importBackup(JSON.parse(await f.text())); toast(`Restored ${r.rows} records`, "good"); } catch (x) { toast(x instanceof SyntaxError ? "That file isn't valid JSON." : x instanceof Error ? x.message : "Couldn't restore the backup", "bad"); } }); }} /></label></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><div><div className="text-sm font-semibold">Sample data</div><div className="text-xs text-muted">{hasSample ? "Example quests and records are on this device. Removing them also removes any XP they earned." : "Add example quests, drills, a subject and more to explore the app."}</div></div>
          {hasSample ? <button className="btn btn-sm" disabled={pending} onClick={() => { if (confirm("Remove all sample data and the XP it earned?")) start(async () => { const r = await removeSample(); if (!r.ok) toast(r.error, "bad"); else toast(`Removed ${r.data.quests_removed} sample quests${r.data.xp_removed ? ` and ${r.data.xp_removed} XP` : ""}`, "info"); }); }}>Remove sample data</button>
            : <button className="btn btn-sm" disabled={pending} onClick={() => start(async () => { const r = await loadSample(); if (!r.ok) toast(r.error, "bad"); else toast(r.data.loaded ? "Sample data added" : "Sample data was already added", "good"); })}>Add sample data</button>}</div>
        <div className="border-t border-line pt-4"><div className="text-sm font-semibold text-bad">Reset all progress</div><div className="mb-2 text-xs text-muted">Deletes every quest, log, XP record and badge on this device. Your profile and settings stay. This can't be undone.</div>
          <div className="flex flex-wrap items-center gap-2"><input className="input !w-44" aria-label="Type RESET to confirm" placeholder="Type RESET" value={typed} onChange={(e) => setTyped(e.target.value)} /><button className="btn btn-danger btn-sm" disabled={pending || typed !== "RESET"} onClick={() => start(async () => { const r = await resetAllData(typed); if (!r.ok) setErr(r.error); else { setTyped(""); toast("All progress reset", "info"); } })}>Reset</button></div>{err && <p className="err">{err}</p>}</div>
      </div>
    </Card>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
