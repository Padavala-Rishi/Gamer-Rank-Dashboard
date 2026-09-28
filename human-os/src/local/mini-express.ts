// A tiny, Express-compatible router so the server's route modules run unchanged in the
// browser. Supports get/post/put/patch/delete, use() with path prefixes, :params, query
// parsing, res.status().json(), and sync or async handlers. Errors go to one error handler.
type Dict = Record<string, unknown>;
export interface MiniReq {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body: unknown;
  headers: Record<string, string>;
  ip: string;
  [k: string]: unknown;
}
export interface MiniRes {
  statusCode: number;
  body: unknown;
  finished: boolean;
  headers: Record<string, string>;
  status(code: number): MiniRes;
  json(body: unknown): MiniRes;
  send(body: unknown): MiniRes;
  setHeader(k: string, v: string): void;
}
type Next = (err?: unknown) => void;
type Handler = (req: MiniReq, res: MiniRes, next: Next) => unknown;
interface Layer {
  method: string | null;
  path: string;
  end: boolean;
  handlers: (Handler | MiniRouter)[];
}

function match(pattern: string, path: string, end: boolean): { params: Record<string, string>; rest: string } | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (end ? p.length !== s.length : p.length > s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return { params, rest: "/" + s.slice(p.length).join("/") };
}

export class MiniRouter {
  layers: Layer[] = [];
  private add(method: string | null, path: string, end: boolean, handlers: (Handler | MiniRouter)[]) {
    this.layers.push({ method, path, end, handlers });
    return this;
  }
  get(path: string, ...h: Handler[]) {
    return this.add("GET", path, true, h);
  }
  post(path: string, ...h: Handler[]) {
    return this.add("POST", path, true, h);
  }
  put(path: string, ...h: Handler[]) {
    return this.add("PUT", path, true, h);
  }
  patch(path: string, ...h: Handler[]) {
    return this.add("PATCH", path, true, h);
  }
  delete(path: string, ...h: Handler[]) {
    return this.add("DELETE", path, true, h);
  }
  use(a: string | Handler | MiniRouter, ...rest: (Handler | MiniRouter)[]) {
    if (typeof a === "string") return this.add(null, a, false, rest);
    return this.add(null, "/", false, [a, ...rest]);
  }
  /** Returns true once a response has been sent. */
  async handle(req: MiniReq, res: MiniRes, path: string): Promise<boolean> {
    for (const layer of this.layers) {
      if (layer.method && layer.method !== req.method) continue;
      const m = match(layer.path, path, layer.end);
      if (!m) continue;
      Object.assign(req.params, m.params);
      for (const h of layer.handlers) {
        if (h instanceof MiniRouter) {
          if (await h.handle(req, res, m.rest)) return true;
          continue;
        }
        let nextCalled = false;
        let nextErr: unknown;
        const out = h(req, res, (err?: unknown) => {
          nextCalled = true;
          nextErr = err;
        });
        if (out && typeof (out as Promise<unknown>).then === "function") await out;
        if (nextErr) throw nextErr;
        if (res.finished) return true;
        if (!nextCalled) return true;
      }
    }
    return false;
  }
}

export function Router(): MiniRouter {
  return new MiniRouter();
}

export function createResponse(): MiniRes {
  const res: MiniRes = {
    statusCode: 200,
    body: undefined,
    finished: false,
    headers: {},
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      res.finished = true;
      return res;
    },
    send(body) {
      return res.json(body);
    },
    setHeader(k, v) {
      res.headers[k.toLowerCase()] = v;
    },
  };
  return res;
}

export function createRequest(method: string, url: string, body: unknown): MiniReq {
  const u = new URL(url, "http://local");
  const query: Record<string, string | string[]> = {};
  u.searchParams.forEach((v, k) => {
    const cur = query[k];
    query[k] = cur === undefined ? v : Array.isArray(cur) ? [...cur, v] : [cur, v];
  });
  return { method: method.toUpperCase(), path: u.pathname, params: {}, query, body, headers: {}, ip: "local" } as MiniReq & Dict;
}

export default { Router };
