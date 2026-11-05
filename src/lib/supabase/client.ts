import { createBrowserClient } from "@supabase/ssr";

export const DEFAULT_SUPABASE_URL = "https://xpnemonyqfikyfzaejkt.supabase.co";
export const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_6dvvgXwq4Z5zmHNa11nJPw_DVRS0uEQ";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = url !== "" && anonKey !== "";

/** Browser client (เก็บ session ใน cookie — ใช้กับ middleware)
 *  เมื่อเปิดจากเครื่องที่ไม่มี .env.local จะใช้ DEFAULT เพื่อให้ทุกเครื่องเข้าถึงฐานข้อมูลกลางเดียวกันได้เสมอ */
export const supabase = createBrowserClient(
  url || DEFAULT_SUPABASE_URL,
  anonKey || DEFAULT_SUPABASE_ANON_KEY,
);
