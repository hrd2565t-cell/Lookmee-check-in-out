"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui";
import {
  fetchStudentAttendance,
  type AttendanceRow,
} from "@/lib/attendance";
import {
  fetchStudentLeaves,
  LEAVE_TYPE_LABEL,
  type LeaveItem,
} from "@/lib/leaves";
import { cn } from "@/lib/cn";

const STATUS_PILL: Record<string, string> = {
  present: "bg-[#1e8e3e]",
  absent: "bg-[#c62828]",
  late: "bg-[#ef8c1a]",
  activity: "bg-[#00897b]",
  pending: "bg-[#ef8c1a]",
  approved: "bg-[#1e8e3e]",
  rejected: "bg-[#5b6b82]",
};

const STATUS_LABEL: Record<string, string> = {
  present: "มา",
  absent: "ขาด",
  late: "สาย",
  activity: "กิจกรรม",
  pending: "รออนุมัติ",
  approved: "อนุมัติ",
  rejected: "ปฏิเสธ",
};

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

/* ---------- ประวัติรายคน: การลา + เช็กชื่อ (ข้อมูลจริงจาก DB) ---------- */
export function StudentDetail({
  code,
  name,
  group,
  onClose,
}: {
  code: string;
  name: string;
  group: string;
  onClose: () => void;
}) {
  const [attendance, setAttendance] = useState<AttendanceRow[] | null>(null);
  const [leaves, setLeaves] = useState<LeaveItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchStudentAttendance(code), fetchStudentLeaves(code)]).then(
      ([a, l]) => {
        if (!cancelled) {
          setAttendance(a ?? []);
          setLeaves(l ?? []);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [code]);

  const loading = attendance === null || leaves === null;

  return (
    <Modal title="ประวัตินักเรียน" onClose={onClose}>
      <div className="rounded-lg bg-[#f1f5fa] px-3 py-2.5">
        <p className="text-[15px] font-bold text-[#16233a]">{name}</p>
        <p className="text-[13px] text-[#5b6b82]">
          รหัส {code} · กลุ่ม {group}
        </p>
      </div>

      <h4 className="mb-1.5 mt-4 text-[14.5px] font-bold text-[#16233a]">
        ประวัติการลา ({leaves?.length ?? 0})
      </h4>
      {loading ? (
        <p className="py-2 text-center text-[13.5px] text-[#5b6b82]">กำลังโหลด...</p>
      ) : leaves && leaves.length > 0 ? (
        <ul className="divide-y divide-[#eef2f7]">
          {leaves.map((l) => (
            <li key={l.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-[#16233a]">
                  {fmtDate(l.dateFrom)}
                  {l.dateTo !== l.dateFrom ? ` – ${fmtDate(l.dateTo)}` : ""} ·{" "}
                  {LEAVE_TYPE_LABEL[l.type]} · {l.reason}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md px-2 py-0.5 text-[12px] font-bold text-white",
                  STATUS_PILL[l.status],
                )}
              >
                {STATUS_LABEL[l.status]}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-center text-[13.5px] text-[#5b6b82]">
          ไม่มีประวัติการลา
        </p>
      )}

      <h4 className="mb-1.5 mt-4 text-[14.5px] font-bold text-[#16233a]">
        ประวัติเช็กชื่อ ({attendance?.length ?? 0})
      </h4>
      {loading ? (
        <p className="py-2 text-center text-[13.5px] text-[#5b6b82]">กำลังโหลด...</p>
      ) : attendance && attendance.length > 0 ? (
        <ul className="slim-scroll max-h-[220px] divide-y divide-[#eef2f7] overflow-y-auto">
          {attendance.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-[#16233a]">
                  {fmtDate(a.date)} · {a.time} · {a.group}
                  {a.periodNo !== null ? ` · คาบที่ ${a.periodNo}` : ""}
                  {a.confidence !== null ? ` · ${a.confidence}%` : ""}
                </p>
                <p className="text-[12px] text-[#8a97ab]">
                  {a.status === "activity" && a.activityName
                    ? `กิจกรรม: ${a.activityName} · `
                    : ""}
                  {a.method === "manual" ? "ครูยืนยันตัวตน" : a.method === "qr" ? "สแกน QR" : "สแกนใบหน้า"}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md px-2 py-0.5 text-[12px] font-bold text-white",
                  STATUS_PILL[a.status],
                )}
              >
                {STATUS_LABEL[a.status]}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-center text-[13.5px] text-[#5b6b82]">
          ยังไม่มีประวัติเช็กชื่อ — เริ่มสแกนที่หน้า Daily Scanner
        </p>
      )}
    </Modal>
  );
}
