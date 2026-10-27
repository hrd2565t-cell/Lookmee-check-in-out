// สำรองและกู้คืนข้อมูลทั้งระบบเป็นไฟล์ JSON
// (ไม่สำรองตาราง users เพราะมีรหัสผ่านแฮชอยู่)

import { isSupabaseConfigured, supabase } from "./supabase/client";

export type BackupData = {
  version?: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
};

export type TableConfig = {
  name: string;
  onConflict: string;
  label: string;
};

// ลำดับตารางเรียงตาม Foreign Key Dependency (ตารางแม่ต้องมาก่อนตารางลูก)
export const BACKUP_TABLES_ORDERED: TableConfig[] = [
  { name: "school_terms", onConflict: "id", label: "ภาคเรียน" },
  { name: "absence_limits", onConflict: "level", label: "เกณฑ์ขาดเรียนรายชั้น" },
  { name: "grade_scales", onConflict: "level,grade", label: "เกณฑ์ตัดเกรดรายชั้น" },
  { name: "class_groups", onConflict: "id", label: "กลุ่มเรียน / ห้อง" },
  { name: "students", onConflict: "id", label: "ข้อมูลนักเรียน" },
  { name: "subjects", onConflict: "id", label: "ทะเบียนวิชา" },
  { name: "level_subjects", onConflict: "level,subject_id", label: "วิชาประจำระดับชั้น" },
  { name: "group_subject_overrides", onConflict: "group_id,subject_id", label: "วิชาเฉพาะห้อง" },
  { name: "class_periods", onConflict: "id", label: "ตารางคาบเรียน" },
  { name: "category_weights", onConflict: "id", label: "สัดส่วนคะแนนรายห้อง" },
  { name: "room_grade_scales", onConflict: "id", label: "เกณฑ์ตัดเกรดรายห้อง" },
  { name: "attendance_sessions", onConflict: "id", label: "รอบเช็กชื่อ" },
  { name: "attendance_records", onConflict: "id", label: "บันทึกการเช็กชื่อ" },
  { name: "leave_requests", onConflict: "id", label: "ใบลา" },
  { name: "assignments", onConflict: "id", label: "ชิ้นงาน / ข้อสอบ" },
  { name: "submissions", onConflict: "id", label: "คะแนนการส่งงาน / สอบ" },
  { name: "bonus_scores", onConflict: "id", label: "คะแนนพิเศษ" },
  { name: "disputes", onConflict: "id", label: "คำขอแก้ไขข้อมูล" },
];

export async function fetchFullBackup(): Promise<BackupData | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const tables: Record<string, unknown[]> = {};
    for (const t of BACKUP_TABLES_ORDERED) {
      const { data, error } = await supabase.from(t.name).select("*");
      if (error) {
        console.error(`Backup error on ${t.name}:`, error);
        return null;
      }
      tables[t.name] = data ?? [];
    }
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      tables,
    };
  } catch (err) {
    console.error("fetchFullBackup error:", err);
    return null;
  }
}

export function downloadBackup(data: BackupData, filename?: string): void {
  const stamp = new Date(data.exportedAt).toISOString().slice(0, 10);
  const name = filename ?? `lookmee-backup-${stamp}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function parseBackupJson(jsonString: string): BackupData {
  const parsed = JSON.parse(jsonString) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("รูปแบบไฟล์ JSON ไม่ถูกต้อง");
  }
  const obj = parsed as Record<string, unknown>;
  if (!obj.tables || typeof obj.tables !== "object") {
    throw new Error("ไม่พบโครงสร้างตารางข้อมูล (tables) ในไฟล์สำรอง");
  }
  return {
    version: typeof obj.version === "number" ? obj.version : 1,
    exportedAt: typeof obj.exportedAt === "string" ? obj.exportedAt : new Date().toISOString(),
    tables: obj.tables as Record<string, unknown[]>,
  };
}

export function backupStats(data: BackupData): Array<{ table: string; label: string; rows: number }> {
  const labelMap = new Map<string, string>();
  for (const t of BACKUP_TABLES_ORDERED) {
    labelMap.set(t.name, t.label);
  }

  return Object.entries(data.tables)
    .map(([table, rows]) => ({
      table,
      label: labelMap.get(table) || table,
      rows: Array.isArray(rows) ? rows.length : 0,
    }))
    .filter((t) => t.rows > 0)
    .sort((a, b) => b.rows - a.rows);
}

export type RestoreResult = {
  success: boolean;
  totalRestored: number;
  tableStats: Array<{
    table: string;
    label: string;
    rows: number;
    success: boolean;
    error?: string;
  }>;
  error?: string;
};

export async function restoreBackup(
  data: BackupData,
  onProgress?: (tableName: string, current: number, total: number) => void,
): Promise<RestoreResult> {
  if (!isSupabaseConfigured) {
    return { success: false, totalRestored: 0, tableStats: [], error: "ไม่ได้ตั้งค่าเชื่อมต่อฐานข้อมูล" };
  }
  if (!data || typeof data !== "object" || !data.tables || typeof data.tables !== "object") {
    return { success: false, totalRestored: 0, tableStats: [], error: "ข้อมูลสำรองไม่ถูกต้อง" };
  }

  const tableStats: RestoreResult["tableStats"] = [];
  let totalRestored = 0;
  let overallSuccess = true;

  const totalTables = BACKUP_TABLES_ORDERED.length;
  let currentIndex = 0;

  for (const t of BACKUP_TABLES_ORDERED) {
    currentIndex++;
    onProgress?.(t.label, currentIndex, totalTables);

    const rows = data.tables[t.name];
    if (!Array.isArray(rows) || rows.length === 0) {
      continue;
    }

    try {
      const batchSize = 50;
      let tableSuccess = true;
      let errorMsg = "";

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase
          .from(t.name)
          .upsert(batch, { onConflict: t.onConflict });

        if (error) {
          console.error(`Restore error on ${t.name}:`, error);
          tableSuccess = false;
          errorMsg = error.message;
          overallSuccess = false;
          break;
        }
      }

      tableStats.push({
        table: t.name,
        label: t.label,
        rows: tableSuccess ? rows.length : 0,
        success: tableSuccess,
        error: errorMsg || undefined,
      });

      if (tableSuccess) {
        totalRestored += rows.length;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      tableStats.push({
        table: t.name,
        label: t.label,
        rows: 0,
        success: false,
        error: msg,
      });
      overallSuccess = false;
    }
  }

  return {
    success: overallSuccess,
    totalRestored,
    tableStats,
  };
}
