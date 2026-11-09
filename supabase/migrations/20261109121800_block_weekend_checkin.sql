-- =====================================================================
-- LOOKMEE Check In-Out · ป้องกันการเช็คชื่อในวันหยุดเสาร์-อาทิตย์ (No weekend check-in)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.student_checkin(p_code TEXT, p_pin TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id UUID;
  v_group_id UUID;
  v_session_id UUID;
  v_pin CHAR(4);
BEGIN
  -- บล็อกการเช็คชื่อในวันหยุดสุดสัปดาห์ (0 = อาทิตย์, 6 = เสาร์)
  IF EXTRACT(DOW FROM CURRENT_DATE) IN (0, 6) THEN
    RETURN jsonb_build_object('result', 'no_session');
  END IF;

  SELECT s.id, s.group_id INTO v_student_id, v_group_id FROM students s
  WHERE s.student_code = p_code AND s.status = 'active';
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  SELECT id, pin INTO v_session_id, v_pin FROM attendance_sessions
  WHERE group_id = v_group_id AND session_date = CURRENT_DATE;
  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object('result', 'no_session');
  END IF;

  IF v_pin IS NOT NULL AND (p_pin IS NULL OR p_pin <> v_pin) THEN
    RETURN jsonb_build_object('result', 'bad_pin');
  END IF;

  BEGIN
    INSERT INTO attendance_records (session_id, student_id, check_in_at, status, method)
    VALUES (v_session_id, v_student_id, now(), 'present', 'face');
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('result', 'duplicate');
  END;

  RETURN jsonb_build_object('result', 'saved');
END;
$$;
GRANT EXECUTE ON FUNCTION public.student_checkin(TEXT, TEXT) TO anon, authenticated;
