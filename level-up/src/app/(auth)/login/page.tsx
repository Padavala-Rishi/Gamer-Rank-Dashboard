import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in · Level Up" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (<><h1 className="mb-4 text-xl font-semibold">Welcome back</h1><AuthForm kind="login" next={sp.next} linkError={sp.error === "link"} /></>);
}
