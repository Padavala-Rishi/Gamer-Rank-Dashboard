import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { api, del, get, patch, post, qs } from "./api";
import { useToast } from "../components/Toast";
import type { Profile } from "./types";
import { todayIn } from "../../shared/dates";

type Params = Record<string, string | number | boolean | null | undefined>;

export function useResource<T>(name: string, params: Params = {}, opts: Partial<UseQueryOptions<T[]>> = {}) {
  return useQuery<T[]>({ queryKey: ["r", name, params], queryFn: () => get<T[]>(`/r/${name}${qs(params)}`), ...opts });
}

export function useOne<T>(name: string, id: string | null | undefined) {
  return useQuery<T>({ queryKey: ["r", name, "one", id], queryFn: () => get<T>(`/r/${name}/${id}`), enabled: !!id });
}

export function useApi<T>(path: string | null, opts: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({ queryKey: ["api", path], queryFn: () => get<T>(path!), enabled: !!path, ...opts });
}

/** Mutations invalidate every cached query: dashboards stay accurate after any change. */
export function useMutate() {
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => qc.invalidateQueries(),
  });
  return useMemo(() => {
    const run = async <T,>(fn: () => Promise<T>, opts: { success?: string; silentError?: boolean } = {}): Promise<T> => {
      try {
        const r = (await m.mutateAsync(fn)) as T;
        if (opts.success) toast.show(opts.success);
        return r;
      } catch (e) {
        if (!opts.silentError) toast.error(e);
        throw e;
      }
    };
    return {
      pending: m.isPending,
      run,
      create: <T,>(name: string, data: unknown, opts?: { success?: string; silentError?: boolean }) => run(() => post<T>(`/r/${name}`, data), opts),
      update: <T,>(name: string, id: string, data: unknown, opts?: { success?: string; silentError?: boolean }) => run(() => patch<T>(`/r/${name}/${id}`, data), opts),
      remove: (name: string, id: string, query: Params = {}, opts?: { success?: string }) => run(() => del(`/r/${name}/${id}${qs(query)}`), opts),
      call: <T,>(path: string, body?: unknown, method = "POST", opts?: { success?: string; silentError?: boolean }) => run(() => api<T>(path, { method, body }), opts),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.isPending, qc, toast]);
}

export function useProfile() {
  return useQuery<Profile>({ queryKey: ["api", "/profile"], queryFn: () => get<Profile>("/profile"), staleTime: 60_000 });
}

export function useToday(): string {
  const { data } = useProfile();
  const tz = data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [today, setToday] = useState(() => todayIn(tz));
  useEffect(() => {
    setToday(todayIn(tz));
    const t = setInterval(() => setToday(todayIn(tz)), 60_000);
    return () => clearInterval(t);
  }, [tz]);
  return today;
}

export function useTz(): string {
  const { data } = useProfile();
  return data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`hos:${key}`);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (nv: T) => {
    setV(nv);
    try {
      localStorage.setItem(`hos:${key}`, JSON.stringify(nv));
    } catch {
      /* storage unavailable: keep in memory */
    }
  };
  return [v, set];
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Human OS` : "Human OS";
  }, [title]);
}
