import { isSupabaseConfigured, supabase } from "./supabase/client";

export type AttendanceStatus = "present" | "absent" | "late" | "activity";

export type AttendanceRow = {
  id: string;
  date: string;
  time: string;
  group: string;
  status: AttendanceStatus;
  confidence: number | null;
  method: string;
  periodNo: number | null;
  activityName: string | null;
};

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const nowTime = () => {
  const d = new Date();
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${ampm}`;
};

/** เปิด (หรือดึง) รอบเช็กชื่อของกลุ่มในวันที่กำหนด — คืน session id */
export async function ensureSession(groupName: string, date: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data: g } = await supabase
      .from("class_groups")
      .select("id")
      .eq("name", groupName)
      .single();
    const groupId = (g as { id: string } | null)?.id;
    if (!groupId) return null;
    const { data: existing } = await supabase
      .from("attendance_sessions")
      .select("id")
      .eq("group_id", groupId)
      .eq("session_date", date)
      .maybeSingle();
    if (existing) return (existing as { id: string }).id;
    const { data: created, error } = await supabase
      .from("attendance_sessions")
      .insert({ group_id: groupId, session_date: date, status: "open", opened_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error || !created) return null;
    return (created as { id: string }).id;
  } catch {
    return null;
  }
}

/** เปิด (หรือดึง) รอบเช็กชื่อวันนี้ของกลุ่ม — คืน session id */
export async function ensureTodaySession(groupName: string): Promise<string | null> {
  return ensureSession(groupName, todayStr());
}

export type CheckInResult = "saved" | "duplicate" | "failed";

/** บันทึกเช็กชื่อ (กันซ้ำคนละ 1 ครั้ง/วัน) */
export async function checkIn(
  sessionId: string,
  studentCode: string,
  confidence: number,
  opts?: { status?: "present" | "late"; periodNo?: number | null; method?: "face" | "manual" },
): Promise<CheckInResult> {
  if (!isSupabaseConfigured) return "failed";
  try {
    const { data: st } = await supabase
      .from("students")
      .select("id")
      .eq("student_code", studentCode)
      .eq("status", "active")
      .single();
    const studentId = (st as { id: string } | null)?.id;
    if (!studentId) return "failed";
    const { error } = await supabase.from("attendance_records").insert({
      session_id: sessionId,
      student_id: studentId,
      check_in_at: new Date().toISOString(),
      status: opts?.status ?? "present",
      period_no: opts?.periodNo ?? null,
      confidence,
      method: opts?.method ?? "face",
    });
    if (error) {
      // 23505 = unique violation → เช็กชื่อไปแล้ววันนี้
      return error.code === "23505" ? "duplicate" : "failed";
    }
    return "saved";
  } catch {
    return "failed";
  }
}

/** บันทึกกิจกรรม (ทับสถานะเดิมของวันนั้นได้ เช่น จาก absent → activity) */
export async function markActivity(
  sessionId: string,
  studentCode: string,
  activityName: string,
): Promise<"saved" | "failed"> {
  if (!isSupabaseConfigured) return "failed";
  try {
    const { data: st } = await supabase
      .from("students")
      .select("id")
      .eq("student_code", studentCode)
      .eq("status", "active")
      .single();
    const studentId = (st as { id: string } | null)?.id;
    if (!studentId) return "failed";
    const { error } = await supabase.from("attendance_records").upsert(
      {
        session_id: sessionId,
        student_id: studentId,
        check_in_at: new Date().toISOString(),
        status: "activity",
        activity_name: activityName,
        method: "manual",
      },
      { onConflict: "session_id,student_id" },
    );
    return error ? "failed" : "saved";
  } catch {
    return "failed";
  }
}

/** ประวัติเช็กชื่อรายคน (ล่าสุด 30 แถว) — null ถ้าต่อ DB ไม่ได้ */
export async function fetchStudentAttendance(studentCode: string): Promise<AttendanceRow[] | null> {
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
      .from("attendance_records")
      .select("id,check_in_at,status,confidence,method,period_no,activity_name,attendance_sessions!inner(session_date,class_groups!inner(name))")
      .eq("student_id", studentId)
      .order("check_in_at", { ascending: false })
      .limit(30);
    if (error || !data) return null;
    return (data as unknown as Array<{
      id: string;
      check_in_at: string | null;
      status: string;
      confidence: number | null;
      method: string;
      period_no: number | null;
      activity_name: string | null;
      attendance_sessions: { session_date: string; class_groups: { name: string } };
    }>).map((r) => ({
      id: r.id,
      date: r.attendance_sessions.session_date,
      time: r.check_in_at
        ? new Date(r.check_in_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
        : "-",
      group: r.attendance_sessions.class_groups.name,
      status: (["present", "absent", "late", "activity"] as const).includes(
        r.status as AttendanceRow["status"],
      )
        ? (r.status as AttendanceRow["status"])
        : "present",
      confidence: r.confidence,
      method: r.method,
      periodNo: r.period_no,
      activityName: r.activity_name,
    }));
  } catch {
    return null;
  }
}

export type SessionInfo = {
  id: string;
  group: string;
  date: string;
  status: "open" | "completed" | "soon";
};

export type DayRecord = {
  id: string;
  studentCode: string;
  name: string;
  group: string;
  time: string;
  checkInAt: string | null;
  status: AttendanceStatus;
  method: string;
  periodNo: number | null;
  sessionId: string;
  sessionStatus: string;
};

/** รอบทั้งหมดของวันที่กำหนด — null ถ้าต่อ DB ไม่ได้ */
export async function fetchSessionsByDate(date: string): Promise<SessionInfo[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from("attendance_sessions")
      .select("id,session_date,status,class_groups!inner(name)")
      .eq("session_date", date);
    if (error || !data) return null;
    return (
      data as unknown as Array<{
        id: string;
        session_date: string;
        status: string;
        class_groups: { name: string };
      }>
    ).map((s) => ({
      id: s.id,
      group: s.class_groups.name,
      date: s.session_date,
      status: (["open", "completed", "soon"] as const).includes(
        s.status as SessionInfo["status"],
      )
        ? (s.status as SessionInfo["status"])
        : "open",
    }));
  } catch {
    return null;
  }
}

/** ผลเช็กชื่อทั้งหมดของวันที่กำหนด (join ชื่อนักเรียนแล้ว) */
export async function fetchRecordsByDate(date: string): Promise<DayRecord[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from("attendance_records")
      .select(
        "id,check_in_at,status,method,period_no,session_id,students!inner(student_code,prefix,first_name,last_name),attendance_sessions!inner(session_date,status,class_groups!inner(name))",
      )
      .eq("attendance_sessions.session_date", date);
    if (error || !data) return null;
    return (
      data as unknown as Array<{
        id: string;
        check_in_at: string | null;
        status: string;
        method: string;
        period_no: number | null;
        session_id: string;
        students: {
          student_code: string | null;
          prefix: string;
          first_name: string;
          last_name: string | null;
        };
        attendance_sessions: { session_date: string; status: string; class_groups: { name: string } };
      }>
    )
      .filter((r) => r.students.student_code)
      .map((r) => {
        const last = r.students.last_name ?? "";
        return {
          id: r.id,
          studentCode: r.students.student_code as string,
          name: `${r.students.prefix}${r.students.first_name}${last ? ` ${last}` : ""}`,
          group: r.attendance_sessions.class_groups.name,
          time: r.check_in_at
            ? new Date(r.check_in_at).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "-",
          checkInAt: r.check_in_at,
          status: (["present", "absent", "late", "activity"] as const).includes(
            r.status as AttendanceStatus,
          )
            ? (r.status as AttendanceStatus)
            : "present",
          method: r.method,
          periodNo: r.period_no,
          sessionId: r.session_id,
          sessionStatus: r.attendance_sessions.status,
        };
      });
  } catch {
    return null;
  }
}

export type AbsentCount = {
  code: string;
  name: string;
  group: string;
  count: number;
};

/** ยอดขาดรายคนในช่วงวัน (ฝั่งครูล็อกอิน — ใช้ทำ watchlist) */
export async function fetchAbsentCounts(from: string, to: string): Promise<AbsentCount[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from("attendance_sessions")
      .select(
        "class_groups!inner(name),attendance_records!inner(status,students!inner(student_code,prefix,first_name,last_name))",
      )
      .gte("session_date", from)
      .lte("session_date", to)
      .eq("attendance_records.status", "absent");
    if (error || !data) return null;
    const map = new Map<string, AbsentCount>();
    for (const s of data as unknown as Array<{
      class_groups: { name: string };
      attendance_records: Array<{
        students: { student_code: string | null; prefix: string; first_name: string; last_name: string | null };
      }>;
    }>) {
      for (const r of s.attendance_records) {
        const st = r.students;
        if (!st.student_code) continue;
        const last = st.last_name ?? "";
        const cur = map.get(st.student_code) ?? {
          code: st.student_code,
          name: `${st.prefix}${st.first_name}${last ? ` ${last}` : ""}`,
          group: s.class_groups.name,
          count: 0,
        };
        cur.count++;
        map.set(st.student_code, cur);
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  } catch {
    return null;
  }
}
