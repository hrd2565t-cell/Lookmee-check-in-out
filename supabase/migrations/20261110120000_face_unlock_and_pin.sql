-- =====================================================================
-- LOOKMEE Check In-Out · Face Unlock + Personal PIN + Approval Workflow
-- =====================================================================

-- 1. ขยายสถานะใบหน้าให้รองรับ 'pending' (รอครูอนุมัติ)
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_face_status_check;
ALTER TABLE public.students ADD CONSTRAINT students_face_status_check
  CHECK (face_status IN ('registered', 'unregistered', 'pending'));

-- 2. เพิ่มคอลัมน์สำหรับ PIN ส่วนตัว และการลงทะเบียนรออนุมัติ
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS pin_failed_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS pending_face_data TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS pending_photo_url TEXT;

-- 3. ตาราง Session Token ของนักเรียน (อายุ 1 วัน ปลดล็อกใหม่ทุกวัน)
CREATE TABLE IF NOT EXISTS public.student_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_code TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_sessions_token ON public.student_sessions(token);
CREATE INDEX IF NOT EXISTS idx_student_sessions_student_id ON public.student_sessions(student_id);

ALTER TABLE public.student_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_anon_read_sessions" ON public.student_sessions;
CREATE POLICY "allow_anon_read_sessions" ON public.student_sessions
  FOR SELECT TO anon, authenticated USING (expires_at > now());

-- 4. ฟังก์ชันคำนวณ Euclidean distance ของเวกเตอร์ 128 มิติ
CREATE OR REPLACE FUNCTION public.face_distance(a jsonb, b jsonb)
RETURNS float8
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  dist float8 := 0.0;
  len int;
  i int;
  diff float8;
BEGIN
  IF a IS NULL OR b IS NULL THEN RETURN 999.0; END IF;
  len := jsonb_array_length(a);
  IF len <> jsonb_array_length(b) OR len = 0 THEN RETURN 999.0; END IF;
  FOR i IN 0..len-1 LOOP
    diff := (a->>i)::float8 - (b->>i)::float8;
    dist := dist + (diff * diff);
  END LOOP;
  RETURN |/ dist;
END;
$$;

