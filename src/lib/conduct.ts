import { isSupabaseConfigured, supabase } from "./supabase/client";

export type StudentAttendanceStats = {
  absent: number;
  late: number;
  present: number;
  activity: number;
};

export type StudentConductPreview = {
  studentCode: string;
  name: string;
  classNo: string;
  absent: number;
  late: number;
  effectiveAbsences: number;
  conductScore: number;
  splitCol1: number;
  splitCol2: number;
};

/**
 * คำนวณคะแนนจิตพิสัย (เต็ม 10 คะแนน) ตามเกณฑ์ระดับชั้น
 *
 * ระดับชั้น ม.1 และ ม.5 (และค่าเริ่มต้น):
 *   ขาด 0-3 ครั้ง = 10 คะแนน
 *   ขาด 4 ครั้ง   = 8 คะแนน
 *   ขาด 5 ครั้ง   = 6 คะแนน
 *   ขาด 6 ครั้ง   = 4 คะแนน
 *   ขาด 7 ครั้ง   = 2 คะแนน
 *   ขาด 8+ ครั้ง  = 0 คะแนน
 *
 * ระดับชั้น ม.3:
 *   ขาด 0-3 ครั้ง = 10 คะแนน
 *   ขาด 4 ครั้ง   = 9 คะแนน
 *   ขาด 5 ครั้ง   = 8 คะแนน
 *   ขาด 6 ครั้ง   = 7 คะแนน
 *   ขาด 7 ครั้ง   = 6 คะแนน
 *   ขาด 8 ครั้ง   = 5 คะแนน
 *   ขาด 9 ครั้ง   = 4 คะแนน
 *   ขาด 10 ครั้ง  = 3 คะแนน
 *   ขาด 11 ครั้ง  = 2 คะแนน
 *   ขาด 12 ครั้ง  = 1 คะแนน
 *   ขาด 13+ ครั้ง = 0 คะแนน
 */
export function calculateConductScore(level: string, effectiveAbsences: number): number {
  const abs = Math.max(0, effectiveAbsences);
  if (level === "ม.3") {
    if (abs <= 3) return 10;
    if (abs >= 13) return 0;
    return 10 - (abs - 3);
  }

  // ม.1, ม.5 (และระดับชั้นอื่นๆ เช่น ม.2, ม.4, ม.6)
  if (abs <= 3) return 10;
  if (abs >= 8) return 0;
  return 10 - (abs - 3) * 2;
}

/**
 * คำนวณยอดขาดเทียบเท่า:
 * ขาด + floor(มาสาย / lateToAbsentRatio)
 * ค่าเริ่มต้น: มาสาย 3 ครั้ง = ขาด 1 ครั้ง
 */
export function calculateEffectiveAbsences(
  absentCount: number,
  lateCount: number,
  lateToAbsentRatio = 3,
): number {
  const ratio = Math.max(1, lateToAbsentRatio);
  return Math.max(0, absentCount) + Math.floor(Math.max(0, lateCount) / ratio);
}

/**
 * คำนวณการแบ่งคะแนนจิตพิสัย 2 คอลัมน์ (เช่น คอลัมน์ละ 5 คะแนน)
 */
export function splitConductScore(score: number): { col1: number; col2: number } {
  const col1 = Math.round((score / 2) * 10) / 10;
  const col2 = Math.round((score - col1) * 10) / 10;
  return { col1, col2 };
}

/**
 * ดึงสถิติการเช็คชื่อ (ขาด, สาย, มา, กิจกรรม) ของนักเรียนในกลุ่ม
 */
export async function fetchConductAttendanceStats(
  groupName: string,
  dateRange?: { startsOn?: string; endsOn?: string } | null,
): Promise<Map<string, StudentAttendanceStats> | null> {
  if (!isSupabaseConfigured) return null;
  try {
    let q = supabase
      .from("attendance_sessions")
      .select(
        "session_date,class_groups!inner(name),attendance_records(status,students!inner(student_code))",
      )
      .eq("class_groups.name", groupName);

    if (dateRange?.startsOn) {
      q = q.gte("session_date", dateRange.startsOn);
    }
    if (dateRange?.endsOn) {
      q = q.lte("session_date", dateRange.endsOn);
    }

    const { data, error } = await q;
    if (error || !data) return null;

    const statsMap = new Map<string, StudentAttendanceStats>();
    for (const session of data as unknown as Array<{
      attendance_records: Array<{
        status: string;
        students: { student_code: string | null };
      }>;
    }>) {
      for (const rec of session.attendance_records ?? []) {
        const code = rec.students?.student_code;
        if (!code) continue;
        const cur = statsMap.get(code) ?? { absent: 0, late: 0, present: 0, activity: 0 };
        if (rec.status === "absent") cur.absent++;
        else if (rec.status === "late") cur.late++;
        else if (rec.status === "present") cur.present++;
        else if (rec.status === "activity") cur.activity++;
        statsMap.set(code, cur);
      }
    }
    return statsMap;
  } catch {
    return null;
  }
}
