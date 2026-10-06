-- =====================================================================
-- LOOKMEE Check In-Out · MVP database schema (PostgreSQL 14+)
-- ออกแบบให้สอดคล้องกับ UI 4 หน้า + ชีททะเบียนจริง (db/students.csv)
-- คอลัมน์ชีท: รูปถ่าย | ระดับชั้น | ห้อง | เลขประจำตัว | เลขที่ |
--              คำนำหน้า | ชื่อ | นามสกุล | QR Code | Face Data
--
-- วิธีใช้: psql "$DATABASE_URL" -f db/schema.sql -f db/seed.sql
-- ข้อมูลจริง: node scripts/build-school-data.mjs (สร้าง seed ใหม่จากชีท)
-- =====================================================================

-- 1) ผู้ใช้ระบบ (ครู) — แสดงชื่อใน TopBar, ใช้ล็อกอิน
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,                       -- เช่น "ครูลูกหมี"
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'teacher'
                CHECK (role IN ('admin', 'teacher')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) กลุ่มเรียน — ระดับชั้น + ห้อง จากชีท (เช่น "ม.1/1")
--    การ์ด "จัดการกลุ่มเรียน" (/students), สถานะรายกลุ่มใน Dashboard
CREATE TABLE class_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,                    -- เช่น "ม.1/1"
  level      TEXT NOT NULL,                           -- เช่น "ม.1" (คอลัมน์ "ระดับชั้น")
  room       TEXT NOT NULL,                           -- เช่น "1"   (คอลัมน์ "ห้อง")
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) นักเรียน — ตาราง "จัดการนักเรียน" (/students):
--    ค้นหาชื่อ/เลขประจำตัว, กรองกลุ่ม/สถานะสแกนใบหน้า
--    หมายเหตุจากข้อมูลจริง:
--    - เลขประจำตัวเก็บ TEXT (มีเคส "ลาออก" และช่องว่างติดท้ายในชีท)
--    - นามสกุลอาจว่าง ("-" หรือนักเรียนต่างชาติ) → last_name NULL ได้
--    - ชีทยังไม่มีรูป/QR/Face → photo_url, qr_code, face_data ว่างได้
--    - แถวลาออก → status = 'inactive', ไม่นับในรายชื่อ active
CREATE TABLE students (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_code TEXT UNIQUE,                          -- เลขประจำตัว (NULL ได้เฉพาะเคสลาออก)
  prefix       TEXT NOT NULL,                         -- คำนำหน้า: เด็กชาย/เด็กหญิง/นาย/นางสาว
  first_name   TEXT NOT NULL,                         -- ชื่อ
  last_name    TEXT,                                  -- นามสกุล (NULL ได้)
  class_no     TEXT NOT NULL,                         -- เลขที่ในห้อง
  group_id     UUID NOT NULL REFERENCES class_groups (id)
                 ON UPDATE CASCADE ON DELETE RESTRICT,
  status       TEXT NOT NULL DEFAULT 'active'         -- active | inactive (ลาออก/ย้าย)
               CHECK (status IN ('active', 'inactive')),
  status_note  TEXT,                                  -- เช่น "ลาออก"
  face_status  TEXT NOT NULL DEFAULT 'unregistered'   -- registered | unregistered
               CHECK (face_status IN ('registered', 'unregistered')),
  photo_url    TEXT,                                  -- คอลัมน์ "รูปถ่าย"
  qr_code      TEXT,                                  -- คอลัมน์ "QR Code"
  face_data    TEXT,                                  -- คอลัมน์ "Face Data" (embedding ref)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_students_group ON students (group_id);
CREATE INDEX idx_students_name ON students (first_name, last_name);
CREATE INDEX idx_students_active ON students (status) WHERE status = 'active';

-- 4) รอบเช็กชื่อรายวันต่อกลุ่ม — 1 แถวต่อ 1 กลุ่มต่อ 1 วัน
--    ใช้วาด progress bar + ปุ่ม "เริ่มสแกน/ดูรายงาน" ใน Dashboard
CREATE TABLE attendance_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES class_groups (id)
                 ON UPDATE CASCADE ON DELETE CASCADE,
  session_date DATE NOT NULL,                        -- วันที่เช็กชื่อ
  status       TEXT NOT NULL DEFAULT 'soon'          -- soon | open | completed
               CHECK (status IN ('soon', 'open', 'completed')),
  opened_at    TIMESTAMPTZ,
  closed_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, session_date)
);
CREATE INDEX idx_sessions_date ON attendance_sessions (session_date);

