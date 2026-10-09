import { isSupabaseConfigured, supabase } from "./supabase/client";

export type LeaveType = "sick" | "personal" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected";

export type LeaveItem = {
  id: string;
  studentCode: string;
  studentName: string;
  group: string;
  dateFrom: string;
  dateTo: string;
  type: LeaveType;
  reason: string;
  status: LeaveStatus;
};

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  sick: "ลาป่วย",
  personal: "ลากิจ",
  other: "ลาอื่นๆ",
};

type DbLeaveRow = {
  id: string;
  date_from: string;
  date_to: string;
  type: string;
  reason: string | null;
  status: string;
  students: {
    student_code: string | null;
    prefix: string;
    first_name: string;
    last_name: string | null;
    class_groups: { name: string } | null;
  } | null;
};

function toItem(r: DbLeaveRow): LeaveItem | null {
  const st = r.students;
  if (!st?.student_code) return null;
  const last = st.last_name ?? "";
  return {
    id: r.id,
    studentCode: st.student_code,
    studentName: `${st.prefix}${st.first_name}${last ? ` ${last}` : ""}`,
    group: st.class_groups?.name ?? "-",
    dateFrom: r.date_from,
    dateTo: r.date_to,
    type: r.type === "sick" || r.type === "personal" || r.type === "other" ? r.type : "sick",
    reason: r.reason ?? "-",
    status: (["pending", "approved", "rejected"] as const).includes(r.status as LeaveStatus)
      ? (r.status as LeaveStatus)
      : "pending",
  };
}

/** ดึงใบลารอ evident — คืน null ถ้าต่อ DB ไม่ได้ */
export async function fetchPendingLeaves(): Promise<LeaveItem[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from("leave_requests")
      .select("id,date_from,date_to,type,reason,status,students(student_code,prefix,first_name,last_name,class_groups(name))")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error || !data) return null;
    return (data as unknown as DbLeaveRow[])
      .map(toItem)
      .filter((x): x is LeaveItem => x !== null);
  } catch {
    return null;
  }
}

/** ประวัติใบลารายคน (ทุกสถานะ, ล่าสุด 20 ใบ) — null ถ้าต่อ DB ไม่ได้ */
export async function fetchStudentLeaves(studentCode: string): Promise<LeaveItem[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data: st } = await supabase
      .from("students")
      .select("id")
      .eq("student_code", studentCode)
      .single();
    const studentId = (st as { id: string } | null)?.id;
    if (!studentId) return null;
    const { data, error } = await supabase
      .from("leave_requests")
      .select("id,date_from,date_to,type,reason,status,students!inner(student_code,prefix,first_name,last_name,class_groups(name))")
      .eq("student_id", studentId)
      .order("date_from", { ascending: false })
      .limit(20);
    if (error || !data) return null;
    return (data as unknown as DbLeaveRow[])
      .map(toItem)
      .filter((x): x is LeaveItem => x !== null);
  } catch {
    return null;
  }
}
/** ยื่นใบลา — คืน id ที่สร้าง, null ถ้าล้มเหลว */
export async function createLeave(input: {
  studentCode: string;
  dateFrom: string;
  dateTo: string;
  type: LeaveType;
  reason: string;
}): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data: st, error: e1 } = await supabase
      .from("students")
      .select("id")
      .eq("student_code", input.studentCode)
      .eq("status", "active")
      .single();
    if (e1 || !st) return null;
    const { data, error: e2 } = await supabase
      .from("leave_requests")
      .insert({
        student_id: (st as { id: string }).id,
        date_from: input.dateFrom,
        date_to: input.dateTo,
        type: input.type,
        reason: input.reason || null,
        status: "pending",
      })
      .select("id")
      .single();
    if (e2 || !data) return null;
    return (data as { id: string }).id;
  } catch {
    return null;
  }
}

/** อนุมัติ/ปฏิเสธใบลา (ผูกครูผู้ตัดสิน) */
export async function decideLeave(id: string, status: "approved" | "rejected"): Promise<boolean> {
  // รายการ local- อยู่ใน state ของ component อยู่แล้ว
  if (id.startsWith("local-")) return true;
  if (!isSupabaseConfigured) return false;
  try {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("leave_requests")
      .update({
        status,
        decided_by: auth.user?.id ?? null,
        decided_at: new Date().toISOString(),
      })
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}