-- 5. RPC: ตรวจสอบสถานะนักเรียนก่อนล็อกอิน (ไม่ส่ง raw descriptor ออกไปภายนอกแล้ว)
DROP FUNCTION IF EXISTS public.lookup_student(TEXT);
CREATE OR REPLACE FUNCTION public.lookup_student(p_code TEXT)
RETURNS TABLE(
  code TEXT, 
  name TEXT, 
  group_name TEXT, 
  face_status TEXT, 
  photo TEXT, 
  has_pin BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT s.student_code,
         (s.prefix || s.first_name || COALESCE(' ' || s.last_name, '')),
         g.name,
         s.face_status,
         s.photo_url,
         (s.pin_hash IS NOT NULL)
  FROM students s
  JOIN class_groups g ON g.id = s.group_id
  WHERE s.student_code = trim(p_code) AND s.status = 'active';
END;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_student(TEXT) TO anon, authenticated;

-- 6. RPC: Face Unlock (เซิร์ฟเวอร์เป็นคนเทียบใบหน้า และออก Session Token)
CREATE OR REPLACE FUNCTION public.student_face_login(p_code TEXT, p_descriptor JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student RECORD;
  v_dist float8;
  v_token TEXT;
  v_expires TIMESTAMPTZ;
BEGIN
  SELECT s.id, s.student_code, s.face_status, s.face_data, s.photo_url,
         (s.prefix || s.first_name || COALESCE(' ' || s.last_name, '')) AS full_name,
         g.name AS group_name,
         (s.pin_hash IS NOT NULL) AS has_pin
  INTO v_student
  FROM students s
  JOIN class_groups g ON g.id = s.group_id
  WHERE s.student_code = trim(p_code) AND s.status = 'active';

  IF v_student.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_student.face_status <> 'registered' OR v_student.face_data IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_face', 'face_status', v_student.face_status);
  END IF;

  -- คำนวณระยะห่างใบหน้า
  v_dist := public.face_distance(v_student.face_data::jsonb, p_descriptor);

  -- เกณฑ์ผ่าน (Threshold <= 0.48 เพื่อความแม่นยำสูง)
  IF v_dist > 0.48 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'face_not_match', 'distance', round(v_dist::numeric, 3));
  END IF;

  -- สร้าง Session Token อายุหมดเวลาตี 4 ของวันถัดไป (หรือ 24 ชั่วโมง)
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := CURRENT_DATE + interval '1 day 04:00:00';

  INSERT INTO public.student_sessions (student_id, student_code, token, expires_at)
  VALUES (v_student.id, v_student.student_code, v_token, v_expires);

  -- รีเซ็ตการล็อก PIN หากมี
  UPDATE public.students 
  SET pin_failed_attempts = 0, pin_locked_until = NULL 
  WHERE id = v_student.id;

  RETURN jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_expires,
    'has_pin', v_student.has_pin,
    'student', jsonb_build_object(
      'code', v_student.student_code,
      'name', v_student.full_name,
      'group', v_student.group_name,
      'photo', v_student.photo_url
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.student_face_login(TEXT, JSONB) TO anon, authenticated;

-- 7. RPC: PIN Login (ล็อกอินด้วย PIN ส่วนตัว 4-6 หลัก กรณีแสงมืดหรือกล้องมีปัญหา)
CREATE OR REPLACE FUNCTION public.student_pin_login(p_code TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student RECORD;
  v_token TEXT;
  v_expires TIMESTAMPTZ;
  v_wait_mins INT;
BEGIN
  SELECT s.id, s.student_code, s.pin_hash, s.pin_failed_attempts, s.pin_locked_until,
         s.photo_url, (s.prefix || s.first_name || COALESCE(' ' || s.last_name, '')) AS full_name,
         g.name AS group_name
  INTO v_student
  FROM students s
  JOIN class_groups g ON g.id = s.group_id
  WHERE s.student_code = trim(p_code) AND s.status = 'active';

  IF v_student.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- ตรวจสอบการถูกระงับชั่วคราว
  IF v_student.pin_locked_until IS NOT NULL AND v_student.pin_locked_until > now() THEN
    v_wait_mins := CEIL(EXTRACT(EPOCH FROM (v_student.pin_locked_until - now())) / 60);
    RETURN jsonb_build_object('ok', false, 'error', 'locked', 'wait_minutes', v_wait_mins);
  END IF;

  IF v_student.pin_hash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_pin_set');
  END IF;

  -- ตรวจสอบ PIN ด้วย pgcrypto crypt
  IF extensions.crypt(trim(p_pin), v_student.pin_hash) <> v_student.pin_hash THEN
    UPDATE public.students
    SET pin_failed_attempts = pin_failed_attempts + 1,
        pin_locked_until = CASE WHEN pin_failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END
    WHERE id = v_student.id;

    RETURN jsonb_build_object(
      'ok', false, 
      'error', 'bad_pin', 
      'remaining', GREATEST(0, 5 - (v_student.pin_failed_attempts + 1))
    );
  END IF;

  -- รหัส PIN ถูกต้อง -> สร้าง Session Token
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := CURRENT_DATE + interval '1 day 04:00:00';

  INSERT INTO public.student_sessions (student_id, student_code, token, expires_at)
  VALUES (v_student.id, v_student.student_code, v_token, v_expires);

  UPDATE public.students 
  SET pin_failed_attempts = 0, pin_locked_until = NULL 
  WHERE id = v_student.id;

  RETURN jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_expires,
    'student', jsonb_build_object(
      'code', v_student.student_code,
      'name', v_student.full_name,
      'group', v_student.group_name,
      'photo', v_student.photo_url
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.student_pin_login(TEXT, TEXT) TO anon, authenticated;

-- 8. RPC: ตั้งค่า PIN ส่วนตัว (ต้องมี token ที่ยังไม่หมดอายุ)
CREATE OR REPLACE FUNCTION public.student_set_pin(p_token TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id UUID;
  v_clean_pin TEXT;
BEGIN
  SELECT student_id INTO v_student_id
  FROM public.student_sessions
  WHERE token = trim(p_token) AND expires_at > now();

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  v_clean_pin := trim(p_pin);
  IF v_clean_pin !~ '^[0-9]{4,6}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_format');
  END IF;

  UPDATE public.students
  SET pin_hash = extensions.crypt(v_clean_pin, extensions.gen_salt('bf')),
      pin_failed_attempts = 0,
      pin_locked_until = NULL
  WHERE id = v_student_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.student_set_pin(TEXT, TEXT) TO anon, authenticated;

-- 9. RPC: นักเรียนลงทะเบียนใบหน้าด้วยตนเอง (จะถูกตั้งเป็น 'pending' รอครูอนุมัติ)
CREATE OR REPLACE FUNCTION public.student_submit_self_enroll(
  p_code TEXT, 
  p_descriptor JSONB, 
  p_photo_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id UUID;
BEGIN
  SELECT id INTO v_student_id 
  FROM public.students 
  WHERE student_code = trim(p_code) AND status = 'active';

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  UPDATE public.students
  SET pending_face_data = p_descriptor::text,
      pending_photo_url = p_photo_url,
      face_status = 'pending'
  WHERE id = v_student_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.student_submit_self_enroll(TEXT, JSONB, TEXT) TO anon, authenticated;

-- 10. RPC ฝั่งครู: อนุมัติ หรือ ปฏิเสธ การลงทะเบียนใบหน้า
CREATE OR REPLACE FUNCTION public.teacher_decide_face_enroll(
  p_student_id UUID, 
  p_decision TEXT -- 'approve' หรือ 'reject'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_decision = 'approve' THEN
    UPDATE public.students
    SET face_data = pending_face_data,
        photo_url = COALESCE(pending_photo_url, photo_url),
        face_status = 'registered',
        pending_face_data = NULL,
        pending_photo_url = NULL
    WHERE id = p_student_id;
  ELSIF p_decision = 'reject' THEN
    UPDATE public.students
    SET face_status = 'unregistered',
        pending_face_data = NULL,
        pending_photo_url = NULL
    WHERE id = p_student_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_decision');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.teacher_decide_face_enroll(UUID, TEXT) TO authenticated;

-- 11. RPC ฝั่งครู: รีเซ็ตรหัส PIN ให้นักเรียน (กรณีเด็กจำรหัสไม่ได้)
CREATE OR REPLACE FUNCTION public.teacher_reset_student_pin(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.students
  SET pin_hash = NULL,
      pin_failed_attempts = 0,
      pin_locked_until = NULL
  WHERE id = p_student_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.teacher_reset_student_pin(UUID) TO authenticated;

-- 12. RPC ตรวจสอบความถูกต้องของ Session Token
CREATE OR REPLACE FUNCTION public.verify_student_session(p_token TEXT)
RETURNS TABLE(
  is_valid BOOLEAN, 
  code TEXT, 
  name TEXT, 
  group_name TEXT, 
  photo TEXT, 
  has_pin BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT (sess.expires_at > now()),
         s.student_code,
         (s.prefix || s.first_name || COALESCE(' ' || s.last_name, '')),
         g.name,
         s.photo_url,
         (s.pin_hash IS NOT NULL)
  FROM public.student_sessions sess
  JOIN public.students s ON s.id = sess.student_id
  JOIN public.class_groups g ON g.id = s.group_id
  WHERE sess.token = trim(p_token) AND sess.expires_at > now() AND s.status = 'active';
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_student_session(TEXT) TO anon, authenticated;


-- 13. RPC ดึง Face Descriptor สำหรับนักเรียนที่ล็อกอินแล้วเพื่อใช้ในหน้าสแกนเช็กชื่อ (/student/scan)
CREATE OR REPLACE FUNCTION public.get_my_face_descriptor(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_face_data TEXT;
BEGIN
  SELECT s.face_data INTO v_face_data
  FROM public.student_sessions sess
  JOIN public.students s ON s.id = sess.student_id
  WHERE sess.token = trim(p_token) AND sess.expires_at > now() AND s.status = 'active';

  IF v_face_data IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_face_data::jsonb;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_face_descriptor(TEXT) TO anon, authenticated;
