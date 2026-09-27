// User-scoped data access. Every query built here includes `user_id = ?`, and every
// foreign key written is verified to belong to the same user. This is the application-level
// equivalent of row-level security, enforced in one place instead of in each endpoint.
import type { z } from "zod";
import type { DB } from "./db";
import { ident, newId, nowIso } from "./db";
import { HttpError, badRequest, notFound } from "./http";

export interface Ctx {
  db: DB;
  userId: string;
  tz: string;
  today: string;
  isDemo?: boolean;
}

export interface M2M {
  field: string; // virtual array field on the resource, e.g. "value_ids"
  table: string; // join table
  self: string; // join column pointing at this resource
  other: string; // join column pointing at the related resource
  otherTable: string; // table the related ids must belong to (ownership check)
}

type Row = Record<string, unknown>;

export interface ResourceDef {
  name: string;
  table: string;
  schema: z.ZodObject<z.ZodRawShape>;
  /** field → table it references (verified for ownership) */
  refs?: Record<string, string>;
  json?: string[];
  bools?: string[];
  m2m?: M2M[];
  /** columns set only by the server (never accepted from clients) */
  serverColumns?: string[];
  order: string;
  filters?: string[];
  /** column used by ?from=&to= range filters */
  dateField?: string;
  searchColumns?: string[];
  /** Creating a row with the same values for these columns updates the existing row. */
  upsertOn?: string[];
  /** Columns that cannot change after creation. */
  immutable?: string[];
  /** Self-referencing parent column; cycles are rejected. */
  treeField?: string;
  beforeWrite?: (ctx: Ctx, data: Row, existing: Row | null) => void;
  afterWrite?: (ctx: Ctx, row: Row, existing: Row | null, input: Row) => void;
  beforeDelete?: (ctx: Ctx, row: Row, query: Record<string, unknown>) => void;
  /** Adds computed fields to rows for API responses. */
  decorate?: (ctx: Ctx, rows: Row[]) => void;
}

export function columnsOf(def: ResourceDef): string[] {
  const virtual = new Set((def.m2m ?? []).map((m) => m.field).concat(def.name === "notes" ? ["tags", "links"] : []));
  return Object.keys(def.schema.shape).filter((k) => !virtual.has(k)).concat(def.serverColumns ?? []);
}

function serialize(def: ResourceDef, data: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(data)) {
    if (def.json?.includes(k)) out[k] = v == null ? null : JSON.stringify(v);
    else if (typeof v === "boolean") out[k] = v ? 1 : 0;
    else out[k] = v;
  }
  return out;
}

export function deserialize(def: ResourceDef, row: Row): Row {
  const out: Row = { ...row };
  delete out.user_id;
  for (const k of def.json ?? []) {
    if (typeof out[k] === "string") {
      try {
        out[k] = JSON.parse(out[k] as string);
      } catch {
        out[k] = null;
      }
    }
  }
  for (const k of def.bools ?? []) if (k in out) out[k] = Boolean(out[k]);
  out.is_demo = Boolean(out.is_demo);
  return out;
}

export function assertOwned(ctx: Ctx, table: string, id: unknown, label = "Linked item"): void {
  if (id == null) return;
  const hit = ctx.db.prepare(`SELECT 1 FROM ${ident(table)} WHERE id = ? AND user_id = ?`).get(id, ctx.userId);
  // Same message whether it doesn't exist or belongs to someone else: no information leak.
  if (!hit) throw badRequest(`${label} not found`);
}

function assertNoCycle(ctx: Ctx, table: string, field: string, id: string, parentId: unknown): void {
  if (parentId == null) return;
  if (parentId === id) throw badRequest("An item cannot be its own parent.");
  let cur: unknown = parentId;
  const seen = new Set<string>();
  const stmt = ctx.db.prepare(`SELECT ${ident(field)} AS p FROM ${ident(table)} WHERE id = ? AND user_id = ?`);
  while (cur != null) {
    if (cur === id) throw badRequest("That would create a circular hierarchy.");
    if (seen.has(cur as string)) break;
    seen.add(cur as string);
    cur = (stmt.get(cur, ctx.userId) as { p: unknown } | undefined)?.p ?? null;
  }
}

