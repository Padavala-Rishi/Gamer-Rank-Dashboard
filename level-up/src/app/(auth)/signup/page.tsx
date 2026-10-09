import { AuthForm } from "../auth-form";

export const metadata = { title: "Create your character · Level Up" };

export default function Page() {
  return (<><h1 className="mb-4 text-xl font-semibold">Create your character</h1><AuthForm kind="signup" /></>);
}
