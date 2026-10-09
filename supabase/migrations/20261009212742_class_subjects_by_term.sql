-- =====================================================================
-- LOOKMEE Check In-Out · วิชาประจำห้องแยกตามภาคเรียน
-- แยกทะเบียนวิชาออกจาก assignments เพื่อให้เพิ่มวิชาได้ก่อนมีงาน/คะแนน
-- =====================================================================

CREATE TABLE IF NOT EXISTS class_subjects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID NOT NULL REFERENCES class_groups (id)
               ON UPDATE CASCADE ON DELETE CASCADE,
  term_id    UUID REFERENCES school_terms (id)
               ON UPDATE CASCADE ON DELETE SET NULL,
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_subjects_group_term_name
  ON class_subjects (group_id, term_id, lower(trim(name)))
  WHERE term_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_class_subjects_group_term
  ON class_subjects (group_id, term_id);

ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_class_subjects" ON class_subjects;
CREATE POLICY "auth_all_class_subjects" ON class_subjects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- สร้างทะเบียนจากวิชาที่มีงานอยู่แล้ว โดยผูกงานกับเทอมตาม due_date.
INSERT INTO class_subjects (group_id, term_id, name)
SELECT DISTINCT ON (a.group_id, t.id, lower(trim(a.subject)))
  a.group_id, t.id, trim(a.subject)
FROM assignments a
JOIN school_terms t ON a.due_date BETWEEN t.starts_on AND t.ends_on
WHERE length(trim(a.subject)) > 0
ORDER BY a.group_id, t.id, lower(trim(a.subject)), trim(a.subject)
ON CONFLICT DO NOTHING;

-- เก็บวิชา legacy ที่กำหนดส่งอยู่นอกช่วงเทอมไว้ใน scope "ไม่ระบุเทอม"
INSERT INTO class_subjects (group_id, term_id, name)
SELECT DISTINCT ON (a.group_id, lower(trim(a.subject))) a.group_id, NULL, trim(a.subject)
FROM assignments a
WHERE length(trim(a.subject)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM school_terms t
    WHERE a.due_date BETWEEN t.starts_on AND t.ends_on
  )
  AND NOT EXISTS (
    SELECT 1 FROM class_subjects existing
    WHERE existing.group_id = a.group_id
      AND existing.term_id IS NULL
      AND lower(trim(existing.name)) = lower(trim(a.subject))
  )
ORDER BY a.group_id, lower(trim(a.subject)), trim(a.subject)
ON CONFLICT DO NOTHING;

-- Normalize any legacy capitalization/spacing variants to the seeded subject.
UPDATE assignments a
SET subject = s.name
FROM class_subjects s
JOIN school_terms t ON t.id = s.term_id
WHERE a.group_id = s.group_id
  AND a.due_date BETWEEN t.starts_on AND t.ends_on
  AND lower(trim(a.subject)) = lower(trim(s.name))
  AND a.subject IS DISTINCT FROM s.name;

UPDATE assignments a
SET subject = s.name
FROM class_subjects s
WHERE s.term_id IS NULL
  AND a.group_id = s.group_id
  AND NOT EXISTS (
    SELECT 1 FROM school_terms t
    WHERE a.due_date BETWEEN t.starts_on AND t.ends_on
  )
  AND lower(trim(a.subject)) = lower(trim(s.name))
  AND a.subject IS DISTINCT FROM s.name;

-- เปลี่ยนชื่อวิชาแล้ว sync ชื่อ denormalized ในรายการงานเฉพาะห้อง/เทอมเดิม
CREATE OR REPLACE FUNCTION public.sync_class_subject_name_to_assignments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE assignments a
    SET subject = NEW.name
    WHERE a.group_id = OLD.group_id
      AND a.subject = OLD.name
      AND (
        (OLD.term_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM school_terms t
          WHERE t.id = OLD.term_id
            AND a.due_date BETWEEN t.starts_on AND t.ends_on
        ))
        OR (OLD.term_id IS NULL AND NOT EXISTS (
          SELECT 1 FROM school_terms t
          WHERE a.due_date BETWEEN t.starts_on AND t.ends_on
        ))
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS class_subjects_sync_assignment_name ON class_subjects;
CREATE TRIGGER class_subjects_sync_assignment_name
AFTER UPDATE OF name ON class_subjects
FOR EACH ROW
EXECUTE FUNCTION public.sync_class_subject_name_to_assignments();

-- ลบวิชาแล้วลบงานและคะแนนที่อยู่ในห้อง/เทอมนั้นเท่านั้น
CREATE OR REPLACE FUNCTION public.delete_class_subject_assignments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM assignments a
  WHERE a.group_id = OLD.group_id
    AND a.subject = OLD.name
    AND (
      (OLD.term_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM school_terms t
        WHERE t.id = OLD.term_id
          AND a.due_date BETWEEN t.starts_on AND t.ends_on
      ))
      OR (OLD.term_id IS NULL AND NOT EXISTS (
        SELECT 1 FROM school_terms t
        WHERE a.due_date BETWEEN t.starts_on AND t.ends_on
      ))
    );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS class_subjects_delete_assignments ON class_subjects;
CREATE TRIGGER class_subjects_delete_assignments
BEFORE DELETE ON class_subjects
FOR EACH ROW
EXECUTE FUNCTION public.delete_class_subject_assignments();
