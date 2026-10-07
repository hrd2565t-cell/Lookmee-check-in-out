import { supabase } from "./supabase/client";

export const STUDENT_COOKIE = "lookmee_student";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export type StudentIdentity = {
  code: string;
  name: string;
  group: string;
  hasFace: boolean;
  descriptor: number[] | null;
  photo: string | null;
};

export type MyHistory = {
  attendance: Array<{
    date: string;
    check_in_at: string | null;
    status: string;
    period_no: number | null;
    grp: string;
  }>;
  leaves: Array<{
    date_from: string;
    date_to: string;
    type: string;
    reason: string | null;
    status: string;
  }>;
};

export function getStudentCode(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)lookmee_student=([^;]*)/);
  const code = m?.[1]?.trim();
  return code ? code : null;
}

export function setStudentCode(code: string) {
  document.cookie = `${STUDENT_COOKIE}=${encodeURIComponent(code)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function clearStudentCode() {
  document.cookie = `${STUDENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/** ค้นหาตัวตนด้วยรหัส (ไม่ต้องล็อกอิน) — ไม่เจอคืน null */
export async function lookupStudent(code: string): Promise<StudentIdentity | null> {
  try {
    const { data, error } = await supabase.rpc("lookup_student", { p_code: code.trim() });
    if (error || !data || (data as unknown[]).length === 0) return null;
    const rows = (data as Array<{
      code: string;
      name: string;
      group_name: string;
      has_face: boolean;
      descriptor: number[] | null;
      photo: string | null;
    }>) ?? [];
    const r = rows[0];
    if (!r) return null;
    const descriptor =
      Array.isArray(r.descriptor) && r.descriptor.length === 128 ? r.descriptor : null;
    return {
      code: r.code,
      name: r.name,
      group: r.group_name,
      hasFace: r.has_face,
      descriptor,
      photo: r.photo ?? null,
    };
  } catch {
    return null;
  }
}

export async function fetchMyHistory(code: string, month?: string): Promise<MyHistory | null> {
  try {
    const { data, error } = await supabase.rpc("my_history", month ? { p_code: code, p_month: month } : { p_code: code });
    if (error || !data) return null;
    return data as MyHistory;
  } catch {
    return null;
  }
}

export async function studentCheckin(code: string): Promise<"saved" | "duplicate" | "failed"> {
  try {
    const { data, error } = await supabase.rpc("student_checkin", { p_code: code });
    if (error || !data) return "failed";
    const r = (data as { result: string }).result;
    if (r === "saved" || r === "duplicate") return r;
    return "failed";
  } catch {
    return "failed";
  }
}

/** นักเรียนยื่นใบลาเอง */
export async function submitLeaveSelf(input: {
  code: string;
  from: string;
  to: string;
  type: "sick" | "personal";
  reason: string;
}): Promise<"saved" | "bad_dates" | "failed"> {
  try {
    const { data, error } = await supabase.rpc("submit_leave", {
      p_code: input.code,
      p_from: input.from,
      p_to: input.to,
      p_type: input.type,
      p_reason: input.reason,
    });
    if (error || !data) return "failed";
    const r = (data as { result: string }).result;
    if (r === "saved") return "saved";
    if (r === "bad_dates") return "bad_dates";
    return "failed";
  } catch {
    return "failed";
  }
}

/** นักเรียนแจ้งขอแก้ไขข้อมูล */
export async function submitDispute(code: string, message: string): Promise<"saved" | "too_short" | "failed"> {
  try {
    const { data, error } = await supabase.rpc("submit_dispute", {
      p_code: code,
      p_message: message,
    });
    if (error || !data) return "failed";
    const r = (data as { result: string }).result;
    if (r === "saved" || r === "too_short") return r;
    return "failed";
  } catch {
    return "failed";
  }
}
