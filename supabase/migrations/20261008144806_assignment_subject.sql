-- =====================================================================
-- LOOKMEE Check In-Out · RPC งาน/คะแนนกรองตามวิชา (p_subject ว่าง = ทุกวิชา)
-- ลบเวอร์ชันเก่า (arg เดียว) กัน PostgREST เลือก function ไม่ถูก
-- =====================================================================

DROP FUNCTION IF EXISTS public.my_assignment_summary(TEXT);
DROP FUNCTION IF EXISTS public.my_assignments(TEXT);

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
    WHERE a.group_id = v_group_id AND a.visible
      AND (p_subject IS NULL OR a.subject = p_subject)
      AND NOT (sub.id IS NULL AND a.due_date >= CURRENT_DATE)
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
      AND (p_subject IS NULL OR a.subject = p_subject)
    ORDER BY a.due_date DESC
    LIMIT 50
  ) t;
  RETURN v_out;
END;
$$;
GRANT EXECUTE ON FUNCTION public.my_assignments(TEXT, TEXT) TO anon, authenticated;
