-- =====================================================================
-- LOOKMEE Check In-Out · เทอม + เกณฑ์ขาดเรียนรายระดับชั้น
-- นับขาดเฉพาะในเทอมปัจจุบัน (ขาด = status absent, ลา/กิจกรรมไม่นับ)
-- =====================================================================

CREATE TABLE school_terms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,                              -- เช่น "ภาคเรียนที่ 2/2569"
  starts_on  DATE NOT NULL,
  ends_on    DATE NOT NULL,
               CHECK (ends_on >= starts_on),
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- เทอมปัจจุบันมีได้เทอมเดียว
CREATE UNIQUE INDEX uq_terms_current ON school_terms (is_current) WHERE is_current;

CREATE TABLE absence_limits (
  level          TEXT PRIMARY KEY,                       -- เช่น "ม.1" (ตรงกับส่วนหน้าของชื่อกลุ่ม)
  max_absent     INTEGER CHECK (max_absent IS NULL OR max_absent >= 0),  -- NULL = ไม่จำกัด
  warn_before    INTEGER NOT NULL DEFAULT 2 CHECK (warn_before >= 0),    -- เตือนล่วงหน้ากี่ครั้ง
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE school_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE absence_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_terms" ON school_terms
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_limits" ON absence_limits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ค่าเริ่มต้น: เทอม 2/2569 (ปัจจุบัน) + เกณฑ์ที่ครูให้มา (ชั้นอื่น = ไม่จำกัด)
INSERT INTO school_terms (name, starts_on, ends_on, is_current) VALUES
  ('ภาคเรียนที่ 2/2569', '2026-10-01', '2027-02-28', TRUE),
  ('ภาคเรียนที่ 1/2569', '2026-05-01', '2026-09-30', FALSE)
ON CONFLICT DO NOTHING;

INSERT INTO absence_limits (level, max_absent, warn_before) VALUES
  ('ม.1', 10, 2),
  ('ม.2', 8, 2),
  ('ม.3', NULL, 2),
  ('ม.4', NULL, 2),
  ('ม.5', NULL, 2),
  ('ม.6', NULL, 2)
ON CONFLICT (level) DO NOTHING;

-- ประวัติเช็กชื่อรายคนแบบระบุช่วงวัน (ใช้คำนวณยอดขาดในเทอม)
CREATE OR REPLACE FUNCTION public.attendance_in_range(p_code TEXT, p_from DATE, p_to DATE)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id UUID;
  v_out JSONB;
BEGIN
  SELECT s.id INTO v_student_id FROM students s
  WHERE s.student_code = p_code AND s.status = 'active';
  IF v_student_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  SELECT COALESCE(jsonb_agg(t ORDER BY t.d), '[]'::jsonb) INTO v_out
  FROM (
    SELECT ses.session_date AS d, r.status AS status
    FROM attendance_records r
    JOIN attendance_sessions ses ON ses.id = r.session_id
    WHERE r.student_id = v_student_id
      AND ses.session_date >= p_from AND ses.session_date <= p_to
    ORDER BY ses.session_date
  ) t;
  RETURN v_out;
END;
$$;
GRANT EXECUTE ON FUNCTION public.attendance_in_range(TEXT, DATE, DATE) TO anon, authenticated;
