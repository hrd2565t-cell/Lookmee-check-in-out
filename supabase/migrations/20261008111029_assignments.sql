-- =====================================================================
-- LOOKMEE Check In-Out · งานที่มอบหมาย + การส่งงาน/คะแนน
-- assignments: งานรายห้อง (วิชา/หมวด/กำหนดส่ง/คะแนนเต็ม)
-- submissions: ผลรายคน (ส่งแล้วมีคะแนน / รอตรวจ = ส่งแต่ยังไม่มีคะแนน /
--               ขาดส่ง = เลยกำหนดแล้วยังไม่ส่ง → คำนวณสด ไม่ต้องเก็บสถานะ)
-- =====================================================================

CREATE TABLE assignments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES class_groups (id)
               ON UPDATE CASCADE ON DELETE CASCADE,
  subject    TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'ใบงาน/การบ้าน',
  title      TEXT NOT NULL,
  due_date   DATE NOT NULL,
  max_score  NUMERIC NOT NULL DEFAULT 10 CHECK (max_score > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_assign_group ON assignments (group_id);

CREATE TABLE submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments (id)
                  ON UPDATE CASCADE ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES students (id)
                  ON UPDATE CASCADE ON DELETE CASCADE,
  score         NUMERIC CHECK (score IS NULL OR score >= 0),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);
CREATE INDEX idx_sub_student ON submissions (student_id);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_assignments" ON assignments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_submissions" ON submissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- สรุปของฉัน: ยอดรวม + รายหมวด (นับเฉพาะงานที่ถึงกำหนดแล้ว)
CREATE OR REPLACE FUNCTION public.my_assignment_summary(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id UUID;
  v_group_id UUID;
  v_out JSONB;
BEGIN
  SELECT s.id, s.group_id INTO v_student_id, v_group_id FROM students s
  WHERE s.student_code = p_code AND s.status = 'active';
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('total', 0, 'submitted', 0, 'missing', 0, 'pending', 0, 'earned', 0, 'max', 0, 'cats', '[]'::jsonb);
  END IF;

  WITH mine AS (
    SELECT a.id, a.category, a.max_score,
           sub.score,
           CASE
             WHEN sub.id IS NULL AND a.due_date < CURRENT_DATE THEN 'missing'
             WHEN sub.id IS NULL THEN 'upcoming'
             WHEN sub.score IS NULL THEN 'pending'
             ELSE 'submitted'
           END AS st
    FROM assignments a
    LEFT JOIN submissions sub ON sub.assignment_id = a.id AND sub.student_id = v_student_id
    WHERE a.group_id = v_group_id AND NOT (sub.id IS NULL AND a.due_date >= CURRENT_DATE)
  ),
  cats AS (
    SELECT category,
           COALESCE(SUM(score), 0) AS earned,
           COALESCE(SUM(max_score), 0) AS max
    FROM mine
    GROUP BY category
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM mine),
    'submitted', (SELECT count(*) FROM mine WHERE st = 'submitted'),
    'missing', (SELECT count(*) FROM mine WHERE st = 'missing'),
    'pending', (SELECT count(*) FROM mine WHERE st = 'pending'),
    'earned', (SELECT COALESCE(SUM(score), 0) FROM mine WHERE st = 'submitted'),
    'max', (SELECT COALESCE(SUM(max_score), 0) FROM mine),
    'cats', (SELECT COALESCE(jsonb_agg(jsonb_build_object('category', category, 'earned', earned, 'max', max)), '[]'::jsonb) FROM cats)
  ) INTO v_out;
  RETURN v_out;
END;
$$;
GRANT EXECUTE ON FUNCTION public.my_assignment_summary(TEXT) TO anon, authenticated;

-- ประวัติงานของฉัน (เรียงกำหนดส่งใหม่→เก่า)
CREATE OR REPLACE FUNCTION public.my_assignments(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student_id UUID;
  v_group_id UUID;
  v_out JSONB;
BEGIN
  SELECT s.id, s.group_id INTO v_student_id, v_group_id FROM students s
  WHERE s.student_code = p_code AND s.status = 'active';
  IF v_student_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.due DESC), '[]'::jsonb) INTO v_out
  FROM (
    SELECT a.title, a.subject, a.category, a.due_date AS due, a.max_score,
           sub.score,
           CASE
             WHEN sub.id IS NULL AND a.due_date < CURRENT_DATE THEN 'missing'
             WHEN sub.id IS NULL THEN 'upcoming'
             WHEN sub.score IS NULL THEN 'pending'
             ELSE 'submitted'
           END AS st
    FROM assignments a
    LEFT JOIN submissions sub ON sub.assignment_id = a.id AND sub.student_id = v_student_id
    WHERE a.group_id = v_group_id
    ORDER BY a.due_date DESC
    LIMIT 50
  ) t;
  RETURN v_out;
END;
$$;
GRANT EXECUTE ON FUNCTION public.my_assignments(TEXT) TO anon, authenticated;