/** Rejects join rows that would create a cycle (e.g. task A depends on B depends on A). */
function assertNoGraphCycle(ctx: Ctx, m: M2M, id: string, targets: string[]): void {
  const stmt = ctx.db.prepare(`SELECT ${ident(m.other)} AS o FROM ${ident(m.table)} WHERE ${ident(m.self)} = ?`);
  for (const start of targets) {
    const stack = [start];
    const seen = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === id) throw badRequest("That would create a circular dependency.");
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const r of stmt.all(cur) as { o: string }[]) stack.push(r.o);
    }
  }
}

function loadM2M(ctx: Ctx, def: ResourceDef, rows: Row[]): void {
  if (!def.m2m?.length || !rows.length) return;
  const ids = rows.map((r) => r.id as string);
  for (const m of def.m2m) {
    const map = new Map<string, string[]>();
    // Chunk to stay within SQLite's parameter limit.
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const sql = `SELECT ${ident(m.self)} AS s, ${ident(m.other)} AS o FROM ${ident(m.table)} WHERE ${ident(m.self)} IN (${chunk.map(() => "?").join(",")})`;
      for (const r of ctx.db.prepare(sql).all(...chunk) as { s: string; o: string }[]) {
        const arr = map.get(r.s) ?? [];
        arr.push(r.o);
        map.set(r.s, arr);
      }
    }
    for (const row of rows) row[m.field] = map.get(row.id as string) ?? [];
  }
}

function writeM2M(ctx: Ctx, def: ResourceDef, id: string, data: Row): void {
  for (const m of def.m2m ?? []) {
    const ids = data[m.field];
    if (!Array.isArray(ids)) continue;
    const unique = [...new Set(ids as string[])].filter((x) => x !== id);
    for (const other of unique) assertOwned(ctx, m.otherTable, other);
    if (m.otherTable === def.table) assertNoGraphCycle(ctx, m, id, unique);
    ctx.db.prepare(`DELETE FROM ${ident(m.table)} WHERE ${ident(m.self)} = ?`).run(id);
    const ins = ctx.db.prepare(`INSERT INTO ${ident(m.table)} (${ident(m.self)}, ${ident(m.other)}) VALUES (?, ?)`);
    for (const other of unique) ins.run(id, other);
  }
}

