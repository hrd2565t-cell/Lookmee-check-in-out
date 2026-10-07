-- =====================================================================
-- LOOKMEE Check In-Out · RPC ฝั่งนักเรียน (รหัสประจำตัวอย่างเดียว ไม่มี password)
-- ใช้ SECURITY DEFINER เพื่อให้ anon เรียกได้โดยไม่ต้องเปิด RLS ตารางหลัก
-- เปิดเผยเฉพาะข้อมูลของรหัสที่ระบุเท่านั้น (ไม่ list ทั้งตาราง)
-- ยอมรับความเสี่ยง: ใครรู้รหัสก็ดูประวัตินั้นได้ (เท่าเทียมดูสมุดเช็กชื่อ)
-- =====================================================================

-- 1) ค้นหาตัวตนก่อนเข้า (คืน descriptor ด้วยไว้แมตช์ใบหน้าบนเครื่อง)
CREATE OR REPLACE FUNCTION public.lookup_student(p_code TEXT)
RETURNS TABLE(code TEXT, name TEXT, group_name TEXT, has_face BOOLEAN, descriptor JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT s.student_code,
         (s.prefix || s.first_name || COALESCE(' ' || s.last_name, '')),
         g.name,
         (s.face_status = 'registered'),
         CASE WHEN s.face_data IS NULL THEN NULL ELSE s.face_data::jsonb END
  FROM students s
  JOIN class_groups g ON g.id = s.group_id
  WHERE s.student_code = p_code AND s.status = 'active';
END;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_student(TEXT) TO anon, authenticated;

-- 2) ประวัติของฉัน (เช็กชื่อ 30 แถวล่าสุด + ใบลาทั้งหมด)
CREATE OR REPLACE FUNCTION public.my_history(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id UUID;
  v_att JSONB;
  v_leave JSONB;
BEGIN
  SELECT s.id INTO v_student_id FROM students s
  WHERE s.student_code = p_code AND s.status = 'active';
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('attendance', '[]'::jsonb, 'leaves', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.check_in_at DESC), '[]'::jsonb) INTO v_att
  FROM (
    SELECT ses.session_date AS date,
           r.check_in_at,
           r.status,
           r.period_no,
           g.name AS grp
    FROM attendance_records r
    JOIN attendance_sessions ses ON ses.id = r.session_id
    JOIN class_groups g ON g.id = ses.group_id
    WHERE r.student_id = v_student_id
    ORDER BY r.check_in_at DESC NULLS LAST
    LIMIT 30
  ) t;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.date_from DESC), '[]'::jsonb) INTO v_leave
  FROM (
    SELECT date_from, date_to, type, reason, status
    FROM leave_requests
    WHERE student_id = v_student_id
    ORDER BY date_from DESC
    LIMIT 20
  ) t;

  RETURN jsonb_build_object('attendance', v_att, 'leaves', v_leave);
END;
$$;
GRANT EXECUTE ON FUNCTION public.my_history(TEXT) TO anon, authenticated;

-- 3) เช็กชื่อด้วยตัวเอง (เปิดรอบวันนี้ของกลุ่มให้ถ้ายังไม่มี, กันซ้ำ/วัน/คน)
CREATE OR REPLACE FUNCTION public.student_checkin(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id UUID;
  v_group_id UUID;
  v_session_id UUID;
  v_today DATE := CURRENT_DATE;
BEGIN
  SELECT s.id, s.group_id INTO v_student_id, v_group_id FROM students s
  WHERE s.student_code = p_code AND s.status = 'active';
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  SELECT id INTO v_session_id FROM attendance_sessions
  WHERE group_id = v_group_id AND session_date = v_today;
  IF v_session_id IS NULL THEN
    INSERT INTO attendance_sessions (group_id, session_date, status, opened_at)
    VALUES (v_group_id, v_today, 'open', now())
    RETURNING id INTO v_session_id;
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
GRANT EXECUTE ON FUNCTION public.student_checkin(TEXT) TO anon, authenticated;
