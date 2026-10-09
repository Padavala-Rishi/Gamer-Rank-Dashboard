import type { ReactNode } from "react";
import { Icon } from "@/components/icon";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-7 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-xl bg-accent text-accent-ink"><Icon name="swords" size={22} /></div>
        <div>
          <div className="display text-xl font-semibold leading-none">Level Up</div>
          <div className="mt-1 text-xs text-muted">Your life, played like a game worth winning.</div>
        </div>
      </div>
      <div className="card p-6">{children}</div>
      <p className="mt-5 text-center text-xs text-faint">Your data is private to your account.</p>
    </main>
  );
}
