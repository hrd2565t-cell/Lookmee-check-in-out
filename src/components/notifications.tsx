"use client";

import { useEffect, useState } from "react";
import { BellIcon } from "@/components/icons";
import { ACTIVE_STUDENT_COUNT } from "@/data/school";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

/* กระดิ่งแจ้งเตือน — นับรอลงทะเบียนใบหน้าสดจาก DB (fallback ตัวเลข mock) */
export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(ACTIVE_STUDENT_COUNT);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .eq("face_status", "unregistered");
      if (!cancelled && typeof count === "number") setPending(count);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="การแจ้งเตือน"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-[#5b6b82] hover:bg-[#f1f5fa]"
      >
        <BellIcon className="h-5 w-5" />
        {pending > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c62828] px-1 text-[10px] font-bold text-white">
            1
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="ปิดการแจ้งเตือน"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default bg-transparent"
          />
          <div className="absolute right-0 z-20 mt-1 w-72 rounded-xl border border-[#e4eaf3] bg-white p-2 shadow-lg">
            <p className="px-2 py-1.5 text-[14px] font-bold text-[#16233a]">
              การแจ้งเตือน ({pending > 0 ? 1 : 0})
            </p>
            {pending > 0 ? (
              <div className="rounded-lg bg-[#fef6ec] px-3 py-2.5">
                <p className="text-[13.5px] font-semibold text-[#e65100]">
                  นักเรียน {pending} คนยังไม่ลงทะเบียนใบหน้า
                </p>
                <p className="mt-0.5 text-[12.5px] text-[#5b6b82]">
                  ลงทะเบียนก่อนเริ่มสแกนเข้าเรียน
                </p>
              </div>
            ) : (
              <p className="px-2 py-2 text-[13.5px] text-[#5b6b82]">
                ลงทะเบียนใบหน้าครบทุกคนแล้ว
              </p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
