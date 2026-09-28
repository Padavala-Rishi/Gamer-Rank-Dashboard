// Build-time flags, replaced with literals by Vite's `define` (see vite.config.ts and
// vite.local.config.ts) so unused code paths are removed from each bundle.
//  - LOCAL: the whole API runs inside the browser on an on-device SQLite database.
//  - EMBED: a self-contained preview (in-memory routing, opens with demo data).
declare global {
  const __LOCAL_MODE__: boolean;
  const __EMBED_MODE__: boolean;
}
export const IS_LOCAL: boolean = __LOCAL_MODE__;
export const IS_EMBED: boolean = __EMBED_MODE__;
