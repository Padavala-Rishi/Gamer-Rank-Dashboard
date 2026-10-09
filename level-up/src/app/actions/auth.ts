"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/dates";
import { safeNext } from "@/lib/safe-next";

export type AuthState = { error?: string; info?: string; fields?: Record<string, string> } | null;

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
const strongPassword = z.string().min(8, "Use at least 8 characters").max(128);

async function origin() {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) return site.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

async function rememberTheme() {
  const supabase = await createClient();
  const { data } = await supabase.from("user_settings").select("theme").maybeSingle();
  if (data?.theme) (await cookies()).set("theme", data.theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: z.string().min(1, "Enter your password") }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] ??= i.message;
    return { error: Object.values(fields)[0], fields };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "That email and password don't match." }; // deliberately vague
  await rememberTheme();
  redirect(safeNext(form.get("next")));
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: strongPassword, name: z.string().trim().max(40).optional() }).safeParse({
    email: form.get("email"), password: form.get("password"), name: form.get("name") || undefined,
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] ??= i.message;
    return { error: Object.values(fields)[0], fields };
  }
  const tzRaw = String(form.get("timezone") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email, password: parsed.data.password,
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=/onboarding`, data: parsed.data.name ? { name: parsed.data.name } : undefined },
  });
  if (error) {
    if (/already|registered/i.test(error.message)) return { error: "An account with that email already exists. Try signing in." };
    if (/password/i.test(error.message)) return { error: error.message };
    return { error: "Couldn't create the account. Please try again." };
  }
  if (!data.session) return { info: "Almost there: check your email and open the confirmation link to finish creating your account." };
  const updates: Record<string, unknown> = {};
  if (isValidTimeZone(tzRaw)) updates.timezone = tzRaw;
  if (parsed.data.name) updates.character_name = parsed.data.name;
  if (Object.keys(updates).length) await supabase.from("profiles").update(updates).eq("id", data.user!.id);
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const p = email.safeParse(form.get("email"));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(p.data, { redirectTo: `${await origin()}/auth/callback?next=/reset-password` });
  return { info: "If an account exists for that address, a reset link is on its way." }; // same answer either way
}

export async function updatePassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const p = strongPassword.safeParse(form.get("password"));
  if (!p.success) return { error: p.error.issues[0].message };
  if (form.get("password") !== form.get("confirm")) return { error: "The two passwords don't match." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: p.data });
  if (error) return { error: "Couldn't update the password. The reset link may have expired." };
  redirect("/");
}