export interface ListOptions {
  filters?: Record<string, unknown>;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export function list(ctx: Ctx, def: ResourceDef, opts: ListOptions = {}): Row[] {
  const where = ["user_id = ?"];
  const params: unknown[] = [ctx.userId];
  for (const [k, v] of Object.entries(opts.filters ?? {})) {
    if (!def.filters?.includes(k) || v === undefined) continue;
    if (v === null || v === "null") where.push(`${ident(k)} IS NULL`);
    else if (Array.isArray(v)) {
      where.push(`${ident(k)} IN (${v.map(() => "?").join(",")})`);
      params.push(...v);
    } else {
      where.push(`${ident(k)} = ?`);
      params.push(typeof v === "boolean" ? (v ? 1 : 0) : v);
    }
  }
  if (def.dateField && opts.from) {
    where.push(`${ident(def.dateField)} >= ?`);
    params.push(opts.from);
  }
  if (def.dateField && opts.to) {
    where.push(`${ident(def.dateField)} <= ?`);
    params.push(opts.to);
  }
  if (opts.q && def.searchColumns?.length) {
    const like = `%${opts.q.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    where.push(`(${def.searchColumns.map((c) => `${ident(c)} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    params.push(...def.searchColumns.map(() => like));
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 2000, 1), 5000);
  const offset = Math.max(Number(opts.offset) || 0, 0);
  const rows = ctx.db
    .prepare(`SELECT * FROM ${ident(def.table)} WHERE ${where.join(" AND ")} ORDER BY ${def.order} LIMIT ${limit} OFFSET ${offset}`)
    .all(...params) as Row[];
  const out = rows.map((r) => deserialize(def, r));
  loadM2M(ctx, def, out);
  def.decorate?.(ctx, out);
  return out;
}

export function getRaw(ctx: Ctx, def: ResourceDef, id: string): Row | null {
  const row = ctx.db.prepare(`SELECT * FROM ${ident(def.table)} WHERE id = ? AND user_id = ?`).get(id, ctx.userId) as Row | undefined;
  return row ?? null;
}

export function get(ctx: Ctx, def: ResourceDef, id: string): Row {
  const raw = getRaw(ctx, def, id);
  if (!raw) throw notFound();
  const row = deserialize(def, raw);
  loadM2M(ctx, def, [row]);
  def.decorate?.(ctx, [row]);
  return row;
}

function validateRefs(ctx: Ctx, def: ResourceDef, data: Row): void {
  for (const [field, table] of Object.entries(def.refs ?? {})) {
    if (field in data && data[field] != null) assertOwned(ctx, table, data[field]);
  }
}

export function create(ctx: Ctx, def: ResourceDef, input: unknown): Row {
  const parsed = def.schema.parse(input) as Row;
  return ctx.db.transaction(() => {
    if (def.upsertOn?.length) {
      const where = def.upsertOn.map((c) => `${ident(c)} = ?`).join(" AND ");
      const existing = ctx.db
        .prepare(`SELECT id FROM ${ident(def.table)} WHERE user_id = ? AND ${where}`)
        .get(ctx.userId, ...def.upsertOn.map((c) => parsed[c])) as { id: string } | undefined;
      if (existing) return updateParsed(ctx, def, existing.id, parsed);
    }
    const id = newId();
    validateRefs(ctx, def, parsed);
    if (def.treeField) assertNoCycle(ctx, def.table, def.treeField, id, parsed[def.treeField]);
    def.beforeWrite?.(ctx, parsed, null);
    const cols = columnsOf(def).filter((c) => c in parsed);
    const values = serialize(def, parsed);
    const now = nowIso();
    const allCols = ["id", "user_id", "is_demo", "created_at", "updated_at", ...cols];
    ctx.db
      .prepare(`INSERT INTO ${ident(def.table)} (${allCols.map(ident).join(", ")}) VALUES (${allCols.map(() => "?").join(", ")})`)
      .run(id, ctx.userId, ctx.isDemo ? 1 : 0, now, now, ...cols.map((c) => values[c] ?? null));
    writeM2M(ctx, def, id, parsed);
    const row = get(ctx, def, id);
    def.afterWrite?.(ctx, row, null, parsed);
    return get(ctx, def, id);
  })();
}

function updateParsed(ctx: Ctx, def: ResourceDef, id: string, patch: Row): Row {
  const existingRaw = getRaw(ctx, def, id);
  if (!existingRaw) throw notFound();
  const existing = deserialize(def, existingRaw);
  loadM2M(ctx, def, [existing]);
  for (const f of def.immutable ?? []) {
    if (f in patch && patch[f] !== existing[f]) throw badRequest(`${f} cannot be changed`);
  }
  validateRefs(ctx, def, patch);
  if (def.treeField && def.treeField in patch) assertNoCycle(ctx, def.table, def.treeField, id, patch[def.treeField]);
  const merged = { ...existing, ...patch };
  def.beforeWrite?.(ctx, merged, existing);
  // Hooks may add server columns to `merged`; persist every known column that changed.
  const cols = columnsOf(def).filter((c) => c in patch || (def.serverColumns ?? []).includes(c));
  const values = serialize(def, merged);
  if (cols.length) {
    ctx.db
      .prepare(`UPDATE ${ident(def.table)} SET ${cols.map((c) => `${ident(c)} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(...cols.map((c) => values[c] ?? null), nowIso(), id, ctx.userId);
  }
  writeM2M(ctx, def, id, patch);
  const row = get(ctx, def, id);
  def.afterWrite?.(ctx, row, existing, patch);
  return get(ctx, def, id);
}

export function update(ctx: Ctx, def: ResourceDef, id: string, input: unknown): Row {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw badRequest("Expected an object");
  // Only validate the fields that were sent; defaults must not overwrite stored values.
  const keys = Object.keys(input).filter((k) => k in def.schema.shape);
  const partial = def.schema.pick(Object.fromEntries(keys.map((k) => [k, true])) as never).partial();
  const parsed = partial.parse(input) as Row;
  for (const k of Object.keys(parsed)) if (parsed[k] === undefined) delete parsed[k];
  return ctx.db.transaction(() => updateParsed(ctx, def, id, parsed))();
}

export function remove(ctx: Ctx, def: ResourceDef, id: string, query: Record<string, unknown> = {}): void {
  ctx.db.transaction(() => {
    const raw = getRaw(ctx, def, id);
    if (!raw) throw notFound();
    def.beforeDelete?.(ctx, deserialize(def, raw), query);
    const res = ctx.db.prepare(`DELETE FROM ${ident(def.table)} WHERE id = ? AND user_id = ?`).run(id, ctx.userId);
    if (res.changes !== 1) throw new HttpError(500, "Delete failed");
  })();
}
