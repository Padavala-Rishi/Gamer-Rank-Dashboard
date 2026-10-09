import type { ReactNode } from "react";
import { CATEGORIES, type AnyCategory } from "@/lib/constants";
import { Icon } from "./icon";

// Server-safe presentational pieces (no hooks).

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const DOMAIN_COLOR: Record<AnyCategory, string> = {
  basketball: "var(--c-basketball)", college: "var(--c-college)", dev: "var(--c-dev)", health: "var(--c-health)", life: "var(--c-life)",
};

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold leading-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, hint, actions, children, className }: { title?: ReactNode; hint?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("mb-6", className)}>
      {(title || actions) && (
        <div className="mb-2.5 flex items-end justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {hint && <p className="text-xs text-muted">{hint}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** value is 0..1 */
export function ProgressBar({ value, color, label, small, className }: { value: number; color?: string; label?: string; small?: boolean; className?: string }) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className={cx("bar", small && "bar-sm", className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
      <span style={{ width: `${pct * 100}%`, ...(color ? { background: color } : null) }} />
    </div>
  );
}

export function DomainIcon({ category, size = 18, className }: { category: AnyCategory; size?: number; className?: string }) {
  return <Icon name={CATEGORIES[category].icon} size={size} className={className} style={{ color: DOMAIN_COLOR[category] }} />;
}

export function DomainTag({ category }: { category: AnyCategory }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
      <span className="inline-block size-2 rounded-full" style={{ background: DOMAIN_COLOR[category] }} aria-hidden />
      {CATEGORIES[category].name}
    </span>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("card-inset p-3.5", className)}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="num mt-0.5 text-2xl font-semibold leading-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon = "inbox", title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card-flat flex flex-col items-center gap-2 px-6 py-9 text-center">
      <div className="grid size-11 place-items-center rounded-full bg-raised text-muted"><Icon name={icon} size={20} /></div>
      <div className="font-semibold">{title}</div>
      {children && <p className="max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "bad" | "good"; children: ReactNode; className?: string }) {
  const color = { info: "var(--muted)", warn: "var(--warn)", bad: "var(--bad)", good: "var(--good)" }[tone];
  return (
    <div className={cx("flex gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm", className)} style={{ borderColor: `color-mix(in oklab, ${color} 40%, var(--line))`, background: `color-mix(in oklab, ${color} 8%, transparent)` }} role={tone === "bad" ? "alert" : "note"}>
      <Icon name={tone === "good" ? "circle-check" : tone === "info" ? "info" : "alert-triangle"} size={16} className="mt-0.5 shrink-0" style={{ color }} />
      <div className="min-w-0 text-ink/90">{children}</div>
    </div>
  );
}

export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor?: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="err" role="alert">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

export function Money({ amount, currency }: { amount: number | string; currency: string }) {
  const n = Number(amount);
  let s: string;
  try {
    s = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency, maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
  } catch {
    s = `${currency} ${n}`;
  }
  return <span className="num">{s}</span>;
}
