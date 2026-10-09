import {
  Activity, AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Award, Banknote, Bed, Beef, Bell, Bird, BookOpen, BookOpenCheck, Bot, Brain, CalendarCheck,
  CalendarClock, CalendarDays, ChartColumn, Check, CircleCheck, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Clock, CodeXml, Compass, Crown, Crosshair,
  Download, Droplets, Dumbbell, Ellipsis, Flag, Flame, Footprints, Gem, Ghost, Gift, GraduationCap, Handshake, HeartPulse, House, Inbox, Info, Layers, Lightbulb, Link,
  ListChecks, ListTodo, Lock, LogOut, Map, Medal, Moon, MoonStar, Mountain, Pause, Pencil, Play, Plus, Repeat, RotateCcw, Rocket, Scale, Search, Send, Settings, Shield, SkipForward, Sparkles, Star, Sun,
  Swords, Target, Terminal, Timer, Trash2, TrendingDown, TrendingUp, Trophy, Undo2, Upload, User, Users, WandSparkles, Wallet, X, Zap,
  type LucideProps,
} from "lucide-react";

/** Lucide has no basketball glyph; this one is drawn in the same 24px stroke style. */
export function BasketballIcon({ size = 24, strokeWidth = 2, ...props }: LucideProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v20" />
      <path d="M2 12h20" />
      <path d="M4.9 4.9c3.6 3.6 3.6 10.6 0 14.2" />
      <path d="M19.1 4.9c-3.6 3.6-3.6 10.6 0 14.2" />
    </svg>
  );
}

const ICONS = {
  activity: Activity, "alert-triangle": AlertTriangle, "arrow-down": ArrowDown, "arrow-left": ArrowLeft, "arrow-right": ArrowRight, "arrow-up": ArrowUp, award: Award,
  banknote: Banknote, basketball: BasketballIcon, bed: Bed, beef: Beef, bell: Bell, bird: Bird, "book-open": BookOpen, "book-open-check": BookOpenCheck, bot: Bot, brain: Brain,
  "calendar-check": CalendarCheck, "calendar-clock": CalendarClock, "calendar-days": CalendarDays, "chart-column": ChartColumn, check: Check, "circle-check": CircleCheck,
  "chevron-down": ChevronDown, "chevron-left": ChevronLeft, "chevron-right": ChevronRight, "clipboard-check": ClipboardCheck, clock: Clock, "code-xml": CodeXml, compass: Compass, crown: Crown,
  crosshair: Crosshair, download: Download, droplets: Droplets, dumbbell: Dumbbell, ellipsis: Ellipsis, flag: Flag, flame: Flame, footprints: Footprints, gem: Gem, ghost: Ghost,
  gift: Gift, "graduation-cap": GraduationCap, handshake: Handshake, "heart-pulse": HeartPulse, house: House, inbox: Inbox, info: Info, layers: Layers, lightbulb: Lightbulb, link: Link,
  "list-checks": ListChecks, "list-todo": ListTodo, lock: Lock, "log-out": LogOut, map: Map, medal: Medal, moon: Moon, "moon-star": MoonStar, mountain: Mountain, pause: Pause,
  pencil: Pencil, play: Play, plus: Plus, repeat: Repeat, "rotate-ccw": RotateCcw, rocket: Rocket, scale: Scale, search: Search, send: Send, settings: Settings, shield: Shield,
  "skip-forward": SkipForward, sparkles: Sparkles, star: Star, sun: Sun, swords: Swords, target: Target, terminal: Terminal, timer: Timer, "trash-2": Trash2,
  "trending-down": TrendingDown, "trending-up": TrendingUp, trophy: Trophy, "undo-2": Undo2, upload: Upload, user: User, users: Users, "wand-sparkles": WandSparkles, wallet: Wallet, x: X, zap: Zap,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const C = (ICONS as Record<string, (p: LucideProps) => React.ReactNode>)[name] ?? Sparkles;
  return <C aria-hidden {...props} />;
}
