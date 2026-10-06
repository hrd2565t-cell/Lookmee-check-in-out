import type { Metadata } from "next";
import StudentsPage from "@/components/students";

export const metadata: Metadata = {
  title: "จัดการนักเรียน | LOOKMEE Check In-Out",
  description: "จัดการกลุ่มเรียนและลงทะเบียนนักเรียน",
};

export default function StudentsRoute() {
  return <StudentsPage />;
}
