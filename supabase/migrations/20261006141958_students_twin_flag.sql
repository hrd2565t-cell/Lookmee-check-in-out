-- =====================================================================
-- LOOKMEE Check In-Out · ปักธงนักเรียนที่ต้องยืนยันมือทุกครั้ง (แฝด/หน้าเหมือน)
-- twin_flag = true → scanner ข้าม auto-save บังคับครูกดยืนยันเสมอ
-- =====================================================================

ALTER TABLE students ADD COLUMN twin_flag BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_students_twin ON students (twin_flag) WHERE twin_flag;
