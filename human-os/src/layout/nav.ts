import {
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarDays,
  CheckSquare,
  Compass,
  FolderKanban,
  GraduationCap,
  HeartPulse,
  Library,
  NotebookPen,
  Repeat,
  RotateCcw,
  Settings,
  Sparkles,
  Sun,
  Target,
  Timer,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  keywords?: string;
}

export const NAV: { group: string; items: NavItem[] }[] = [
  { group: "", items: [{ to: "/", label: "Today", icon: Sun, keywords: "dashboard home plan" }] },
  {
    group: "Execute",
    items: [
      { to: "/tasks", label: "Tasks", icon: CheckSquare, keywords: "todo inbox" },
      { to: "/calendar", label: "Calendar", icon: CalendarDays, keywords: "schedule time blocking" },
      { to: "/projects", label: "Projects", icon: FolderKanban, keywords: "kanban timeline" },
      { to: "/focus", label: "Focus", icon: Timer, keywords: "pomodoro deep work timer distraction" },
    ],
  },
  {
    group: "Direction",
    items: [
      { to: "/compass", label: "Compass", icon: Compass, keywords: "vision values purpose identity life areas" },
      { to: "/goals", label: "Goals", icon: Target, keywords: "objectives milestones okr" },
      { to: "/habits", label: "Habits", icon: Repeat, keywords: "streak routine" },
    ],
  },
  {
    group: "Life",
    items: [
      { to: "/learning", label: "Learning", icon: GraduationCap, keywords: "study courses flashcards exams" },
      { to: "/career", label: "Career & growth", icon: Briefcase, keywords: "skills applications personal development" },
      { to: "/health", label: "Health", icon: HeartPulse, keywords: "sleep exercise mood check-in environment" },
      { to: "/finance", label: "Finance", icon: Wallet, keywords: "money budget savings net worth" },
      { to: "/people", label: "People", icon: Users, keywords: "relationships family friends" },
    ],
  },
  {
    group: "Reflect",
    items: [
      { to: "/journal", label: "Journal", icon: NotebookPen, keywords: "reflection gratitude decisions" },
      { to: "/knowledge", label: "Knowledge", icon: Library, keywords: "notes wiki" },
      { to: "/reviews", label: "Reviews", icon: RotateCcw, keywords: "weekly monthly quarterly" },
      { to: "/analytics", label: "Analytics", icon: BarChart3, keywords: "charts trends insights" },
      { to: "/assistant", label: "Assistant", icon: Sparkles, keywords: "ai life audit chat" },
    ],
  },
  { group: "", items: [{ to: "/settings", label: "Settings", icon: Settings, keywords: "profile export privacy" }] },
];

export const ALL_NAV = NAV.flatMap((g) => g.items);
export const HELP_ICON = BookOpen;
