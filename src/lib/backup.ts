// สำรองข้อมูลทั้งระบบเป็นไฟล์ JSON หนึ่งไฟล์
// (ไม่สำรองตาราง users เพราะมีรหัสผ่านแฮชอยู่)

import { isSupabaseConfigured, supabase } from "./supabase/client";

export type BackupData = {
  exportedAt: string;
  tables: Record<string, unknown[]>;
};

const BACKUP_TABLES = [
  "school_terms",
  "absence_limits",
  "class_groups",
  "students",
  "class_periods",
  "attendance_sessions",
  "attendance_records",
  "leave_requests",
  "assignments",
  "submissions",
  "subjects",
  "level_subjects",
  "group_subject_overrides",
  "grade_scales",
  "disputes",
];

export async function fetchFullBackup(): Promise<BackupData | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const tables: Record<string, unknown[]> = {};
    for (const name of BACKUP_TABLES) {
      const { data, error } = await supabase.from(name).select("*");
      if (error) return null;
      tables[name] = data ?? [];
    }
    return { exportedAt: new Date().toISOString(), tables };
  } catch {
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

export function backupStats(data: BackupData): Array<{ table: string; rows: number }> {
  return Object.entries(data.tables)
    .map(([table, rows]) => ({ table, rows: Array.isArray(rows) ? rows.length : 0 }))
    .sort((a, b) => b.rows - a.rows);
}
