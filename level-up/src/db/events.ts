// A tiny change bus. Server Actions used to call revalidatePath(); on-device, a successful write calls notifyChange()
// and every mounted page (LivePage) re-reads its data. Memoised reads register a reset so they never serve stale data.
const listeners = new Set<() => void>();
const resets = new Set<() => void>();
let version = 0;
let queued = false;

export const getVersion = () => version;

export function onChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function registerReset(fn: () => void): void { resets.add(fn); }

/** Drop memoised reads right away; tell the UI once the current burst of writes is over. */
export function notifyChange(): void {
  for (const r of resets) r();
  version++;
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; for (const l of [...listeners]) l(); });
}
