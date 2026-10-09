import { AuthForm } from "../auth-form";

export const metadata = { title: "New password · Level Up" };

export default function Page() {
  return (<><h1 className="mb-4 text-xl font-semibold">Choose a new password</h1><AuthForm kind="reset" /></>);
}
