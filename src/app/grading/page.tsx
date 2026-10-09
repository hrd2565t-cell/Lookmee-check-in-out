import type { Metadata } from "next";
import GradingPage from "@/components/grading";

export const metadata: Metadata = {
  title: "งานและคะแนน | LOOKMEE Check In-Out",
  description: "จัดการงานที่มอบหมาย คะแนน และการเผยแพร่ให้นักเรียน",
};

export default function GradingRoute() {
  return <GradingPage />;
}
