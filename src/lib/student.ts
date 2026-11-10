import { supabase } from "./supabase/client";

export const STUDENT_COOKIE = "lookmee_student";
export const STUDENT_TOKEN_COOKIE = "lookmee_student_token";
// Requirement 3ข: ปลดล็อกใหม่ทุกวัน (Session token expires daily / 24h)
const SESSION_MAX_AGE = 24 * 60 * 60;

export type StudentFaceStatus = "registered" | "unregistered" | "pending";

export type StudentIdentity = {
  id?: string;
  code: string;
  name: string;
  group: string;
  faceStatus: StudentFaceStatus;
  hasFace: boolean;
  descriptor: number[] | null;
  photo: string | null;
  hasPin: boolean;
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
  return code ? decodeURIComponent(code) : null;
}

export function getStudentToken(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)lookmee_student_token=([^;]*)/);
  const token = m?.[1]?.trim();
  return token ? decodeURIComponent(token) : null;
}

export function setStudentSession(code: string, token: string, expiresAt?: string) {
  let maxAge = SESSION_MAX_AGE;
  if (expiresAt) {
    const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
    if (diff > 0) maxAge = diff;
  }
  document.cookie = `${STUDENT_COOKIE}=${encodeURIComponent(code)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  document.cookie = `${STUDENT_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function setStudentCode(code: string) {
  document.cookie = `${STUDENT_COOKIE}=${encodeURIComponent(code)}; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax`;
}

export function clearStudentSession() {
  document.cookie = `${STUDENT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = `${STUDENT_TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function clearStudentCode() {
  clearStudentSession();
}

/** ค้นหาตัวตนด้วยรหัส (ไม่ต้องล็อกอิน) — ปลอดภัย ไม่ส่ง raw descriptor ออกมา */
export async function lookupStudent(code: string): Promise<StudentIdentity | null> {
  try {
    const { data, error } = await supabase.rpc("lookup_student", { p_code: code.trim() });
    if (error || !data || (data as unknown[]).length === 0) return null;
    const rows = (data as Array<{
      code?: string;
      student_code?: string;
      name?: string;
      student_name?: string;
      group_name?: string;
      face_status?: string;
      photo?: string | null;
      photo_url?: string | null;
      has_pin?: boolean;
    }>) ?? [];
    const r = rows[0];
    if (!r) return null;
    const faceStatus = ((r.face_status as StudentFaceStatus) || "unregistered");
    return {
      code: r.code ?? r.student_code ?? code.trim(),
      name: r.name ?? r.student_name ?? "",
      group: r.group_name ?? "",
      faceStatus,
      hasFace: faceStatus === "registered",
      descriptor: null,
      photo: r.photo ?? r.photo_url ?? null,
      hasPin: r.has_pin === true,
    };
  } catch {
    return null;
  }
}

/** ดึงเวกเตอร์ใบหน้าของตนเองสำหรับใช้ในหน้าสแกนเช็กชื่อ (ต้องมี session token) */
export async function getMyFaceDescriptor(): Promise<number[] | null> {
  const token = getStudentToken();
  if (!token) return null;
  try {
    const { data, error } = await supabase.rpc("get_my_face_descriptor", { p_token: token });
    if (error || !data) return null;
    if (Array.isArray(data) && data.length === 128) return data as number[];
    return null;
  } catch {
    return null;
  }
}

export type FaceLoginResult = {
  ok: boolean;
  token?: string;
  expires_at?: string;
  has_pin?: boolean;
  error?: "not_found" | "no_face" | "face_not_match" | string;
  distance?: number;
  student?: {
    code: string;
    name: string;
    group: string;
    photo: string | null;
  };
};

/** ล็อกอินด้วย Face Unlock (สแกนใบหน้า) */
export async function loginWithFace(code: string, descriptor: number[]): Promise<FaceLoginResult> {
  try {
    const { data, error } = await supabase.rpc("student_face_login", {
      p_code: code.trim(),
      p_descriptor: descriptor,
    });
    if (error || !data) return { ok: false, error: error?.message || "network_error" };
    return data as FaceLoginResult;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "network_error";
    return { ok: false, error: msg };
  }
}

export type PinLoginResult = {
  ok: boolean;
  token?: string;
  expires_at?: string;
  error?: "not_found" | "locked" | "no_pin_set" | "bad_pin" | string;
  remaining?: number;
  wait_minutes?: number;
  student?: {
    code: string;
    name: string;
    group: string;
    photo: string | null;
  };
};

/** ล็อกอินด้วยรหัส PIN ส่วนตัว 4-6 หลัก */
export async function loginWithPin(code: string, pin: string): Promise<PinLoginResult> {
  try {
    const { data, error } = await supabase.rpc("student_pin_login", {
      p_code: code.trim(),
      p_pin: pin.trim(),
    });
    if (error || !data) return { ok: false, error: error?.message || "network_error" };
    return data as PinLoginResult;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "network_error";
    return { ok: false, error: msg };
  }
}

/** ตั้งรหัส PIN ส่วนตัว 4-6 หลัก (ต้องมี session token) */
export async function setStudentPersonalPin(pin: string, token?: string): Promise<{ ok: boolean; error?: string }> {
  const t = token ?? getStudentToken();
  if (!t) return { ok: false, error: "unauthorized" };
  try {
    const { data, error } = await supabase.rpc("student_set_pin", {
      p_token: t,
      p_pin: pin.trim(),
    });
    if (error || !data) return { ok: false, error: error?.message || "failed" };
    const r = data as { ok: boolean; error?: string };
    return { ok: r.ok === true, error: r.error };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/** นักเรียนส่งคำขอลงทะเบียนใบหน้าด้วยตนเอง (สถานะจะเป็น 'pending' รอครูอนุมัติ) */
export async function submitSelfEnroll(
  code: string,
  descriptor: number[],
  photoUrl?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("student_submit_self_enroll", {
      p_code: code.trim(),
      p_descriptor: descriptor,
      p_photo_url: photoUrl ?? null,
    });
    if (error || !data) return { ok: false, error: error?.message || "failed" };
    const r = data as { ok: boolean; error?: string };
    return { ok: r.ok === true, error: r.error };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/** ครูอนุมัติหรือปฏิเสธคำขอลงทะเบียนใบหน้า */
export async function teacherDecideFaceEnroll(
  studentId: string,
  decision: "approve" | "reject",
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("teacher_decide_face_enroll", {
      p_student_id: studentId,
      p_decision: decision,
    });
    if (error || !data) return { ok: false, error: error?.message || "failed" };
    const r = data as { ok: boolean; error?: string };
    return { ok: r.ok === true, error: r.error };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/** ครูรีเซ็ตรหัส PIN ให้นักเรียน */
export async function teacherResetStudentPin(studentId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("teacher_reset_student_pin", {
      p_student_id: studentId,
    });
    if (error || !data) return { ok: false, error: error?.message || "failed" };
    const r = data as { ok: boolean; error?: string };
    return { ok: r.ok === true, error: r.error };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/** ครูตั้งหรือเปลี่ยนรหัส PIN ให้นักเรียนโดยตรง */
export async function teacherSetStudentPin(studentId: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("teacher_set_student_pin", {
      p_student_id: studentId,
      p_pin: pin.trim(),
    });
    if (error || !data) return { ok: false, error: error?.message || "failed" };
    const r = data as { ok: boolean; error?: string };
    return { ok: r.ok === true, error: r.error };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/** ตรวจสอบ Session Token ที่จัดเก็บใน Cookie */
export async function verifyStudentSession(token?: string): Promise<StudentIdentity | null> {
  const t = token ?? getStudentToken();
  if (!t) return null;
  try {
    const { data, error } = await supabase.rpc("verify_student_session", { p_token: t });
    if (error || !data || (data as unknown[]).length === 0) return null;
    const rows = (data as Array<{
      is_valid?: boolean;
      code?: string;
      name?: string;
      group_name?: string;
      photo?: string | null;
      has_pin?: boolean;
    }>) ?? [];
    const r = rows[0];
    if (!r || !r.is_valid) return null;
    return {
      code: r.code ?? "",
      name: r.name ?? "",
      group: r.group_name ?? "",
      faceStatus: "registered",
      hasFace: true,
      descriptor: null,
      photo: r.photo ?? null,
      hasPin: r.has_pin === true,
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

export async function studentCheckin(code: string, pin?: string): Promise<"saved" | "duplicate" | "no_session" | "bad_pin" | "failed"> {
  try {
    const { data, error } = await supabase.rpc("student_checkin", { p_code: code, p_pin: pin ?? null });
    if (error || !data) return "failed";
    const r = (data as { result: string }).result;
    if (r === "saved" || r === "duplicate" || r === "no_session" || r === "bad_pin") return r;
    return "failed";
  } catch {
    return "failed";
  }
}

export type AssignmentSummary = {
  total: number;
  submitted: number;
  missing: number;
  pending: number;
  earned: number;
  max: number;
  cats: Array<{ category: string; earned: number; max: number }>;
};

export type AssignmentRow = {
  title: string;
  subject: string;
  category: string;
  due: string;
  max_score: number;
  score: number | null;
  st: "submitted" | "missing" | "pending" | "upcoming";
  attachment: string | null;
};

/** สรุปงาน/คะแนนของฉัน (กรองวิชาได้, ว่าง = ทุกวิชา) */
export async function fetchAssignmentSummary(code: string, subject?: string): Promise<AssignmentSummary | null> {
  try {
    const assignments = await fetchAssignments(code, subject);
    if (!assignments) return null;

    let submitted = 0;
    let missing = 0;
    let pending = 0;
    let earned = 0;
    let max = 0;
    const catMap = new Map<string, { earned: number; max: number }>();

    for (const a of assignments) {
      max += a.max_score;
      const cat = a.category || "ทั่วไป";
      const curCat = catMap.get(cat) ?? { earned: 0, max: 0 };
      curCat.max += a.max_score;

      if (a.score !== null && a.score !== undefined) {
        submitted++;
        earned += a.score;
        curCat.earned += a.score;
      } else if (a.st === "missing") {
        missing++;
      } else {
        pending++;
      }
      catMap.set(cat, curCat);
    }

    const cats = [...catMap.entries()].map(([category, vals]) => ({
      category,
      earned: vals.earned,
      max: vals.max,
    }));

    return {
      total: assignments.length,
      submitted,
      missing,
      pending,
      earned,
      max,
      cats,
    };
  } catch {
    return null;
  }
}

/** ประวัติงานของฉัน (กรองวิชาได้, ว่าง = ทุกวิชา) */
export async function fetchAssignments(code: string, subject?: string): Promise<AssignmentRow[] | null> {
  try {
    const { data, error } = await supabase.rpc("my_assignments", { p_code: code, p_subject: subject ?? null });
    const list = (!error && Array.isArray(data)) ? (data as AssignmentRow[]) : [];

    // หากนักเรียนสังกัด ม.1 ให้ดึงงานของ "รวม ม.1" เพิ่มเติมด้วยหากยังไม่มีในรายการ
    const { data: stRow } = await supabase
      .from("students")
      .select("id, class_groups!inner(name)")
      .eq("student_code", code.trim())
      .single();

    const groupName = (stRow as unknown as { class_groups: { name: string } } | null)?.class_groups?.name;
    if (groupName && groupName.startsWith("ม.1/")) {
      const { data: combinedG } = await supabase
        .from("class_groups")
        .select("id")
        .eq("name", "รวม ม.1 (ห้อง 1/1 - 1/11)")
        .maybeSingle();

      if (combinedG?.id) {
        let q = supabase
          .from("assignments")
          .select("id,title,subject,category,due_date,max_score,visible")
          .eq("group_id", combinedG.id)
          .eq("visible", true)
          .is("retake_of", null);
        if (subject) q = q.eq("subject", subject);
        const { data: m1Assigns } = await q;

        if (m1Assigns && m1Assigns.length > 0) {
          const studentId = (stRow as { id: string }).id;
          const { data: subs } = await supabase
            .from("v_submission_latest")
            .select("assignment_id,score")
            .in("assignment_id", m1Assigns.map((a) => a.id))
            .eq("student_id", studentId);
          const subMap = new Map((subs ?? []).map((s: { assignment_id: string; score: number | null }) => [s.assignment_id, s.score]));

          const existingTitles = new Set(list.map((r) => `${r.subject}|${r.title}`));
          const today = new Date().toISOString().slice(0, 10);

          for (const a of m1Assigns as Array<{ id: string; title: string; subject: string; category: string | null; due_date: string; max_score: number }>) {
            if (!existingTitles.has(`${a.subject}|${a.title}`)) {
              const score = subMap.has(a.id) ? subMap.get(a.id) ?? null : null;
              let st: "submitted" | "missing" | "pending" | "upcoming" = "upcoming";
              if (score !== null && score !== undefined) st = "submitted";
              else if (a.due_date < today) st = "missing";

              list.push({
                title: a.title,
                subject: a.subject,
                category: a.category || "ใบงาน/การบ้าน",
                due: a.due_date,
                max_score: Number(a.max_score),
                score: score !== undefined ? score : null,
                st,
                attachment: null,
              });
            }
          }
        }
      }
    }

    return list.sort((a, b) => b.due.localeCompare(a.due));
  } catch {
    return null;
  }
}
/** ตรวจ PIN ประจำรอบก่อนเปิดกล้อง */
export async function verifyPin(code: string, pin: string): Promise<{ ok: boolean; legacy: boolean }> {
  try {
    const { data, error } = await supabase.rpc("verify_pin", { p_code: code, p_pin: pin.trim() });
    if (error || !data) return { ok: false, legacy: false };
    const r = data as { ok: boolean; legacy?: boolean };
    return { ok: r.ok === true, legacy: r.legacy === true };
  } catch {
    return { ok: false, legacy: false };
  }
}

/** นักเรียนยื่นใบลาเอง */
export async function submitLeaveSelf(input: {
  code: string;
  from: string;
  to: string;
  type: "sick" | "personal" | "other";
  reason: string;
}): Promise<"saved" | "bad_dates" | "need_reason" | "failed"> {
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
    if (r === "saved" || r === "bad_dates" || r === "need_reason") return r;
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
