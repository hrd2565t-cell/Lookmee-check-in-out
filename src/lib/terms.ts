import { isSupabaseConfigured, supabase } from "./supabase/client";

export type SchoolTerm = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
};

export type AbsenceLimit = {
  level: string;
  maxAbsent: number | null;
  warnBefore: number;
};

export async function fetchTerms(): Promise<SchoolTerm[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from("school_terms")
      .select("id,name,starts_on,ends_on,is_current")
      .order("starts_on", { ascending: false });
    if (error || !data) return null;
    return (data as Array<{ id: string; name: string; starts_on: string; ends_on: string; is_current: boolean }>).map(
      (t) => ({
        id: t.id,
        name: t.name,
        startsOn: t.starts_on,
        endsOn: t.ends_on,
        isCurrent: t.is_current,
      }),
    );
  } catch {
    return null;
  }
}

export async function fetchLimits(): Promise<AbsenceLimit[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from("absence_limits")
      .select("level,max_absent,warn_before")
      .order("level");
    if (error || !data) return null;
    return (data as Array<{ level: string; max_absent: number | null; warn_before: number }>).map((l) => ({
      level: l.level,
      maxAbsent: l.max_absent,
      warnBefore: l.warn_before,
    }));
  } catch {
    return null;
  }
}

/** ดึงยอดขาดรายคนในช่วงวัน (ฝั่งนักเรียนใช้รหัสตัวเองได้) */
export async function fetchAbsencesInRange(
  code: string,
  from: string,
  to: string,
): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc("attendance_in_range", {
      p_code: code,
      p_from: from,
      p_to: to,
    });
    if (error || !data) return null;
    return (data as Array<{ status: string }>).filter((r) => r.status === "absent").length;
  } catch {
    return null;
  }
}

/** ระดับชั้นจากชื่อกลุ่ม เช่น "ม.1/1" → "ม.1" */
export function levelOf(groupName: string): string {
  return groupName.includes("/") ? (groupName.split("/")[0] as string) : groupName;
}
