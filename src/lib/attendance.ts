import { isSupabaseConfigured, supabase } from "./supabase/client";

export type AttendanceStatus = "present" | "absent" | "late" | "activity";

export type AttendanceRow = {
  id: string;
  date: string;
  time: string;
  checkInAt: string | null;
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

export const randomPin = () => String(Math.floor(1000 + Math.random() * 9000));

export const COMBINED_M1_GROUP = "รวม ม.1 (ห้อง 1/1 - 1/11)";
export const M1_SUBGROUPS = [
  "ม.1/1",
  "ม.1/2",
  "ม.1/3",
  "ม.1/4",
  "ม.1/5",
  "ม.1/6",
  "ม.1/7",
  "ม.1/8",
  "ม.1/9",
  "ม.1/10",
  "ม.1/11",
];

export function isCombinedM1(name: string): boolean {
  return name === COMBINED_M1_GROUP || name === "รวม ม.1" || name.startsWith("รวม ม.1");
}

/** เปิด (หรือดึง) รอบเช็กชื่อของกลุ่มในวันที่กำหนด — คืน session id */
export async function ensureSession(groupName: string, date: string): Promise<string | null> {
  const s = await ensureSessionFull(groupName, date);
  return s?.id ?? null;
}

export type SessionFull = { id: string; pin: string | null; status: string };

/** เปิดรอบพร้อม PIN (รอบเก่าที่ไม่มี PIN จะเติมให้) + ผูกครูผู้เปิด (รองรับกลุ่มรวม ม.1) */
export async function ensureSessionFull(groupName: string, date: string): Promise<SessionFull | null> {
  if (!isSupabaseConfigured) return null;
  try {
    if (isCombinedM1(groupName)) {
      const { data: gList } = await supabase
        .from("class_groups")
        .select("id,name")
        .in("name", M1_SUBGROUPS);
      if (!gList || gList.length === 0) return null;

      const gIds = gList.map((g) => g.id);
      const { data: existingSessions } = await supabase
        .from("attendance_sessions")
        .select("id,pin,status,group_id")
        .in("group_id", gIds)
        .eq("session_date", date);

      const sharedPin = existingSessions?.find((s) => s.pin)?.pin || randomPin();
      const { data: auth } = await supabase.auth.getUser();

      let primarySession: SessionFull | null = null;
      for (const g of gList) {
        const found = existingSessions?.find((s) => s.group_id === g.id);
        if (found) {
          if (found.pin !== sharedPin || found.status !== "open") {
            await supabase
              .from("attendance_sessions")
              .update({ pin: sharedPin, status: "open" })
              .eq("id", found.id);
          }
          if (!primarySession) primarySession = { id: found.id, pin: sharedPin, status: "open" };
        } else {
          const { data: created } = await supabase
            .from("attendance_sessions")
            .insert({
              group_id: g.id,
              session_date: date,
              status: "open",
              opened_at: new Date().toISOString(),
              pin: sharedPin,
              opened_by: auth.user?.id ?? null,
            })
            .select("id,pin,status")
            .single();
          if (created && !primarySession) {
            primarySession = created as SessionFull;
          }
        }
      }
      return primarySession || { id: "m1-combined", pin: sharedPin, status: "open" };
    }

    const { data: g } = await supabase
      .from("class_groups")
      .select("id")
      .eq("name", groupName)
      .single();
    const groupId = (g as { id: string } | null)?.id;
    if (!groupId) return null;
    const { data: existing } = await supabase
      .from("attendance_sessions")
      .select("id,pin,status")
      .eq("group_id", groupId)
      .eq("session_date", date)
      .maybeSingle();
    if (existing) {
      const e = existing as { id: string; pin: string | null; status: string };
      if (!e.pin) {
        const pin = randomPin();
        await supabase.from("attendance_sessions").update({ pin }).eq("id", e.id);
        return { id: e.id, pin, status: e.status };
      }
      return e;
    }
    const { data: auth } = await supabase.auth.getUser();
    const { data: created, error } = await supabase
      .from("attendance_sessions")
      .insert({
        group_id: groupId,
        session_date: date,
        status: "open",
        opened_at: new Date().toISOString(),
        pin: randomPin(),
        opened_by: auth.user?.id ?? null,
      })
      .select("id,pin,status")
      .single();
    if (error || !created) return null;
    return created as SessionFull;
  } catch {
    return null;
  }
}

/** ปิดรอบ (completed) */
export async function closeSession(sessionId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from("attendance_sessions")
      .update({ status: "completed", closed_at: new Date().toISOString() })
      .eq("id", sessionId);
    return !error;
  } catch {
    return false;
  }
}

