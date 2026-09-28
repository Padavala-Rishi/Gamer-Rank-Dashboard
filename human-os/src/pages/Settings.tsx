import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Download, LogOut, Upload } from "lucide-react";
import { useApi, useDocumentTitle, useMutate, useProfile } from "../lib/hooks";
import type { Profile } from "../lib/types";
import { Button, Card, Field, PageHeader, Seg, Skeleton, Tabs, useConfirm } from "../components/ui";
import { ApiError, get, post, setSession } from "../lib/api";
import { NOTIFICATION_KINDS } from "../../shared/constants";
import { ALL_NAV } from "../layout/nav";
import { useToast } from "../components/Toast";

type Tab = "profile" | "appearance" | "notifications" | "preferences" | "ai" | "data" | "security";

export default function Settings() {
  useDocumentTitle("Settings");
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "profile";
  const profile = useProfile();
  return (
    <div className="page page-narrow">
      <PageHeader title="Settings" />
      <Tabs
        label="Settings sections"
        value={tab}
        onChange={(t) => {
          params.set("tab", t);
          setParams(params, { replace: true });
        }}
        options={[
          ["profile", "Profile"],
          ["appearance", "Appearance"],
          ["notifications", "Notifications"],
          ["preferences", "Habits & focus"],
          ["ai", "AI"],
          ["data", "Data & privacy"],
          ["security", "Security"],
        ]}
      />
      {!profile.data ? (
        <Skeleton lines={6} />
      ) : (
        <>
          {tab === "profile" && <ProfileTab p={profile.data} />}
          {tab === "appearance" && <AppearanceTab p={profile.data} />}
          {tab === "notifications" && <NotificationsTab p={profile.data} />}
          {tab === "preferences" && <PreferencesTab p={profile.data} />}
          {tab === "ai" && <AiTab p={profile.data} />}
          {tab === "data" && <DataTab />}
          {tab === "security" && <SecurityTab />}
        </>
      )}
    </div>
  );
}

function useSave() {
  const mut = useMutate();
  return (patch: Partial<Profile>, msg = "Saved") => mut.call("/profile", patch, "PATCH", { success: msg }).catch(() => {});
}

