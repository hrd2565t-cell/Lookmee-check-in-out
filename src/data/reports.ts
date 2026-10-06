// types สำหรับ Reports — ข้อมูลจริงดึงจาก DB ใน component
export type AttendanceStatus = "present" | "absent" | "late" | "activity";

export type ReportRow = {
  id: string;
  name: string;
  group: string;
  time: string;
  status: AttendanceStatus;
  initials: string;
  color: string;
  method: "face" | "manual";
};

export type DaySummary = {
  present: number;
  absent: number;
  late: number;
  activity: number;
  total: number;
};

export const PAGE_SIZE = 6;
