import { isSupabaseConfigured, supabase } from "./supabase/client";
import { groupIdOf, fetchCategoryWeights, saveCategoryWeights, type CategoryWeight } from "./grading";

export type GradingTemplateItem = {
  title: string;
  max: number;
  category: string;
};

export type GradingTemplate = {
  id: string;
  name: string;
  level: string; // e.g. "ม.3"
  subject?: string; // e.g. "ภาษาอังกฤษ 6"
  items: GradingTemplateItem[];
  weights?: CategoryWeight[];
  createdAt: string;
};

const STORAGE_KEY = "lookmee_grading_templates";

/** รายการแม่แบบมาตรฐานของระบบ (Fallback) */
export const SYSTEM_DEFAULT_TEMPLATES: GradingTemplate[] = [
  {
    id: "system_standard_9",
    name: "ชุดมาตรฐาน 9 คอลัมน์ (น.1–น.7 + กลางภาค + ปลายภาค รวม 100 คะแนน)",
    level: "ทุกระดับชั้น",
    items: [
      { title: "น.1", max: 10, category: "ใบงาน/การบ้าน" },
      { title: "น.2", max: 10, category: "ใบงาน/การบ้าน" },
      { title: "น.3", max: 10, category: "ใบงาน/การบ้าน" },
      { title: "น.4", max: 10, category: "ใบงาน/การบ้าน" },
      { title: "น.5", max: 10, category: "ใบงาน/การบ้าน" },
      { title: "น.6", max: 10, category: "ใบงาน/การบ้าน" },
      { title: "น.7", max: 10, category: "ใบงาน/การบ้าน" },
      { title: "กลางภาค", max: 10, category: "สอบกลางภาค" },
      { title: "ปลายภาค", max: 20, category: "สอบปลายภาค" },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

/** ดึงรายการแม่แบบที่ครูสร้างไว้ทั้งหมด (รวมแม่แบบระบบ) */
export function getGradingTemplates(): GradingTemplate[] {
  if (typeof window === "undefined") return SYSTEM_DEFAULT_TEMPLATES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const customList: GradingTemplate[] = raw ? JSON.parse(raw) : [];
    return [...customList, ...SYSTEM_DEFAULT_TEMPLATES];
  } catch {
    return SYSTEM_DEFAULT_TEMPLATES;
  }
}

/** บันทึกแม่แบบใหม่หรืออัปเดตแม่แบบเดิม */
export function saveGradingTemplate(template: {
  id?: string;
  name: string;
  level: string;
  subject?: string;
  items: GradingTemplateItem[];
  weights?: CategoryWeight[];
}): GradingTemplate {
  if (typeof window === "undefined") {
    throw new Error("ไม่สามารถบันทึกแม่แบบในขณะนี้ได้");
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const customList: GradingTemplate[] = raw ? JSON.parse(raw) : [];
  const now = new Date().toISOString();
  const id = template.id || `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const item: GradingTemplate = {
    id,
    name: template.name.trim(),
    level: template.level,
    subject: template.subject?.trim() || undefined,
    items: template.items,
    weights: template.weights,
    createdAt: now,
  };
  const filtered = customList.filter((t) => t.id !== id);
  filtered.unshift(item);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return item;
}

/** ลบแม่แบบส่วนตัว (ไม่สามารถลบแม่แบบระบบได้) */
export function deleteGradingTemplate(id: string): boolean {
  if (typeof window === "undefined") return false;
  if (id.startsWith("system_")) return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const customList: GradingTemplate[] = raw ? JSON.parse(raw) : [];
    const filtered = customList.filter((t) => t.id !== id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch {
    return false;
  }
}

export type GradeLevelSyncResult = {
  success: boolean;
  sourceGroup: string;
  targetRoomsCount: number;
  syncedRooms: string[];
  createdCount: number;
  updatedCount: number;
  cleanedCount: number;
  preservedWithScoresCount: number;
  preservedAssignments: Array<{ room: string; title: string; scoreCount: number }>;
  errors: string[];
};

export type CloneResult = {
  success: boolean;
  targetRoomsCount: number;
  createdAssignmentsCount: number;
  skippedAssignmentsCount: number;
  cleanedAssignmentsCount?: number;
  updatedAssignmentsCount?: number;
  preservedWithScoresCount?: number;
  errors: string[];
};

type AssignmentDbRow = {
  id: string;
  title: string;
  subject: string;
  category: string | null;
  due_date: string;
  max_score: number;
  visible: boolean | null;
  sort_order: number | null;
  retake_of: string | null;
};

/**
 * ซิงค์โครงสร้างคอลัมน์งานทั้งระดับชั้น (Grade-Level Sync Engine)
 * - ใช้ห้องต้นทาง (เช่น ม.3/13) เป็น Master รายการงานและลำดับคอลัมน์
 * - ปรับปรุงคอลัมน์ในห้องปลายทางที่มีชื่องานตรงกัน (คง id เดิมไว้ คะแนนนักเรียนไม่สูญหาย)
 * - สร้างคอลัมน์ใหม่ที่ห้องปลายทางยังไม่มีให้ครบ
 * - ลบคอลัมน์ที่ซ้ำซ้อนหรือเกินมาเฉพาะที่ "ยังไม่มีคะแนนกรอก (0 submissions)"
 * - คุ้มครองคอลัมน์ที่มีคะแนนแล้วเสมอ (ไม่ลบเด็ดขาด)
 * - จัดลำดับคอลัมน์ (sort_order) ให้ตรงกันทุกห้อง 100%
 */
export async function syncAssignmentsAcrossGradeLevel(options: {
  sourceGroupName: string;
  targetGroupNames: string[];
  subject: string;
  cleanEmptyExcess?: boolean;
  copyWeights?: boolean;
}): Promise<GradeLevelSyncResult> {
  const {
    sourceGroupName,
    targetGroupNames,
    subject,
    cleanEmptyExcess = true,
    copyWeights = true,
  } = options;

  if (!isSupabaseConfigured) {
    return {
      success: false,
      sourceGroup: sourceGroupName,
      targetRoomsCount: 0,
      syncedRooms: [],
      createdCount: 0,
      updatedCount: 0,
      cleanedCount: 0,
      preservedWithScoresCount: 0,
      preservedAssignments: [],
      errors: ["ไม่ได้ตั้งค่าเชื่อมต่อฐานข้อมูล"],
    };
  }

  const targets = targetGroupNames.filter((name) => name !== sourceGroupName);
  if (targets.length === 0) {
    return {
      success: true,
      sourceGroup: sourceGroupName,
      targetRoomsCount: 0,
      syncedRooms: [],
      createdCount: 0,
      updatedCount: 0,
      cleanedCount: 0,
      preservedWithScoresCount: 0,
      preservedAssignments: [],
      errors: [],
    };
  }

  try {
    const sourceGid = await groupIdOf(sourceGroupName);
    if (!sourceGid) {
      return {
        success: false,
        sourceGroup: sourceGroupName,
        targetRoomsCount: 0,
        syncedRooms: [],
        createdCount: 0,
        updatedCount: 0,
        cleanedCount: 0,
        preservedWithScoresCount: 0,
        preservedAssignments: [],
        errors: [`ไม่พบรหัสห้องต้นแบบ ${sourceGroupName}`],
      };
    }

    // ดึงรายการงานจากห้องต้นแบบ (Master List)
    const { data: masterRows, error: sErr } = await supabase
      .from("assignments")
      .select("id,title,subject,category,due_date,max_score,visible,sort_order,retake_of")
      .eq("group_id", sourceGid)
      .eq("subject", subject)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (sErr || !masterRows || masterRows.length === 0) {
      return {
        success: false,
        sourceGroup: sourceGroupName,
        targetRoomsCount: 0,
        syncedRooms: [],
        createdCount: 0,
        updatedCount: 0,
        cleanedCount: 0,
        preservedWithScoresCount: 0,
        preservedAssignments: [],
        errors: [sErr?.message || `ห้อง ${sourceGroupName} ยังไม่มีคอลัมน์งานในวิชา ${subject}`],
      };
    }

    const masterAssignments = masterRows as AssignmentDbRow[];

    // จัดระเบียบลำดับ sort_order ของห้องต้นแบบให้เป็น 1..N
    for (let i = 0; i < masterAssignments.length; i++) {
      const item = masterAssignments[i];
      if (item && item.sort_order !== i + 1) {
        await supabase.from("assignments").update({ sort_order: i + 1 }).eq("id", item.id);
        item.sort_order = i + 1;
      }
    }

    // ดึงน้ำหนักคะแนนห้องต้นแบบ (ถ้ามี)
    let sourceWeights: CategoryWeight[] | null = null;
    if (copyWeights) {
      sourceWeights = await fetchCategoryWeights(sourceGroupName);
    }

    let createdCount = 0;
    let updatedCount = 0;
    let cleanedCount = 0;
    let preservedWithScoresCount = 0;
    const preservedAssignments: Array<{ room: string; title: string; scoreCount: number }> = [];
    const syncedRooms: string[] = [];
    const errors: string[] = [];

    const masterRegular = masterAssignments.filter((a) => !a.retake_of);
    const masterRetakes = masterAssignments.filter((a) => !!a.retake_of);

    for (const targetName of targets) {
      const targetGid = await groupIdOf(targetName);
      if (!targetGid) {
        errors.push(`ไม่พบห้อง ${targetName}`);
        continue;
      }

      // ดึงงานเดิมทั้งหมดของห้องปลายทาง
      const { data: rawTargetRows, error: tErr } = await supabase
        .from("assignments")
        .select("id,title,subject,category,due_date,max_score,visible,sort_order,retake_of")
        .eq("group_id", targetGid)
        .eq("subject", subject)
        .order("sort_order", { ascending: true });

      if (tErr) {
        errors.push(`ห้อง ${targetName}: ไม่สามารถดึงข้อมูลคอลัมน์เดิม (${tErr.message})`);
        continue;
      }

      const targetRows = (rawTargetRows ?? []) as AssignmentDbRow[];
      const targetIds = targetRows.map((r) => r.id);

      // นับจำนวนคะแนนที่กรอกแล้วในแต่ละคอลัมน์ของห้องปลายทาง
      const subCountMap = new Map<string, number>();
      if (targetIds.length > 0) {
        const { data: subRows } = await supabase
          .from("submissions")
          .select("assignment_id")
          .in("assignment_id", targetIds);

        for (const sub of (subRows ?? []) as Array<{ assignment_id: string }>) {
          subCountMap.set(sub.assignment_id, (subCountMap.get(sub.assignment_id) ?? 0) + 1);
        }
      }

      // จัดกลุ่มคอลัมน์ตามชื่อ
      const targetByTitle = new Map<string, AssignmentDbRow[]>();
      for (const row of targetRows) {
        const list = targetByTitle.get(row.title) || [];
        list.push(row);
        targetByTitle.set(row.title, list);
      }

      const processedTargetIds = new Set<string>();
      const masterToTargetIdMap = new Map<string, string>();

      // 1. ซิงค์งานปกติ (Regular Assignments)
      for (let idx = 0; idx < masterRegular.length; idx++) {
        const m = masterRegular[idx]!;
        const desiredOrder = idx + 1;
        const matches = targetByTitle.get(m.title) || [];

        // เลือกตัวแทนงานเดิม: ให้ความสำคัญกับตัวที่มีคะแนนกรอกแล้ว
        const sortedMatches = [...matches].sort((a, b) => {
          const subA = subCountMap.get(a.id) ?? 0;
          const subB = subCountMap.get(b.id) ?? 0;
          return subB - subA;
        });

        if (sortedMatches.length > 0) {
          const primary = sortedMatches[0]!;
          // อัปเดตคอลัมน์หลักเดิม (คง id เดิมไว้ คะแนนนักเรียนอยู่ครบ)
          const { error: upErr } = await supabase
            .from("assignments")
            .update({
              max_score: m.max_score,
              category: m.category ?? "ใบงาน/การบ้าน",
              due_date: m.due_date,
              visible: m.visible !== false,
              sort_order: desiredOrder,
            })
            .eq("id", primary.id);

          if (upErr) {
            errors.push(`ห้อง ${targetName} อัปเดต ${m.title} ไม่สำเร็จ: ${upErr.message}`);
          } else {
            updatedCount++;
            masterToTargetIdMap.set(m.id, primary.id);
            processedTargetIds.add(primary.id);
          }

          // จัดการตัวซ้ำในห้องปลายทางที่มีชื่อเดียวกัน
          for (let d = 1; d < sortedMatches.length; d++) {
            const dup = sortedMatches[d]!;
            const dupSubs = subCountMap.get(dup.id) ?? 0;
            if (dupSubs === 0 && cleanEmptyExcess) {
              await supabase.from("assignments").delete().eq("id", dup.id);
              cleanedCount++;
              processedTargetIds.add(dup.id);
            } else if (dupSubs > 0) {
              // มีคะแนนนักเรียน ห้ามลบเด็ดขาด! ย้ายไปไว้ท้ายตาราง
              const safeOrder = masterAssignments.length + 10 + preservedWithScoresCount;
              await supabase.from("assignments").update({ sort_order: safeOrder }).eq("id", dup.id);
              preservedWithScoresCount++;
              preservedAssignments.push({ room: targetName, title: `${dup.title} (ซ้ำ)`, scoreCount: dupSubs });
              processedTargetIds.add(dup.id);
            }
          }
        } else {
          // ยังไม่มีในห้องปลายทาง -> สร้างใหม่
          const { data: inserted, error: insErr } = await supabase
            .from("assignments")
            .insert({
              group_id: targetGid,
              subject,
              title: m.title,
              max_score: m.max_score,
              category: m.category ?? "ใบงาน/การบ้าน",
              due_date: m.due_date,
              visible: m.visible !== false,
              sort_order: desiredOrder,
            })
            .select("id")
            .single();

          if (insErr) {
            errors.push(`ห้อง ${targetName} สร้าง ${m.title} ไม่สำเร็จ: ${insErr.message}`);
          } else if (inserted) {
            createdCount++;
            masterToTargetIdMap.set(m.id, inserted.id);
          }
        }
      }

      // 2. ซิงค์งานสอบซ่อม (Retake Assignments)
      for (let rIdx = 0; rIdx < masterRetakes.length; rIdx++) {
        const r = masterRetakes[rIdx]!;
        const desiredOrder = masterRegular.length + rIdx + 1;
        const targetParentId = r.retake_of ? masterToTargetIdMap.get(r.retake_of) ?? null : null;
        const matches = targetByTitle.get(r.title) || [];

        if (matches.length > 0) {
          const primary = matches[0]!;
          await supabase
            .from("assignments")
            .update({
              max_score: r.max_score,
              category: r.category ?? "สอบซ่อม",
              due_date: r.due_date,
              visible: r.visible !== false,
              sort_order: desiredOrder,
              retake_of: targetParentId,
            })
            .eq("id", primary.id);
          updatedCount++;
          processedTargetIds.add(primary.id);
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from("assignments")
            .insert({
              group_id: targetGid,
              subject,
              title: r.title,
              max_score: r.max_score,
              category: r.category ?? "สอบซ่อม",
              due_date: r.due_date,
              visible: r.visible !== false,
              sort_order: desiredOrder,
              retake_of: targetParentId,
            })
            .select("id")
            .single();

          if (insErr) {
            errors.push(`ห้อง ${targetName} สร้าง ${r.title} ไม่สำเร็จ: ${insErr.message}`);
          } else if (inserted) {
            createdCount++;
          }
        }
      }

      // 3. จัดการคอลัมน์ส่วนเกินในห้องปลายทางที่ไม่มีในต้นแบบ
      const extraneous = targetRows.filter((row) => !processedTargetIds.has(row.id));
      for (const extra of extraneous) {
        const extraSubs = subCountMap.get(extra.id) ?? 0;
        if (extraSubs === 0 && cleanEmptyExcess) {
          // ไม่มีคะแนนเลย -> ลบออกเพื่อทำความสะอาดตาราง
          await supabase.from("assignments").delete().eq("id", extra.id);
          cleanedCount++;
        } else if (extraSubs > 0) {
          // มีคะแนนนักเรียนแล้ว -> คุ้มครองคะแนนไว้เสมอ ย้ายไปท้ายตาราง
          const safeOrder = masterAssignments.length + 20 + preservedWithScoresCount;
          await supabase.from("assignments").update({ sort_order: safeOrder }).eq("id", extra.id);
          preservedWithScoresCount++;
          preservedAssignments.push({ room: targetName, title: extra.title, scoreCount: extraSubs });
        }
      }

      // 4. คัดลอกน้ำหนักคะแนนรายห้องถ้ามี
      if (copyWeights && sourceWeights && sourceWeights.length > 0) {
        await saveCategoryWeights(targetName, sourceWeights);
      }

      syncedRooms.push(targetName);
    }

    return {
      success: errors.length === 0,
      sourceGroup: sourceGroupName,
      targetRoomsCount: syncedRooms.length,
      syncedRooms,
      createdCount,
      updatedCount,
      cleanedCount,
      preservedWithScoresCount,
      preservedAssignments,
      errors,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      sourceGroup: sourceGroupName,
      targetRoomsCount: 0,
      syncedRooms: [],
      createdCount: 0,
      updatedCount: 0,
      cleanedCount: 0,
      preservedWithScoresCount: 0,
      preservedAssignments: [],
      errors: [msg],
    };
  }
}

/** คัดลอกโครงสร้างคอลัมน์จากห้องต้นแบบไปยังห้องอื่นๆ (Backwards Compatible Wrapper) */
export async function cloneAssignmentsToGroups(options: {
  sourceGroupName: string;
  targetGroupNames: string[];
  subject: string;
  skipDuplicates?: boolean;
  copyWeights?: boolean;
  cleanEmptyExcess?: boolean;
}): Promise<CloneResult> {
  const syncRes = await syncAssignmentsAcrossGradeLevel({
    sourceGroupName: options.sourceGroupName,
    targetGroupNames: options.targetGroupNames,
    subject: options.subject,
    cleanEmptyExcess: options.cleanEmptyExcess ?? true,
    copyWeights: options.copyWeights ?? true,
  });

  return {
    success: syncRes.success,
    targetRoomsCount: syncRes.targetRoomsCount,
    createdAssignmentsCount: syncRes.createdCount,
    skippedAssignmentsCount: 0,
    cleanedAssignmentsCount: syncRes.cleanedCount,
    updatedAssignmentsCount: syncRes.updatedCount,
    preservedWithScoresCount: syncRes.preservedWithScoresCount,
    errors: syncRes.errors,
  };
}

/**
 * ใช้แม่แบบที่บันทึกไว้กับห้องเป้าหมาย (Smart Template Reconciliation)
 * - จับคู่ตามชื่องาน: ถ้ามีงานชื่อเดิมอยู่แล้วจะอัปเดต max_score, category, sort_order (ไม่เพิ่มคอลัมน์ซ้ำ ไม่ลบคะแนนเดิม)
 * - ถ้ายังไม่มีงานชื่อนั้น: เพิ่มคอลัมน์ใหม่ตามลำดับแม่แบบ
 * - ถ้าห้องมีคอลัมน์ว่างที่ไม่มีในแม่แบบ: ทำความสะอาดลบออกให้อัตโนมัติ (เฉพาะคอลัมน์ที่ 0 submissions)
 * - คุ้มครองคะแนนนักเรียนเสมอ ไม่มีการลบคอลัมน์ที่มีคะแนนแล้ว
 */
export async function applyTemplateToGroups(options: {
  template: GradingTemplate;
  targetGroupNames: string[];
  subject: string;
  dueDate: string;
  cleanEmptyExcess?: boolean;
  copyWeights?: boolean;
  skipDuplicates?: boolean;
}): Promise<GradeLevelSyncResult & CloneResult> {
  const {
    template,
    targetGroupNames,
    subject,
    dueDate,
    cleanEmptyExcess = true,
    copyWeights = true,
  } = options;

  if (!isSupabaseConfigured) {
    return {
      success: false,
      sourceGroup: "template",
      targetRoomsCount: 0,
      syncedRooms: [],
      createdCount: 0,
      updatedCount: 0,
      cleanedCount: 0,
      preservedWithScoresCount: 0,
      preservedAssignments: [],
      createdAssignmentsCount: 0,
      skippedAssignmentsCount: 0,
      errors: ["ไม่ได้ตั้งค่าเชื่อมต่อฐานข้อมูล"],
    };
  }

  if (targetGroupNames.length === 0 || template.items.length === 0) {
    return {
      success: true,
      sourceGroup: "template",
      targetRoomsCount: 0,
      syncedRooms: [],
      createdCount: 0,
      updatedCount: 0,
      cleanedCount: 0,
      preservedWithScoresCount: 0,
      preservedAssignments: [],
      createdAssignmentsCount: 0,
      skippedAssignmentsCount: 0,
      errors: [],
    };
  }

  let createdCount = 0;
  let updatedCount = 0;
  let cleanedCount = 0;
  let preservedWithScoresCount = 0;
  const preservedAssignments: Array<{ room: string; title: string; scoreCount: number }> = [];
  const syncedRooms: string[] = [];
  const errors: string[] = [];

  try {
    for (const targetName of targetGroupNames) {
      const targetGid = await groupIdOf(targetName);
      if (!targetGid) {
        errors.push(`ไม่พบห้อง ${targetName}`);
        continue;
      }

      // ดึงงานเดิมทั้งหมดของห้องปลายทาง
      const { data: rawTargetRows, error: tErr } = await supabase
        .from("assignments")
        .select("id,title,subject,category,due_date,max_score,visible,sort_order,retake_of")
        .eq("group_id", targetGid)
        .eq("subject", subject)
        .order("sort_order", { ascending: true });

      if (tErr) {
        errors.push(`ห้อง ${targetName}: ดึงข้อมูลคอลัมน์ไม่สำเร็จ (${tErr.message})`);
        continue;
      }

      const targetRows = (rawTargetRows ?? []) as AssignmentDbRow[];
      const targetIds = targetRows.map((r) => r.id);

      // ตรวจสอบจำนวนคะแนนที่กรอกแล้ว
      const subCountMap = new Map<string, number>();
      if (targetIds.length > 0) {
        const { data: subRows } = await supabase
          .from("submissions")
          .select("assignment_id")
          .in("assignment_id", targetIds);

        for (const sub of (subRows ?? []) as Array<{ assignment_id: string }>) {
          subCountMap.set(sub.assignment_id, (subCountMap.get(sub.assignment_id) ?? 0) + 1);
        }
      }

      // จัดกลุ่มตามชื่อ
      const targetByTitle = new Map<string, AssignmentDbRow[]>();
      for (const row of targetRows) {
        const list = targetByTitle.get(row.title) || [];
        list.push(row);
        targetByTitle.set(row.title, list);
      }

      const processedTargetIds = new Set<string>();

      // วนลูปตามรายการในแม่แบบ
      for (let idx = 0; idx < template.items.length; idx++) {
        const it = template.items[idx]!;
        const desiredOrder = idx + 1;
        const matches = targetByTitle.get(it.title) || [];

        const sortedMatches = [...matches].sort((a, b) => {
          const subA = subCountMap.get(a.id) ?? 0;
          const subB = subCountMap.get(b.id) ?? 0;
          return subB - subA;
        });

        if (sortedMatches.length > 0) {
          const primary = sortedMatches[0]!;
          // อัปเดตคอลัมน์เดิม (คง id เดิมไว้ คะแนนนักเรียนยังคงอยู่)
          const { error: upErr } = await supabase
            .from("assignments")
            .update({
              max_score: it.max,
              category: it.category,
              due_date: dueDate,
              visible: true,
              sort_order: desiredOrder,
            })
            .eq("id", primary.id);

          if (upErr) {
            errors.push(`ห้อง ${targetName} อัปเดต ${it.title} ไม่สำเร็จ: ${upErr.message}`);
          } else {
            updatedCount++;
            processedTargetIds.add(primary.id);
          }

          // จัดการตัวซ้ำในห้องที่มีชื่อเดียวกัน
          for (let d = 1; d < sortedMatches.length; d++) {
            const dup = sortedMatches[d]!;
            const dupSubs = subCountMap.get(dup.id) ?? 0;
            if (dupSubs === 0 && cleanEmptyExcess) {
              await supabase.from("assignments").delete().eq("id", dup.id);
              cleanedCount++;
              processedTargetIds.add(dup.id);
            } else if (dupSubs > 0) {
              const safeOrder = template.items.length + 10 + preservedWithScoresCount;
              await supabase.from("assignments").update({ sort_order: safeOrder }).eq("id", dup.id);
              preservedWithScoresCount++;
              preservedAssignments.push({ room: targetName, title: `${dup.title} (ซ้ำ)`, scoreCount: dupSubs });
              processedTargetIds.add(dup.id);
            }
          }
        } else {
          // ยังไม่มีในห้อง -> สร้างใหม่
          const { error: insErr } = await supabase.from("assignments").insert({
            group_id: targetGid,
            subject,
            title: it.title,
            max_score: it.max,
            category: it.category,
            due_date: dueDate,
            visible: true,
            sort_order: desiredOrder,
          });

          if (insErr) {
            errors.push(`ห้อง ${targetName} สร้าง ${it.title} ไม่สำเร็จ: ${insErr.message}`);
          } else {
            createdCount++;
          }
        }
      }

      // จัดการคอลัมน์ส่วนเกินที่ไม่มีในแม่แบบ
      const extraneous = targetRows.filter((row) => !processedTargetIds.has(row.id));
      for (const extra of extraneous) {
        const extraSubs = subCountMap.get(extra.id) ?? 0;
        if (extraSubs === 0 && cleanEmptyExcess) {
          await supabase.from("assignments").delete().eq("id", extra.id);
          cleanedCount++;
        } else if (extraSubs > 0) {
          const safeOrder = template.items.length + 20 + preservedWithScoresCount;
          await supabase.from("assignments").update({ sort_order: safeOrder }).eq("id", extra.id);
          preservedWithScoresCount++;
          preservedAssignments.push({ room: targetName, title: extra.title, scoreCount: extraSubs });
        }
      }

      // บันทึกน้ำหนักคะแนนถ้ามีในแม่แบบ
      if (copyWeights && template.weights && template.weights.length > 0) {
        await saveCategoryWeights(targetName, template.weights);
      }

      syncedRooms.push(targetName);
    }

    return {
      success: errors.length === 0,
      sourceGroup: "template",
      targetRoomsCount: syncedRooms.length,
      syncedRooms,
      createdCount,
      updatedCount,
      cleanedCount,
      preservedWithScoresCount,
      preservedAssignments,
      createdAssignmentsCount: createdCount,
      skippedAssignmentsCount: 0,
      cleanedAssignmentsCount: cleanedCount,
      updatedAssignmentsCount: updatedCount,
      errors,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      sourceGroup: "template",
      targetRoomsCount: 0,
      syncedRooms: [],
      createdCount: 0,
      updatedCount: 0,
      cleanedCount: 0,
      preservedWithScoresCount: 0,
      preservedAssignments: [],
      createdAssignmentsCount: 0,
      skippedAssignmentsCount: 0,
      errors: [msg],
    };
  }
}
