-- =====================================================================
-- LOOKMEE Check In-Out · Store Student PIN for Teacher Lookup & Assistance
-- =====================================================================

-- 1. เพิ่มคอลัมน์ pin_code สำหรับให้คุณครูตรวจสอบรหัส PIN ของนักเรียนได้
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS pin_code TEXT;

-- 2. ปรับปรุง student_set_pin ให้เก็บ pin_code ไว้ด้วย
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
      pin_code = v_clean_pin,
      pin_failed_attempts = 0,
      pin_locked_until = NULL
  WHERE id = v_student_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.student_set_pin(TEXT, TEXT) TO anon, authenticated;

-- 3. ปรับปรุง teacher_reset_student_pin ให้ล้าง pin_code ด้วย
CREATE OR REPLACE FUNCTION public.teacher_reset_student_pin(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.students
  SET pin_hash = NULL,
      pin_code = NULL,
      pin_failed_attempts = 0,
      pin_locked_until = NULL
  WHERE id = p_student_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.teacher_reset_student_pin(UUID) TO authenticated;

-- 4. RPC ครูตั้ง PIN ให้นักเรียนโดยตรง (กรณีนักเรียนขอให้ครูช่วยตั้งให้)
CREATE OR REPLACE FUNCTION public.teacher_set_student_pin(p_student_id UUID, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clean_pin TEXT;
BEGIN
  v_clean_pin := trim(p_pin);
  IF v_clean_pin !~ '^[0-9]{4,6}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_format');
  END IF;

  UPDATE public.students
  SET pin_hash = extensions.crypt(v_clean_pin, extensions.gen_salt('bf')),
      pin_code = v_clean_pin,
      pin_failed_attempts = 0,
      pin_locked_until = NULL
  WHERE id = p_student_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.teacher_set_student_pin(UUID, TEXT) TO authenticated;
