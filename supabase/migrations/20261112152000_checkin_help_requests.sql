-- =====================================================================
-- LOOKMEE Check In-Out · Check-in Help / SOS Requests for Low-Spec / Frozen Devices
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.checkin_help_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES public.attendance_sessions (id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES public.students (id) ON DELETE CASCADE,
  student_code TEXT NOT NULL,
  student_name TEXT NOT NULL,
  group_name   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID REFERENCES auth.users (id),
  UNIQUE (session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_help_req_session ON public.checkin_help_requests (session_id, status);
CREATE INDEX IF NOT EXISTS idx_help_req_student ON public.checkin_help_requests (student_id, created_at);

ALTER TABLE public.checkin_help_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_help_requests" ON public.checkin_help_requests;
CREATE POLICY "auth_all_help_requests" ON public.checkin_help_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_help_requests" ON public.checkin_help_requests;
CREATE POLICY "anon_select_help_requests" ON public.checkin_help_requests
  FOR SELECT TO anon USING (true);

-- ---------------------------------------------------------------------
-- RPC: นักเรียนส่งคำขอช่วยเช็คชื่อกรณีโทรศัพท์ค้าง / กล้องไม่พร้อมใช้งาน
-- ต้องมีรหัส PIN ประจำรอบที่ถูกต้องเท่านั้น
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_request_checkin_help(
  p_code TEXT,
  p_pin  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bkk_now    TIMESTAMP;
  v_today      DATE;
  v_dow        INT;
  v_student    RECORD;
  v_session    RECORD;
  v_group_name TEXT;
  v_req_id     UUID;
  v_already    RECORD;
BEGIN
  v_bkk_now := now() AT TIME ZONE 'Asia/Bangkok';
  v_today := v_bkk_now::date;
  v_dow := EXTRACT(ISODOW FROM v_today)::INT;

  IF v_dow IN (6, 7) THEN
    RETURN jsonb_build_object('result', 'no_session', 'message', 'วันเสาร์-อาทิตย์ไม่มีรอบเช็กชื่อ');
  END IF;

  SELECT s.id, s.student_code, s.prefix, s.first_name, s.last_name, s.group_id
  INTO v_student
  FROM public.students s
  WHERE s.student_code = trim(p_code) AND s.status = 'active';

  IF v_student.id IS NULL THEN
    RETURN jsonb_build_object('result', 'not_found', 'message', 'ไม่พบรหัสนักเรียนในระบบ');
  END IF;

  SELECT name INTO v_group_name FROM public.class_groups WHERE id = v_student.group_id;

  SELECT id, pin, status INTO v_session
  FROM public.attendance_sessions
  WHERE group_id = v_student.group_id AND session_date = v_today;

  IF v_session.id IS NULL THEN
    RETURN jsonb_build_object('result', 'no_session', 'message', 'ครูยังไม่ได้เปิดรอบเช็กชื่อวันนี้');
  END IF;

  IF v_session.pin IS NOT NULL AND (p_pin IS NULL OR trim(p_pin) <> trim(v_session.pin)) THEN
    RETURN jsonb_build_object('result', 'bad_pin', 'message', 'รหัสประจำรอบไม่ถูกต้อง ขอรหัสใหม่จากครู');
  END IF;

  -- ถ้าเช็คชื่อไปแล้ว
  SELECT id INTO v_already
  FROM public.attendance_records
  WHERE session_id = v_session.id AND student_id = v_student.id;

  IF v_already.id IS NOT NULL THEN
    RETURN jsonb_build_object('result', 'already_checked', 'message', 'เช็คชื่อวันนี้เรียบร้อยแล้ว');
  END IF;

  -- บันทึกคำขอช่วยเช็คชื่อ
  INSERT INTO public.checkin_help_requests (
    session_id, student_id, student_code, student_name, group_name, status, created_at
  )
  VALUES (
    v_session.id,
    v_student.id,
    v_student.student_code,
    COALESCE(v_student.prefix || ' ', '') || v_student.first_name || ' ' || v_student.last_name,
    COALESCE(v_group_name, ''),
    'pending',
    now()
  )
  ON CONFLICT (session_id, student_id) DO UPDATE SET
    status = 'pending',
    created_at = now()
  RETURNING id INTO v_req_id;

  RETURN jsonb_build_object('result', 'saved', 'id', v_req_id, 'status', 'pending');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.student_request_checkin_help(TEXT, TEXT) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- RPC: นักเรียนตรวจสอบสถานะคำขอช่วยเช็คชื่อ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_get_help_status(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bkk_now    TIMESTAMP;
  v_today      DATE;
  v_student_id UUID;
  v_group_id   UUID;
  v_session_id UUID;
  v_rec        RECORD;
BEGIN
  v_bkk_now := now() AT TIME ZONE 'Asia/Bangkok';
  v_today := v_bkk_now::date;

  SELECT s.id, s.group_id INTO v_student_id, v_group_id
  FROM public.students s
  WHERE s.student_code = trim(p_code) AND s.status = 'active';

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  SELECT id INTO v_session_id
  FROM public.attendance_sessions
  WHERE group_id = v_group_id AND session_date = v_today;

  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object('result', 'no_session');
  END IF;

  SELECT id, status, created_at, resolved_at INTO v_rec
  FROM public.checkin_help_requests
  WHERE session_id = v_session_id AND student_id = v_student_id;

  IF v_rec.id IS NULL THEN
    RETURN jsonb_build_object('result', 'none');
  END IF;

  RETURN jsonb_build_object(
    'result', 'ok',
    'status', v_rec.status,
    'created_at', v_rec.created_at,
    'resolved_at', v_rec.resolved_at
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.student_get_help_status(TEXT) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- RPC: ครูอนุมัติการขอเช็คชื่อ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.teacher_approve_checkin_help(
  p_request_id UUID,
  p_status     TEXT DEFAULT 'present'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_req        RECORD;
  v_bkk_now    TIMESTAMP;
  v_now_time   TIME;
  v_dow        INT;
  v_period_no  INT;
  v_group_id   UUID;
  v_rec_status TEXT := 'present';
BEGIN
  SELECT r.* INTO v_req
  FROM public.checkin_help_requests r
  WHERE r.id = p_request_id;

  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  v_bkk_now := now() AT TIME ZONE 'Asia/Bangkok';
  v_now_time := v_bkk_now::time;
  v_dow := EXTRACT(ISODOW FROM v_bkk_now::date)::INT;

  SELECT group_id INTO v_group_id
  FROM public.attendance_sessions
  WHERE id = v_req.session_id;

  SELECT period_no INTO v_period_no
  FROM public.class_periods
  WHERE group_id = v_group_id AND day_of_week = v_dow AND is_active = true
    AND v_now_time >= start_time AND v_now_time <= end_time
  LIMIT 1;

  IF p_status IN ('present', 'late', 'activity') THEN
    v_rec_status := p_status;
  END IF;

  -- บันทึกข้อมูลการเช็คชื่อ
  INSERT INTO public.attendance_records (
    session_id, student_id, check_in_at, status, period_no, confidence, method
  )
  VALUES (
    v_req.session_id, v_req.student_id, now(), v_rec_status, v_period_no, 100, 'teacher_help'
  )
  ON CONFLICT (session_id, student_id) DO UPDATE SET
    status = v_rec_status,
    check_in_at = now(),
    method = 'teacher_help';

  -- อัปเดตสถานะคำขอ
  UPDATE public.checkin_help_requests
  SET status = 'approved',
      resolved_at = now(),
      resolved_by = auth.uid()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('result', 'saved', 'status', v_rec_status);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.teacher_approve_checkin_help(UUID, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- RPC: ครูปฏิเสธคำขอ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.teacher_reject_checkin_help(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.checkin_help_requests
  SET status = 'rejected',
      resolved_at = now(),
      resolved_by = auth.uid()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('result', 'saved');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.teacher_reject_checkin_help(UUID) TO authenticated, service_role;
