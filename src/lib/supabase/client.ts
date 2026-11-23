import { createBrowserClient } from "@supabase/ssr";

export const DEFAULT_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const DEFAULT_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = url !== "" && anonKey !== "";

/** Browser client (เก็บ session ใน cookie — ใช้กับ middleware)
 *  ความปลอดภัย: อ่านค่า URL และ Anon Key ผ่าน Environment Variable เสมอ ไม่ฮาร์ดโค้ดในซอร์สโค้ด
 *  เมื่อยังไม่ตั้งค่า Supabase จะใช้ placeholder เพื่อป้องกัน build error */
export const supabase = createBrowserClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key",
);
