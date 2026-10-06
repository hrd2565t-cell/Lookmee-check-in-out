import type { Metadata } from "next";
import { LoginCard, LoginForm } from "@/components/login";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ | LOOKMEE Check In-Out",
  description: "เข้าสู่ระบบสำหรับครู",
};

export default function LoginRoute() {
  return (
    <LoginCard>
      <LoginForm />
    </LoginCard>
  );
}
