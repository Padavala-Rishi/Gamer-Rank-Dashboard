"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icon";

/** Modal built on the native <dialog>: focus is trapped, Esc closes it, and the page behind is inert. */
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      style={wide ? { width: "min(46rem, calc(100vw - 1.5rem))" } : undefined}
      aria-labelledby="sheet-title"
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      onClose={() => { if (open) onClose(); }}
    >
      {open && (
        <div className="flex flex-col">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3.5">
            <h2 id="sheet-title" className="text-lg font-semibold">{title}</h2>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
          </div>
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
