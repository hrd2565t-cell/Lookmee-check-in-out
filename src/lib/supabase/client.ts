import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = url !== "" && anonKey !== "";

/** Browser client (เก็บ session ใน cookie — ใช้กับ middleware) */
export const supabase = createBrowserClient(url, anonKey);
