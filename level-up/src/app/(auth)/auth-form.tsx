"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { signIn, signUp, requestReset, updatePassword, type AuthState } from "@/app/actions/auth";
import { Notice } from "@/components/ui";

type Kind = "login" | "signup" | "forgot" | "reset";

export function AuthForm({ kind, next, linkError }: { kind: Kind; next?: string; linkError?: boolean }) {
  const action = { login: signIn, signup: signUp, forgot: requestReset, reset: updatePassword }[kind];
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, null);
  const [tz, setTz] = useState("");
  useEffect(() => { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);
  const f = state?.fields ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {linkError && <Notice tone="warn">That link has expired or was already used. Request a new one.</Notice>}
      {kind === "signup" && (
        <div>
          <label className="label" htmlFor="name">Character name</label>
          <input id="name" name="name" className="input" autoComplete="nickname" maxLength={40} placeholder="What should we call you?" />
        </div>
      )}
      {kind !== "reset" && (
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" inputMode="email" required aria-invalid={!!f.email} />
          {f.email && <p className="err" role="alert">{f.email}</p>}
        </div>
      )}
      {kind !== "forgot" && (
        <div>
          <label className="label" htmlFor="password">{kind === "reset" ? "New password" : "Password"}</label>
          <input id="password" name="password" type="password" className="input" autoComplete={kind === "login" ? "current-password" : "new-password"} required minLength={kind === "login" ? undefined : 8} aria-invalid={!!f.password} />
          {f.password ? <p className="err" role="alert">{f.password}</p> : kind !== "login" && <p className="hint">At least 8 characters.</p>}
        </div>
      )}
      {kind === "reset" && (
        <div>
          <label className="label" htmlFor="confirm">Confirm password</label>
          <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" required />
        </div>
      )}
      {next && <input type="hidden" name="next" value={next} />}
      {kind === "signup" && <input type="hidden" name="timezone" value={tz} />}
      {state?.error && Object.keys(f).length === 0 && <Notice tone="bad">{state.error}</Notice>}
      {state?.info && <Notice tone="good">{state.info}</Notice>}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "One moment…" : { login: "Sign in", signup: "Create account", forgot: "Send reset link", reset: "Set new password" }[kind]}
      </button>
      <div className="flex justify-between text-sm text-muted">
        {kind === "login" && (<><Link className="hover:text-ink" href="/forgot-password">Forgot password?</Link><Link className="hover:text-ink" href="/signup">Create an account</Link></>)}
        {kind === "signup" && <Link className="hover:text-ink" href="/login">Already have an account? Sign in</Link>}
        {kind === "forgot" && <Link className="hover:text-ink" href="/login">Back to sign in</Link>}
      </div>
    </form>
  );
}
