-- =====================================================================
-- LOOKMEE Check In-Out · คะแนนพิเศษ (Bonus Scores)
-- ครูกำหนดคะแนนพิเศษให้นักเรียนแต่ละคนได้ทุกครั้ง
-- คะแนนนี้จะถูกนำมารวมคำนวณเกรดรวมกับคะแนนงานปกติ
-- =====================================================================

CREATE TABLE IF NOT EXISTS bonus_scores (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students (id)
                 ON UPDATE CASCADE ON DELETE CASCADE,
  score      NUMERIC NOT NULL CHECK (score >= 0),
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bonus_scores_student ON bonus_scores (student_id);
CREATE INDEX IF NOT EXISTS idx_bonus_scores_created ON bonus_scores (created_at);

ALTER TABLE bonus_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_bonus_scores" ON bonus_scores;
CREATE POLICY "auth_all_bonus_scores" ON bonus_scores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE bonus_scores IS 'คะแนนพิเศษที่ครูกำหนดให้นักเรียนแต่ละคน ใช้รวมคำนวณเกรดรวม';
