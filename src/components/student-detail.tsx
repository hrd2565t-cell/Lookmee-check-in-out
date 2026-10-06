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
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
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

/* ---------- ประวัติรายคน: การลา + เช็กชื่อ + รูปใบหน้า (ข้อมูลจริงจาก DB) ---------- */
export function StudentDetail({
  code,
  name,
  group,
  onClose,
  onEnroll,
  onFaceDeleted,
}: {
  code: string;
  name: string;
  group: string;
  onClose: () => void;
  onEnroll?: (code: string) => void;
  onFaceDeleted?: (code: string) => void;
}) {
  const [attendance, setAttendance] = useState<AttendanceRow[] | null>(null);
  const [leaves, setLeaves] = useState<LeaveItem[] | null>(null);
  const [facePhoto, setFacePhoto] = useState<string | null | undefined>(undefined);
  const [faceBusy, setFaceBusy] = useState(false);
  const [twinFlag, setTwinFlag] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [a, l] = await Promise.all([fetchStudentAttendance(code), fetchStudentLeaves(code)]);
      if (cancelled) return;
      setAttendance(a ?? []);
      setLeaves(l ?? []);
      if (!isSupabaseConfigured) {
        setFacePhoto(null);
        return;
      }
      const { data } = await supabase
        .from("students")
        .select("photo_url,face_status,twin_flag")
        .eq("student_code", code)
        .single();
      if (cancelled) return;
      const row = data as { photo_url: string | null; face_status: string; twin_flag: boolean | null } | null;
      setFacePhoto(row?.face_status === "registered" ? (row.photo_url ?? null) : null);
      setTwinFlag(row?.twin_flag === true);
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const toggleTwin = async () => {
    const next = !twinFlag;
    setTwinFlag(next);
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from("students")
        .update({ twin_flag: next })
        .eq("student_code", code);
      if (error) setTwinFlag(!next);
    }
  };

  const deleteFace = async () => {
    if (!window.confirm(`ลบข้อมูลใบหน้าของ ${name}? (ต้องลงทะเบียนใหม่ก่อนสแกน)`)) return;
    setFaceBusy(true);
    if (isSupabaseConfigured) {
      await supabase.storage.from("face-photos").remove([`${code}.jpg`]);
      const { error } = await supabase
        .from("students")
        .update({ face_data: null, photo_url: null, face_status: "unregistered" })
        .eq("student_code", code);
      if (error) {
        setFaceBusy(false);
        return;
      }
    }
    setFacePhoto(null);
    setFaceBusy(false);
    onFaceDeleted?.(code);
  };

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
        รูปใบหน้าที่ลงทะเบียน
      </h4>
      <button
        type="button"
        onClick={() => void toggleTwin()}
        aria-pressed={twinFlag}
        title="ปักธงแล้ว scanner จะบังคับยืนยันมือทุกครั้ง (ใช้ได้แม้ยังไม่ลงทะเบียนใบหน้า)"
        className={
          twinFlag
            ? "mb-2 rounded-md bg-[#6a1b9a] px-2.5 py-1 text-[12.5px] font-bold text-white"
            : "mb-2 rounded-md border border-[#d8e0ec] bg-white px-2.5 py-1 text-[12.5px] font-bold text-[#5b6b82] hover:bg-[#f1f5fa]"
        }
      >
        {twinFlag ? "★ ปักธงแฝดแล้ว" : "☆ ปักธงแฝด"}
      </button>
      {facePhoto === undefined ? (
        <p className="py-2 text-center text-[13.5px] text-[#5b6b82]">กำลังโหลด...</p>
      ) : facePhoto ? (
        <div className="flex items-center gap-3 rounded-lg border border-[#e4eaf3] p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={facePhoto}
            alt={`รูปลงทะเบียนของ ${name}`}
            className="h-24 w-20 shrink-0 rounded-md object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-[#1e8e3e]">ลงทะเบียนแล้ว</p>
            <p className="text-[12px] text-[#5b6b82]">เทียบว่าเป็นตัวจริงหรือไม่</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {onEnroll ? (
                <button
                  type="button"
                  onClick={() => onEnroll(code)}
                  className="rounded-md bg-[#2474c6] px-2.5 py-1 text-[12.5px] font-bold text-white hover:bg-[#1a5da3]"
                >
                  ลงทะเบียนใหม่
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void deleteFace()}
                disabled={faceBusy}
                className="rounded-md bg-[#fdecec] px-2.5 py-1 text-[12.5px] font-bold text-[#c62828] hover:brightness-95 disabled:opacity-40"
              >
                {faceBusy ? "กำลังลบ..." : "ลบใบหน้า"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-[#fef6ec] px-3 py-2.5 text-center">
          <p className="text-[13px] font-semibold text-[#e65100]">
            ไม่มีรูปอ้างอิง{isSupabaseConfigured ? " (ลงทะเบียนก่อนระบบเก็บรูป หรือยังไม่ลงทะเบียน)" : ""}
          </p>
          {onEnroll ? (
            <button
              type="button"
              onClick={() => onEnroll(code)}
              className="mt-1.5 rounded-md bg-[#ef8c1a] px-3 py-1.5 text-[12.5px] font-bold text-white hover:brightness-110"
            >
              ลงทะเบียนใบหน้า
            </button>
          ) : null}
        </div>
      )}

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
