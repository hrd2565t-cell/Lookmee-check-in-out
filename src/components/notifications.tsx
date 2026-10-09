"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellIcon } from "@/components/icons";
import { ACTIVE_STUDENT_COUNT } from "@/data/school";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { fetchPendingLeaves } from "@/lib/leaves";
import { fetchPendingDisputes } from "@/lib/disputes";

const READ_KEY = "lookmee-notif-read";

type ReadState = { count: number; date: string; at: string; signature?: string };

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
  const [pendingLeaves, setPendingLeaves] = useState(0);
  const [pendingDisputes, setPendingDisputes] = useState(0);
  const [read, setRead] = useState<ReadState | null>(() =>
    typeof window === "undefined" ? null : loadRead(),
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      const [faceResult, leaves, disputes] = await Promise.all([
        supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .eq("face_status", "unregistered"),
        fetchPendingLeaves(),
        fetchPendingDisputes(),
      ]);
      const count = faceResult.count;
      if (!cancelled && typeof count === "number") setPending(count);
      if (!cancelled && leaves) setPendingLeaves(leaves.length);
      if (!cancelled && disputes) setPendingDisputes(disputes.length);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ซ่อนเมื่อรับทราบแล้ว (ของวันนี้ + ยอดไม่เพิ่มจากตอนที่รับทราบ)
  const pendingTotal = pending + pendingLeaves + pendingDisputes;
  const signature = `${pending}|${pendingLeaves}|${pendingDisputes}`;
  const dismissed = read !== null && read.date === todayStr() && (
    read.signature ? read.signature === signature : read.count >= pendingTotal
  );
  const showAlert = pendingTotal > 0 && !dismissed;

  const acknowledge = () => {
    const state: ReadState = {
      count: pendingTotal,
      signature,
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
        aria-label="งานที่ต้องจัดการ"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-[#5b6b82] hover:bg-[#f1f5fa]"
      >
        <BellIcon className="h-5 w-5" />
        {showAlert ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#c62828] px-1 text-[10px] font-bold text-white">
            {pendingTotal > 9 ? "9+" : pendingTotal}
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
              งานที่ต้องจัดการ ({pendingTotal})
            </p>
            {showAlert ? (
              <div className="space-y-1.5">
                {pending > 0 ? (
                  <Link href="/students?action=unregistered" onClick={() => setOpen(false)} className="block rounded-lg bg-[#fef6ec] px-3 py-2.5 hover:bg-[#fff1df]">
                    <p className="text-[13.5px] font-semibold text-[#e65100]">ยังไม่ลงทะเบียนใบหน้า {pending} คน</p>
                    <p className="mt-0.5 text-[12px] text-[#5b6b82]">ไปยังรายชื่อนักเรียน</p>
                  </Link>
                ) : null}
                {pendingLeaves > 0 ? (
                  <Link href="/reports#pending-leaves" onClick={() => setOpen(false)} className="block rounded-lg bg-[#e8f1fb] px-3 py-2.5 hover:bg-[#dceafa]">
                    <p className="text-[13.5px] font-semibold text-[#1a5da3]">ใบลารอตรวจ {pendingLeaves} รายการ</p>
                    <p className="mt-0.5 text-[12px] text-[#5b6b82]">ตรวจและอนุมัติใบลา</p>
                  </Link>
                ) : null}
                {pendingDisputes > 0 ? (
                  <Link href="/reports#student-disputes" onClick={() => setOpen(false)} className="block rounded-lg bg-[#f3e5f5] px-3 py-2.5 hover:bg-[#eedaf2]">
                    <p className="text-[13.5px] font-semibold text-[#6a1b9a]">คำขอแก้ไขข้อมูล {pendingDisputes} รายการ</p>
                    <p className="mt-0.5 text-[12px] text-[#5b6b82]">อ่านและปิดคำขอจากนักเรียน</p>
                  </Link>
                ) : null}
                <button type="button" onClick={acknowledge} className="mt-1 min-h-10 w-full rounded-md border border-[#d8e0ec] bg-white px-3 py-2 text-[12.5px] font-bold text-[#5b6b82] hover:bg-[#f1f5fa]">
                  รับทราบรายการแล้ว
                </button>
              </div>
            ) : (
              <p className="px-2 py-2 text-[13.5px] text-[#5b6b82]">
                {pendingTotal > 0 && read
                  ? `รับทราบแล้ว ✓ (เวลา ${read.at})`
                  : "ไม่มีงานค้างที่ต้องจัดการ"}
              </p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
