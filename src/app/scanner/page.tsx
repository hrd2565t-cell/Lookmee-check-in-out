import type { Metadata } from "next";
import ScannerPage from "@/components/scanner";

export const metadata: Metadata = {
  title: "Daily Scanner | LOOKMEE Check In-Out",
  description: "สแกนเข้าเรียนรายวันด้วยใบหน้า",
};

export default function ScannerRoute() {
  return <ScannerPage />;
}
