-- =====================================================================
-- LOOKMEE Check In-Out · แจ้งขอแก้ไขข้อมูล + ให้นักเรียนยื่นใบลาเองได้
-- disputes: เรื่องที่นักเรียนแจ้งขอแก้ไข (ครูดู/ปิดเรื่องในภายหลัง)
-- RPC ฝั่งนักเรียน (SECURITY DEFINER, เรียกแบบ anon ได้เฉพาะแถวของรหัสตัวเอง)
-- =====================================================================

CREATE TABLE IF NOT EXISTS disputes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students (id)
                ON UPDATE CASCADE ON DELETE CASCADE,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_disputes_student ON disputes (student_id);
CREATE INDEX IF NOT EXISTS idx_disputes_pending ON disputes (status) WHERE status = 'pending';

ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_disputes" ON disputes;
CREATE POLICY "auth_all_disputes" ON disputes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- นักเรียนยื่นใบลาเอง (отрудникиตรวจสอบซ้ำซ้อนไม่ได้ ครูอนุมัติในหน้า Reports)
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
  IF p_type NOT IN ('sick', 'personal') THEN
    RETURN jsonb_build_object('result', 'bad_type');
  END IF;
  INSERT INTO leave_requests (student_id, date_from, date_to, type, reason, status)
  VALUES (v_student_id, p_from, p_to, p_type, NULLIF(p_reason, ''), 'pending')
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('result', 'saved', 'id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_leave(TEXT, DATE, DATE, TEXT, TEXT) TO anon, authenticated;

-- นักเรียนแจ้งขอแก้ไขข้อมูล
CREATE OR REPLACE FUNCTION public.submit_dispute(p_code TEXT, p_message TEXT)
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
  IF length(trim(coalesce(p_message, ''))) < 5 THEN
    RETURN jsonb_build_object('result', 'too_short');
  END IF;
  INSERT INTO disputes (student_id, message, status)
  VALUES (v_student_id, trim(p_message), 'pending')
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('result', 'saved', 'id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_dispute(TEXT, TEXT) TO anon, authenticated;
