/** Only same-site relative paths are allowed as a post-login destination (prevents open redirects). */
export function safeNext(next: unknown): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\r\n\t]/.test(next)) return "/";
  if (next.startsWith("/login") || next.startsWith("/signup")) return "/";
  return next;
}