/** ปิดรอบแบบรองรับกลุ่มรวม ม.1 */
export async function closeSessionFull(groupName: string, date: string, sessionId?: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    if (isCombinedM1(groupName)) {
      const { data: gList } = await supabase
        .from("class_groups")
        .select("id")
        .in("name", M1_SUBGROUPS);
      if (!gList) return false;
      const gIds = gList.map((g) => g.id);
      const { error } = await supabase
        .from("attendance_sessions")
        .update({ status: "completed", closed_at: new Date().toISOString() })
        .in("group_id", gIds)
        .eq("session_date", date);
      return !error;
    }
    if (sessionId) {
      return await closeSession(sessionId);
    }
    const { data: g } = await supabase
      .from("class_groups")
      .select("id")
      .eq("name", groupName)
      .single();
    if (!g) return false;
    const { error } = await supabase
      .from("attendance_sessions")
      .update({ status: "completed", closed_at: new Date().toISOString() })
      .eq("group_id", g.id)
      .eq("session_date", date);
    return !error;
  } catch {
    return false;
  }
}

/** ครูเช็กชื่อให้นักเรียนด้วยตนเอง (Manual Override) เช่น เด็กเปิดกล้องไม่ได้ */
export async function manualCheckIn(
  studentGroup: string,
  studentCode: string,
  status: "present" | "late" = "present",
): Promise<CheckInResult> {
  const sessionId = await ensureSession(studentGroup, todayStr());
  if (!sessionId) return "failed";
  return await checkIn(sessionId, studentCode, 1.0, { status, method: "manual" });
}

/** บันทึกสถานะให้นักเรียนพร้อมกันหลายคน เช่น มาร์กคนที่เหลือเป็นขาด หรือไปกิจกรรม */
export async function bulkMarkStatus(
  students: Array<{ group: string; code: string }>,
  status: "absent" | "activity" | "present",
  activityName?: string,
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  for (const st of students) {
    try {
      const sessionId = await ensureSession(st.group, todayStr());
      if (!sessionId) {
        failed++;
        continue;
      }
      if (status === "activity") {
        const r = await markActivity(sessionId, st.code, activityName || "กิจกรรมโรงเรียน");
        if (r === "saved") success++;
        else failed++;
      } else {
        const { data: sRow } = await supabase
          .from("students")
          .select("id")
          .eq("student_code", st.code)
          .eq("status", "active")
          .single();
        const studentId = (sRow as { id: string } | null)?.id;
        if (!studentId) {
          failed++;
          continue;
        }
        const { error } = await supabase.from("attendance_records").upsert(
          {
            session_id: sessionId,
            student_id: studentId,
            check_in_at: new Date().toISOString(),
            status,
            method: "manual",
          },
          { onConflict: "session_id,student_id" },
        );
        if (error) failed++;
        else success++;
      }
    } catch {
      failed++;
    }
  }
  return { success, failed };
}

/** คำนวณคะแนนจิตพิสัย (เต็ม 10) ตามระดับชั้นและจำนวนครั้งที่ขาดเรียน */
export function calculateAffectiveScore(groupName: string, absentCount: number): number {
  const abs = Math.max(0, absentCount);
  if (abs <= 3) return 10;

  if (groupName.includes("ม.3")) {
    // ม.3: ขาด 0-3 = 10, ขาด 4 = 9, ..., ขาด 12 = 1, ขาด 13 ขึ้นไป = 0
    if (abs >= 13) return 0;
    return Math.max(0, 10 - (abs - 3));
  }

  // ม.1 และ ม.5 (และระดับชั้นอื่นๆ):
  // ขาด 4 = 8, ขาด 5 = 6, ขาด 6 = 4, ขาด 7 = 2, ขาด 8 ขึ้นไป = 0
  if (abs === 4) return 8;
  if (abs === 5) return 6;
  if (abs === 6) return 4;
  if (abs === 7) return 2;
  return 0;
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

/** แก้ไขสถานะ / เวลาเช็คชื่อของแถวเดิม (ครูแก้ไขย้อนหลังได้) */
export async function updateAttendanceRecord(
  recordId: string,
  fields: {
    status?: AttendanceStatus;
    check_in_at?: string | null;
    method?: string;
    activity_name?: string | null;
  },
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.from("attendance_records").update(fields).eq("id", recordId);
    return !error;
  } catch {
    return false;
  }
}

