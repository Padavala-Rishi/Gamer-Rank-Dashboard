import type { Executor } from "./open";

// A small supabase-js–compatible query builder that talks to the on-device Postgres. It implements exactly the
// calls this app makes (and fails loudly on anything else), so pages and actions keep their original code.
// Reads are wrapped in to_jsonb(), which makes dates, timestamps and numerics come back the way PostgREST sent them.

export type DbError = { message: string; code?: string; details?: string | null; hint?: string | null };
// data is `any`, as with an untyped supabase-js client: callers cast to their own row types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result<T = any> = { data: T; error: DbError | null; count?: number | null };
type Op = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "is";
type Filter = { col: string; op: Op; value: unknown; negate: boolean };
type Order = { col: string; asc: boolean; nullsFirst?: boolean };

const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (s: string): string => {
  if (!IDENT.test(s)) throw new Error(`Unsupported identifier: ${s}`);
  return `"${s}"`;
};

/** Embedded to-one relations the app selects, e.g. task_completions → tasks(…). */
const EMBEDS: Record<string, Record<string, { table: string; fk: string; ref: string }>> = {
  task_completions: { tasks: { table: "tasks", fk: "task_id", ref: "id" } },
  user_achievements: { achievement_defs: { table: "achievement_defs", fk: "key", ref: "key" } },
};

