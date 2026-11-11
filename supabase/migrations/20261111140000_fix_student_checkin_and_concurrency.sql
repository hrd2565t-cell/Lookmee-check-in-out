-- =====================================================================
-- LOOKMEE Check In-Out · Update student_checkin with Period & Timezone
-- =====================================================================

CREATE OR REPLACE FUNCTION public.student_checkin(
  p_code TEXT,
  p_pin TEXT DEFAULT NULL::TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bkk_now TIMESTAMP;
  v_today DATE;
  v_now_time TIME;
  v_dow INT;
  v_student_id UUID;
  v_group_id UUID;
  v_session_id UUID;
  v_pin CHAR(4);
  v_period_no INT;
  v_late_after INT := 15;
  v_is_late BOOLEAN := false;
  v_status TEXT := 'present';
BEGIN
  -- 1. เวลาท้องถิ่นไทย Asia/Bangkok
  v_bkk_now := now() AT TIME ZONE 'Asia/Bangkok';
  v_today := v_bkk_now::date;
  v_now_time := v_bkk_now::time;
  v_dow := EXTRACT(ISODOW FROM v_today)::INT;

  -- บล็อกวันเสาร์ (6) และอาทิตย์ (7)
  IF v_dow IN (6, 7) THEN
    RETURN jsonb_build_object('result', 'no_session');
  END IF;

  -- 2. ค้นหานักเรียนและกลุ่ม
  SELECT s.id, s.group_id INTO v_student_id, v_group_id 
  FROM public.students s
  WHERE s.student_code = trim(p_code) AND s.status = 'active';

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  -- 3. ค้นหารอบการเช็คชื่อวันนี้
  SELECT id, pin INTO v_session_id, v_pin 
  FROM public.attendance_sessions
  WHERE group_id = v_group_id AND session_date = v_today;

  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object('result', 'no_session');
  END IF;

  -- ตรวจสอบ PIN ประจำรอบ (ถ้ามีกำหนด)
  IF v_pin IS NOT NULL AND (p_pin IS NULL OR trim(p_pin) <> trim(v_pin)) THEN
    RETURN jsonb_build_object('result', 'bad_pin');
  END IF;

  -- 4. คำนวณคาบเรียนและการมาสาย
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

  -- 5. บันทึกข้อมูล
  BEGIN
    INSERT INTO public.attendance_records (
      session_id, student_id, check_in_at, status, period_no, confidence, method
    )
    VALUES (
      v_session_id, v_student_id, now(), v_status, v_period_no, 100, 'face'
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('result', 'duplicate', 'period_no', v_period_no, 'late', v_is_late);
  END;

  RETURN jsonb_build_object('result', 'saved', 'period_no', v_period_no, 'late', v_is_late);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.student_checkin(TEXT, TEXT) TO anon, authenticated, service_role;
