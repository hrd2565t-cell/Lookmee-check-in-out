-- =====================================================================
-- LOOKMEE Check In-Out · คะแนนถ่วงน้ำหนักรายห้อง + เกณฑ์เกรดรายห้อง + สอบซ่อมแยกคอลัมน์
-- 1) category_weights   : น้ำหนัก % ต่อหมวด ต่อห้อง (ใช้ทุกวิชา, รวม 100)
-- 2) room_grade_scales  : เกณฑ์ตัดเกรดรายห้อง (ห้องไหนไม่ตั้ง ใช้เกณฑ์ระดับชั้น)
-- 3) assignments.retake_of : ชี้กลับไปยังข้อสอบเดิม (คอลัมน์สอบซ่อมแยก)
-- =====================================================================

-- 1) สัดส่วนคะแนนต่อหมวด ต่อห้อง
CREATE TABLE IF NOT EXISTS category_weights (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES class_groups (id)
               ON UPDATE CASCADE ON DELETE CASCADE,
  category   TEXT NOT NULL,
  weight     NUMERIC NOT NULL CHECK (weight >= 0 AND weight <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, category)
);
CREATE INDEX IF NOT EXISTS idx_category_weights_group ON category_weights (group_id);

-- 2) เกณฑ์ตัดเกรดรายห้อง
CREATE TABLE IF NOT EXISTS room_grade_scales (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES class_groups (id)
               ON UPDATE CASCADE ON DELETE CASCADE,
  grade      TEXT NOT NULL,
  min_score  NUMERIC NOT NULL CHECK (min_score >= 0 AND min_score <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, grade)
);
CREATE INDEX IF NOT EXISTS idx_room_grade_scales_group ON room_grade_scales (group_id);

-- 3) คอลัมน์สอบซ่อม (ชี้กลับข้อสอบเดิม)
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS retake_of UUID REFERENCES assignments (id)
    ON UPDATE CASCADE ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_retake_of ON assignments (retake_of);

-- RLS (ตามแพทเทิร์นเดิม: authenticated เข้าถึงได้ทั้งหมด)
ALTER TABLE category_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_grade_scales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_category_weights" ON category_weights;
CREATE POLICY "auth_all_category_weights" ON category_weights
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_room_grade_scales" ON room_grade_scales;
CREATE POLICY "auth_all_room_grade_scales" ON room_grade_scales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE category_weights IS 'น้ำหนัก % ต่อหมวดคะแนน ต่อห้อง (รวมต้อง = 100)';
COMMENT ON TABLE room_grade_scales IS 'เกณฑ์ตัดเกรดรายห้อง (fallback ไปที่ grade_scales ตามระดับชั้น)';
COMMENT ON COLUMN assignments.retake_of IS 'ถ้าไม่ null = คอลัมน์นี้คือสอบซ่อมของข้อสอบชี้ไป';
