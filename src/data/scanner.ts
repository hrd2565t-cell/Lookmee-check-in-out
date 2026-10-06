// รายชื่อเช็กใช้ชื่อจริงจากทะเบียน + เวลาจำลอง
import type { RosterGroup, RosterStudent } from "@/lib/school-data";

export type ScanEntry = {
  id: string;
  name: string;
  time: string;
  group: string;
  initials: string;
  color: string;
};

export type CurrentMatch = {
  code: string;
  group: string;
  thaiName: string;
  engName: string;
  status: string;
  time: string;
  confidence: number;
};

const FAKE_TIMES = ["09:02 AM", "09:01 AM", "08:58 AM", "08:51 AM", "08:45 AM"];

export function buildRecentByGroup(
  groups: RosterGroup[],
  students: RosterStudent[],
): Record<string, ScanEntry[]> {
  return Object.fromEntries(
    groups.map((g) => [
      g.name,
      students
        .filter((s) => s.group === g.name)
        .slice(0, 5)
        .map((s, i) => ({
          id: s.code,
          name: s.name,
          time: FAKE_TIMES[i] ?? "08:40 AM",
          group: s.group,
          initials: s.initials,
          color: s.color,
        })),
    ]),
  );
}

export function buildCurrentMatch(students: RosterStudent[]): CurrentMatch {
  const m: RosterStudent | { code: string; group: string; name: string } =
    students.find((s) => s.group === "ม.3/7") ??
    students[0] ?? { code: "", group: "", name: "—" };
  return {
    code: m.code,
    group: m.group,
    thaiName: m.name,
    engName: "",
    status: "Present",
    time: "09:02 AM",
    confidence: 97,
  };
}
