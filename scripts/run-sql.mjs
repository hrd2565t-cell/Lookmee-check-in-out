// รัน SQL ไฟล์ขึ้น Supabase ผ่าน Management API: node scripts/run-sql.mjs <file>
// ใช้ token จาก .env.local (SUPABASE_ACCESS_TOKEN) — อย่า commit ไฟล์นี้พร้อม token จริง
import { readFileSync } from "node:fs";

const PROJECT_REF = "xpnemonyqfikyfzaejkt";
const token = (readFileSync(".env.local", "utf8").match(/SUPABASE_ACCESS_TOKEN=(.+)/) || [])[1]?.trim();
if (!token) {
  console.error("missing SUPABASE_ACCESS_TOKEN in .env.local");
  process.exit(1);
}
const file = process.argv[2];
const sql = readFileSync(file, "utf8");

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log("HTTP", res.status);
console.log(text.slice(0, 2000));
