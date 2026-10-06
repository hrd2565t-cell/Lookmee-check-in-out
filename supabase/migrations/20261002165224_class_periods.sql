-- =====================================================================
-- LOOKMEE Check In-Out · ตารางคาบเรียนรายห้อง (แต่ละห้องมีคาบไม่เหมือนกัน)
-- day_of_week: 1=จันทร์ 2=อังคาร 3=พุธ 4=พฤหัส 5=ศุกร์ 6=เสาร์
-- ใช้ตัดสิน "สาย" (เช็กชื่อหลัง start_time + late_after_min) และเลือกคาบปัจจุบัน
-- =====================================================================

CREATE TABLE class_periods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES class_groups (id)
                  ON UPDATE CASCADE ON DELETE CASCADE,
  day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
  period_no     SMALLINT NOT NULL CHECK (period_no BETWEEN 1 AND 12),
  subject       TEXT NOT NULL DEFAULT '',
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
                CHECK (end_time > start_time),
  late_after_min SMALLINT NOT NULL DEFAULT 15 CHECK (late_after_min >= 0),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, day_of_week, period_no)
);
CREATE INDEX idx_periods_group_day ON class_periods (group_id, day_of_week)
  WHERE is_active;

ALTER TABLE class_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mvp_all_periods" ON class_periods
  FOR ALL USING (true) WITH CHECK (true);
