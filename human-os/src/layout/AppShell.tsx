import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Bell, CalendarDays, CheckSquare, Command, Menu, Plus, Search, Sun, Zap, X } from "lucide-react";
import { NAV } from "./nav";
import { useUI } from "./UIContext";
import { useApi, useMutate, useOnline, useProfile } from "../lib/hooks";
import { Button, Modal } from "../components/ui";
import { post } from "../lib/api";
import { IS_LOCAL } from "../lib/mode";
import { useNavigate } from "react-router-dom";

interface Notif {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const q = useApi<Notif[]>("/notifications", { refetchInterval: 5 * 60_000 });
  const mut = useMutate();
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const unread = (q.data ?? []).filter((n) => !n.read_at).length;
  const profile = useProfile();
  const shown = useRef(new Set<string>());

  // Optional browser notifications for new unread items (only when the user enabled them).
  useEffect(() => {
    if (!profile.data?.notification_prefs.browser || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const n of q.data ?? []) {
      if (n.read_at || shown.current.has(n.id)) continue;
      shown.current.add(n.id);
      if (Date.now() - Date.parse(n.created_at) < 10 * 60_000) new Notification(n.title, { body: n.body ?? undefined, tag: n.id });
    }
  }, [q.data, profile.data?.notification_prefs.browser]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <Button variant="ghost" icon aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Bell size={18} />
        {unread > 0 && <span className="bell-dot" aria-hidden />}
      </Button>
      {open && (
        <div className="popover" role="dialog" aria-label="Notifications">
          <div className="row between" style={{ padding: "12px 14px 6px" }}>
            <h3>Notifications</h3>
            {unread > 0 && (
              <Button size="sm" variant="ghost" onClick={() => mut.call("/notifications/read-all")}>
                Mark all read
              </Button>
            )}
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto", padding: "0 6px 8px" }}>
            {q.isLoading && <p className="muted small" style={{ padding: 10 }}>Loading…</p>}
            {q.error ? <p className="small" style={{ padding: 10, color: "var(--bad)" }}>Couldn't load notifications.</p> : null}
            {q.data?.length === 0 && <p className="muted small" style={{ padding: 10 }}>You're all caught up. Notifications only appear when something genuinely needs you.</p>}
            {q.data?.map((n) => (
              <div key={n.id} className="palette-item" style={{ alignItems: "flex-start" }}>
                <span className="dot" style={{ background: n.read_at ? "transparent" : "var(--accent)", marginTop: 7 }} aria-hidden />
                <button
                  className="grow"
                  style={{ background: "none", border: 0, textAlign: "left", padding: 0, cursor: "pointer" }}
                  onClick={async () => {
                    setOpen(false);
                    await post(`/notifications/${n.id}/dismiss`).catch(() => {});
                    q.refetch();
                    if (n.link) nav(n.link);
                  }}
                >
                  <div className="strong">{n.title}</div>
                  {n.body && <div className="small muted">{n.body}</div>}
                </button>
                <Button size="sm" variant="ghost" icon aria-label="Dismiss" onClick={() => post(`/notifications/${n.id}/dismiss`).then(() => q.refetch())}>
                  <X size={14} />
                </Button>
              </div>
            ))}
          </div>
          <div className="small" style={{ padding: "8px 14px", borderTop: "1px solid var(--border)" }}>
            <Link to="/settings?tab=notifications" onClick={() => setOpen(false)}>
              Notification settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function DemoBanner() {
  const q = useApi<{ loaded: boolean }>("/demo");
  const mut = useMutate();
  if (!q.data?.loaded) return null;
  return (
    <div className="demo-banner" role="note">
      <span>
        <strong>Demo data is loaded.</strong> It's marked separately from anything you create and can be removed in one click.
      </span>
      <Button size="sm" onClick={() => mut.call("/demo", undefined, "DELETE", { success: "Demo data removed" })}>
        Remove demo data
      </Button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const ui = useUI();
  const online = useOnline();
  const loc = useLocation();
  const [more, setMore] = useState(false);
  const profile = useProfile();
  const hidden = new Set(profile.data?.hidden_nav ?? []);
  useEffect(() => setMore(false), [loc.pathname]);
  useEffect(() => {
    document.getElementById("main")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Main navigation">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden>
            <Sun size={16} />
          </span>
          Human OS
        </Link>
        <Button variant="now" block onClick={ui.openNow} style={{ justifyContent: "flex-start" }}>
          <Zap size={16} aria-hidden /> What should I do now?
        </Button>
        <nav className="col" style={{ gap: 12 }}>
          {NAV.map((g, i) => {
            const items = g.items.filter((it) => !hidden.has(it.to));
            if (!items.length) return null;
            return (
              <div className="nav-group" key={i}>
                {g.group && <div className="nav-label">{g.group}</div>}
                {items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.to === "/"} className="nav-link">
                    <it.icon size={17} aria-hidden />
                    {it.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="grow" />
        <div className="tiny muted" style={{ padding: "0 10px" }}>
          <kbd>⌘</kbd> <kbd>K</kbd> command · <kbd>C</kbd> capture · <kbd>W</kbd> what now
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="search-trigger" onClick={ui.openPalette} aria-label="Search and commands">
            <Search size={16} aria-hidden />
            <span className="grow" style={{ textAlign: "left" }}>
              Search or run a command…
            </span>
            <span className="hide-mobile row gap-4">
              <kbd>
                <Command size={10} />
              </kbd>
              <kbd>K</kbd>
            </span>
          </button>
          <div className="grow hide-mobile" />
          <Button className="hide-mobile" onClick={() => ui.openCapture()}>
            <Plus size={16} aria-hidden /> Capture
          </Button>
          <Notifications />
        </header>
        {!online && !IS_LOCAL && (
          <div className="offline-banner" role="alert">
            You're offline. You can keep reading, but changes can't be saved until you reconnect.
          </div>
        )}
        <DemoBanner />
        <main id="main" tabIndex={-1} style={{ outline: "none" }}>
          {children}
        </main>
      </div>

      <button className="fab" onClick={() => ui.openCapture()} aria-label="Quick capture">
        <Plus size={22} />
      </button>
      <nav className="bottom-nav" aria-label="Primary">
        <NavLink to="/" end>
          <Sun size={20} aria-hidden />
          Today
        </NavLink>
        <NavLink to="/tasks">
          <CheckSquare size={20} aria-hidden />
          Tasks
        </NavLink>
        <button className="now-btn" onClick={ui.openNow} aria-label="What should I do now?">
          <Zap size={20} aria-hidden />
          Now
        </button>
        <NavLink to="/calendar">
          <CalendarDays size={20} aria-hidden />
          Calendar
        </NavLink>
        <button onClick={() => setMore(true)} aria-haspopup="dialog">
          <Menu size={20} aria-hidden />
          More
        </button>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="More">
        <div className="col gap-16">
          {NAV.slice(1).map((g, i) => {
            const items = g.items.filter((it) => !hidden.has(it.to));
            if (!items.length) return null;
            return (
              <div key={i}>
                {g.group && <div className="nav-label" style={{ paddingLeft: 0 }}>{g.group}</div>}
                <div className="sheet-nav">
                  {items.map((it) => (
                    <NavLink key={it.to} to={it.to}>
                      <it.icon size={20} aria-hidden />
                      {it.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