function ProfileTab({ p }: { p: Profile }) {
  const save = useSave();
  const [f, setF] = useState({ display_name: p.display_name ?? "", timezone: p.timezone, week_start: p.week_start, day_start: p.day_start, day_end: p.day_end, currency: p.currency, units: p.units });
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [p.timezone];
  return (
    <Card>
      <div className="form-grid">
        <Field label="Name" htmlFor="s-name">
          <input id="s-name" className="input" value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} />
        </Field>
        <Field label="Timezone" htmlFor="s-tz" hint={`Your device: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}>
          <select id="s-tz" className="select" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Field>
        <Field label="My day starts" htmlFor="s-ds" hint="Used for capacity planning and 'what now' suggestions.">
          <input id="s-ds" className="input" type="time" value={f.day_start} onChange={(e) => setF({ ...f, day_start: e.target.value })} />
        </Field>
        <Field label="My day ends" htmlFor="s-de">
          <input id="s-de" className="input" type="time" value={f.day_end} onChange={(e) => setF({ ...f, day_end: e.target.value })} />
        </Field>
        <Field label="Week starts on" htmlFor="s-ws">
          <select id="s-ws" className="select" value={f.week_start} onChange={(e) => setF({ ...f, week_start: Number(e.target.value) as 0 | 1 })}>
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </Field>
        <Field label="Currency" htmlFor="s-cur" hint="3-letter code, e.g. INR, USD, EUR">
          <input id="s-cur" className="input" value={f.currency} maxLength={3} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} />
        </Field>
        <Field label="Units" htmlFor="s-units">
          <select id="s-units" className="select" value={f.units} onChange={(e) => setF({ ...f, units: e.target.value as "metric" | "imperial" })}>
            <option value="metric">Metric</option>
            <option value="imperial">Imperial</option>
          </select>
        </Field>
      </div>
      <div className="row mt-16" style={{ justifyContent: "flex-end" }}>
        <Button variant="primary" onClick={() => save({ ...f, display_name: f.display_name || null })}>
          Save profile
        </Button>
      </div>
    </Card>
  );
}

function AppearanceTab({ p }: { p: Profile }) {
  const save = useSave();
  const hidden = new Set(p.hidden_nav);
  return (
    <div className="col gap-16">
      <Card title="Look & feel">
        <div className="col gap-16">
          <Field label="Theme">
            <Seg label="Theme" value={p.theme} onChange={(v) => save({ theme: v })} options={[["system", "System"], ["light", "Light"], ["dark", "Dark"]]} />
          </Field>
          <Field label="Density">
            <Seg label="Density" value={p.density} onChange={(v) => save({ density: v })} options={[["comfortable", "Comfortable"], ["compact", "Compact"]]} />
          </Field>
          <Field label="Motion" hint="“Reduce” turns off animations regardless of your system setting.">
            <Seg label="Motion" value={p.reduced_motion} onChange={(v) => save({ reduced_motion: v })} options={[["system", "Follow system"], ["reduce", "Reduce"]]} />
          </Field>
          <Field label="Accent colour (light mode)" htmlFor="s-acc">
            <div className="row">
              <input id="s-acc" type="color" className="input" style={{ width: 60, padding: 2 }} defaultValue={p.accent} onBlur={(e) => e.target.value !== p.accent && save({ accent: e.target.value })} />
              <Button size="sm" variant="ghost" onClick={() => save({ accent: "#2f6f5e" })}>
                Reset
              </Button>
            </div>
          </Field>
        </div>
      </Card>
      <Card title="Navigation">
        <p className="small muted" style={{ marginBottom: 12 }}>
          Hide sections you don't use. Nothing is deleted, and hidden pages stay reachable from search.
        </p>
        <div className="chips">
          {ALL_NAV.filter((n) => n.to !== "/" && n.to !== "/settings").map((n) => (
            <button key={n.to} className="chip" aria-pressed={!hidden.has(n.to)} onClick={() => save({ hidden_nav: hidden.has(n.to) ? p.hidden_nav.filter((x) => x !== n.to) : [...p.hidden_nav, n.to] })}>
              {n.label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function NotificationsTab({ p }: { p: Profile }) {
  const save = useSave();
  const np = p.notification_prefs;
  const toast = useToast();
  const [perm, setPerm] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  return (
    <Card>
      <div className="col gap-16">
        <label className="check">
          <input type="checkbox" checked={np.enabled} onChange={(e) => save({ notification_prefs: { ...np, enabled: e.target.checked } })} /> In-app notifications
        </label>
        <p className="small muted">Human OS only notifies you when something genuinely needs you, deduplicated, and capped per day. No streak guilt, no engagement bait.</p>
        <div className="col gap-8">
          {NOTIFICATION_KINDS.map(([k, l]) => (
            <label key={k} className="check" style={{ opacity: np.enabled ? 1 : 0.5 }}>
              <input type="checkbox" disabled={!np.enabled} checked={(np.kinds as Record<string, boolean>)[k] !== false} onChange={(e) => save({ notification_prefs: { ...np, kinds: { ...np.kinds, [k]: e.target.checked } } })} /> {l}
            </label>
          ))}
        </div>
        <Field label="Maximum per day" htmlFor="s-max">
          <input id="s-max" className="input" type="number" min={1} max={50} style={{ width: 100 }} defaultValue={np.max_per_day} onBlur={(e) => save({ notification_prefs: { ...np, max_per_day: Math.max(1, Math.min(50, Number(e.target.value) || 8)) } })} />
        </Field>
        <div className="col gap-8">
          <label className="check">
            <input
              type="checkbox"
              checked={np.browser}
              disabled={perm === "unsupported" || perm === "denied"}
              onChange={async (e) => {
                if (e.target.checked && perm !== "granted") {
                  const r = await Notification.requestPermission();
                  setPerm(r);
                  if (r !== "granted") {
                    toast.show("Browser notifications were blocked. You can allow them in your browser's site settings.", { kind: "error" });
                    return;
                  }
                }
                save({ notification_prefs: { ...np, browser: e.target.checked } });
              }}
            />
            Browser notifications (while Human OS is open in a tab)
          </label>
          <p className="tiny muted">{perm === "unsupported" ? "Your browser doesn't support notifications." : perm === "denied" ? "Blocked in your browser settings." : "Push notifications to a closed app or phone aren't supported yet."}</p>
        </div>
      </div>
    </Card>
  );
}

function PreferencesTab({ p }: { p: Profile }) {
  const save = useSave();
  return (
    <Card>
      <div className="form-grid">
        <Field label="Default focus session (min)" htmlFor="s-fm">
          <input id="s-fm" className="input" type="number" min={5} max={180} defaultValue={p.default_focus_min} onBlur={(e) => save({ default_focus_min: Math.max(5, Math.min(180, Number(e.target.value) || 25)) })} />
        </Field>
        <Field label="Break length (min)" htmlFor="s-bm">
          <input id="s-bm" className="input" type="number" min={1} max={60} defaultValue={p.pomodoro_break_min} onBlur={(e) => save({ pomodoro_break_min: Math.max(1, Math.min(60, Number(e.target.value) || 5)) })} />
        </Field>
      </div>
      <p className="small muted mt-16">Habit rules: the minimum version keeps a streak alive; intentional skips never break it; paused habits aren't scheduled. These are deliberate and not configurable — they exist to prevent all-or-nothing thinking.</p>
    </Card>
  );
}

function AiTab({ p }: { p: Profile }) {
  const save = useSave();
  const status = useApi<{ configured: boolean; model: string }>("/ai/status");
  return (
    <Card>
      <div className="col gap-16">
        <p className="small">{status.data?.configured ? `AI is available on this server (model: ${status.data.model}).` : "AI isn't configured on this server. These settings apply once it is."}</p>
        <label className="check">
          <input type="checkbox" checked={p.ai_enabled} onChange={(e) => save({ ai_enabled: e.target.checked })} /> Enable AI features (assistant, goal breakdown, audit interpretation)
        </label>
        <label className="check">
          <input type="checkbox" checked={p.ai_include_journal} onChange={(e) => save({ ai_include_journal: e.target.checked })} /> Share recent journal entries with the assistant
        </label>
        <p className="small muted">Off by default. When off, the assistant sees goals, tasks, habits and aggregate trends — never your journal text. You can preview exactly what is shared on the Assistant page.</p>
      </div>
    </Card>
  );
}

function DataTab() {
  const mut = useMutate();
  const demo = useApi<{ loaded: boolean }>("/demo");
  const confirm = useConfirm();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const exportData = async () => {
    setBusy(true);
    try {
      const data = await get("/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `human-os-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const importData = async (file: File) => {
    if (file.size > 4.5 * 1024 * 1024) return toast.show("That file is too large to import (max ~4.5 MB).", { kind: "error" });
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      return toast.show("That file isn't valid JSON.", { kind: "error" });
    }
    if (!(await confirm({ title: "Import this data?", body: "Everything in the file is added alongside your current data (nothing is overwritten). Importing the same file twice creates duplicates.", confirm: "Import" }))) return;
    await mut.call<{ imported: Record<string, number> }>("/import", json, "POST", { success: "Import complete" }).catch(() => {});
  };
  return (
    <div className="col gap-16">
      <Card title="Export">
        <div className="row between wrap">
          <p className="small muted">Download everything you've stored as JSON — a portable copy you own.</p>
          <Button onClick={exportData} loading={busy}>
            <Download size={15} aria-hidden /> Export my data
          </Button>
        </div>
      </Card>
      <Card title="Import">
        <div className="row between wrap">
          <p className="small muted">Import a Human OS export file (e.g. from another account or server).</p>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload size={15} aria-hidden /> Choose file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importData(f);
              e.target.value = "";
            }}
          />
        </div>
      </Card>
      <Card title="Demo data">
        <div className="row between wrap">
          <p className="small muted">{demo.data?.loaded ? "Demo data is loaded. Removing it never touches anything you created." : "Load a realistic example (a student preparing for placements) to explore every feature."}</p>
          {demo.data?.loaded ? (
            <Button variant="danger" onClick={() => mut.call("/demo", undefined, "DELETE", { success: "Demo data removed" }).catch(() => {})}>
              Remove demo data
            </Button>
          ) : (
            <Button onClick={() => mut.call("/demo", {}, "POST", { success: "Demo data loaded" }).catch(() => {})}>Load demo data</Button>
          )}
        </div>
      </Card>
      <Card title="Privacy">
        <ul className="small ink-2" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Your data is private to your account; every request is checked against your identity on the server.</li>
          <li>Passwords are hashed (scrypt); session tokens are stored only as hashes.</li>
          <li>No analytics, trackers or third-party scripts. Fonts are served from this server.</li>
          <li>AI requests (if enabled) send a summary to Anthropic's API; journal text only if you opt in.</li>
        </ul>
      </Card>
    </div>
  );
}

