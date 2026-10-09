import { isSupabaseConfigured, supabase } from "./supabase/client";

export type SheetAssignment = {
  id: string;
  title: string;
  subject: string;
  category: string;
  due: string;
  max: number;
  visible: boolean;
  attachment: string | null;
};

export type SheetData = {
  assignments: SheetAssignment[];
  scores: Map<string, number | null>; // `${assignmentId}|${studentCode}` -> score
};

export type ClassSubject = {
  id: string;
  groupId: string;
  termId: string | null;
  termName: string | null;
  name: string;
  isActive: boolean;
  isAssigned: boolean;
  source: "level" | "room" | "history";
};

export type SubjectCatalogItem = {
  id: string;
  termId: string | null;
  termName: string | null;
  name: string;
  isActive: boolean;
};

export type SubjectScopeState = {
  catalog: SubjectCatalogItem[];
  selectedIds: string[];
  levelIds: string[];
  inheritedIds: string[];
  overrideModes: Record<string, "include" | "exclude">;
};

async function groupIdOf(name: string): Promise<string | null> {
  const { data } = await supabase.from("class_groups").select("id").eq("name", name).single();
  return (data as { id: string } | null)?.id ?? null;
}

async function groupInfoOf(name: string): Promise<{ id: string; level: string } | null> {
  const { data, error } = await supabase.from("class_groups").select("id,level").eq("name", name).single();
  if (error || !data) return null;
  return data as { id: string; level: string };
}

export async function fetchSubjectCatalog(termId: string): Promise<SubjectCatalogItem[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    let query = supabase
      .from("subjects")
      .select("id,term_id,name,is_active,school_terms(name)")
      .order("name");
    if (termId !== "all") query = query.eq("term_id", termId);
    const { data, error } = await query;
    if (error || !data) return null;
    return (data as unknown as Array<{
      id: string;
      term_id: string | null;
      name: string;
      is_active: boolean;
      school_terms: { name: string } | null;
    }>).map((row) => ({
      id: row.id,
      termId: row.term_id,
      termName: row.school_terms?.name ?? null,
      name: row.name,
      isActive: row.is_active,
    }));
  } catch {
    return null;
  }
}

/** Read catalog mappings for either a level default or one room. */
export async function fetchSubjectScope(
  scope: "level" | "group",
  scopeName: string,
  termId: string,
): Promise<SubjectScopeState | null> {
  if (!isSupabaseConfigured) return null;
  const catalog = await fetchSubjectCatalog(termId);
  if (!catalog) return null;
  const ids = catalog.map((subject) => subject.id);
  if (ids.length === 0) return { catalog, selectedIds: [], levelIds: [], inheritedIds: [], overrideModes: {} };

  try {
    let level = scopeName;
    let groupId: string | null = null;
    if (scope === "group") {
      const group = await groupInfoOf(scopeName);
      if (!group) return null;
      groupId = group.id;
      level = group.level;
    }

    const { data: levelRows, error: levelError } = await supabase
      .from("level_subjects")
      .select("subject_id")
      .eq("level", level)
      .in("subject_id", ids);
    if (levelError) return null;
    const levelIds = new Set((levelRows ?? []).map((row) => (row as { subject_id: string }).subject_id));
    if (scope === "level") {
      return { catalog, selectedIds: [...levelIds], levelIds: [...levelIds], inheritedIds: [], overrideModes: {} };
    }

    const { data: overrides, error: overrideError } = await supabase
      .from("group_subject_overrides")
      .select("subject_id,mode")
      .eq("group_id", groupId as string)
      .in("subject_id", ids);
    if (overrideError) return null;
    const overrideModes: Record<string, "include" | "exclude"> = {};
    for (const row of (overrides ?? []) as Array<{ subject_id: string; mode: "include" | "exclude" }>) {
      overrideModes[row.subject_id] = row.mode;
    }
    const selectedIds = new Set<string>();
    const inheritedIds: string[] = [];
    for (const id of ids) {
      const mode = overrideModes[id];
      if (mode === "include") selectedIds.add(id);
      else if (mode === "exclude") continue;
      else if (levelIds.has(id)) {
        selectedIds.add(id);
        inheritedIds.push(id);
      }
    }
    return { catalog, selectedIds: [...selectedIds], levelIds: [...levelIds], inheritedIds, overrideModes };
  } catch {
    return null;
  }
}

