import { isSupabaseConfigured, supabase } from "./supabase/client";

export const DAY_NAMES = ["", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export const DAY_SHORT = ["", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export type Period = {
  id: string;
  groupId: string;
  groupName: string;
  day: number;
  periodNo: number;
  subject: string;
  start: string; // "08:00"
  end: string;   // "08:50"
  lateAfterMin: number;
};

type DbPeriodRow = {
  id: string;
  group_id: string;
  day_of_week: number;
  period_no: number;
  subject: string | null;
  start_time: string;
  end_time: string;
  late_after_min: number;
  class_groups?: { name: string } | null;
};

/** ดึงคาบทั้งหมดของกลุ่ม (เรียงวัน+คาบ) — null ถ้าต่อ DB ไม่ได้ */
export async function fetchPeriods(groupName?: string): Promise<Period[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    let q = supabase
      .from("class_periods")
      .select("id,group_id,day_of_week,period_no,subject,start_time,end_time,late_after_min,class_groups!inner(name)")
      .eq("is_active", true);
    if (groupName) q = q.eq("class_groups.name", groupName);
    const { data, error } = await q
      .order("day_of_week")
      .order("period_no");
    if (error || !data) return null;
    return (data as unknown as DbPeriodRow[]).map((r) => ({
      id: r.id,
      groupId: r.group_id,
      groupName: r.class_groups?.name ?? "",
      day: r.day_of_week,
      periodNo: r.period_no,
      subject: r.subject ?? "",
      start: r.start_time.slice(0, 5),
      end: r.end_time.slice(0, 5),
      lateAfterMin: r.late_after_min,
    }));
  } catch {
    return null;
  }
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** หาคาบปัจจุบันจากเวลา (คืน null ถ้านอกคาบเรียน) */
export function findCurrentPeriod(periods: Period[], now = new Date()): Period | null {
  const jsDay = now.getDay(); // 0=อาทิตย์..6=เสาร์
  const day = jsDay === 0 ? 0 : jsDay; // อาทิตย์ไม่มีคาบ
  if (day < 1 || day > 6) return null;
  const t = now.getHours() * 60 + now.getMinutes();
  return (
    periods.find((p) => p.day === day && toMin(p.start) <= t && t <= toMin(p.end)) ?? null
  );
}

/** ตัดสินสาย: เกิน start + late_after_min ถือว่าสาย */
export function isLate(period: Period, now = new Date()): boolean {
  const t = now.getHours() * 60 + now.getMinutes();
  return t > toMin(period.start) + period.lateAfterMin;
}
