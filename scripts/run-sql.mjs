// รัน SQL ไฟล์ขึ้น Supabase ผ่าน Management API: node scripts/run-sql.mjs <file>
// ใช้ token จาก .env.local (SUPABASE_ACCESS_TOKEN) — ไฟล์ .env.local อยู่ใน .gitignore ป้องกันการรั่วไหล
import { readFileSync, existsSync } from "node:fs";

if (!existsSync(".env.local")) {
  console.error("missing .env.local");
  process.exit(1);
}

const envContent = readFileSync(".env.local", "utf8");
const token = (envContent.match(/SUPABASE_ACCESS_TOKEN=(.+)/) || [])[1]?.trim();
if (!token) {
  console.error("missing SUPABASE_ACCESS_TOKEN in .env.local");
  process.exit(1);
}

const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=https:\/\/([^.]+)\.supabase\.co/);
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || (urlMatch ? urlMatch[1] : "");
if (!PROJECT_REF) {
  console.error("missing PROJECT_REF in NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error("missing or invalid SQL file path");
  process.exit(1);
}
const sql = readFileSync(file, "utf8");

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log("HTTP", res.status);
console.log(text.slice(0, 2000));
