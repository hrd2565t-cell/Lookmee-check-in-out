// สร้างข้อมูลจริงจากชีท → src/data/school.ts + db/seed.sql
// รัน: node scripts/build-school-data.mjs
// กฎทำความสะอาด:
//  - trim เลขประจำตัว (ม.3/8 มีช่องว่างท้าย)
//  - นามสกุล "-" ถือว่าไม่มีนามสกุล
//  - แถว "ลาออก" → status inactive, ไม่นับในรายชื่อ active, student_code = NULL
import { readFileSync, writeFileSync } from "node:fs";

const CSV = "db/students.csv";
const TS_OUT = "src/data/school.ts";
const SQL_OUT = "db/seed.sql";

const PALETTE = [
  "bg-[#dbe7f5] text-[#1a5da3]",
  "bg-[#e3f2e6] text-[#166c2e]",
  "bg-[#f3e8f5] text-[#7b1fa2]",
  "bg-[#fff3e0] text-[#e65100]",
  "bg-[#e0f2f1] text-[#00695c]",
  "bg-[#fce4ec] text-[#ad1457]",
];

const esc = (s) => `'${s.replace(/'/g, "''")}'`;
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.codePointAt(0)) >>> 0, 7);

const lines = readFileSync(CSV, "utf8")
  .split(/\r?\n/)
  .filter((l) => l.trim() !== "");
const rows = lines.slice(1).map((l) => l.split(","));

const students = [];
const skipped = [];
for (const c of rows) {
  const level = (c[1] || "").trim();
  const room = (c[2] || "").trim();
  const rawId = (c[3] || "").trim();
  const number = (c[4] || "").trim();
  const title = (c[5] || "").trim();
  const firstName = (c[6] || "").trim();
  let lastName = (c[7] || "").trim();
  if (lastName === "-") lastName = "";
  const group = `${level}/${room}`;
  const inactive = rawId === "ลาออก" || !/^\d+$/.test(rawId);
  const rec = {
    code: inactive ? null : rawId,
    title,
    firstName,
    lastName,
    name: lastName ? `${firstName} ${lastName}` : firstName,
    group,
    level,
    room,
    number,
    status: inactive ? "inactive" : "active",
  };
  (inactive ? skipped : students).push(rec);
}

// กลุ่ม + จำนวน (เฉพาะ active)
const groupMap = new Map();
for (const s of students) groupMap.set(s.group, (groupMap.get(s.group) || 0) + 1);
const groups = [...groupMap.entries()]
  .map(([name, count]) => ({ name, count }))
  .sort((a, b) => a.name.localeCompare(b.name, "th", { numeric: true }));

const initialsOf = (s) =>
  s.firstName.charAt(0) + (s.lastName ? s.lastName.charAt(0) : s.firstName.charAt(1) || "");

// ---- 1) src/data/school.ts ----
const ts = `// ข้อมูลจริงจากชีท (db/students.csv) — สร้างอัตโนมัติ ห้ามแก้ด้วยมือ
// สั่งสร้างใหม่: node scripts/build-school-data.mjs
// หมายเหตุ: ชีทมีเฉพาะทะเบียนรายชื่อ (ยังไม่มี Face/QR/รูป) → ทุกคน face_status = unregistered
// และยังไม่มีข้อมูลเช็กชื่อจริง → ตัวเลขเช็กชื่อใน UI เป็นข้อมูลจำลอง

export type SchoolStudent = {
  code: string;
  title: string;
  firstName: string;
  lastName: string;
  name: string;
  group: string;
  number: string;
  initials: string;
  color: string;
};

export const SCHOOL_GROUPS: Array<{ name: string; count: number }> = ${JSON.stringify(groups)};

export const ACTIVE_STUDENT_COUNT = ${students.length};

export const SCHOOL_STUDENTS: SchoolStudent[] = ${JSON.stringify(
  students.map((s) => ({
    code: s.code,
    title: s.title,
    firstName: s.firstName,
    lastName: s.lastName,
    name: s.name,
    group: s.group,
    number: s.number,
    initials: initialsOf(s),
    color: PALETTE[hash(s.code) % PALETTE.length],
  })),
)};
`;
writeFileSync(TS_OUT, ts);

// ---- 2) db/seed.sql ----
const all = [...students, ...skipped];
const sql = `-- ข้อมูลจริงจากชีท (db/students.csv) — สร้างอัตโนมัติ ห้ามแก้ด้วยมือ
-- สั่งสร้างใหม่: node scripts/build-school-data.mjs
-- หมายเหตุ: ยังไม่มี Face/QR/รูปในชีท → face_status = unregistered ทั้งหมด

INSERT INTO users (name, email, password_hash, role) VALUES
  ('ครูลูกหมี', 'teacher@lookmee.school', 'password', 'teacher')
ON CONFLICT (email) DO NOTHING;

${groups.map((g) => `INSERT INTO class_groups (name, level, room) VALUES (${esc(g.name)}, ${esc(g.name.split("/")[0])}, ${esc(g.name.split("/")[1])}) ON CONFLICT (name) DO NOTHING;`).join("\n")}

${all
  .map((s) => {
    const base =
      `INSERT INTO students (student_code, prefix, first_name, last_name, class_no, group_id, status, face_status) ` +
      `SELECT ${s.code ? esc(s.code) : "NULL"}, ${esc(s.title)}, ${esc(s.firstName)}, ${s.lastName ? esc(s.lastName) : "NULL"}, ${esc(s.number)}, g.id, '${s.status}', 'unregistered' FROM class_groups g WHERE g.name = ${esc(s.group)}`;
    // student_code เป็น NULL ได้ (UNIQUE มอง NULL ไม่ซ้ำกัน) จึงกันซ้ำด้วย NOT EXISTS
    return s.code
      ? base + ` ON CONFLICT (student_code) DO NOTHING;`
      : base +
          ` AND NOT EXISTS (SELECT 1 FROM students s2 JOIN class_groups g2 ON g2.id = s2.group_id WHERE s2.first_name = ${esc(s.firstName)} AND g2.name = ${esc(s.group)});`;
  })
  .join("\n")}
`;
writeFileSync(SQL_OUT, sql);

console.log(`active: ${students.length}, inactive: ${skipped.length}, groups: ${groups.length}`);
console.log("inactive rows:", skipped.map((s) => `${s.group} ${s.title}${s.firstName}`).join(", "));
console.log(`wrote ${TS_OUT}, ${SQL_OUT}`);
