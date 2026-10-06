import type { Metadata } from "next";
import TimetablePage from "@/components/timetable";

export const metadata: Metadata = {
  title: "ตารางคาบเรียน | LOOKMEE Check In-Out",
  description: "ตั้งค่าตารางคาบเรียนรายห้อง",
};

export default function TimetableRoute() {
  return <TimetablePage />;
}