/** Split "a,b,emb(c,d)" at top-level commas. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function selectList(table: string, columns: string, src: string): string {
  const items = splitTop(columns || "*");
  return items.map((item) => {
    if (item === "*") return `${src}.*`;
    const m = /^([a-z_][a-z0-9_]*)\((.*)\)$/s.exec(item);
    if (m) {
      const rel = EMBEDS[table]?.[m[1]];
      if (!rel) throw new Error(`Unsupported embed ${m[1]} on ${table}`);
      const inner = splitTop(m[2]).map(ident).join(", ");
      return `(select to_jsonb(e) from (select ${inner} from public.${ident(rel.table)} where ${ident(rel.ref)} = ${src}.${ident(rel.fk)}) e) as ${ident(m[1])}`;
    }
    return `${src}.${ident(item)}`;
  }).join(", ");
}

function toError(e: unknown): DbError {
  const x = e as { message?: string; code?: string; detail?: string; hint?: string };
  return { message: x?.message ?? String(e), code: x?.code, details: x?.detail ?? null, hint: x?.hint ?? null };
}

class Builder<D = any[]> implements PromiseLike<Result<D>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private cols = "*";
  private returning = false;
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private lim: number | null = null;
  private off = 0;
  private mode: "many" | "single" | "maybe" = "many";
  private countExact = false;
  private head = false;
  private payload: Record<string, unknown>[] = [];
  private patch: Record<string, unknown> = {};
  private conflict: string[] | null = null;
  private ignoreDup = false;

  constructor(private exec: Executor, private table: string) { ident(table); }

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    if (this.op === "select") this.cols = columns; else { this.cols = columns; this.returning = true; }
    if (opts?.count) this.countExact = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(rows: Record<string, unknown> | Record<string, unknown>[], _opts?: { defaultToNull?: boolean }) { this.op = "insert"; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert"; this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflict = opts?.onConflict ? opts.onConflict.split(",").map((s) => s.trim()) : null;
    this.ignoreDup = !!opts?.ignoreDuplicates;
    return this;
  }
  update(values: Record<string, unknown>) { this.op = "update"; this.patch = values; return this; }
  delete() { this.op = "delete"; return this; }

  private f(col: string, op: Op, value: unknown, negate = false) { ident(col); this.filters.push({ col, op, value, negate }); return this; }
  eq(c: string, v: unknown) { return this.f(c, "eq", v); }
  neq(c: string, v: unknown) { return this.f(c, "neq", v); }
  gt(c: string, v: unknown) { return this.f(c, "gt", v); }
  gte(c: string, v: unknown) { return this.f(c, "gte", v); }
  lt(c: string, v: unknown) { return this.f(c, "lt", v); }
  lte(c: string, v: unknown) { return this.f(c, "lte", v); }
  in(c: string, v: unknown[]) { return this.f(c, "in", v); }
  is(c: string, v: null | boolean) { return this.f(c, "is", v); }
  not(c: string, op: string, v: unknown) {
    if (!["eq", "neq", "gt", "gte", "lt", "lte", "in", "is"].includes(op)) throw new Error(`Unsupported not() operator: ${op}`);
    return this.f(c, op as Op, v, true);
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) { ident(col); this.orders.push({ col, asc: opts?.ascending !== false, nullsFirst: opts?.nullsFirst }); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(from: number, to: number) { this.off = from; this.lim = to - from + 1; return this; }
  single() { this.mode = "single"; return this as unknown as Builder<any>; } // eslint-disable-line @typescript-eslint/no-explicit-any
  maybeSingle() { this.mode = "maybe"; return this as unknown as Builder<any>; } // eslint-disable-line @typescript-eslint/no-explicit-any

  private where(params: unknown[]): string {
    if (!this.filters.length) return "";
    const parts = this.filters.map(({ col, op, value, negate }) => {
      const c = `t.${ident(col)}`;
      let sql: string;
      if (op === "is") sql = value === null ? `${c} is null` : `${c} is ${value ? "true" : "false"}`;
      else if (op === "in") { params.push(value); sql = `${c} = any($${params.length})`; }
      else {
        params.push(value);
        sql = `${c} ${{ eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[op]} $${params.length}`;
      }
      return negate ? `not (${sql})` : sql;
    });
    return ` where ${parts.join(" and ")}`;
  }

  private orderBy(): string {
    if (!this.orders.length) return "";
    return " order by " + this.orders.map((o) => `t.${ident(o.col)} ${o.asc ? "asc" : "desc"}${o.nullsFirst === undefined ? "" : o.nullsFirst ? " nulls first" : " nulls last"}`).join(", ");
  }

  private build(): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const tbl = `public.${ident(this.table)}`;
    const wrap = (src: string) => `select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) as data from (select ${selectList(this.table, this.cols, "r")} from ${src} r) q`;

    if (this.op === "select") {
      const w = this.where(params);
      if (this.head) return { sql: `select count(*)::int as count from ${tbl} t${w}`, params };
      const lim = this.lim != null ? ` limit ${Math.max(0, Math.floor(this.lim))}` : "";
      const off = this.off ? ` offset ${Math.floor(this.off)}` : "";
      const count = this.countExact ? `, (select count(*)::int from ${tbl} t${w}) as count` : "";
      const body = `select ${selectList(this.table, this.cols, "t")} from ${tbl} t${w}${this.orderBy()}${lim}${off}`;
      return { sql: `select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) as data${count} from (${body}) q`, params };
    }

    if (this.op === "insert" || this.op === "upsert") {
      if (!this.payload.length) return { sql: `select '[]'::jsonb as data`, params };
      const keys = [...new Set(this.payload.flatMap((r) => Object.keys(r).filter((k) => r[k] !== undefined)))];
      if (!keys.length) throw new Error("insert with no columns");
      // Missing keys use the column default (not NULL), unlike PostgREST's bulk-insert behaviour.
      const rows = this.payload.map((r) => `(${keys.map((k) => {
        if (r[k] === undefined) return "default";
        params.push(r[k]);
        return `$${params.length}`;
      }).join(", ")})`);
      let sql = `insert into ${tbl} (${keys.map(ident).join(", ")}) values ${rows.join(", ")}`;
      if (this.op === "upsert") {
        const target = (this.conflict ?? ["id"]).map(ident).join(", ");
        const set = keys.filter((k) => !(this.conflict ?? ["id"]).includes(k)).map((k) => `${ident(k)} = excluded.${ident(k)}`);
        sql += ` on conflict (${target}) ` + (this.ignoreDup || !set.length ? "do nothing" : `do update set ${set.join(", ")}`);
      }
      return { sql: `with m as (${sql} returning *) ${this.returning ? wrap("m") : "select null::jsonb as data"}`, params };
    }

    if (this.op === "update") {
      const entries = Object.entries(this.patch).filter(([, v]) => v !== undefined);
      if (!entries.length) throw new Error("update with no values");
      const sets = entries.map(([k, v]) => { params.push(v); return `${ident(k)} = $${params.length}`; });
      const w = this.where(params);
      return { sql: `with m as (update ${tbl} t set ${sets.join(", ")}${w} returning t.*) ${this.returning ? wrap("m") : "select null::jsonb as data"}`, params };
    }

    const w = this.where(params);
    return { sql: `with m as (delete from ${tbl} t${w} returning t.*) ${this.returning ? wrap("m") : "select null::jsonb as data"}`, params };
  }

  private async run(): Promise<Result> {
    try {
      const { sql, params } = this.build();
      const { rows } = await this.exec(sql, params);
      const row = rows[0] ?? {};
      if (this.head) return { data: null, error: null, count: (row.count as number) ?? 0 };
      let data = (row.data ?? null) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (this.mode !== "many" && Array.isArray(data)) {
        if (data.length === 1) data = data[0];
        else if (data.length === 0 && this.mode === "maybe") data = null;
        else return { data: null, error: { message: data.length ? "Multiple rows returned" : "No rows returned", code: "PGRST116", details: `The result contains ${data.length} rows`, hint: null } };
      }
      return { data, error: null, count: (row.count as number | undefined) ?? null };
    } catch (e) {
      return { data: null, error: toError(e) };
    }
  }

  then<A = Result<D>, B = never>(ok?: ((v: Result<D>) => A | PromiseLike<A>) | null, bad?: ((r: unknown) => B | PromiseLike<B>) | null) {
    return (this.run() as Promise<Result<D>>).then(ok, bad);
  }
}

export type DbClient = ReturnType<typeof makeClient>;

export function makeClient(exec: Executor) {
  const setReturning = new Map<string, boolean>();
  return {
    from: (table: string) => new Builder(exec, table),
    /** Call a database function with named arguments. Set-returning functions give an array of rows, like PostgREST. */
    async rpc(fn: string, args: Record<string, unknown> = {}): Promise<Result> {
      try {
        ident(fn);
        if (!setReturning.has(fn)) {
          const { rows } = await exec(`select bool_or(p.proretset or t.typtype = 'c') as setof from pg_proc p join pg_type t on t.oid = p.prorettype where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fn]);
          if (rows[0]?.setof == null) return { data: null, error: { message: `Could not find the function public.${fn}`, code: "PGRST202" } };
          setReturning.set(fn, rows[0].setof === true);
        }
        const params: unknown[] = [];
        const named = Object.entries(args).filter(([, v]) => v !== undefined).map(([k, v]) => { params.push(v); return `${ident(k)} => $${params.length}`; }).join(", ");
        const call = `public.${ident(fn)}(${named})`;
        const sql = setReturning.get(fn)
          ? `select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) as data from ${call} f`
          : `select ${call} as data`;
        const { rows } = await exec(sql, params);
        return { data: rows[0]?.data ?? null, error: null };
      } catch (e) {
        return { data: null, error: toError(e) };
      }
    },
  };
}
