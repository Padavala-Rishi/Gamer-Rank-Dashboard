export type NavItem = { href: string; label: string; icon: string; group: "main" | "domains" | "progress" | "system" };

export const NAV: NavItem[] = [
  { href: "/", label: "Character", icon: "house", group: "main" },
  { href: "/quests", label: "Quests", icon: "list-todo", group: "main" },
  { href: "/calendar", label: "Calendar", icon: "calendar-days", group: "main" },
  { href: "/basketball", label: "Basketball", icon: "basketball", group: "domains" },
  { href: "/college", label: "College", icon: "graduation-cap", group: "domains" },
  { href: "/dev", label: "Development", icon: "code-xml", group: "domains" },
  { href: "/health", label: "Health & Physique", icon: "heart-pulse", group: "domains" },
  { href: "/stats", label: "Stats", icon: "chart-column", group: "progress" },
  { href: "/achievements", label: "Achievements", icon: "trophy", group: "progress" },
  { href: "/coach", label: "AI Coach", icon: "bot", group: "progress" },
  { href: "/settings", label: "Settings", icon: "settings", group: "system" },
];

export const GROUP_LABEL: Record<NavItem["group"], string> = { main: "Play", domains: "Train", progress: "Progress", system: "" };

export const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
