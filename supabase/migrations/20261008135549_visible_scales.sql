-- =====================================================================
-- LOOKMEE Check In-Out · เปิด/ปิดคอลัมน์ + เกณฑ์ตัดเกรดรายชั้น
-- assignments.visible: false = ครูเห็นคนเดียว เด็กไม่เห็น
-- grade_scales: เกณฑ์ตัดเกรดรายระดับชั้น (คะแนนดิบเต็ม 100)
-- =====================================================================

ALTER TABLE assignments ADD COLUMN visible BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX idx_assign_visible ON assignments (group_id, visible);

CREATE TABLE grade_scales (
  level     TEXT NOT NULL,
  grade     TEXT NOT NULL,                               -- A, B+, B, C+, C, D+, D, F
  min_score NUMERIC NOT NULL CHECK (min_score >= 0),
  PRIMARY KEY (level, grade)
);
ALTER TABLE grade_scales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_scales" ON grade_scales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- เกณฑ์มาตรฐานไทย (A=80) ใส่ให้ ม.1–ม.6 ครูแก้ได้ทีหลัง
INSERT INTO grade_scales (level, grade, min_score)
SELECT l.level, g.grade, g.min_score
FROM (VALUES ('ม.1'), ('ม.2'), ('ม.3'), ('ม.4'), ('ม.5'), ('ม.6')) AS l(level)
CROSS JOIN (VALUES ('A', 80), ('B+', 75), ('B', 70), ('C+', 65), ('C', 60), ('D+', 55), ('D', 50), ('F', 0)) AS g(grade, min_score)
ON CONFLICT (level, grade) DO NOTHING;

-- ฝั่งนักเรียนเห็นเฉพาะคอลัมน์ที่เผยแพร่แล้ว
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
    WHERE a.group_id = v_group_id AND a.visible AND NOT (sub.id IS NULL AND a.due_date >= CURRENT_DATE)
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
    WHERE a.group_id = v_group_id AND a.visible
    ORDER BY a.due_date DESC
    LIMIT 50
  ) t;
  RETURN v_out;
END;
$$;
GRANT EXECUTE ON FUNCTION public.my_assignments(TEXT) TO anon, authenticated;
