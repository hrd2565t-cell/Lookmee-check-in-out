-- =====================================================================
-- LOOKMEE Check In-Out · Default Student PIN & Login Fallback
-- =====================================================================

-- 1. กำหนดรหัส PIN เริ่มต้น (เลข 4 ตัวท้ายของรหัสนักเรียน) ให้กับนักเรียนทุกคนที่ยังไม่มี PIN
UPDATE public.students
SET pin_code = right(trim(student_code), 4),
    pin_hash = extensions.crypt(right(trim(student_code), 4), extensions.gen_salt('bf')),
    pin_failed_attempts = 0,
    pin_locked_until = NULL
WHERE pin_hash IS NULL 
  AND student_code IS NOT NULL 
  AND length(trim(student_code)) >= 4;

-- 2. ปรับปรุง student_pin_login ให้รองรับทั้ง PIN ที่ตั้งเอง และ PIN เริ่มต้น
CREATE OR REPLACE FUNCTION public.student_pin_login(p_code TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student RECORD;
  v_token TEXT;
  v_expires TIMESTAMPTZ;
  v_wait_mins INT;
  v_default_pin TEXT;
  v_input_pin TEXT;
BEGIN
  v_input_pin := trim(p_pin);

  SELECT s.id, s.student_code, s.pin_hash, s.pin_code, s.pin_failed_attempts, s.pin_locked_until,
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

  v_default_pin := right(trim(v_student.student_code), 4);

  -- หากยังไม่มี pin_hash ให้ตรวจสอบกับเลข 4 ตัวท้าย
  IF v_student.pin_hash IS NULL THEN
    IF v_input_pin = v_default_pin THEN
      -- บันทึกเป็น PIN ถาวรทันที
      UPDATE public.students
      SET pin_hash = extensions.crypt(v_default_pin, extensions.gen_salt('bf')),
          pin_code = v_default_pin,
          pin_failed_attempts = 0,
          pin_locked_until = NULL
      WHERE id = v_student.id;
    ELSE
      RETURN jsonb_build_object(
        'ok', false, 
        'error', 'bad_pin',
        'remaining', 5,
        'hint', 'หากยังไม่เคยเปลี่ยนรหัส ให้ใช้เลข 4 ตัวท้ายของรหัสนักเรียน (' || v_default_pin || ')'
      );
    END IF;
  ELSE
    -- ตรวจสอบ PIN ด้วย pgcrypto crypt หรือ pin_code เริ่มต้น
    IF extensions.crypt(v_input_pin, v_student.pin_hash) <> v_student.pin_hash AND v_input_pin <> v_default_pin THEN
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
    'has_pin', true,
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
