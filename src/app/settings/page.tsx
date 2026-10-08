import type { Metadata } from "next";
import SettingsPage from "@/components/settings";

export const metadata: Metadata = {
  title: "ตั้งค่าระบบ | LOOKMEE Check In-Out",
  description: "ตั้งค่าเทอมและเกณฑ์ขาดเรียน",
};

export default function SettingsRoute() {
  return <SettingsPage />;
}
