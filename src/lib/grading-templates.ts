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

export type CloneResult = {
  success: boolean;
  targetRoomsCount: number;
  createdAssignmentsCount: number;
  skippedAssignmentsCount: number;
  errors: string[];
};

/** คัดลอกโครงสร้างคอลัมน์จากห้องต้นแบบไปยังห้องอื่นๆ */
export async function cloneAssignmentsToGroups(options: {
  sourceGroupName: string;
  targetGroupNames: string[];
  subject: string;
  skipDuplicates?: boolean;
  copyWeights?: boolean;
}): Promise<CloneResult> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      targetRoomsCount: 0,
      createdAssignmentsCount: 0,
      skippedAssignmentsCount: 0,
      errors: ["ไม่ได้ตั้งค่าเชื่อมต่อฐานข้อมูล"],
    };
  }

  const { sourceGroupName, targetGroupNames, subject, skipDuplicates = true, copyWeights = true } = options;

  if (targetGroupNames.length === 0) {
    return {
      success: true,
      targetRoomsCount: 0,
      createdAssignmentsCount: 0,
      skippedAssignmentsCount: 0,
      errors: [],
    };
  }

  try {
    const sourceGid = await groupIdOf(sourceGroupName);
    if (!sourceGid) {
      return {
        success: false,
        targetRoomsCount: 0,
        createdAssignmentsCount: 0,
        skippedAssignmentsCount: 0,
        errors: [`ไม่พบรหัสห้องต้นแบบ ${sourceGroupName}`],
      };
    }

    // ดึงงานจากห้องต้นแบบ
    const { data: sourceAssignments, error: sErr } = await supabase
      .from("assignments")
      .select("id,title,subject,category,due_date,max_score,visible,sort_order,retake_of")
      .eq("group_id", sourceGid)
      .eq("subject", subject)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (sErr || !sourceAssignments || sourceAssignments.length === 0) {
      return {
        success: false,
        targetRoomsCount: 0,
        createdAssignmentsCount: 0,
        skippedAssignmentsCount: 0,
        errors: [sErr?.message || `ห้อง ${sourceGroupName} ยังไม่มีคอลัมน์งานในวิชา ${subject}`],
      };
    }

    // ดึงสัดส่วนน้ำหนักคะแนนห้องต้นแบบ (ถ้ามีและต้องการคัดลอก)
    let sourceWeights: CategoryWeight[] | null = null;
    if (copyWeights) {
      sourceWeights = await fetchCategoryWeights(sourceGroupName);
    }

    let createdAssignmentsCount = 0;
    let skippedAssignmentsCount = 0;
    const errors: string[] = [];
    let successfulRooms = 0;

    for (const targetName of targetGroupNames) {
      const targetGid = await groupIdOf(targetName);
      if (!targetGid) {
        errors.push(`ไม่พบห้อง ${targetName}`);
        continue;
      }

      // ตรวจสอบงานเดิมที่มีอยู่แล้วในห้องปลายทาง
      let existingTitles = new Set<string>();
      if (skipDuplicates) {
        const { data: existing } = await supabase
          .from("assignments")
          .select("title")
          .eq("group_id", targetGid)
          .eq("subject", subject);
        if (existing) {
          existingTitles = new Set(existing.map((e) => e.title));
        }
      }

      // แยกงานทั่วไปกับงานสอบซ่อม
      const regularAssignments = sourceAssignments.filter((a) => !a.retake_of);
      const retakeAssignments = sourceAssignments.filter((a) => !!a.retake_of);

      const oldToNewIdMap = new Map<string, string>();

      // นำเข้างานทั่วไป
      for (const a of regularAssignments) {
        if (skipDuplicates && existingTitles.has(a.title)) {
          skippedAssignmentsCount++;
          continue;
        }

        const { data: inserted, error: insErr } = await supabase
          .from("assignments")
          .insert({
            group_id: targetGid,
            subject,
            title: a.title,
            max_score: a.max_score,
            due_date: a.due_date,
            category: a.category,
            visible: a.visible,
            sort_order: a.sort_order,
          })
          .select("id")
          .single();

        if (insErr) {
          errors.push(`ห้อง ${targetName} สร้าง ${a.title} ไม่สำเร็จ: ${insErr.message}`);
        } else if (inserted) {
          createdAssignmentsCount++;
          oldToNewIdMap.set(a.id, inserted.id);
        }
      }

      // นำเข้างานสอบซ่อม (เชื่อมต่อกับ id ใหม่ที่เพิ่งสร้าง)
      for (const r of retakeAssignments) {
        if (skipDuplicates && existingTitles.has(r.title)) {
          skippedAssignmentsCount++;
          continue;
        }

        const newRetakeOf = r.retake_of ? oldToNewIdMap.get(r.retake_of) ?? null : null;
        const { error: insErr } = await supabase.from("assignments").insert({
          group_id: targetGid,
          subject,
          title: r.title,
          max_score: r.max_score,
          due_date: r.due_date,
          category: r.category,
          visible: r.visible,
          sort_order: r.sort_order,
          retake_of: newRetakeOf,
        });

        if (insErr) {
          errors.push(`ห้อง ${targetName} สร้าง ${r.title} ไม่สำเร็จ: ${insErr.message}`);
        } else {
          createdAssignmentsCount++;
        }
      }

      // คัดลอกน้ำหนักคะแนนรายห้อง
      if (copyWeights && sourceWeights && sourceWeights.length > 0) {
        await saveCategoryWeights(targetName, sourceWeights);
      }

      successfulRooms++;
    }

    return {
      success: errors.length === 0,
      targetRoomsCount: successfulRooms,
      createdAssignmentsCount,
      skippedAssignmentsCount,
      errors,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      targetRoomsCount: 0,
      createdAssignmentsCount: 0,
      skippedAssignmentsCount: 0,
      errors: [msg],
    };
  }
}

