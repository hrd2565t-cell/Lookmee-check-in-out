-- =====================================================================
-- LOOKMEE Check In-Out · ยกเว้นนักศึกษาวิชาทหารอัตโนมัติตามตารางประจำ
-- ถ้าวิชาในตารางคาบมีคำว่า "รด." นักเรียนที่ติดธง is_rotc จะเป็น activity
-- =====================================================================

CREATE OR REPLACE FUNCTION public.apply_rotc_exemptions(p_session_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group_id UUID;
  v_session_date DATE;
  v_level TEXT;
  v_inserted INTEGER := 0;
BEGIN
  SELECT s.group_id, s.session_date, g.level
    INTO v_group_id, v_session_date, v_level
  FROM attendance_sessions s
  JOIN class_groups g ON g.id = s.group_id
  WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- ใช้วันฝึกของห้อง หรือวันฝึกของระดับชั้นที่ไม่ถูกคาบรายห้องเขียนทับ
  IF NOT EXISTS (
    SELECT 1
    FROM class_periods p
    WHERE p.is_active
      AND p.day_of_week = EXTRACT(ISODOW FROM v_session_date)::SMALLINT
      AND p.subject ILIKE '%รด%'
      AND (
        p.group_id = v_group_id
        OR (
          p.group_id IS NULL
          AND p.level = v_level
          AND NOT EXISTS (
            SELECT 1
            FROM class_periods room_period
            WHERE room_period.group_id = v_group_id
              AND room_period.day_of_week = p.day_of_week
              AND room_period.period_no = p.period_no
              AND room_period.is_active
          )
        )
      )
  ) THEN
    RETURN 0;
  END IF;

  INSERT INTO attendance_records (
    session_id, student_id, check_in_at, status, method, activity_name
  )
  SELECT p_session_id, s.id, NULL, 'activity', 'manual', 'ฝึก รด.'
  FROM students s
  WHERE s.group_id = v_group_id
    AND s.status = 'active'
    AND s.is_rotc
  ON CONFLICT (session_id, student_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_rotc_exemptions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_rotc_exemptions(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.auto_apply_rotc_exemptions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.apply_rotc_exemptions(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_sessions_auto_rotc ON attendance_sessions;
CREATE TRIGGER attendance_sessions_auto_rotc
AFTER INSERT ON attendance_sessions
FOR EACH ROW
EXECUTE FUNCTION public.auto_apply_rotc_exemptions();

-- รองรับรอบเช็กชื่อของวันนี้ที่เปิดไว้ก่อนติดตั้งกติกานี้
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM attendance_sessions WHERE session_date = CURRENT_DATE
  LOOP
    PERFORM public.apply_rotc_exemptions(r.id);
  END LOOP;
END;
$$;
