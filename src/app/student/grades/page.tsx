import type { Metadata } from "next";
import StudentGradesPage from "@/components/student-grades";

export const metadata: Metadata = {
  title: "งานและคะแนน | LOOKMEE Check In-Out",
  description: "สรุปการส่งงานและคะแนนสะสมของนักเรียน",
};

export default function StudentGradesRoute() {
  return <StudentGradesPage />;
}
