export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** True when the two public Supabase values are present. Nothing works without them, and we say so. */
export const isConfigured = Boolean(supabaseUrl && supabaseKey);

/** The AI coach is optional: it needs a server-side key and is off without one. */
export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);
