-- =====================================================================
-- LOOKMEE Check In-Out · ล็อกสิทธิ์เหลือเฉพาะผู้ใช้ที่ล็อกอิน (authenticated)
-- แทนที่ policy เปิดโล่งช่วง MVP — รันหลังมีบัญชีครูใน Auth แล้ว
-- =====================================================================

DROP POLICY IF EXISTS "mvp_all_users" ON users;
DROP POLICY IF EXISTS "mvp_all_groups" ON class_groups;
DROP POLICY IF EXISTS "mvp_all_students" ON students;
DROP POLICY IF EXISTS "mvp_all_sessions" ON attendance_sessions;
DROP POLICY IF EXISTS "mvp_all_records" ON attendance_records;
DROP POLICY IF EXISTS "mvp_all_periods" ON class_periods;
DROP POLICY IF EXISTS "mvp_all_leave" ON leave_requests;
DROP POLICY IF EXISTS "mvp_face_photos_read" ON storage.objects;
DROP POLICY IF EXISTS "mvp_face_photos_write" ON storage.objects;
DROP POLICY IF EXISTS "mvp_face_photos_update" ON storage.objects;
DROP POLICY IF EXISTS "mvp_face_photos_delete" ON storage.objects;

CREATE POLICY "auth_all_users" ON users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_groups" ON class_groups
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_students" ON students
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_sessions" ON attendance_sessions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_records" ON attendance_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_periods" ON class_periods
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_leave" ON leave_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_face_photos_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'face-photos');
CREATE POLICY "auth_face_photos_write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'face-photos');
CREATE POLICY "auth_face_photos_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'face-photos') WITH CHECK (bucket_id = 'face-photos');
CREATE POLICY "auth_face_photos_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'face-photos');
