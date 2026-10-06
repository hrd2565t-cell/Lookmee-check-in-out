import { ensureSession, todayStr } from "./attendance";
import { findCurrentPeriod, fetchPeriods, isLate } from "./timetable";
import { isSupabaseConfigured, supabase } from "./supabase/client";

export type QueuedCheckin = {
  id: string;
  group: string;
  date: string;
  code: string;
  confidence: number;
  status: "present" | "late";
  periodNo: number | null;
  method: "face" | "manual";
  attempts: number;
  createdAt: string;
};

const KEY = "lookmee-pending-checkins";
const MAX_ATTEMPTS = 10;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function readQueue(): QueuedCheckin[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as QueuedCheckin[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeQueue(list: QueuedCheckin[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage เต็ม/ใช้ไม่ได้ — ข้าม */
  }
}

export function pendingCount(): number {
  if (typeof window === "undefined") return 0;
  return readQueue().length;
}

/** เก็บเข้าคิว (ตอนออฟไลน์) — คืนจำนวนค้างทั้งหมด */
export function enqueueCheckin(
  item: Omit<QueuedCheckin, "id" | "attempts" | "createdAt" | "date">,
): number {
  const list = readQueue();
  // กันซ้ำ: คนเดียวกัน กลุ่มเดียวกัน วันเดียวกัน มีแล้วไม่เพิ่ม
  const date = todayStr();
  if (list.some((q) => q.code === item.code && q.group === item.group && q.date === date)) {
    return list.length;
  }
  list.push({
    ...item,
    id: `${item.code}-${Date.now()}`,
    date,
    attempts: 0,
    createdAt: new Date().toISOString(),
  });
  writeQueue(list);
  return list.length;
}

export type SaveResult = "saved" | "duplicate" | "queued" | "failed";

/** บันทึกเช็กชื่อ — ออฟไลน์หรือไม่ติด DB จะเก็บเข้าคิวอัตโนมัติ */
export async function saveCheckin(input: {
  group: string;
  code: string;
  confidence: number;
  method?: "face" | "manual";
}): Promise<{ result: SaveResult; periodNo: number | null; late: boolean; queued: number }> {
  const method = input.method ?? "face";
  const fail = (result: SaveResult): { result: SaveResult; periodNo: number | null; late: boolean; queued: number } => ({
    result,
    periodNo: null,
    late: false,
    queued: typeof window === "undefined" ? 0 : readQueue().length,
  });

  if (typeof window !== "undefined" && !window.navigator.onLine) {
    const queued = enqueueCheckin({
      group: input.group,
      code: input.code,
      confidence: input.confidence,
      status: "present",
      periodNo: null,
      method,
    });
    return { result: "queued", periodNo: null, late: false, queued };
  }

  const periods = (await fetchPeriods(input.group)) ?? [];
  const period = findCurrentPeriod(periods);
  const late = period ? isLate(period) : false;
  const status = late ? "late" : "present";

  const sessionId = await ensureSession(input.group, todayStr());
  if (!sessionId) {
    const queued = enqueueCheckin({
      group: input.group,
      code: input.code,
      confidence: input.confidence,
      status,
      periodNo: period?.periodNo ?? null,
      method,
    });
    return { result: "queued", periodNo: period?.periodNo ?? null, late, queued };
  }

  const { data: st } = await supabase
    .from("students")
    .select("id")
    .eq("student_code", input.code)
    .eq("status", "active")
    .single();
  const studentId = (st as { id: string } | null)?.id;
  if (!studentId) return fail("failed");

  const { error } = await supabase.from("attendance_records").insert({
    session_id: sessionId,
    student_id: studentId,
    check_in_at: new Date().toISOString(),
    status,
    period_no: period?.periodNo ?? null,
    confidence: input.confidence,
    method,
  });
  if (error) {
    if (error.code === "23505") {
      return { result: "duplicate", periodNo: period?.periodNo ?? null, late, queued: readQueue().length };
    }
    const queued = enqueueCheckin({
      group: input.group,
      code: input.code,
      confidence: input.confidence,
      status,
      periodNo: period?.periodNo ?? null,
      method,
    });
    return { result: "queued", periodNo: period?.periodNo ?? null, late, queued };
  }
  return { result: "saved", periodNo: period?.periodNo ?? null, late, queued: readQueue().length };
}

/** ซิงก์คิวค้างขึ้น server — คืนผลสรุป */
export async function flushQueue(): Promise<{ synced: number; dropped: number; remaining: number }> {
  let list = readQueue();
  if (!isSupabaseConfigured || list.length === 0) return { synced: 0, dropped: 0, remaining: list.length };
  let synced = 0;
  let dropped = 0;
  const now = Date.now();
  const kept: QueuedCheckin[] = [];
  for (const q of list) {
    // ทิ้งแถวเก่าเกิน 7 วัน / ลองเกินกำหนด
    if (now - new Date(q.createdAt).getTime() > MAX_AGE_MS || q.attempts >= MAX_ATTEMPTS) {
      dropped++;
      continue;
    }
    try {
      const sessionId = await ensureSession(q.group, q.date);
      if (!sessionId) {
        kept.push({ ...q, attempts: q.attempts + 1 });
        continue;
      }
      const { data: st } = await supabase
        .from("students")
        .select("id")
        .eq("student_code", q.code)
        .eq("status", "active")
        .single();
      const studentId = (st as { id: string } | null)?.id;
      if (!studentId) {
        dropped++;
        continue;
      }
      const { error } = await supabase.from("attendance_records").insert({
        session_id: sessionId,
        student_id: studentId,
        check_in_at: q.createdAt,
        status: q.status,
        period_no: q.periodNo,
        confidence: q.confidence,
        method: q.method,
      });
      if (error && error.code !== "23505") {
        kept.push({ ...q, attempts: q.attempts + 1 });
      } else {
        synced++; // 23505 = มีแถวนี้บน server แล้ว ถือว่าซิงก์สำเร็จ
      }
    } catch {
      kept.push({ ...q, attempts: q.attempts + 1 });
    }
  }
  writeQueue(kept);
  list = kept;
  return { synced, dropped, remaining: list.length };
}
