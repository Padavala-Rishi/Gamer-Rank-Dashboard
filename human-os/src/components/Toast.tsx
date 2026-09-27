import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ToastItem {
  id: number;
  message: string;
  kind: "info" | "error";
  action?: { label: string; onClick: () => void };
}
interface ToastApi {
  show: (message: string, opts?: { kind?: "info" | "error"; action?: ToastItem["action"]; ms?: number }) => void;
  error: (err: unknown) => void;
}
const Ctx = createContext<ToastApi>({ show: () => {}, error: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));
  const show = useCallback<ToastApi["show"]>((message, opts = {}) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, message, kind: opts.kind ?? "info", action: opts.action }]);
    setTimeout(() => dismiss(id), opts.ms ?? (opts.kind === "error" ? 6000 : 3500));
  }, []);
  const error = useCallback((err: unknown) => show(err instanceof Error ? err.message : "Something went wrong.", { kind: "error" }), [show]);
  return (
    <Ctx.Provider value={{ show, error }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "error" ? "error" : ""}`}>
            <span>{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
