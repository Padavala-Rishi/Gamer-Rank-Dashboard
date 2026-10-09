import { isConfigured } from "@/lib/env";
import { redirect } from "next/navigation";

export const metadata = { title: "Setup required · Level Up" };

export default function Setup() {
  if (isConfigured) redirect("/");
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-2xl font-semibold">Setup required</h1>
      <p className="mt-2 text-muted">Level Up stores your progress in Supabase. It isn't connected yet, so nothing can be saved or loaded. This page will disappear once it is.</p>
      <ol className="mt-6 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
        <li>Create a free project at <b>supabase.com</b>.</li>
        <li>In the project's <b>SQL editor</b>, run the three files in <code className="rounded bg-raised px-1">supabase/migrations</code> in order (0001 → 0002 → 0003).</li>
        <li>Open <b>Project Settings → API</b> and copy the <b>Project URL</b> and the <b>anon / publishable key</b>.</li>
        <li>Set these environment variables (in <code className="rounded bg-raised px-1">.env.local</code> locally, or in your host's settings):
          <pre className="card-inset mt-2 overflow-x-auto p-3 text-xs">NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co{"\n"}NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key</pre>
        </li>
        <li>Restart the app. In Supabase → Authentication → URL Configuration, add your site URL and <code className="rounded bg-raised px-1">/auth/callback</code> as a redirect URL.</li>
      </ol>
      <p className="mt-6 text-sm text-muted">Optional: set <code className="rounded bg-raised px-1">ANTHROPIC_API_KEY</code> on the server to enable the AI coach. Everything else works without it.</p>
    </main>
  );
}
