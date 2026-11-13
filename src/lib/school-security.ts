import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

export interface SchoolSecuritySettings {
  id: string;
  school_name: string;
  geofence_enabled: boolean;
  school_lat: number | null;
  school_lng: number | null;
  school_radius_meters: number;
  dynamic_qr_enabled: boolean;
  dynamic_qr_interval_sec: number;
  updated_at?: string;
  updated_by?: string | null;
}

export const DEFAULT_SECURITY_SETTINGS: SchoolSecuritySettings = {
  id: "default",
  school_name: "โรงเรียนลูกหมี",
  geofence_enabled: false,
  school_lat: null,
  school_lng: null,
  school_radius_meters: 250,
  dynamic_qr_enabled: true,
  dynamic_qr_interval_sec: 30,
};

const STORAGE_KEY = "lookmee_school_security_settings";

/**
 * โหลดการตั้งค่าความปลอดภัย (GPS Geofence & Dynamic QR) จาก Supabase หรือแคช
 */
export async function fetchSchoolSecuritySettings(): Promise<SchoolSecuritySettings> {
  // ดึงจาก local cache ก่อนเพื่อความเร็ว
  let cached: SchoolSecuritySettings | null = null;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) cached = JSON.parse(raw);
    } catch {
      // ignore
    }
  }

  if (!isSupabaseConfigured) {
    return cached ?? DEFAULT_SECURITY_SETTINGS;
  }

  try {
    const { data, error } = await supabase
      .from("school_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    if (error || !data) {
      return cached ?? DEFAULT_SECURITY_SETTINGS;
    }

    const settings: SchoolSecuritySettings = {
      id: "default",
      school_name: data.school_name ?? DEFAULT_SECURITY_SETTINGS.school_name,
      geofence_enabled: !!data.geofence_enabled,
      school_lat: data.school_lat !== null && data.school_lat !== undefined ? Number(data.school_lat) : null,
      school_lng: data.school_lng !== null && data.school_lng !== undefined ? Number(data.school_lng) : null,
      school_radius_meters: Number(data.school_radius_meters) || 250,
      dynamic_qr_enabled: data.dynamic_qr_enabled !== false,
      dynamic_qr_interval_sec: Number(data.dynamic_qr_interval_sec) || 30,
      updated_at: data.updated_at,
      updated_by: data.updated_by,
    };

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch {
        // ignore
      }
    }

    return settings;
  } catch (err) {
    console.warn("fetchSchoolSecuritySettings error:", err);
    return cached ?? DEFAULT_SECURITY_SETTINGS;
  }
}

/**
 * บันทึกการตั้งค่าความปลอดภัย
 */
export async function saveSchoolSecuritySettings(
  updates: Partial<SchoolSecuritySettings>
): Promise<{ ok: boolean; error?: string }> {
  const current = await fetchSchoolSecuritySettings();
  const merged: SchoolSecuritySettings = {
    ...current,
    ...updates,
    id: "default",
    updated_at: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // ignore
    }
  }

  if (!isSupabaseConfigured) {
    return { ok: true };
  }

  try {
    const { error } = await supabase
      .from("school_settings")
      .upsert(merged, { onConflict: "id" });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "บันทึกไม่สำเร็จ" };
  }
}

/**
 * คำนวณระยะทางบนผิวโลก (Haversine Formula) เป็นเมตร
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // รัศมีโลกเฉลี่ย (เมตร)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * คำนวณ Time-step ปัจจุบัน (เช่น ทุก 30 วินาที)
 */
export function getCurrentTimeStep(intervalSec = 30): number {
  return Math.floor(Date.now() / 1000 / intervalSec);
}

/**
 * คำนวณ Rolling Token 8 ตัวอักษร สำหรับ PIN และ Step
 */
export function computeRollingToken(pin: string, step: number): string {
  const salt = "lookmee_dynamic_qr_step_salt";
  const str = `${pin.trim()}:${step}:${salt}`;
  let hash1 = 0x811c9dc5;
  let hash2 = 0x55555555;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    hash1 ^= code;
    hash1 = Math.imul(hash1, 0x01000193);
    hash2 = Math.imul(hash2 ^ code, 0x45d9f3b);
  }
  const part1 = (hash1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (hash2 >>> 0).toString(16).padStart(8, "0");
  return `${part1.slice(0, 4)}${part2.slice(0, 4)}`;
}

/**
 * ตรวจสอบความถูกต้องของ Rolling Token
 * - ยอมรับ time-step ได้ +/- toleranceSteps (ค่าเริ่มต้น 6 steps = ประมาณ 3 นาที)
 *   เพื่อรองรับ network delay ในห้องเรียน, เวลาโหลดหน้าเว็บ และ clock drift ของมือถือ
 */
export function verifyRollingToken(
  pin: string,
  token: string,
  passedStep: number,
  intervalSec = 30,
  toleranceSteps = 6
): boolean {
  if (!token || !pin) return false;
  const currentStep = getCurrentTimeStep(intervalSec);
  if (Math.abs(currentStep - passedStep) > toleranceSteps) {
    return false;
  }
  const expectedToken = computeRollingToken(pin, passedStep);
  return expectedToken.toLowerCase() === token.toLowerCase();
}

/**
 * ขอพิกัด GPS ปัจจุบันจากเบราว์เซอร์
 */
export function getUserCurrentCoordinates(): Promise<{
  lat: number;
  lng: number;
  accuracy: number;
}> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      reject(new Error("เบราว์เซอร์ไม่รองรับ GPS / Geolocation"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      (err) => {
        let message = "ไม่สามารถระบุพิกัดได้";
        if (err.code === 1) {
          message = "ผู้ใช้ปฏิเสธการเข้าถึงตำแหน่ง (GPS) — กรุณากดอนุญาตในเบราว์เซอร์";
        } else if (err.code === 2) {
          message = "สัญญาณ GPS ไม่พร้อมใช้งาน หรืออยู่นอกพื้นที่รับสัญญาณ";
        } else if (err.code === 3) {
          message = "หมดเวลาในการค้นหาตำแหน่ง GPS";
        }
        reject(new Error(message));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 15000,
      }
    );
  });
}
