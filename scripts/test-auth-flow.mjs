// เทส flow ครูล็อกอิน (ไม่เก็บรหัสในไฟล์ — ส่งผ่าน env)
// AUTH_EMAIL=... AUTH_PASSWORD=... node scripts/test-auth-flow.mjs
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

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const { data, error: loginErr } = await db.auth.signInWithPassword({
  email: process.env.AUTH_EMAIL ?? "",
  password: process.env.AUTH_PASSWORD ?? "",
});
console.log("login:", loginErr ? `FAIL ${loginErr.message}` : `OK ${data.user?.email}`);
if (loginErr) process.exit(1);

const g = await db.from("class_groups").select("id,name", { count: "exact" });
console.log("groups visible:", g.count, "| sample:", g.data?.[0]?.name);
const s = await db.from("students").select("id", { count: "exact", head: true }).eq("status", "active");
console.log("active students visible:", s.count);

const gid = (await db.from("class_groups").select("id").eq("name", "ม.1/1").single()).data?.id;
const ins = await db
  .from("students")
  .insert({ student_code: "59998", prefix: "เด็กชาย", first_name: "เทส", last_name: "ล็อกอิน", class_no: "98", group_id: gid, status: "active", face_status: "unregistered" })
  .select("id")
  .single();
console.log("add:", ins.error ? `FAIL ${ins.error.message}` : "OK");
const upd = await db.from("students").update({ first_name: "เทสแก้" }).eq("student_code", "59998");
console.log("edit:", upd.error ? `FAIL ${upd.error.message}` : "OK");
const hide = await db.from("students").update({ status: "inactive" }).eq("student_code", "59998");
console.log("soft-delete:", hide.error ? `FAIL ${hide.error.message}` : "OK");
await db.from("students").delete().eq("student_code", "59998");
await db.auth.signOut();
console.log("cleanup + signout OK");
