-- =====================================================================
-- LOOKMEE Check In-Out · ปลด FK decided_by/opened_by ออกจาก public.users
-- เหตุผล: บัญชีครูอยู่ใน auth.users ไม่ใช่ public.users ใส่ auth.uid()
-- ลงไปแล้วโดน FK ดัก (อนุมัติใบลา + เปิดรอบพังทั้งหมด)
-- เก็บคอลัมน์ UUID ไว้เฉย ๆ (เอาไว้อ้างอิง ไม่ enforce)
-- =====================================================================

ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_decided_by_fkey;
ALTER TABLE attendance_sessions DROP CONSTRAINT IF EXISTS attendance_sessions_opened_by_fkey;