/** Available subjects are the active level defaults plus room inclusions. */
export async function fetchSubjects(groupName: string, termId: string): Promise<ClassSubject[] | null> {
  const group = await groupInfoOf(groupName);
  const scope = await fetchSubjectScope("group", groupName, termId);
  if (!group || !scope) return null;
  const selected = new Set(scope.selectedIds);
  const assignmentsResult = await supabase
    .from("assignments")
    .select("subject,due_date")
    .eq("group_id", group.id);
  if (assignmentsResult.error || !assignmentsResult.data) return null;

  let terms: Array<{ id: string; starts_on: string; ends_on: string }> = [];
  const { data: termRows } = await supabase.from("school_terms").select("id,starts_on,ends_on");
  if (termRows) terms = termRows as typeof terms;

  return scope.catalog.flatMap((subject) => {
    const inTerm = terms.find((t) => t.id === subject.termId) ?? null;
    const hasHistory = (assignmentsResult.data as Array<{ subject: string; due_date: string }>).some((assignment) => {
      if (assignment.subject.trim().toLocaleLowerCase("th") !== subject.name.trim().toLocaleLowerCase("th")) return false;
      if (inTerm) return assignment.due_date >= inTerm.starts_on && assignment.due_date <= inTerm.ends_on;
      return !terms.some((t) => assignment.due_date >= t.starts_on && assignment.due_date <= t.ends_on);
    });
    const isAssigned = selected.has(subject.id);
    if (!isAssigned && !hasHistory) return [];
    const source = isAssigned
      ? scope.overrideModes[subject.id] === "include"
        ? "room"
        : "level"
      : "history";
    return [{
      ...subject,
      groupId: group.id,
      isAssigned,
      source: source as ClassSubject["source"],
    }];
  });
}

export type SubjectMutationResult =
  | { ok: true; subject: SubjectCatalogItem }
  | { ok: false; reason: "duplicate" | "failed" };

/** Add a subject to the shared catalog for one term. */
export async function createSubject(termId: string, name: string): Promise<SubjectMutationResult> {
  if (!isSupabaseConfigured || !name.trim()) return { ok: false, reason: "failed" };
  try {
    const { data, error } = await supabase
      .from("subjects")
      .insert({ term_id: termId, name: name.trim() })
      .select("id,term_id,name,is_active,school_terms(name)")
      .single();
    if (error?.code === "23505") return { ok: false, reason: "duplicate" };
    if (error || !data) return { ok: false, reason: "failed" };
    const row = data as unknown as { id: string; term_id: string | null; name: string; is_active: boolean; school_terms: { name: string } | null };
    return { ok: true, subject: { id: row.id, termId: row.term_id, termName: row.school_terms?.name ?? null, name: row.name, isActive: row.is_active } };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

export async function renameSubject(subjectId: string, name: string): Promise<"saved" | "duplicate" | "failed"> {
  if (!isSupabaseConfigured || !name.trim()) return "failed";
  try {
    const { error } = await supabase.from("subjects").update({ name: name.trim() }).eq("id", subjectId);
    if (error?.code === "23505") return "duplicate";
    return error ? "failed" : "saved";
  } catch {
    return "failed";
  }
}

/** Archive keeps assignments/scores and the subject can be restored later. */
export async function setSubjectActive(subjectId: string, isActive: boolean): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.from("subjects").update({ is_active: isActive }).eq("id", subjectId);
    return !error;
  } catch {
    return false;
  }
}

