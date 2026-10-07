import type { Metadata } from "next";
import StudentSummaryPage from "@/components/student-summary";

export const metadata: Metadata = {
  title: "สรุปประวัติการเข้าเรียน | LOOKMEE Check In-Out",
  description: "สรุปประวัติการเข้าเรียนและใบลาของนักเรียน",
};

export default function StudentRoute() {
  return <StudentSummaryPage />;
}
