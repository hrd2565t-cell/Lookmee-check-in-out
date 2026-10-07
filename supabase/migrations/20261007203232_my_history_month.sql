-- =====================================================================
-- LOOKMEE Check In-Out · my_history เพิ่มกรองรายเดือน (p_month = 'YYYY-MM')
-- ไม่ส่งมา = พฤติกรรมเดิม (30 แถวล่าสุด) — backward compatible
-- =====================================================================

-- ลบเวอร์ชันเก่า (1 arg) กัน PostgREST เลือก function ไม่ถูก
DROP FUNCTION IF EXISTS public.my_history(TEXT);

CREATE OR REPLACE FUNCTION public.my_history(p_code TEXT, p_month TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id UUID;
  v_att JSONB;
  v_leave JSONB;
  v_from DATE;
  v_to DATE;
BEGIN
  SELECT s.id INTO v_student_id FROM students s
  WHERE s.student_code = p_code AND s.status = 'active';
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('attendance', '[]'::jsonb, 'leaves', '[]'::jsonb);
  END IF;

  IF p_month ~ '^\d{4}-\d{2}$' THEN
    v_from := (p_month || '-01')::date;
    v_to := (v_from + INTERVAL '1 month' - INTERVAL '1 day')::date;
  ELSE
    v_from := NULL;
    v_to := NULL;
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
      AND (v_from IS NULL OR (ses.session_date >= v_from AND ses.session_date <= v_to))
    ORDER BY r.check_in_at DESC NULLS LAST
    LIMIT CASE WHEN v_from IS NULL THEN 30 ELSE 200 END
  ) t;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.date_from DESC), '[]'::jsonb) INTO v_leave
  FROM (
    SELECT date_from, date_to, type, reason, status
    FROM leave_requests
    WHERE student_id = v_student_id
      AND (v_from IS NULL OR (date_from <= v_to AND date_to >= v_from))
    ORDER BY date_from DESC
    LIMIT CASE WHEN v_from IS NULL THEN 20 ELSE 100 END
  ) t;

  RETURN jsonb_build_object('attendance', v_att, 'leaves', v_leave);
END;
$$;
GRANT EXECUTE ON FUNCTION public.my_history(TEXT, TEXT) TO anon, authenticated;
