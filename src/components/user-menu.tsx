"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/** ชื่อผู้ใช้ + ปุ่มออกจากระบบใน TopBar */
export function UserMenu() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  if (!email) {
    return (
      <span className="hidden items-center gap-2 sm:flex">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#dbe7f5] text-[13px] font-bold text-[#1a5da3]">
          ครู
        </span>
        <span className="text-[14px] font-semibold">ครูลูกหมี</span>
      </span>
    );
  }

  return (
    <span className="hidden items-center gap-2 sm:flex">
      <span
        title={email}
        className="max-w-[140px] truncate text-[14px] font-semibold"
      >
        {email}
      </span>
      <button
        type="button"
        onClick={() => void logout()}
        className="rounded-md border border-[#d8e0ec] px-2.5 py-1 text-[12.5px] font-semibold text-[#5b6b82] hover:bg-[#f1f5fa]"
      >
        ออกจากระบบ
      </button>
    </span>
  );
}
