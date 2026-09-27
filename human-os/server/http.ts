import type { ErrorRequestHandler, Request } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`);

export function userId(req: Request): string {
  const id = (req as Request & { userId?: string }).userId;
  if (!id) throw new HttpError(401, "Not signed in");
  return id;
}

/** Turns a ZodError into { field: message } for display next to form inputs. */
export function fieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  void _next;
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Please check the highlighted fields.", fields: fieldErrors(err) });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON body" });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: "Request is too large" });
    return;
  }
  const code = typeof err?.code === "string" ? err.code : "";
  if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
    res.status(409).json({ error: "That already exists." });
    return;
  }
  if (code.startsWith("SQLITE_CONSTRAINT")) {
    res.status(400).json({ error: "That change isn't valid (it conflicts with related data)." });
    return;
  }
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Something went wrong on our side. Your data is safe — please try again." });
};
