// Browser stand-in for node:path.
export const dirname = (p: string) => p.split("/").slice(0, -1).join("/") || "/";
export const join = (...parts: string[]) => parts.join("/").replace(/\/+/g, "/");
export const resolve = join;
export default { dirname, join, resolve };
