"use client";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { DbLockedError } from "@/db/client";
import { notifyChange, onChange } from "@/db/events";
import { getContext } from "@/lib/data/context";
import { todayIn } from "@/lib/dates";

type SP = Record<string, string | undefined>;
type View = (props: { searchParams: Promise<SP> }) => Promise<ReactNode>;

/**
 * Re-runs `load` whenever data is written (notifyChange) or the date rolls over, and keeps the previous result on
 * screen while it does, so open forms and sheets don't lose their state. Stale results are dropped.
 */
export function useLive<T>(load: () => Promise<T>, key: string): { data: T | undefined; error: unknown } {
  const [state, setState] = useState<{ key: string; data: T } | null>(null);
  const [failure, setFailure] = useState<{ key: string; error: unknown } | null>(null);
  const token = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let alive = true;
    const run = () => {
      const mine = ++token.current;
      loadRef.current().then(
        (d) => { if (alive && mine === token.current) { setState({ key, data: d }); setFailure(null); } },
        (e) => { if (alive && mine === token.current) { if (!(e instanceof DbLockedError)) console.error("[data]", e); setFailure({ key, error: e }); } },
      );
    };
    run();
    const off = onChange(run);
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      try { const c = await getContext(); if (todayIn(c.profile.timezone) !== c.today) notifyChange(); } catch { /* the page shows its own error */ }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; off(); document.removeEventListener("visibilitychange", onVisible); };
  }, [key]);

  // Content that belongs to another URL (e.g. the previous tab) is never shown under this one.
  return { data: state?.key === key ? state.data : undefined, error: failure?.key === key ? failure.error : null };
}

/**
 * Runs a page's async data function in the browser and renders what it returns. There is no server: pages read the
 * on-device database.
 */
export function LivePage({ view, title }: { view: View; title?: string }) {
  useEffect(() => { document.title = title ? `${title} · Level Up` : "Level Up"; }, [title]);
  return (
    <Suspense fallback={<Skeleton />}>
      <Live view={view} />
    </Suspense>
  );
}

function Live({ view }: { view: View }) {
  const key = useSearchParams().toString();
  const { data, error } = useLive(() => view({ searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(key))) }), key);
  if (error && data === undefined) return <DbProblem error={error} />;
  return data ?? <Skeleton />;
}

export function DbProblem({ error }: { error: unknown }) {
  return error instanceof DbLockedError ? <Locked /> : <Failed error={error} />;
}

/** Shown while the on-device database opens (the very first launch also creates it). */
export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center px-6" role="status" aria-live="polite" data-testid="splash">
      <div className="text-center">
        <div className="mx-auto grid size-12 animate-pulse place-items-center rounded-2xl bg-accent text-accent-ink"><span className="display text-xl font-bold">L</span></div>
        <p className="mt-4 text-sm text-muted">Opening your data…</p>
        <p className="mt-1 text-xs text-faint">Everything stays on this device.</p>
      </div>
    </div>
  );
}

export function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="card h-40 animate-pulse" />
      <div className="card h-24 animate-pulse" />
      <div className="card h-24 animate-pulse" />
    </div>
  );
}

export function Locked() {
  return (
    <div className="card mx-auto mt-16 max-w-md p-6 text-center" role="alert" data-testid="db-locked">
      <h1 className="text-lg font-semibold">Level Up is open in another tab</h1>
      <p className="mt-2 text-sm text-muted">Your data lives on this device and only one tab can use it at a time. Close the other tab or window, then reload this one.</p>
      <button className="btn btn-primary mt-4" onClick={() => location.reload()}>Reload</button>
    </div>
  );
}

function Failed({ error }: { error: unknown }) {
  return (
    <div className="card mx-auto mt-16 max-w-md p-6 text-center" role="alert" data-testid="db-failed">
      <h1 className="text-lg font-semibold">Couldn't open your data</h1>
      <p className="mt-2 text-sm text-muted">{error instanceof Error ? error.message : "Something went wrong."} Reloading usually fixes it. Your data is still on this device.</p>
      <button className="btn btn-primary mt-4" onClick={() => location.reload()}>Reload</button>
    </div>
  );
}
