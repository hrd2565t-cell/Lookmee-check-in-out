// ทดสอบเชื่อมต่อ Supabase: node scripts/check-supabase.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const { data, error } = await supabase.from("class_groups").select("name").limit(3);
if (error) {
  console.log("QUERY_ERROR:", error.message);
  if (error.message.includes("does not exist") || error.code === "42P01") {
    console.log("→ คีย์ใช้ได้ แต่ยังไม่มีตาราง: รัน db/schema.sql + db/seed.sql + db/rls.sql ใน SQL Editor");
  }
  process.exit(1);
}
console.log("OK: connected, groups sample:", JSON.stringify(data));
