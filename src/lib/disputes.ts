import { isSupabaseConfigured, supabase } from "./supabase/client";

export type StudentDispute = {
  id: string;
  studentCode: string;
  studentName: string;
  group: string;
  message: string;
  createdAt: string;
};

type DbDispute = {
  id: string;
  message: string;
  created_at: string;
  students: {
    student_code: string | null;
    prefix: string;
    first_name: string;
    last_name: string | null;
    class_groups: { name: string } | null;
  } | null;
};

/** คำขอแก้ไขข้อมูลที่ครูยังไม่ได้รับทราบ */
export async function fetchPendingDisputes(): Promise<StudentDispute[] | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from("disputes")
      .select("id,message,created_at,students!inner(student_code,prefix,first_name,last_name,class_groups(name))")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error || !data) return null;
    return (data as unknown as DbDispute[]).flatMap((row) => {
      const student = row.students;
      if (!student?.student_code) return [];
      const last = student.last_name ?? "";
      return [{
        id: row.id,
        studentCode: student.student_code,
        studentName: `${student.prefix}${student.first_name}${last ? ` ${last}` : ""}`,
        group: student.class_groups?.name ?? "-",
        message: row.message,
        createdAt: row.created_at,
      }];
    });
  } catch {
    return null;
  }
}

/** ครูรับทราบและปิดคำขอ */
export async function resolveDispute(id: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error, data } = await supabase
      .from("disputes")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    return !error && !!data;
  } catch {
    return false;
  }
}
