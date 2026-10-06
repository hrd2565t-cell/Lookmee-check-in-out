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
  TO authenticated FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_groups" ON class_groups
  TO authenticated FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_students" ON students
  TO authenticated FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_sessions" ON attendance_sessions
  TO authenticated FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_records" ON attendance_records
  TO authenticated FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_periods" ON class_periods
  TO authenticated FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_leave" ON leave_requests
  TO authenticated FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "auth_face_photos_read" ON storage.objects
  TO authenticated FOR SELECT USING (bucket_id = 'face-photos');
CREATE POLICY "auth_face_photos_write" ON storage.objects
  TO authenticated FOR INSERT WITH CHECK (bucket_id = 'face-photos');
CREATE POLICY "auth_face_photos_update" ON storage.objects
  TO authenticated FOR UPDATE USING (bucket_id = 'face-photos') WITH CHECK (bucket_id = 'face-photos');
CREATE POLICY "auth_face_photos_delete" ON storage.objects
  TO authenticated FOR DELETE USING (bucket_id = 'face-photos');
