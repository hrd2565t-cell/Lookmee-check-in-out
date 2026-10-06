// types สำหรับ Dashboard — ตัวเลขทั้งหมดคำนวณจากข้อมูลจริงใน component
export type CheckIn = {
  id: string;
  thaiName: string;
  engName?: string;
  time: string;
  group: string;
  initials: string;
  color: string;
};

export type TodayGroup = {
  id: string;
  name: string;
  status: "completed" | "pending" | "soon" | "empty";
  statusText: string;
  present: number;
  total: number;
  action?: { label: string; variant: "green" | "blue"; href: string };
};

export type StatItem = {
  id: string;
  label: string;
  value: string;
  sub?: string;
  icon: "manage" | "profile" | "attendance" | "bell";
  caption: string;
  accent: string;
};
