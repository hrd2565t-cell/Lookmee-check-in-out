-- =====================================================================
-- LOOKMEE Check In-Out · รอบเช็กชื่อต้องเปิดโดยครู + รหัสประจำรอบ 4 หลัก
-- - sessions.pin: รหัสที่ครูเห็นบนจอ นักเรียนกรอกก่อนสแกนได้ (NULL = รอบเก่า อนุโลม)
-- - sessions.opened_by: ครูผู้เปิดรอบ
-- - student_checkin(p_code, p_pin): ไม่สร้างรอบเองแล้ว, รอบต้องมีอยู่ก่อน + PIN ต้องตรง
-- =====================================================================

ALTER TABLE attendance_sessions ADD COLUMN pin CHAR(4);
ALTER TABLE attendance_sessions ADD COLUMN opened_by UUID REFERENCES users (id)
  ON UPDATE CASCADE ON DELETE SET NULL;

DROP FUNCTION IF EXISTS public.student_checkin(TEXT);

CREATE OR REPLACE FUNCTION public.student_checkin(p_code TEXT, p_pin TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id UUID;
  v_group_id UUID;
  v_session_id UUID;
  v_pin CHAR(4);
BEGIN
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

-- ตรวจ PIN ก่อนเปิดกล้อง (ไม่เปลืองสแกน)
CREATE OR REPLACE FUNCTION public.verify_pin(p_code TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_group_id UUID;
  v_pin CHAR(4);
BEGIN
  SELECT s.group_id INTO v_group_id FROM students s
  WHERE s.student_code = p_code AND s.status = 'active';
  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  SELECT pin INTO v_pin FROM attendance_sessions
  WHERE group_id = v_group_id AND session_date = CURRENT_DATE;
  IF v_pin IS NULL THEN
    -- รอบเก่า/รอบที่ครูยังไม่ตั้ง PIN: อนุโลมชั่วคราว
    RETURN jsonb_build_object('ok', true, 'legacy', true);
  END IF;
  RETURN jsonb_build_object('ok', v_pin = p_pin);
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_pin(TEXT, TEXT) TO anon, authenticated;
