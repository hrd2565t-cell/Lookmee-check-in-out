import type { Metadata } from "next";
import StudentsPage from "@/components/students";

export const metadata: Metadata = {
  title: "นักเรียนและกลุ่มเรียน | LOOKMEE Check In-Out",
  description: "จัดการรายชื่อนักเรียน กลุ่มเรียน และข้อมูลการสอน",
};

export default function StudentsRoute() {
  return <StudentsPage />;
}
