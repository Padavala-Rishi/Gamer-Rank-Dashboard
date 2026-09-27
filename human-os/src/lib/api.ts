// Thin fetch wrapper: JSON in/out, cookies for auth, readable errors.
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export function onUnauthorized(fn: Listener) {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      signal: init.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, navigator.onLine ? "Couldn't reach the server. Please try again." : "You're offline. This will work again once you reconnect.");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; fields?: Record<string, string>; details?: unknown };
    if (res.status === 401 && !path.startsWith("/auth/")) unauthorizedListeners.forEach((fn) => fn());
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.fields, body.details);
  }
  return data as T;
}

export const get = <T,>(path: string) => api<T>(path);
export const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body });
export const patch = <T,>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
export const put = <T,>(path: string, body: unknown) => api<T>(path, { method: "PUT", body });
export const del = <T,>(path: string) => api<T>(path, { method: "DELETE" });

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * Switches the signed-in user in the client cache. Removes every cached query except the
 * session itself (so no data from a previous user can be shown), then sets the session.
 * Note: queryClient.clear() would detach the active session observer, so it isn't used.
 */
export function setSession(qc: import("@tanstack/react-query").QueryClient, user: { id: string; email: string } | null) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
  qc.setQueryData(["me"], { user });
}
