// เทสวงจรแก้/ซ่อนนักเรียนผ่าน Management API (ลบเทสทิ้งท้าย)
// รัน: node scripts/test-student-edit.mjs
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const Q = (query) =>
  fetch("https://api.supabase.com/v1/projects/xpnemonyqfikyfzaejkt/database/query", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  })
    .then((r) => r.text())
    .then((t) => {
      try {
        return JSON.parse(t);
      } catch {
        throw new Error(t.slice(0, 200));
      }
    });

const g = await Q("SELECT id FROM class_groups WHERE name='ม.1/1'");
const gid = g[0].id;
await Q(
  `INSERT INTO students (student_code,prefix,first_name,last_name,class_no,group_id,status,face_status) VALUES ('59999','เด็กชาย','ทดสอบ','ระบบ','99','${gid}','active','unregistered')`,
);
console.log("insert OK");
await Q("UPDATE students SET first_name='ทดสอบแก้' WHERE student_code='59999'");
const u = await Q("SELECT first_name FROM students WHERE student_code='59999'");
console.log("update:", u[0]?.first_name === "ทดสอบแก้" ? "OK" : "FAIL");
await Q("UPDATE students SET status='inactive', status_note='ซ่อนโดยครู' WHERE student_code='59999'");
const v = await Q("SELECT count(*) AS c FROM students WHERE status='active' AND student_code='59999'");
const h = await Q("SELECT status FROM students WHERE student_code='59999'");
console.log("hidden from active:", Number(v[0]?.c) === 0 ? "YES" : "NO", "| history kept:", h[0]?.status === "inactive" ? "YES" : "NO");
await Q("DELETE FROM students WHERE student_code='59999'");
console.log("cleanup OK");
