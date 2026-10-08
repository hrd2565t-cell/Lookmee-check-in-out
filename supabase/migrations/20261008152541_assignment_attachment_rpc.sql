-- =====================================================================
-- LOOKMEE Check In-Out · ส่ง attachment_url ในประวัติงานฝั่งนักเรียน
-- =====================================================================

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
    SELECT a.title, a.subject, a.category, a.due_date AS due, a.max_score, a.attachment_url AS attachment,
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