function SecurityTab() {
  const sessions = useApi<{ handle: string; created_at: string; last_seen_at: string; user_agent: string; current: boolean }[]>("/auth/sessions");
  const mut = useMutate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwErr, setPwErr] = useState<Record<string, string>>({});
  const [del, setDel] = useState({ password: "", confirm: "" });
  const [delErr, setDelErr] = useState<string | null>(null);
  useEffect(() => setPwErr({}), [pw]);
  const logout = async () => {
    await post("/auth/logout").catch(() => {});
    setSession(qc, null);
  };
  return (
    <div className="col gap-16">
      <Card title="Sessions">
        <div className="list">
          {(sessions.data ?? []).map((s) => (
            <div key={s.handle} className="item">
              <span className="grow small">
                <span className="ellipsis" style={{ display: "block" }}>
                  {s.user_agent || "Unknown device"}
                </span>
                <span className="muted">Last active {new Date(s.last_seen_at).toLocaleString()}</span>
              </span>
              {s.current && <span className="badge accent">This device</span>}
            </div>
          ))}
        </div>
        <div className="row mt-12">
          <Button onClick={() => mut.call("/auth/sessions/revoke-others", {}, "POST", { success: "Signed out other devices" }).catch(() => {})}>Sign out other devices</Button>
          <Button onClick={logout}>
            <LogOut size={15} aria-hidden /> Sign out
          </Button>
        </div>
      </Card>
      <Card title="Change password">
        <div className="form-grid">
          <Field label="Current password" htmlFor="pw-cur" error={pwErr.current}>
            <input id="pw-cur" className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
          <Field label="New password" htmlFor="pw-new" error={pwErr.next} hint="At least 10 characters">
            <input id="pw-new" className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
        </div>
        <div className="row mt-12" style={{ justifyContent: "flex-end" }}>
          <Button
            variant="primary"
            onClick={async () => {
              try {
                await mut.call("/auth/change-password", pw, "POST", { success: "Password changed. Other devices were signed out.", silentError: true });
                setPw({ current: "", next: "" });
              } catch (e) {
                if (e instanceof ApiError) setPwErr(e.fields ?? { current: e.message });
              }
            }}
          >
            Change password
          </Button>
        </div>
      </Card>
      <Card title="Delete account">
        <p className="small muted">Permanently deletes your account and every piece of data in it. Export first if you want a copy. This cannot be undone.</p>
        <div className="form-grid mt-12">
          <Field label="Password" htmlFor="del-pw">
            <input id="del-pw" className="input" type="password" autoComplete="current-password" value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} />
          </Field>
          <Field label='Type "DELETE" to confirm' htmlFor="del-c">
            <input id="del-c" className="input" value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} />
          </Field>
        </div>
        {delErr && <div className="form-error mt-8">{delErr}</div>}
        <div className="row mt-12" style={{ justifyContent: "flex-end" }}>
          <Button
            variant="danger"
            disabled={del.confirm !== "DELETE" || !del.password}
            onClick={async () => {
              if (!(await confirm({ title: "Delete your account forever?", body: "All goals, tasks, journal entries and everything else will be erased.", confirm: "Delete everything", danger: true }))) return;
              try {
                await post("/auth/delete-account", del);
                setSession(qc, null);
              } catch (e) {
                setDelErr(e instanceof ApiError ? e.message : "Couldn't delete the account.");
              }
            }}
          >
            Delete my account
          </Button>
        </div>
      </Card>
    </div>
  );
}