/** ลบแถวเช็คชื่อ (คืนสถานะเป็นไม่มีข้อมูลสำหรับวันที่นั้น) */
export async function deleteAttendanceRecord(recordId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.from("attendance_records").delete().eq("id", recordId);
    return !error;
  } catch {
    return false;
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
      time: r.check_in_at ? new Date(r.check_in_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "-",
      checkInAt: r.check_in_at ?? null,
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

/** ปักขาดย้อนหลังช่วงวันที่ลา (เฉพาะวันที่ยังไม่มีแถว — ของเดิมไม่โดนทับ) */
export async function fillAbsentForLeave(
  groupName: string,
  studentCode: string,
  fromDate: string,
  toDate: string,
): Promise<{ filled: number }> {
  let filled = 0;
  try {
    const { data: st } = await supabase
      .from("students")
      .select("id")
      .eq("student_code", studentCode)
      .eq("status", "active")
      .single();
    const studentId = (st as { id: string } | null)?.id;
    if (!studentId) return { filled };
    const cur = new Date(`${fromDate}T00:00:00`);
    const end = new Date(`${toDate}T00:00:00`);
    let guard = 0;
    while (cur <= end && guard++ < 60) {
      const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      if (cur.getDay() === 0) {
        cur.setDate(cur.getDate() + 1);
        continue;
      }
      const sessionId = await ensureSession(groupName, ds);
      if (sessionId) {
        const { error } = await supabase.from("attendance_records").insert({
          session_id: sessionId,
          student_id: studentId,
          check_in_at: null,
          status: "absent",
          method: "manual",
        });
        if (!error) filled++;
      }
      cur.setDate(cur.getDate() + 1);
    }
  } catch {
    /* ข้าม */
  }
  return { filled };
}

export type RangeSummaryRow = {
  code: string;
  number: string;
  name: string;
  present: number;
  late: number;
  activity: number;
  absent: number;
  days: number;
};

/** สรุปรายคนช่วงวันที่ของกลุ่มเดียว (มา/สาย/กิจกรรม/ขาด + จำนวนวันที่มีข้อมูล) */
export async function fetchGroupRangeSummary(
  groupName: string,
  from: string,
  to: string,
): Promise<RangeSummaryRow[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    let query = supabase
      .from("attendance_sessions")
      .select("session_date,class_groups!inner(name),attendance_records(status,students!inner(student_code,prefix,first_name,last_name,class_no))")
      .gte("session_date", from)
      .lte("session_date", to)
      .order("session_date");

    if (isCombinedM1(groupName)) {
      query = query.in("class_groups.name", M1_SUBGROUPS);
    } else {
      query = query.eq("class_groups.name", groupName);
    }

    const { data, error } = await query;
    if (error || !data) return null;
    const days = new Set<string>();
    const map = new Map<string, RangeSummaryRow>();
    for (const s of data as unknown as Array<{
      session_date: string;
      attendance_records: Array<{
        status: string;
        students: {
          student_code: string | null;
          prefix: string;
          first_name: string;
          last_name: string | null;
          class_no: string;
        };
      }>;
    }>) {
      days.add(s.session_date);
      for (const r of s.attendance_records) {
        const st = r.students;
        if (!st.student_code) continue;
        const last = st.last_name ?? "";
        const cur = map.get(st.student_code) ?? {
          code: st.student_code,
          number: st.class_no,
          name: `${st.prefix}${st.first_name}${last ? ` ${last}` : ""}`,
          present: 0,
          late: 0,
          activity: 0,
          absent: 0,
          days: 0,
        };
        if (r.status === "present") cur.present++;
        else if (r.status === "late") cur.late++;
        else if (r.status === "activity") cur.activity++;
        else if (r.status === "absent") cur.absent++;
        map.set(st.student_code, cur);
      }
    }
    const totalDays = days.size;
    return [...map.values()]
      .map((row) => ({ ...row, days: totalDays }))
      .sort(
        (a, b) =>
          a.code.localeCompare(b.code, "th", { numeric: true }) ||
          (Number(a.number) || 999) - (Number(b.number) || 999) ||
          a.name.localeCompare(b.name, "th"),
      );
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
