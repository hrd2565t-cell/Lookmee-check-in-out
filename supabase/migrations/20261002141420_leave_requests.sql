-- =====================================================================
-- LOOKMEE Check In-Out · ใบลานักเรียน (ลาป่วย/ลากิจ)
-- ผูกกับ students + users (ครูผู้อนุมัติ)
-- =====================================================================

CREATE TABLE leave_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students (id)
                ON UPDATE CASCADE ON DELETE CASCADE,
  date_from   DATE NOT NULL,                             -- ลาตั้งแต่วันที่
  date_to     DATE NOT NULL,                             -- ลาถึงวันที่
              CHECK (date_to >= date_from),
  type        TEXT NOT NULL DEFAULT 'sick'               -- sick (ป่วย) | personal (กิจ)
              CHECK (type IN ('sick', 'personal')),
  reason      TEXT,                                      -- เหตุผล
  status      TEXT NOT NULL DEFAULT 'pending'            -- pending | approved | rejected
              CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by  UUID REFERENCES users (id)
                ON UPDATE CASCADE ON DELETE SET NULL,    -- ครูผู้อนุมัติ/ปฏิเสธ
  decided_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leave_student ON leave_requests (student_id);
CREATE INDEX idx_leave_dates ON leave_requests (date_from, date_to);
CREATE INDEX idx_leave_pending ON leave_requests (status) WHERE status = 'pending';

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mvp_all_leave" ON leave_requests
  FOR ALL USING (true) WITH CHECK (true);
