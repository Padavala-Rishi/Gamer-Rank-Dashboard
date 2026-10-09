import { CATEGORIES, CHART_ORDER, type CategoryKey } from "./constants";

export type Series = { key: string; label: string; color: string };

/** One series per life area, in the fixed, colour-blind-validated order. Server-safe (no client code). */
export const domainSeries = (keys: CategoryKey[] = CHART_ORDER): Series[] =>
  keys.map((k) => ({ key: k, label: CATEGORIES[k].name, color: `var(--c-${k})` }));

/** Generic categorical colours for non-domain series (same validated hues, same order). */
export const SERIES_COLORS = ["var(--c-college)", "var(--c-basketball)", "var(--c-dev)", "var(--c-health)"];
