-- =====================================================================
-- LOOKMEE Check In-Out · ตารางระดับชั้น (ใช้ร่วมทุกห้อง) + ตารางห้องทับได้
-- กติกา: แถวหนึ่งมี group_id หรือ level อย่างใดอย่างหนึ่ง (ไม่ใช่ทั้งคู่/ว่างคู่)
-- ลำดับใช้: ตารางห้องก่อน ถ้าไม่มีค่อยตกไปใช้ตารางชั้น
-- =====================================================================

ALTER TABLE class_periods ALTER COLUMN group_id DROP NOT NULL;
ALTER TABLE class_periods ADD COLUMN level TEXT;
ALTER TABLE class_periods ADD CONSTRAINT chk_period_scope
  CHECK ((group_id IS NULL) != (level IS NULL));
CREATE INDEX idx_periods_level ON class_periods (level, day_of_week)
  WHERE is_active AND level IS NOT NULL;
