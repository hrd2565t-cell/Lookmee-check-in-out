"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "./supabase/client";
import {
  ACTIVE_STUDENT_COUNT,
  SCHOOL_GROUPS,
  SCHOOL_STUDENTS,
} from "@/data/school";

export type RosterStudent = {
  code: string;
  title: string;
  firstName: string;
  lastName: string;
  name: string;
  group: string;
  number: string;
  initials: string;
  color: string;
  registered: boolean;
};

export type RosterGroup = { name: string; count: number };

export type Roster = {
  groups: RosterGroup[];
  students: RosterStudent[];
  /** true = ข้อมูลสดจาก Supabase, false = ข้อมูลสำรองในเครื่อง */
  live: boolean;
};

const PALETTE = [
  "bg-[#dbe7f5] text-[#1a5da3]",
  "bg-[#e3f2e6] text-[#166c2e]",
  "bg-[#f3e8f5] text-[#7b1fa2]",
  "bg-[#fff3e0] text-[#e65100]",
  "bg-[#e0f2f1] text-[#00695c]",
  "bg-[#fce4ec] text-[#ad1457]",
];

export function colorForSeed(seed: string) {
  const h = [...seed].reduce((a, c) => (a * 31 + (c.codePointAt(0) ?? 0)) >>> 0, 7);
  return PALETTE[h % PALETTE.length] ?? PALETTE[0];
}

/** เรียงชื่อห้องแบบธรรมชาติ: ม.1/1, ม.1/2, ..., ม.1/10 (ไม่ใช่ 1, 10, 11, 2) */
export function compareGroupNames(a: string, b: string): number {
  return a.localeCompare(b, "th", { numeric: true });
}

export function initialsForName(firstName: string, lastName: string) {
  return (
    firstName.charAt(0) + (lastName ? lastName.charAt(0) : firstName.charAt(1) ?? "")
  );
}

/** ข้อมูลสำรอง (mock จากชีท) — ใช้ตอนยังไม่ต่อ DB หรือต่อไม่ติด */
export function mockRoster(): Omit<Roster, "live"> {
  return {
    groups: SCHOOL_GROUPS,
    students: SCHOOL_STUDENTS.map((s) => ({ ...s, registered: false })),
  };
}

type DbStudentRow = {
  student_code: string | null;
  prefix: string;
  first_name: string;
  last_name: string | null;
  class_no: string;
  face_status: string;
  group_id: string;
};

async function fetchRosterFromDb(): Promise<Omit<Roster, "live"> | null> {
  const { data: gData, error: gErr } = await supabase
    .from("class_groups")
    .select("id,name")
    .eq("is_active", true)
    .order("name");
  if (gErr || !gData) return null;

  const { data: sData, error: sErr } = await supabase
    .from("students")
    .select("student_code,prefix,first_name,last_name,class_no,face_status,group_id")
    .eq("status", "active");
  if (sErr || !sData) return null;

  const idToName = new Map<string, string>(
    (gData as Array<{ id: string; name: string }>).map((g) => [g.id, g.name]),
  );
  // DB เรียง string ("ม.1/10" มาก่อน "ม.1/2") — เรียงใหม่แบบธรรมชาติตรงนี้
  const names = [...new Set(idToName.values())].sort(compareGroupNames);
  const order = new Map<string, number>(names.map((n, i) => [n, i]));
  const students: RosterStudent[] = (sData as DbStudentRow[])
    .filter((r) => r.student_code && idToName.has(r.group_id))
    .map((r) => {
      const last = r.last_name ?? "";
      return {
        code: r.student_code as string,
        title: r.prefix,
        firstName: r.first_name,
        lastName: last,
        name: last ? `${r.first_name} ${last}` : r.first_name,
        group: idToName.get(r.group_id) as string,
        number: r.class_no,
        initials: initialsForName(r.first_name, last),
        color: colorForSeed(r.student_code as string),
        registered: r.face_status === "registered",
      };
    })
    .sort(
      (a, b) =>
        (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99) ||
        Number(a.number) - Number(b.number),
    );

  const counts = new Map<string, number>();
  students.forEach((s) => counts.set(s.group, (counts.get(s.group) ?? 0) + 1));
  const groups: RosterGroup[] = names.map((name) => ({
    name,
    count: counts.get(name) ?? 0,
  }));
  return { groups, students };
}

/** ดึงทะเบียนจาก Supabase — ล้มเหลว/ยังไม่ setup จะ fallback เป็น mock อัตโนมัติ */
export function useRoster(): Roster {
  const [roster, setRoster] = useState<Omit<Roster, "live">>(mockRoster);
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    fetchRosterFromDb()
      .then((r) => {
        if (r && !cancelled) {
          setRoster(r);
          setLive(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return { ...roster, live };
}

export { ACTIVE_STUDENT_COUNT };
