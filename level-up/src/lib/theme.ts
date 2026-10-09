export type Theme = "dark" | "light";
export const THEME_KEY = "lu:theme";

/** Show a theme now and remember it for the next first paint (the inline script in the root layout reads this). */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode: the database still holds the choice */ }
}
