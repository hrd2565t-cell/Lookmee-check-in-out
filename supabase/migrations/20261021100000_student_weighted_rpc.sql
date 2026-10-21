-- =====================================================================
-- LOOKMEE Check In-Out · แก้ RPC ฝั่งนักเรียนให้รองรับคะแนนถ่วงน้ำหนัก + สอบซ่อม
-- - ใช้ v_submission_latest (คะแนนครั้งล่าสุด) แทน submissions ตรง (กัน double count)
-- - คอลัมน์สอบซ่อม (retake_of) override คะแนนข้อสอบเดิม ไม่นับแยก
-- - คืนค่า cats แยกตามหมวด เพื่อให้ frontend เอาไปถ่วงน้ำหนักต่อ
-- =====================================================================

DROP FUNCTION IF EXISTS public.my_assignment_summary(TEXT);
DROP FUNCTION IF EXISTS public.my_assignment_summary(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.my_assignments(TEXT);
DROP FUNCTION IF EXISTS public.my_assignments(TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.my_assignment_summary(p_code TEXT, p_subject TEXT DEFAULT NULL)
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

  WITH eff AS (
    SELECT
      a.id, a.category, a.max_score,
      COALESCE(rk.score, s.score) AS score,
      CASE
        WHEN rk.id IS NULL AND s.id IS NULL AND a.due_date < CURRENT_DATE THEN 'missing'
        WHEN rk.id IS NULL AND s.id IS NULL THEN 'upcoming'
        WHEN COALESCE(rk.score, s.score) IS NULL THEN 'pending'
        ELSE 'submitted'
      END AS st
    FROM assignments a
    LEFT JOIN assignments rt ON rt.retake_of = a.id
    LEFT JOIN v_submission_latest s ON s.assignment_id = a.id AND s.student_id = v_student_id
    LEFT JOIN v_submission_latest rk ON rk.assignment_id = rt.id AND rk.student_id = v_student_id
    WHERE a.group_id = v_group_id AND a.retake_of IS NULL AND a.visible
      AND (p_subject IS NULL OR a.subject = p_subject)
      AND NOT (rk.id IS NULL AND s.id IS NULL AND a.due_date >= CURRENT_DATE)
  ),
  cats AS (
    SELECT category,
      COALESCE(SUM(score), 0) AS earned,
      COALESCE(SUM(max_score), 0) AS max
    FROM eff
    GROUP BY category
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM eff),
    'submitted', (SELECT count(*) FROM eff WHERE st = 'submitted'),
    'missing', (SELECT count(*) FROM eff WHERE st = 'missing'),
    'pending', (SELECT count(*) FROM eff WHERE st = 'pending'),
    'earned', (SELECT COALESCE(SUM(score), 0) FROM eff WHERE st = 'submitted'),
    'max', (SELECT COALESCE(SUM(max_score), 0) FROM eff),
    'cats', (SELECT COALESCE(jsonb_agg(jsonb_build_object('category', category, 'earned', earned, 'max', max)), '[]'::jsonb) FROM cats)
  ) INTO v_out;
  RETURN v_out;
END;
$$;
GRANT EXECUTE ON FUNCTION public.my_assignment_summary(TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_assignments(p_code TEXT, p_subject TEXT DEFAULT NULL)
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
      COALESCE(rk.score, s.score) AS score,
      CASE
        WHEN rk.id IS NULL AND s.id IS NULL AND a.due_date < CURRENT_DATE THEN 'missing'
        WHEN rk.id IS NULL AND s.id IS NULL THEN 'upcoming'
        WHEN COALESCE(rk.score, s.score) IS NULL THEN 'pending'
        ELSE 'submitted'
      END AS st
    FROM assignments a
    LEFT JOIN assignments rt ON rt.retake_of = a.id
    LEFT JOIN v_submission_latest s ON s.assignment_id = a.id AND s.student_id = v_student_id
    LEFT JOIN v_submission_latest rk ON rk.assignment_id = rt.id AND rk.student_id = v_student_id
    WHERE a.group_id = v_group_id AND a.retake_of IS NULL AND a.visible
      AND (p_subject IS NULL OR a.subject = p_subject)
    ORDER BY a.due_date DESC
    LIMIT 50
  ) t;
  RETURN v_out;
END;
$$;
GRANT EXECUTE ON FUNCTION public.my_assignments(TEXT, TEXT) TO anon, authenticated;
