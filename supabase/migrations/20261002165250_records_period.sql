-- =====================================================================
-- LOOKMEE Check In-Out · เก็บเลขคาบในผลเช็กชื่อ (ผูกกับ class_periods)
-- =====================================================================

ALTER TABLE attendance_records ADD COLUMN period_no SMALLINT;
CREATE INDEX idx_records_period ON attendance_records (session_id, period_no);
