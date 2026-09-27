import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sun } from "lucide-react";
import { post, ApiError, setSession } from "../lib/api";
import { Button, Field } from "../components/ui";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrors({});
    setBusy(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await post<{ user: { id: string; email: string } }>(`/auth/${mode}`, mode === "register" ? { email, password, timezone } : { email, password });
      setSession(qc, res.user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.fields) setErrors(err.fields);
      } else setError("Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="row" style={{ marginBottom: 24, justifyContent: "center" }}>
          <span className="brand-mark" aria-hidden>
            <Sun size={16} />
          </span>
          <span className="strong" style={{ fontSize: 17 }}>
            Human OS
          </span>
        </div>
        <div className="card card-pad">
          <h1 style={{ fontSize: 20 }}>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="muted mt-4">{mode === "login" ? "Sign in to your personal operating system." : "Your data stays private to your account."}</p>
          <form onSubmit={submit} className="col gap-12 mt-16" noValidate>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <Field label="Email" error={errors.email} htmlFor="email">
              <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required aria-invalid={!!errors.email} autoFocus />
            </Field>
            <Field label="Password" error={errors.password} hint={mode === "register" ? "At least 10 characters. A short sentence works well." : undefined} htmlFor="password">
              <input
                id="password"
                className="input"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "register" ? 10 : undefined}
                aria-invalid={!!errors.password}
              />
            </Field>
            <Button type="submit" variant="primary" size="lg" block loading={busy}>
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </div>
        <p className="muted small" style={{ textAlign: "center", marginTop: 16 }}>
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
              setErrors({});
            }}
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
