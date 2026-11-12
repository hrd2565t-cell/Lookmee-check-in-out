-- =====================================================================
-- LOOKMEE Check In-Out · School Security Settings (GPS Geofencing & Dynamic QR)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.school_settings (
  id                      TEXT PRIMARY KEY DEFAULT 'default',
  school_name             TEXT DEFAULT 'โรงเรียนลูกหมี',
  geofence_enabled        BOOLEAN NOT NULL DEFAULT false,
  school_lat              DOUBLE PRECISION,
  school_lng              DOUBLE PRECISION,
  school_radius_meters    INT NOT NULL DEFAULT 250,
  dynamic_qr_enabled      BOOLEAN NOT NULL DEFAULT true,
  dynamic_qr_interval_sec INT NOT NULL DEFAULT 30,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by              UUID REFERENCES auth.users (id)
);

ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "school_settings_select_all" ON public.school_settings;
CREATE POLICY "school_settings_select_all" ON public.school_settings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "school_settings_update_auth" ON public.school_settings;
CREATE POLICY "school_settings_update_auth" ON public.school_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ใส่ค่าเริ่มต้น
INSERT INTO public.school_settings (
  id, school_name, geofence_enabled, school_lat, school_lng, school_radius_meters, dynamic_qr_enabled, dynamic_qr_interval_sec
)
VALUES (
  'default', 'โรงเรียนลูกหมี', false, NULL, NULL, 250, true, 30
)
ON CONFLICT (id) DO NOTHING;
