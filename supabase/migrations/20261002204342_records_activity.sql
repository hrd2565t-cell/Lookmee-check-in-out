-- =====================================================================
-- LOOKMEE Check In-Out · สถานะ "กิจกรรม" (ไปกิจกรรมพิเศษ ไม่ถือว่าขาด)
-- สูตร % มาเรียน = present + late + activity
-- =====================================================================

ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_status_check;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_status_check
  CHECK (status IN ('present', 'absent', 'late', 'activity'));

ALTER TABLE attendance_records ADD COLUMN activity_name TEXT;
