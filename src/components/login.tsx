"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, UIButton } from "@/components/ui";
import { BrandMark } from "@/components/logo";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("กรุณากรอกอีเมลและรหัสผ่าน");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      setError("เข้าสู่ระบบไม่สำเร็จ — ตรวจอีเมล/รหัสผ่าน");
      return;
    }
    router.push("/");
    router.refresh();
  };

  if (!isSupabaseConfigured) {
    return (
      <p className="rounded-lg bg-[#fef6ec] px-4 py-3 text-center text-[14px] font-semibold text-[#e65100]">
        ยังไม่เชื่อมต่อ Supabase — ใช้งานโหมด Local ไม่ต้องล็อกอิน
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <div className="mb-1 flex flex-col items-center gap-2 text-center">
        <BrandMark size={64} />
        <div>
          <p className="text-[20px] font-bold text-[#16233a]">LOOKMEE Check In-Out</p>
          <p className="text-[13.5px] text-[#5b6b82]">เข้าสู่ระบบสำหรับครู</p>
        </div>
      </div>
      <label className="block text-[14px] font-medium text-[#16233a]">
        อีเมล
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teacher@school.ac.th"
          className="mt-1 h-11 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[15px] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
        />
      </label>
      <label className="block text-[14px] font-medium text-[#16233a]">
        รหัสผ่าน
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="mt-1 h-11 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[15px] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
        />
      </label>
      {error ? (
        <p role="alert" className="rounded-lg bg-[#fdecec] px-3 py-2 text-[13.5px] font-semibold text-[#c62828]">
          {error}
        </p>
      ) : null}
      <UIButton type="submit" disabled={busy} className="h-11 w-full disabled:opacity-50">
        {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
      </UIButton>
    </form>
  );
}

export function LoginCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eaf1f8] p-4">
      <Card className="w-full max-w-sm p-6">{children}</Card>
    </div>
  );
}
