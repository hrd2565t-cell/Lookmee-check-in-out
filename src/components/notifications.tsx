"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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
    Promise.all([
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .eq("face_status", "unregistered"),
      fetchPendingLeaves(),
      fetchPendingDisputes(),
    ]).then(([faceResult, leaves, disputes]) => {
      if (cancelled) return;
      const count = faceResult.count;
      if (typeof count === "number") setPending(count);
      if (leaves) setPendingLeaves(leaves.length);
      if (disputes) setPendingDisputes(disputes.length);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingTotal = pending + pendingLeaves + pendingDisputes;
  const currentSignature = `${todayStr()}:${pending}:${pendingLeaves}:${pendingDisputes}`;
  const isAcknowledged =
    Boolean(read && read.signature === currentSignature) ||
    Boolean(read && read.count === pendingTotal && read.date === todayStr());
  const showAlert = pendingTotal > 0 && !isAcknowledged;

  const acknowledge = () => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const state: ReadState = {
      count: pendingTotal,
      date: todayStr(),
      at: timeStr,
      signature: currentSignature,
    };
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(state));
    } catch {
      /* เก็บไม่ได้ก็แค่ไม่จำ */
    }
    setRead(state);
    setOpen(false);
  };

  const handleNavigate = (path: string, hashId?: string) => {
    setOpen(false);
    if (typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      const targetPath = path.split("#")[0]?.split("?")[0] || "";
      if (hashId && (currentPath === targetPath || (targetPath === "/reports" && currentPath.startsWith("/reports")))) {
        const el = document.getElementById(hashId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("ring-2", "ring-[#2474c6]");
          setTimeout(() => el.classList.remove("ring-2", "ring-[#2474c6]"), 2000);
          return;
        }
      }
      if (path.includes("action=unregistered") && currentPath === "/students") {
        window.dispatchEvent(new CustomEvent("filter-unregistered"));
        return;
      }
    }
    router.push(path);
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
          <div className="absolute right-0 z-20 mt-1 w-80 rounded-xl border border-[#e4eaf3] bg-white p-2.5 shadow-xl">
            <p className="px-2 py-1 text-[14px] font-bold text-[#16233a]">
              งานที่ต้องจัดการ ({pendingTotal})
            </p>
            {showAlert ? (
              <div className="mt-1 space-y-2">
                {pending > 0 ? (
                  <button
                    type="button"
                    onClick={() => handleNavigate("/students?action=unregistered")}
                    className="group block w-full text-left rounded-lg border border-[#fed7aa] bg-[#fef6ec] px-3 py-2.5 transition hover:bg-[#fff1df] active:scale-[0.98] cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[13.5px] font-bold text-[#e65100]">ยังไม่ลงทะเบียนใบหน้า {pending} คน</p>
                      <span className="text-[13px] font-bold text-[#e65100] transition-transform group-hover:translate-x-0.5">➔</span>
                    </div>
                    <p className="mt-0.5 text-[12px] font-medium text-[#5b6b82]">แตะเพื่อไปยังหน้ารายชื่อนักเรียน</p>
                  </button>
                ) : null}
                {pendingLeaves > 0 ? (
                  <button
                    type="button"
                    onClick={() => handleNavigate("/reports#pending-leaves", "pending-leaves")}
                    className="group block w-full text-left rounded-lg border border-[#bfdbfe] bg-[#e8f1fb] px-3 py-2.5 transition hover:bg-[#dceafa] active:scale-[0.98] cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[13.5px] font-bold text-[#1a5da3]">ใบลารอตรวจ {pendingLeaves} รายการ</p>
                      <span className="text-[13px] font-bold text-[#1a5da3] transition-transform group-hover:translate-x-0.5">➔</span>
                    </div>
                    <p className="mt-0.5 text-[12px] font-medium text-[#5b6b82]">แตะเพื่อตรวจและอนุมัติใบลา</p>
                  </button>
                ) : null}
                {pendingDisputes > 0 ? (
                  <button
                    type="button"
                    onClick={() => handleNavigate("/reports#student-disputes", "student-disputes")}
                    className="group block w-full text-left rounded-lg border border-[#e9d5ff] bg-[#f3e5f5] px-3 py-2.5 transition hover:bg-[#eedaf2] active:scale-[0.98] cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[13.5px] font-bold text-[#6a1b9a]">คำขอแก้ไขข้อมูล {pendingDisputes} รายการ</p>
                      <span className="text-[13px] font-bold text-[#6a1b9a] transition-transform group-hover:translate-x-0.5">➔</span>
                    </div>
                    <p className="mt-0.5 text-[12px] font-medium text-[#5b6b82]">แตะเพื่ออ่านและปิดคำขอจากนักเรียน</p>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={acknowledge}
                  className="mt-1 min-h-10 w-full rounded-md border border-[#d8e0ec] bg-white px-3 py-2 text-[12.5px] font-bold text-[#5b6b82] hover:bg-[#f1f5fa] cursor-pointer"
                >
                  รับทราบรายการแล้ว
                </button>
              </div>
            ) : (
              <p className="px-2 py-3 text-center text-[13.5px] text-[#5b6b82]">
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
