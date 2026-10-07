import type { Metadata } from "next";
import StudentScanPage from "@/components/student-scan";

export const metadata: Metadata = {
  title: "สแกนใบหน้า | LOOKMEE Check In-Out",
  description: "สแกนใบหน้าเช็กชื่อด้วยตัวเอง",
};

export default function StudentScanRoute() {
  return <StudentScanPage />;
}
