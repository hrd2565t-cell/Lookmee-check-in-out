-- =====================================================================
-- LOOKMEE Check In-Out · RLS policies สำหรับ MVP (เปิดกว้างแบบ anon)
-- รันใน Supabase SQL Editor ต่อจาก db/schema.sql + db/seed.sql
-- หมายเหตุ: ของจริงควรล็อกด้วย Supabase Auth (เช่น auth.uid() = teacher_id)
-- =====================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mvp_all_users" ON users
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "mvp_all_groups" ON class_groups
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "mvp_all_students" ON students
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "mvp_all_sessions" ON attendance_sessions
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "mvp_all_records" ON attendance_records
  FOR ALL USING (true) WITH CHECK (true);
