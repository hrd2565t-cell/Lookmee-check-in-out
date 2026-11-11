-- =====================================================================
-- LOOKMEE Check In-Out · Performance Optimization & Fast Teacher Checkin
-- =====================================================================

-- 1. ดัชนีเพิ่มความเร็วการค้นหา
CREATE INDEX IF NOT EXISTS idx_students_face_status ON public.students(face_status);
CREATE INDEX IF NOT EXISTS idx_students_code_active ON public.students(student_code) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_records_session_status ON public.attendance_records(session_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_group_date ON public.attendance_sessions(group_id, session_date);
CREATE INDEX IF NOT EXISTS idx_periods_group_dow ON public.class_periods(group_id, day_of_week, is_active);

-- 2. ฟังก์ชันเช็กชื่อฝั่งครูแบบ Atomic Transaction (ลดจาก 5-6 network calls เหลือ 1 call)
CREATE OR REPLACE FUNCTION public.teacher_checkin(
  p_group TEXT,
  p_code TEXT,
  p_confidence INT DEFAULT 0,
  p_method TEXT DEFAULT 'face',
  p_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bkk_now TIMESTAMP;
  v_today DATE;
  v_now_time TIME;
  v_dow INT;
  v_group_id UUID;
  v_student_id UUID;
  v_session_id UUID;
  v_period_no INT;
  v_late_after INT := 15;
  v_is_late BOOLEAN := false;
  v_status TEXT := 'present';
BEGIN
  -- คำนวณเวลาท้องถิ่นไทย (Asia/Bangkok UTC+7)
  v_bkk_now := now() AT TIME ZONE 'Asia/Bangkok';
  v_today := COALESCE(p_date, v_bkk_now::date);
  v_now_time := v_bkk_now::time;
  v_dow := EXTRACT(ISODOW FROM v_today)::INT;

  -- 1. หา group_id
  SELECT id INTO v_group_id FROM public.class_groups WHERE name = p_group;
  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('result', 'failed', 'error', 'group_not_found');
  END IF;

  -- 2. หา student_id
  SELECT id INTO v_student_id FROM public.students WHERE student_code = p_code AND status = 'active';
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('result', 'failed', 'error', 'student_not_found');
  END IF;

  -- 3. หาหรือสร้าง attendance_session วันนี้
  SELECT id INTO v_session_id FROM public.attendance_sessions 
  WHERE group_id = v_group_id AND session_date = v_today;

  IF v_session_id IS NULL THEN
    INSERT INTO public.attendance_sessions (group_id, session_date, status, opened_at)
    VALUES (v_group_id, v_today, 'open', now())
    ON CONFLICT (group_id, session_date) DO UPDATE SET session_date = EXCLUDED.session_date
    RETURNING id INTO v_session_id;
  END IF;

  -- 4. หาคาบเรียนปัจจุบัน
  SELECT period_no, COALESCE(late_after_min, 15), 
         (v_now_time > (start_time + (COALESCE(late_after_min, 15) || ' minutes')::interval))
  INTO v_period_no, v_late_after, v_is_late
  FROM public.class_periods
  WHERE group_id = v_group_id AND day_of_week = v_dow AND is_active = true
    AND v_now_time >= start_time AND v_now_time <= end_time
  LIMIT 1;

  IF v_is_late THEN
    v_status := 'late';
  END IF;

  -- 5. บันทึก attendance_records (atomic insert พร้อมตรวจ unique constraint)
  BEGIN
    INSERT INTO public.attendance_records (session_id, student_id, check_in_at, status, period_no, confidence, method)
    VALUES (v_session_id, v_student_id, now(), v_status, v_period_no, p_confidence, p_method);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('result', 'duplicate', 'period_no', v_period_no, 'late', v_is_late);
  END;

  RETURN jsonb_build_object('result', 'saved', 'period_no', v_period_no, 'late', v_is_late);
END;
$$;

GRANT EXECUTE ON FUNCTION public.teacher_checkin(TEXT, TEXT, INT, TEXT, DATE) TO anon, authenticated, service_role;
