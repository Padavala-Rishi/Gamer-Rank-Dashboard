import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Inbox, RefreshCw, X } from "lucide-react";
import { ApiError } from "../lib/api";

// ------------------------------------------------------------------ Button
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "default" | "now";
  size?: "sm" | "md" | "lg";
  icon?: boolean;
  loading?: boolean;
  block?: boolean;
};
export function Button({ variant = "default", size = "md", icon, loading, block, className = "", children, disabled, ...rest }: BtnProps) {
  const cls = [
    "btn",
    variant === "primary" && "btn-primary",
    variant === "ghost" && "btn-ghost",
    variant === "danger" && "btn-danger",
    variant === "now" && "now-button",
    size === "sm" && "btn-sm",
    size === "lg" && "btn-lg",
    icon && "btn-icon",
    block && "btn-block",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : null}
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Card
export function Card({ title, icon, actions, children, className = "", pad = false, footer }: { title?: ReactNode; icon?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; pad?: boolean; footer?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-header">
          {title ? (
            <h2>
              {icon}
              {title}
            </h2>
          ) : (
            <span />
          )}
          {actions ? <div className="row">{actions}</div> : null}
        </div>
      )}
      <div className={pad ? "card-pad" : "card-body"}>{children}</div>
      {footer ? <div className="card-footer">{footer}</div> : null}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="row wrap">{actions}</div> : null}
    </header>
  );
}

// ------------------------------------------------------------------ States
export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>
        {icon ?? <Inbox size={20} />}
      </div>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="error-box" role="alert">
      <AlertTriangle size={18} aria-hidden />
      <span className="grow">{msg}</span>
      {retry && (
        <Button size="sm" onClick={retry}>
          <RefreshCw size={14} aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ lines = 3, height = 16 }: { lines?: number; height?: number }) {
  return (
    <div className="col" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ height, width: `${90 - ((i * 17) % 35)}%` }} />
      ))}
    </div>
  );
}

/** Renders loading / error / content for a query-like object. */
export function Async<T>({ q, children, lines = 4 }: { q: { data?: T; isLoading: boolean; error: unknown; refetch: () => unknown }; children: (data: T) => ReactNode; lines?: number }) {
  if (q.isLoading) return <Skeleton lines={lines} />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (q.data === undefined) return null;
  return <>{children(q.data)}</>;
}

// ------------------------------------------------------------------ Modal
// While any modal is open, the app behind it is made inert (unreachable by keyboard and
// screen readers). Ref-counted so nested dialogs (e.g. a confirm inside a form) work.
let openModals = 0;
function setBackgroundInert(delta: number) {
  openModals = Math.max(0, openModals + delta);
  const root = document.getElementById("root");
  if (root) root.inert = openModals > 0;
}

export function Modal({ open, onClose, title, children, footer, wide, labelledBy }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? []);
    const first = el?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab") {
        const f = focusables();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setBackgroundInert(1);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      setBackgroundInert(-1);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? titleId}>
        {title !== undefined && (
          <div className="modal-header">
            <h2 id={titleId}>{title}</h2>
            <Button variant="ghost" icon size="sm" onClick={onClose} aria-label="Close">
              <X size={16} />
            </Button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ Confirm
interface ConfirmOpts {
  title: string;
  body?: ReactNode;
  confirm?: string;
  danger?: boolean;
  /** Extra choice, e.g. "Delete tasks too". */
  alt?: string;
}
type ConfirmResult = "confirm" | "alt" | false;
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<ConfirmResult>>(async () => false);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: ConfirmResult) => void }) | null>(null);
  const ask = useCallback((o: ConfirmOpts) => new Promise<ConfirmResult>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: ConfirmResult) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        footer={
          <>
            <Button onClick={() => close(false)}>Cancel</Button>
            {state?.alt && (
              <Button variant="danger" onClick={() => close("alt")}>
                {state.alt}
              </Button>
            )}
            <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close("confirm")} data-autofocus>
              {state?.confirm ?? "Confirm"}
            </Button>
          </>
        }
      >
        <div className="ink-2">{state?.body}</div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// ------------------------------------------------------------------ Form fields
export function Field({ label, hint, error, children, full, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; full?: boolean; htmlFor?: string }) {
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? (
        <span className="error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="hint">{hint}</span>
      ) : null}
    </div>
  );
}

export function Scale({ value, onChange, max = 5, labels, name }: { value: number | null | undefined; onChange: (v: number | null) => void; max?: number; labels?: [string, string]; name: string }) {
  return (
    <div>
      <div className="scale" role="radiogroup" aria-label={name}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-pressed={value === n} onClick={() => onChange(value === n ? null : n)}>
            {n}
          </button>
        ))}
      </div>
      {labels && (
        <div className="row between tiny muted mt-4">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      )}
    </div>
  );
}

export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: readonly (readonly [T, ReactNode])[]; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: readonly (readonly [T, ReactNode])[]; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, tone, label, expected }: { value: number | null | undefined; tone?: "warn" | "bad"; label?: string; expected?: number | null }) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  return (
    <div className="progress-marker">
      <div className={`progress ${tone ?? ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}>
        <span style={{ width: `${v * 100}%` }} />
      </div>
      {expected != null && <span className="expected" style={{ left: `calc(${Math.min(1, expected) * 100}% - 1px)` }} title={`Expected by now: ${Math.round(expected * 100)}%`} aria-hidden />}
    </div>
  );
}

export function Ring({ value, label }: { value: number | null | undefined; label?: string }) {
  const p = Math.round(Math.max(0, Math.min(1, value ?? 0)) * 100);
  return <div className="ring" style={{ ["--p" as string]: p }} data-label={label ?? `${p}%`} role="img" aria-label={`${label ?? p + "%"}`} />;
}

export function Stat({ label, value, unit, delta, deltaGood }: { label: string; value: ReactNode; unit?: string; delta?: string | null; deltaGood?: boolean | null }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
      {delta ? <span className={`stat-delta ${deltaGood == null ? "" : deltaGood ? "up" : "down"}`}>{delta}</span> : null}
    </div>
  );
}
