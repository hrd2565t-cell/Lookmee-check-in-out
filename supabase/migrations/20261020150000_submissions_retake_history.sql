-- =====================================================================
-- LOOKMEE Check In-Out · รองรับคะแนนสอบซ่อมหลายครั้ง
-- ยกเลิก UNIQUE constraint ของ submissions เพื่อให้เก็บคะแนนซ้ำได้
-- เพิ่มคอลัมน์ attempt_no เพื่อบอกว่าครั้งที่เท่าไหร่
-- คะแนนที่ใช้คำนวณเกรด = แถวล่าสุด (created_at มากที่สุด) ต่อนักเรียนต่องาน
-- =====================================================================

-- ยกเลิก constraint เดิมที่กันคะแนนซ้ำ
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_assignment_id_student_id_key;

-- เพิ่มคอลัมน์ attempt_no (ครั้งที่สอบ)
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS attempt_no INTEGER NOT NULL DEFAULT 1;

-- ดึง attempt_no สูงสุดเดิมมาใส่ให้แถวเก่า (กันค่า null)
WITH max_attempt AS (
  SELECT assignment_id, student_id, MAX(attempt_no) AS max_attempt
  FROM submissions
  GROUP BY assignment_id, student_id
)
UPDATE submissions s
SET attempt_no = m.max_attempt
FROM max_attempt m
WHERE s.assignment_id = m.assignment_id
  AND s.student_id = m.student_id
  AND s.attempt_no IS NULL;

-- สร้าง index สำหรับค้นหาคะแนนล่าสุดต่อนักเรียนต่องาน
CREATE INDEX IF NOT EXISTS idx_submissions_latest
  ON submissions (assignment_id, student_id, created_at DESC);

-- สร้าง view สำหรับคะแนนล่าสุดต่อนักเรียนต่องาน (ใช้คำนวณเกรด)
CREATE OR REPLACE VIEW v_submission_latest AS
SELECT DISTINCT ON (assignment_id, student_id)
  id,
  assignment_id,
  student_id,
  score,
  attempt_no,
  submitted_at,
  created_at
FROM submissions
ORDER BY assignment_id, student_id, created_at DESC;

COMMENT ON VIEW v_submission_latest IS 'คะแนนครั้งล่าสุดต่อนักเรียนต่องาน ใช้คำนวณเกรด';
