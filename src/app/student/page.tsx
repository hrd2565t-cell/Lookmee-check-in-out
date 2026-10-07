import type { Metadata } from "next";
import StudentHistoryPage from "@/components/student-history";

export const metadata: Metadata = {
  title: "ประวัติของฉัน | LOOKMEE Check In-Out",
  description: "ประวัติการเข้าเรียนของนักเรียน",
};

export default function StudentRoute() {
  return <StudentHistoryPage />;
}
