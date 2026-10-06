// ทะเบียนจริงจากชีท — ทุกคน face_status = unregistered (ชีทยังไม่มี Face Data)
import { SCHOOL_GROUPS, SCHOOL_STUDENTS } from "./school";

export type ClassGroup = {
  id: string;
  name: string;
  students: number;
};

export type Student = {
  id: string;
  thaiName: string;
  engName?: string;
  studentId: string;
  group: string;
  registered: boolean;
  initials: string;
  color: string;
};

const half = Math.ceil(SCHOOL_GROUPS.length / 2);
const toGroup = (g: { name: string; count: number }): ClassGroup => ({
  id: g.name,
  name: g.name,
  students: g.count,
});

export const leftGroups: ClassGroup[] = SCHOOL_GROUPS.slice(0, half).map(toGroup);
export const rightGroups: ClassGroup[] = SCHOOL_GROUPS.slice(half).map(toGroup);

export const allGroups = SCHOOL_GROUPS.map((g) => g.name);

export const students: Student[] = SCHOOL_STUDENTS.map((s) => ({
  id: s.code,
  thaiName: `${s.title}${s.firstName}${s.lastName ? ` ${s.lastName}` : ""}`,
  studentId: s.code,
  group: s.group,
  registered: false,
  initials: s.initials,
  color: s.color,
}));
