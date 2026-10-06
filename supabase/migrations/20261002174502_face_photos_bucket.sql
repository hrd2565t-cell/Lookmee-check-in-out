-- =====================================================================
-- LOOKMEE Check In-Out · ที่เก็บรูปอ้างอิงใบหน้า (โหมดสำรองเทียบรูป)
-- bucket: face-photos (public แบบ MVP — มีล็อกอินครูแล้วค่อยล็อก)
-- ไฟล์: <รหัสนักเรียน>.jpg (upsert ทับได้ตอนลงทะเบียนซ้ำ)
-- =====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('face-photos', 'face-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "mvp_face_photos_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'face-photos');
CREATE POLICY "mvp_face_photos_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'face-photos');
CREATE POLICY "mvp_face_photos_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'face-photos') WITH CHECK (bucket_id = 'face-photos');
CREATE POLICY "mvp_face_photos_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'face-photos');
