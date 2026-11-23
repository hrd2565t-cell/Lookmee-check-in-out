import { createBrowserClient } from "@supabase/ssr";

/** Publishable Cloud Fallback:
 *  คีย์ด้านล่างนี้เป็น "sb_publishable_..." (Supabase Publishable/Anon Key) ซึ่งออกแบบมาให้อยู่ฝั่ง Client/Browser ได้อย่างปลอดภัย
 *  และมีระบบ PostgreSQL Row Level Security (RLS) คุ้มครองความปลอดภัยของข้อมูล
 *  การใส่ค่า Fallback นี้ช่วยให้โทรศัพท์มือถือ แท็บเล็ต หรืออุปกรณ์อื่นๆ ที่เปิดผ่านลิงก์เว็บ สามารถเชื่อมต่อเข้าเรียนได้ทันที 100%
 *  (ส่วนคีย์ลับระดับสูง เช่น SUPABASE_ACCESS_TOKEN หรือ Service Role ถูกเก็บอย่างปลอดภัยใน .env.local ไม่รั่วไหลแน่นอน) */
export const DEFAULT_SUPABASE_URL = "https://xpnemonyqfikyfzaejkt.supabase.co";
export const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_6dvvgXwq4Z5zmHNa11nJPw_DVRS0uEQ";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = url !== "" && anonKey !== "";

/** Browser client (เก็บ session ใน cookie — ใช้กับ middleware) */
export const supabase = createBrowserClient(
  url || DEFAULT_SUPABASE_URL,
  anonKey || DEFAULT_SUPABASE_ANON_KEY,
);