/** ใช้แม่แบบที่บันทึกไว้กับห้องเป้าหมาย */
export async function applyTemplateToGroups(options: {
  template: GradingTemplate;
  targetGroupNames: string[];
  subject: string;
  dueDate: string;
  skipDuplicates?: boolean;
  copyWeights?: boolean;
}): Promise<CloneResult> {
  if (!isSupabaseConfigured) {
    return {
      success: false,
      targetRoomsCount: 0,
      createdAssignmentsCount: 0,
      skippedAssignmentsCount: 0,
      errors: ["ไม่ได้ตั้งค่าเชื่อมต่อฐานข้อมูล"],
    };
  }

  const { template, targetGroupNames, subject, dueDate, skipDuplicates = true, copyWeights = true } = options;

  if (targetGroupNames.length === 0 || template.items.length === 0) {
    return {
      success: true,
      targetRoomsCount: 0,
      createdAssignmentsCount: 0,
      skippedAssignmentsCount: 0,
      errors: [],
    };
  }

  let createdAssignmentsCount = 0;
  let skippedAssignmentsCount = 0;
  const errors: string[] = [];
  let successfulRooms = 0;

  try {
    for (const targetName of targetGroupNames) {
      const targetGid = await groupIdOf(targetName);
      if (!targetGid) {
        errors.push(`ไม่พบห้อง ${targetName}`);
        continue;
      }

      let existingTitles = new Set<string>();
      if (skipDuplicates) {
        const { data: existing } = await supabase
          .from("assignments")
          .select("title")
          .eq("group_id", targetGid)
          .eq("subject", subject);
        if (existing) {
          existingTitles = new Set(existing.map((e) => e.title));
        }
      }

      const toInsert = template.items
        .filter((it) => !skipDuplicates || !existingTitles.has(it.title))
        .map((it, idx) => ({
          group_id: targetGid,
          subject,
          title: it.title,
          max_score: it.max,
          category: it.category,
          due_date: dueDate,
          visible: true,
          sort_order: idx + 1,
        }));

      skippedAssignmentsCount += template.items.length - toInsert.length;

      if (toInsert.length > 0) {
        const { error } = await supabase.from("assignments").insert(toInsert);
        if (error) {
          errors.push(`ห้อง ${targetName} สร้างคอลัมน์ไม่สำเร็จ: ${error.message}`);
          continue;
        }
        createdAssignmentsCount += toInsert.length;
      }

      // บันทึกน้ำหนักคะแนนถ้ามีในแม่แบบ
      if (copyWeights && template.weights && template.weights.length > 0) {
        await saveCategoryWeights(targetName, template.weights);
      }

      successfulRooms++;
    }

    return {
      success: errors.length === 0,
      targetRoomsCount: successfulRooms,
      createdAssignmentsCount,
      skippedAssignmentsCount,
      errors,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      targetRoomsCount: 0,
      createdAssignmentsCount: 0,
      skippedAssignmentsCount: 0,
      errors: [msg],
    };
  }
}
