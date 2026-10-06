import type { Metadata } from "next";
import ReportsPage from "@/components/reports";

export const metadata: Metadata = {
  title: "รายงานการเข้าเรียน | LOOKMEE Check In-Out",
  description: "ค้นหาและตรวจสอบข้อมูลการเข้าเรียนกลุ่มและรายบุคคล",
};

export default function ReportsRoute() {
  return <ReportsPage />;
}
