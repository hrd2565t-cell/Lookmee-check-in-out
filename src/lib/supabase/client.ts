import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = url !== "" && anonKey !== "";

/** Browser client (เก็บ session ใน cookie — ใช้กับ middleware)
 *  เมื่อยังไม่ตั้งค่า Supabase จะใช้ค่าหลอกเพื่อกัน build พัง (โหมด Local ไม่เรียกใช้ client นี้จริง) */
export const supabase = createBrowserClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key",
);
