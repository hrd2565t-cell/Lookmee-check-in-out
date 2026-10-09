-- =====================================================================
-- LOOKMEE Check In-Out · ประเภท "ลาอื่นๆ" + ธงนักศึกษาวิชาทหาร (รด.)
-- leave_requests.type: sick | personal | other (บังคับเหตุผลฝั่งแอป)
-- students.is_rotc: ติ๊กดาวรายคน (ยกเว้นอัตโนมัติตามตารางคาบ รด.)
-- =====================================================================

ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_type_check;
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_type_check
  CHECK (type IN ('sick', 'personal', 'other'));
ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_other_reason_check;
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_other_reason_check
  CHECK (type <> 'other' OR length(trim(coalesce(reason, ''))) > 0);

ALTER TABLE students ADD COLUMN IF NOT EXISTS is_rotc BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_students_rotc ON students (is_rotc) WHERE is_rotc;

-- submit_leave รุ่นเดิมล็อก type แค่ sick/personal → เปิด other ด้วย
CREATE OR REPLACE FUNCTION public.submit_leave(
  p_code TEXT, p_from DATE, p_to DATE, p_type TEXT, p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id UUID;
  v_id UUID;
BEGIN
  SELECT s.id INTO v_student_id FROM students s
  WHERE s.student_code = p_code AND s.status = 'active';
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;
  IF p_to < p_from THEN
    RETURN jsonb_build_object('result', 'bad_dates');
  END IF;
  IF p_type NOT IN ('sick', 'personal', 'other') THEN
    RETURN jsonb_build_object('result', 'bad_type');
  END IF;
  IF p_type = 'other' AND length(trim(coalesce(p_reason, ''))) = 0 THEN
    RETURN jsonb_build_object('result', 'need_reason');
  END IF;
  INSERT INTO leave_requests (student_id, date_from, date_to, type, reason, status)
  VALUES (v_student_id, p_from, p_to, p_type, NULLIF(trim(p_reason), ''), 'pending')
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('result', 'saved', 'id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_leave(TEXT, DATE, DATE, TEXT, TEXT) TO anon, authenticated;
