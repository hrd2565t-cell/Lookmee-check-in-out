import { isSupabaseConfigured, supabase } from "./supabase/client";

export type SheetAssignment = {
  id: string;
  title: string;
  subject: string;
  category: string;
  due: string;
  max: number;
};

export type SheetData = {
  assignments: SheetAssignment[];
  scores: Map<string, number | null>; // `${assignmentId}|${studentCode}` -> score
};

async function groupIdOf(name: string): Promise<string | null> {
  const { data } = await supabase.from("class_groups").select("id").eq("name", name).single();
  return (data as { id: string } | null)?.id ?? null;
}

/** วิชาที่มีในกลุ่ม (จากงานที่เคยสร้าง) */
export async function fetchSubjects(groupName: string): Promise<string[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const gid = await groupIdOf(groupName);
    if (!gid) return [];
    const { data, error } = await supabase
      .from("assignments")
      .select("subject")
      .eq("group_id", gid);
    if (error || !data) return null;
    return [...new Set((data as Array<{ subject: string }>).map((r) => r.subject))].sort((a, b) =>
      a.localeCompare(b, "th"),
    );
  } catch {
    return null;
  }
}

/** ดึงชีท: งานของกลุ่ม+วิชา (+กรองเทอม) + คะแนนทั้งหมด */
export async function fetchSheet(
  groupName: string,
  subject: string,
  term?: { startsOn: string; endsOn: string } | null,
): Promise<SheetData | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const gid = await groupIdOf(groupName);
    if (!gid) return { assignments: [], scores: new Map() };
    let q = supabase
      .from("assignments")
      .select("id,title,subject,category,due_date,max_score")
      .eq("group_id", gid)
      .eq("subject", subject)
      .order("due_date")
      .order("created_at");
    if (term) q = q.gte("due_date", term.startsOn).lte("due_date", term.endsOn);
    const { data: aData, error: aErr } = await q;
    if (aErr || !aData) return null;
    const assignments: SheetAssignment[] = (
      aData as Array<{
        id: string;
        title: string;
        subject: string;
        category: string | null;
        due_date: string;
        max_score: number;
      }>
    ).map((a) => ({
      id: a.id,
      title: a.title,
      subject: a.subject,
      category: a.category ?? "",
      due: a.due_date,
      max: Number(a.max_score),
    }));
    const scores = new Map<string, number | null>();
    if (assignments.length > 0) {
      const { data: sData } = await supabase
        .from("submissions")
        .select("assignment_id,student_id,score,students!inner(student_code)")
        .in(
          "assignment_id",
          assignments.map((a) => a.id),
        );
      for (const r of (sData ?? []) as unknown as Array<{
        assignment_id: string;
        score: number | null;
        students: { student_code: string | null };
      }>) {
        if (r.students.student_code) {
          scores.set(`${r.assignment_id}|${r.students.student_code}`, r.score === null ? null : Number(r.score));
        }
      }
    }
    return { assignments, scores };
  } catch {
    return null;
  }
}

/** บันทึกทีเดียวหลายช่อง (upsert รายแถว) */
export async function saveScores(
  rows: Array<{ assignmentId: string; studentCode: string; score: number | null; groupName: string }>,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  // แปลงรหัส → uuid ทีเดียว
  const codes = [...new Set(rows.map((r) => r.studentCode))];
  const { data: stData } = await supabase
    .from("students")
    .select("id,student_code")
    .in("student_code", codes)
    .eq("status", "active");
  const idOf = new Map(
    ((stData ?? []) as Array<{ id: string; student_code: string }>).map((s) => [s.student_code, s.id]),
  );
  for (const r of rows) {
    const studentId = idOf.get(r.studentCode);
    if (!studentId) {
      failed++;
      continue;
    }
    const { error } = await supabase.from("submissions").upsert(
      { assignment_id: r.assignmentId, student_id: studentId, score: r.score },
      { onConflict: "assignment_id,student_id" },
    );
    if (error) failed++;
    else ok++;
  }
  return { ok, failed };
}

/** เพิ่มคอลัมน์งาน */
export async function addAssignment(input: {
  groupName: string;
  subject: string;
  title: string;
  max: number;
  due: string;
  category?: string;
}): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const gid = await groupIdOf(input.groupName);
    if (!gid) return false;
    const { error } = await supabase.from("assignments").insert({
      group_id: gid,
      subject: input.subject,
      title: input.title,
      max_score: input.max,
      due_date: input.due,
      category: input.category ?? "ใบงาน/การบ้าน",
    });
    return !error;
  } catch {
    return false;
  }
}

/** ลบคอลัมน์งาน (คะแนนในคอลัมน์หายตามด้วย cascade) */
export async function deleteAssignment(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.from("assignments").delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}
