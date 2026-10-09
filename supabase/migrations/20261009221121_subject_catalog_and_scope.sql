-- =====================================================================
-- LOOKMEE Check In-Out · ทะเบียนวิชากลาง + วิชาประจำชั้น/ห้อง
-- วิชากลางแยกตามเทอม; ชั้นเป็นค่าเริ่มต้น ห้องยกเว้น/เพิ่มได้
-- ย้ายข้อมูล class_subjects เดิมให้เป็นการกำหนดวิชาเฉพาะห้อง
-- =====================================================================

CREATE TABLE IF NOT EXISTS subjects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id    UUID REFERENCES school_terms (id)
               ON UPDATE CASCADE ON DELETE SET NULL,
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_term_name
  ON subjects (term_id, lower(trim(name)))
  WHERE term_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_legacy_name
  ON subjects (lower(trim(name)))
  WHERE term_id IS NULL;

CREATE TABLE IF NOT EXISTS level_subjects (
  level      TEXT NOT NULL,
  subject_id UUID NOT NULL REFERENCES subjects (id)
               ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (level, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_level_subjects_subject ON level_subjects (subject_id);

CREATE TABLE IF NOT EXISTS group_subject_overrides (
  group_id   UUID NOT NULL REFERENCES class_groups (id)
               ON UPDATE CASCADE ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects (id)
               ON UPDATE CASCADE ON DELETE RESTRICT,
  mode       TEXT NOT NULL CHECK (mode IN ('include', 'exclude')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_group_subject_overrides_subject ON group_subject_overrides (subject_id);

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_subject_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_subjects" ON subjects;
CREATE POLICY "auth_all_subjects" ON subjects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_level_subjects" ON level_subjects;
CREATE POLICY "auth_all_level_subjects" ON level_subjects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_group_subject_overrides" ON group_subject_overrides;
CREATE POLICY "auth_all_group_subject_overrides" ON group_subject_overrides
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ย้ายทะเบียนวิชาต่อห้อง/เทอมเดิมเข้าสู่ทะเบียนกลาง
INSERT INTO subjects (term_id, name)
SELECT DISTINCT ON (cs.term_id, lower(trim(cs.name))) cs.term_id, trim(cs.name)
FROM class_subjects cs
WHERE length(trim(cs.name)) > 0
ORDER BY cs.term_id, lower(trim(cs.name)), trim(cs.name)
ON CONFLICT DO NOTHING;

-- ข้อมูลเดิมเป็นการเลือกวิชาแยกต่อห้อง จึงเก็บเป็น room-level include override
INSERT INTO group_subject_overrides (group_id, subject_id, mode)
SELECT DISTINCT ON (cs.group_id, s.id) cs.group_id, s.id, 'include'
FROM class_subjects cs
JOIN subjects s
  ON s.term_id IS NOT DISTINCT FROM cs.term_id
 AND lower(trim(s.name)) = lower(trim(cs.name))
ON CONFLICT (group_id, subject_id) DO NOTHING;

-- เปลี่ยนชื่อจากทะเบียนกลางแล้ว sync ชื่องานเดิมของทุกห้องในเทอมนั้น
CREATE OR REPLACE FUNCTION public.sync_catalog_subject_name_to_assignments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE assignments a
    SET subject = NEW.name
    WHERE lower(trim(a.subject)) = lower(trim(OLD.name))
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

DROP TRIGGER IF EXISTS subjects_sync_assignment_name ON subjects;
CREATE TRIGGER subjects_sync_assignment_name
AFTER UPDATE OF name ON subjects
FOR EACH ROW
EXECUTE FUNCTION public.sync_catalog_subject_name_to_assignments();

-- ยกเลิกตารางทะเบียนวิชาเก่าหลังย้ายข้อมูลแล้ว
DROP TRIGGER IF EXISTS class_subjects_sync_assignment_name ON class_subjects;
DROP TRIGGER IF EXISTS class_subjects_delete_assignments ON class_subjects;
DROP FUNCTION IF EXISTS public.sync_class_subject_name_to_assignments();
DROP FUNCTION IF EXISTS public.delete_class_subject_assignments();
DROP TABLE IF EXISTS class_subjects;
