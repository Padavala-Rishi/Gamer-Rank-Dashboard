import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseKey, supabaseUrl } from "../env";

/** Supabase client for Server Components, Server Actions and Route Handlers. Runs as the signed-in user, so RLS applies. */
export async function createClient() {
  const store = await cookies();
  return createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // called from a Server Component: the proxy refreshes the session instead
        }
      },
    },
  });
}

export type Supa = Awaited<ReturnType<typeof createClient>>;
