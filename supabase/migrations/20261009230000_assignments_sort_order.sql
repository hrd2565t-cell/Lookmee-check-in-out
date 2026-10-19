-- =====================================================================
-- LOOKMEE Check In-Out · ลำดับคอลัมน์งาน (sort_order)
-- เพิ่มคอลัมน์ sort_order ให้ครูเรียงคอลัมน์งานได้เองในหน้า งานและคะแนน
-- =====================================================================

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- เติมลำดับเริ่มต้นให้งานเดิมตามวันกำหนดส่งแล้วเวลาสร้าง (เก่าก่อน = น้อยก่อน)
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY due_date ASC, created_at ASC) AS rn
  FROM assignments
  WHERE sort_order = 0
)
UPDATE assignments a
SET sort_order = n.rn
FROM numbered n
WHERE a.id = n.id;

CREATE INDEX IF NOT EXISTS idx_assignments_group_sort ON assignments (group_id, sort_order);
