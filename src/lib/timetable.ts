import { isSupabaseConfigured, supabase } from "./supabase/client";
import { levelOf } from "./terms";

export const DAY_NAMES = ["", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
export const DAY_SHORT = ["", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export type Period = {
  id: string;
  groupId: string | null;
  groupName: string; // ชื่อห้อง หรือ "" ถ้าเป็นแถวระดับชั้น
  level: string | null; // เช่น "ม.1" ถ้าเป็นแถวระดับชั้น
  day: number;
  periodNo: number;
  subject: string;
  start: string; // "08:00"
  end: string;   // "08:50"
  lateAfterMin: number;
};

/** ป้ายแสดงขอบเขต: "ม.1/1" หรือ "ม.1 (ทุกห้อง)" */
export function scopeLabel(p: Pick<Period, "groupName" | "level">): string {
  return p.level ? `${p.level} (ทุกห้อง)` : p.groupName;
}

type DbPeriodRow = {
  id: string;
  group_id: string | null;
  level: string | null;
  day_of_week: number;
  period_no: number;
  subject: string | null;
  start_time: string;
  end_time: string;
  late_after_min: number;
  class_groups?: { name: string } | null;
};

function toPeriod(r: DbPeriodRow): Period {
  return {
    id: r.id,
    groupId: r.group_id,
    groupName: r.class_groups?.name ?? "",
    level: r.level,
    day: r.day_of_week,
    periodNo: r.period_no,
    subject: r.subject ?? "",
    start: r.start_time.slice(0, 5),
    end: r.end_time.slice(0, 5),
    lateAfterMin: r.late_after_min,
  };
}

/** ดึงคาบทั้งหมด (ห้อง+ชั้น) — null ถ้าต่อ DB ไม่ได้ */
export async function fetchAllPeriods(): Promise<Period[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from("class_periods")
      .select("id,group_id,level,day_of_week,period_no,subject,start_time,end_time,late_after_min,class_groups(name)")
      .eq("is_active", true)
      .order("day_of_week")
      .order("period_no");
    if (error || !data) return null;
    return (data as unknown as DbPeriodRow[]).map(toPeriod);
  } catch {
    return null;
  }
}

/** รวมตารางที่ใช้จริงของห้อง: แถวห้องทับแถวชั้น (ช่องวัน+คาบเดียวกัน) */
export function mergePeriods(all: Period[], groupName: string): Period[] {
  const lvl = levelOf(groupName);
  const base = new Map<string, Period>();
  all
    .filter((p) => p.level !== null && p.level === lvl)
    .forEach((p) => base.set(`${p.day}|${p.periodNo}`, p));
  all
    .filter((p) => p.level === null && p.groupName === groupName)
    .forEach((p) => base.set(`${p.day}|${p.periodNo}`, p));
  return [...base.values()].sort((a, b) => a.day - b.day || a.periodNo - b.periodNo);
}

/** ดึงคาบที่ใช้จริงของกลุ่ม (รวมชั้นแล้ว) — null ถ้าต่อ DB ไม่ได้ */
export async function fetchPeriods(groupName?: string): Promise<Period[] | null> {
  const all = await fetchAllPeriods();
  if (!all) return null;
  if (!groupName) return all;
  return mergePeriods(all, groupName);
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
