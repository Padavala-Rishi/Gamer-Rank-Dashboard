import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isConfigured, supabaseKey, supabaseUrl } from "@/lib/env";

// Runs before every page: keeps the Supabase session fresh and sends signed-out visitors to /login.
// (Every protected layout and Server Action re-checks the user too: this is not the only guard.)

const PUBLIC = ["/login", "/signup", "/forgot-password", "/auth", "/setup"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isConfigured) {
    if (pathname === "/setup") return NextResponse.next();
    return NextResponse.rewrite(new URL("/setup", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));

  const redirect = (to: string) => {
    const r = NextResponse.redirect(new URL(to, request.url));
    for (const c of response.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  // API callers get a real 401, not an HTML redirect to the login page
  if (!user && pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user && !isPublic) return redirect(`/login?next=${encodeURIComponent(pathname + search)}`);
  if (user && (pathname === "/login" || pathname === "/signup")) return redirect("/");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
