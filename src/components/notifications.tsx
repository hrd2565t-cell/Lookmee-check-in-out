"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellIcon } from "@/components/icons";
import { ACTIVE_STUDENT_COUNT } from "@/data/school";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

const READ_KEY = "lookmee-notif-read";

type ReadState = { count: number; date: string; at: string };

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function loadRead(): ReadState | null {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as ReadState;
    return typeof v.count === "number" && typeof v.date === "string" ? v : null;
  } catch {
    return null;
  }
}

/* กระดิ่งแจ้งเตือน — นับสดจาก DB + ปุ่ม "รับทราบแล้ว" (จำในเครื่อง) */
export function NotificationsButton() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(ACTIVE_STUDENT_COUNT);
  const [read, setRead] = useState<ReadState | null>(() =>
    typeof window === "undefined" ? null : loadRead(),
  );

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

  // ซ่อนเมื่อรับทราบแล้ว (ของวันนี้ + ยอดไม่เพิ่มจากตอนที่รับทราบ)
  const dismissed =
    read !== null && read.date === todayStr() && read.count >= pending;
  const showAlert = pending > 0 && !dismissed;

  const acknowledge = () => {
    const state: ReadState = {
      count: pending,
      date: todayStr(),
      at: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
    };
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(state));
    } catch {
      /* เก็บไม่ได้ก็แค่ไม่จำ */
    }
    setRead(state);
    setOpen(false);
  };

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
        {showAlert ? (
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
              การแจ้งเตือน ({showAlert ? 1 : 0})
            </p>
            {showAlert ? (
              <div className="rounded-lg bg-[#fef6ec] px-3 py-2.5">
                <p className="text-[13.5px] font-semibold text-[#e65100]">
                  นักเรียน {pending} คนยังไม่ลงทะเบียนใบหน้า
                </p>
                <p className="mt-0.5 text-[12.5px] text-[#5b6b82]">
                  ลงทะเบียนก่อนเริ่มสแกนเข้าเรียน
                </p>
                <div className="mt-2 flex gap-1.5">
                  <Link
                    href="/students"
                    onClick={() => setOpen(false)}
                    className="flex-1 rounded-md bg-[#2474c6] px-2 py-1.5 text-center text-[12.5px] font-bold text-white hover:bg-[#1a5da3]"
                  >
                    ไปลงทะเบียน
                  </Link>
                  <button
                    type="button"
                    onClick={acknowledge}
                    className="flex-1 rounded-md border border-[#d8e0ec] bg-white px-2 py-1.5 text-[12.5px] font-bold text-[#5b6b82] hover:bg-[#f1f5fa]"
                  >
                    รับทราบแล้ว
                  </button>
                </div>
              </div>
            ) : (
              <p className="px-2 py-2 text-[13.5px] text-[#5b6b82]">
                {pending > 0 && read
                  ? `รับทราบแล้ว ✓ (เวลา ${read.at})`
                  : "ลงทะเบียนใบหน้าครบทุกคนแล้ว"}
              </p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
