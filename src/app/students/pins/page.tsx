import type { Metadata } from "next";
import StudentPinsPage from "@/components/student-pins";

export const metadata: Metadata = {
  title: "สมุดรหัส PIN นักเรียน | LOOKMEE Check In-Out",
  description: "ค้นหาและดูรหัส PIN ส่วนตัวของนักเรียนเพื่อช่วยเหลือเมื่อลืมรหัส",
};

export default function StudentPinsRoute() {
  return <StudentPinsPage />;
}
