import { Router, type Request } from "express";
import type { DB } from "./db";
import { notFound, userId } from "./http";
import { getProfile } from "./profile";
import { todayIn } from "../shared/dates";
import { RESOURCE_BY_NAME } from "./resources";
import * as repo from "./repo";
import type { Ctx } from "./repo";

export function makeCtx(db: DB, req: Request): Ctx {
  const uid = userId(req);
  const profile = getProfile(db, uid);
  return { db, userId: uid, tz: profile.timezone, today: todayIn(profile.timezone) };
}

function resourceFor(name: string) {
  const def = RESOURCE_BY_NAME.get(name);
  if (!def) throw notFound("Resource type");
  return def;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** Generic REST endpoints: /api/r/:resource[/:id] */
export function crudRouter(db: DB): Router {
  const r = Router();

  r.get("/:resource", (req, res) => {
    const def = resourceFor(req.params.resource);
    const ctx = makeCtx(db, req);
    const q = req.query as Record<string, unknown>;
    const filters: Record<string, unknown> = {};
    for (const f of def.filters ?? []) {
      const v = q[f];
      if (typeof v === "string") filters[f] = v.includes(",") ? v.split(",") : v === "true" ? true : v === "false" ? false : v;
    }
    res.json(
      repo.list(ctx, def, {
        filters,
        from: str(q.from),
        to: str(q.to),
        q: str(q.q)?.slice(0, 100),
        limit: Number(q.limit) || undefined,
        offset: Number(q.offset) || undefined,
      }),
    );
  });

  r.get("/:resource/:id", (req, res) => {
    const def = resourceFor(req.params.resource);
    res.json(repo.get(makeCtx(db, req), def, req.params.id));
  });

  r.post("/:resource", (req, res) => {
    const def = resourceFor(req.params.resource);
    res.status(201).json(repo.create(makeCtx(db, req), def, req.body));
  });

  r.patch("/:resource/:id", (req, res) => {
    const def = resourceFor(req.params.resource);
    res.json(repo.update(makeCtx(db, req), def, req.params.id, req.body));
  });

  r.delete("/:resource/:id", (req, res) => {
    const def = resourceFor(req.params.resource);
    repo.remove(makeCtx(db, req), def, req.params.id, req.query as Record<string, unknown>);
    res.json({ ok: true });
  });

  return r;
}
