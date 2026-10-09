import { AuthForm } from "../auth-form";

export const metadata = { title: "Reset password · Level Up" };

export default function Page() {
  return (<><h1 className="mb-1 text-xl font-semibold">Reset your password</h1><p className="mb-4 text-sm text-muted">We'll email you a link to choose a new one.</p><AuthForm kind="forgot" /></>);
}