-- 5) ผลเช็กชื่อรายคน — ฟีด "การเข้าเรียนล่าสุด" (Dashboard),
--    "RECENT CHECK-INS" (Scanner), ตาราง Reports + แบ่งหน้า
CREATE TABLE attendance_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES attendance_sessions (id)
                ON UPDATE CASCADE ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students (id)
                ON UPDATE CASCADE ON DELETE CASCADE,
  check_in_at TIMESTAMPTZ,                           -- NULL = ขาดเรียน
  status      TEXT NOT NULL DEFAULT 'present'        -- present | absent | late
              CHECK (status IN ('present', 'absent', 'late')),
  confidence  SMALLINT CHECK (confidence BETWEEN 0 AND 100),  -- % จาก Scanner
  method      TEXT NOT NULL DEFAULT 'face'           -- face | manual | qr
              CHECK (method IN ('face', 'manual', 'qr')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)                     -- เช็กชื่อได้คนละ 1 ครั้ง/วัน
);
CREATE INDEX idx_records_session ON attendance_records (session_id);
CREATE INDEX idx_records_student ON attendance_records (student_id);

-- 6) View สรุปภาพรวมรายวัน — ใช้ตรงกับการ์ด Dashboard
--    ("การเข้าเรียนวันนี้", "มาเรียน/ขาดเรียน/มาสาย" ใน Reports)
CREATE VIEW v_daily_summary AS
SELECT
  s.session_date                                       AS date,
  COUNT(*)                                            AS total,
  COUNT(*) FILTER (WHERE r.status = 'present')        AS present,
  COUNT(*) FILTER (WHERE r.status = 'absent')         AS absent,
  COUNT(*) FILTER (WHERE r.status = 'late')           AS late
FROM attendance_sessions s
LEFT JOIN attendance_records r ON r.session_id = s.id
GROUP BY s.session_date;

-- =====================================================================
-- ตัวอย่าง query ผูกกับแต่ละหน้าจอ (นับเฉพาะ status = 'active')
--
-- Dashboard · ตัวเลข 4 ใบ:
--   SELECT COUNT(*) FROM class_groups WHERE is_active;
--   SELECT COUNT(*) FROM students WHERE status = 'active';
--   SELECT * FROM v_daily_summary WHERE date = CURRENT_DATE;
--
-- /students · ตาราง + ค้นหา/กรอง:
--   SELECT s.student_code, s.prefix, s.first_name, s.last_name,
--          s.class_no, g.name AS group_name, s.face_status
--   FROM students s JOIN class_groups g ON g.id = s.group_id
--   WHERE s.status = 'active'
--     AND (g.name = $1 OR $1 = 'all')
--     AND (s.face_status = $2 OR $2 = 'all')
--     AND (s.first_name ILIKE '%'||$3||'%' OR s.last_name ILIKE '%'||$3||'%'
--          OR s.student_code ILIKE '%'||$3||'%')
--   ORDER BY g.name, s.class_no;
--
-- Scanner · เปิดรอบสแกนแล้วบันทึกผล:
--   INSERT INTO attendance_sessions (group_id, session_date, status, opened_at)
--   VALUES ($1, CURRENT_DATE, 'open', now())
--   ON CONFLICT (group_id, session_date)
--   DO UPDATE SET status = 'open', opened_at = COALESCE(attendance_sessions.opened_at, now())
--   RETURNING id;
--   INSERT INTO attendance_records (session_id, student_id, check_in_at, status, confidence)
--   VALUES ($1, $2, now(), 'present', 97)
--   ON CONFLICT (session_id, student_id) DO NOTHING;
--
-- Reports · ตาราง + แบ่งหน้า (PAGE_SIZE = 6):
--   ...WHERE g.name = $1 AND s.session_date = $2 AND st.status = 'active'...
--   ORDER BY r.check_in_at DESC NULLS LAST LIMIT 6 OFFSET $4;
-- =====================================================================