export async function fetchLevelSubjectIds(level: string, termId: string): Promise<string[] | null> {
  const catalog = await fetchSubjectCatalog(termId);
  if (!catalog) return null;
  const ids = catalog.map((item) => item.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("level_subjects").select("subject_id").eq("level", level).in("subject_id", ids);
  return error ? null : (data ?? []).map((row) => (row as { subject_id: string }).subject_id);
}

export async function saveLevelSubjectIds(level: string, termId: string, selectedIds: string[]): Promise<boolean> {
  const catalog = await fetchSubjectCatalog(termId);
  if (!catalog) return false;
  const ids = catalog.map((item) => item.id);
  if (ids.length === 0) return true;
  const { data, error } = await supabase.from("level_subjects").select("subject_id").eq("level", level).in("subject_id", ids);
  if (error) return false;
  const current = new Set((data ?? []).map((row) => (row as { subject_id: string }).subject_id));
  const desired = new Set(selectedIds.filter((id) => ids.includes(id)));
  const remove = [...current].filter((id) => !desired.has(id));
  const add = [...desired].filter((id) => !current.has(id));
  if (remove.length) {
    const { error: removeError } = await supabase.from("level_subjects").delete().eq("level", level).in("subject_id", remove);
    if (removeError) return false;
  }
  if (add.length) {
    const { error: addError } = await supabase.from("level_subjects").insert(add.map((subject_id) => ({ level, subject_id })));
    if (addError) return false;
  }
  return true;
}

export async function saveGroupSubjectSelection(
  groupName: string,
  termId: string,
  inheritedIds: string[],
  selectedIds: string[],
): Promise<boolean> {
  const [group, catalog] = await Promise.all([groupInfoOf(groupName), fetchSubjectCatalog(termId)]);
  if (!group || !catalog) return false;
  const ids = catalog.map((item) => item.id);
  if (ids.length === 0) return true;
  const { data, error } = await supabase.from("group_subject_overrides").select("subject_id,mode").eq("group_id", group.id).in("subject_id", ids);
  if (error) return false;
  const current = new Map((data ?? []).map((row) => {
    const item = row as { subject_id: string; mode: "include" | "exclude" };
    return [item.subject_id, item.mode] as const;
  }));
  const inherited = new Set(inheritedIds);
  const desired = new Set(selectedIds);
  const remove: string[] = [];
  const upsert: Array<{ group_id: string; subject_id: string; mode: "include" | "exclude" }> = [];
  for (const id of ids) {
    const shouldInherit = inherited.has(id);
    const shouldSelect = desired.has(id);
    if (shouldInherit === shouldSelect) {
      if (current.has(id)) remove.push(id);
    } else {
      upsert.push({ group_id: group.id, subject_id: id, mode: shouldSelect ? "include" : "exclude" });
    }
  }
  if (remove.length) {
    const { error: removeError } = await supabase.from("group_subject_overrides").delete().eq("group_id", group.id).in("subject_id", remove);
    if (removeError) return false;
  }
  if (upsert.length) {
    const { error: upsertError } = await supabase.from("group_subject_overrides").upsert(upsert, { onConflict: "group_id,subject_id" });
    if (upsertError) return false;
  }
  return true;
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
      .select("id,title,subject,category,due_date,max_score,visible,attachment_url")
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
        visible: boolean | null;
        attachment_url: string | null;
      }>
    ).map((a) => ({
      id: a.id,
      title: a.title,
      subject: a.subject,
      category: a.category ?? "",
      due: a.due_date,
      max: Number(a.max_score),
      visible: a.visible !== false,
      attachment: a.attachment_url,
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

/** แก้ไขคอลัมน์งาน (ทุกฟิลด์) */
export async function updateAssignment(
  id: string,
  fields: {
    subject: string;
    title: string;
    max: number;
    due: string;
    category: string;
  },
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from("assignments")
      .update({
        subject: fields.subject,
        title: fields.title,
        max_score: fields.max,
        due_date: fields.due,
        category: fields.category,
      })
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/** อัปโหลดไฟล์ตัวอย่างงาน (รูป/PDF ≤ 5MB) คืน public URL */
export async function uploadAssignmentFile(
  assignmentId: string,
  file: File,
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const okType =
      file.type.startsWith("image/") || file.type === "application/pdf";
    if (!okType || file.size > 5 * 1024 * 1024) return null;
    const ext = file.name.includes(".")
      ? file.name.slice(file.name.lastIndexOf("."))
      : file.type === "application/pdf"
        ? ".pdf"
        : ".jpg";
    const path = `${assignmentId}${ext}`;
    const { error: upErr } = await supabase.storage
      .from("assignment-files")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) return null;
    const { data } = supabase.storage.from("assignment-files").getPublicUrl(path);
    const url = data.publicUrl;
    const { error } = await supabase
      .from("assignments")
      .update({ attachment_url: url })
      .eq("id", assignmentId);
    return error ? null : url;
  } catch {
    return null;
  }
}

/** ลบไฟล์ตัวอย่าง */
export async function removeAssignmentFile(assignmentId: string, url: string): Promise<void> {
  try {
    const path = url.split("/assignment-files/")[1];
    if (path) await supabase.storage.from("assignment-files").remove([path.split("?")[0] as string]);
    await supabase.from("assignments").update({ attachment_url: null }).eq("id", assignmentId);
  } catch {
    /* ข้าม */
  }
}
export async function deleteAssignment(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.from("assignments").delete().eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/** เปิด/ปิดการมองเห็นของคอลัมน์ (ฝั่งนักเรียน) */
export async function toggleAssignmentVisible(id: string, visible: boolean): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.from("assignments").update({ visible }).eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

export type StandardSetItem = {
  title: string;
  max: number;
  category: string;
  due: string;
};
/** สร้างชุดมาตรฐาน น.1–น.7 + กลางภาค + ปลายภาค (รวม 100) */
export async function createStandardSet(
  groupName: string,
  subject: string,
  items: StandardSetItem[],
): Promise<{ ok: boolean; created: number }> {
  if (!isSupabaseConfigured || items.length === 0) return { ok: false, created: 0 };
  try {
    const gid = await groupIdOf(groupName);
    if (!gid) return { ok: false, created: 0 };
    const { error } = await supabase.from("assignments").insert(
      items.map((it) => ({
        group_id: gid,
        subject,
        title: it.title,
        max_score: it.max,
        due_date: it.due,
        category: it.category,
        visible: true,
      })),
    );
    if (error) return { ok: false, created: 0 };
    return { ok: true, created: items.length };
  } catch {
    return { ok: false, created: 0 };
  }
}

export type GradeScale = { grade: string; min: number };

/** เกณฑ์ตัดเกรดของระดับชั้น (เรียงเกณฑ์สูง→ต่ำ) */
export async function fetchGradeScales(level: string): Promise<GradeScale[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from("grade_scales")
      .select("grade,min_score")
      .eq("level", level)
      .order("min_score", { ascending: false });
    if (error || !data) return null;
    return (data as Array<{ grade: string; min_score: number }>).map((r) => ({
      grade: r.grade,
      min: Number(r.min_score),
    }));
  } catch {
    return null;
  }
}

/** เทียบ % เป็นเกรดตามสเกล (คืน null ถ้าไม่มีสเกล) */
export function gradeOf(scales: GradeScale[] | null, pct: number): string | null {
  if (!scales || scales.length === 0) return null;
  for (const s of scales) {
    if (pct >= s.min) return s.grade;
  }
  return scales[scales.length - 1]?.grade ?? null;
}

export const GRADE_POINTS: Record<string, number> = {
  A: 4.0,
  "B+": 3.5,
  B: 3.0,
  "C+": 2.5,
  C: 2.0,
  "D+": 1.5,
  D: 1.0,
  F: 0,
};

/** บันทึกเกณฑ์ทั้งแถวของระดับชั้น */
export async function saveGradeScales(level: string, rows: GradeScale[]): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase
      .from("grade_scales")
      .upsert(
        rows.map((r) => ({ level, grade: r.grade, min_score: r.min })),
        { onConflict: "level,grade" },
      );
    return !error;
  } catch {
    return false;
  }
}
