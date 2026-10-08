import type { Metadata } from "next";
import GradingPage from "@/components/grading";

export const metadata: Metadata = {
  title: "กรอกคะแนน | LOOKMEE Check In-Out",
  description: "บันทึกคะแนนนักเรียนรายบุคคล",
};

export default function GradingRoute() {
  return <GradingPage />;
}
