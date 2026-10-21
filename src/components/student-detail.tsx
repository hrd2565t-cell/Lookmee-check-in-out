"use client";

import { useEffect, useState } from "react";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { Modal } from "@/components/ui";
import {
  fetchStudentAttendance,
  type AttendanceRow,
  type AttendanceStatus,
  updateAttendanceRecord,
  deleteAttendanceRecord,
} from "@/lib/attendance";
import {
  fetchStudentLeaves,
  LEAVE_TYPE_LABEL,
  type LeaveItem,
  type LeaveType,
  deleteLeave,
  updateLeave,
} from "@/lib/leaves";
import {
  fetchBonusScores,
  saveBonusScore,
  fetchBonusScoreTotal,
  type BonusScoreRow,
} from "@/lib/grading";
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
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
  const [editLeaveFrom, setEditLeaveFrom] = useState("");
  const [editLeaveTo, setEditLeaveTo] = useState("");
  const [editLeaveType, setEditLeaveType] = useState<LeaveType>("sick");
  const [editLeaveReason, setEditLeaveReason] = useState("");
  const [editLeaveBusy, setEditLeaveBusy] = useState(false);
  const [leaveNotice, setLeaveNotice] = useState("");
  const [editRecord, setEditRecord] = useState<AttendanceRow | null>(null);
  const [editStatus, setEditStatus] = useState<AttendanceStatus>("present");
  const [editCheckIn, setEditCheckIn] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [retakes, setRetakes] = useState<Array<{
    id: string;
    assignmentTitle: string;
    maxScore: number;
    attemptNo: number;
    score: number | null;
    submittedAt: string;
    isLatest: boolean;
  }> | null>(null);
  const [bonusScores, setBonusScores] = useState<BonusScoreRow[] | null>(null);
  const [bonusTotal, setBonusTotal] = useState<number | null>(null);
  const [bonusBusy, setBonusBusy] = useState(false);
  const [bonusScore, setBonusScore] = useState("");
  const [bonusReason, setBonusReason] = useState("");
  const [bonusNotice, setBonusNotice] = useState("");

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

      // โหลดคะแนนพิเศษ
      const bonus = await fetchBonusScores(code);
      if (!cancelled) setBonusScores(bonus ?? []);
      const total = await fetchBonusScoreTotal(code);
      if (!cancelled) setBonusTotal(total ?? 0);

      // โหลดประวัติสอบซ่อม (submissions ทั้งหมดของนักเรียนคนนี้)
      const { data: studentRow } = await supabase
        .from("students")
        .select("id")
        .eq("student_code", code)
        .single();
      if (cancelled) return;
      if (studentRow) {
        const { data: rData } = await supabase
          .from("submissions")
          .select("id, attempt_no, score, submitted_at, assignment_id, assignments(title, max_score)")
          .eq("student_id", studentRow.id)
          .order("submitted_at", { ascending: true });
        if (!cancelled && rData) {
          const rows = rData as unknown as Array<{
            id: string;
            attempt_no: number;
            score: number | null;
            submitted_at: string;
            assignments: { title: string; max_score: number } | null;
          }>;
          const latestMap = new Map<string, string>();
          for (const r of rows) {
            if (r.assignments) latestMap.set(r.assignments.title, r.id);
          }
          setRetakes(
            rows.map((r) => ({
              id: r.id,
              assignmentTitle: r.assignments?.title ?? "-",
              maxScore: r.assignments?.max_score ?? 0,
              attemptNo: r.attempt_no,
              score: r.score,
              submittedAt: r.submitted_at,
              isLatest: latestMap.get(r.assignments?.title ?? "") === r.id,
            })),
          );
        }
      }
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

  const deleteLeaveItem = async (id: string) => {
    const target = leaves?.find((l) => l.id === id) ?? null;
    if (!target || target.status !== "pending") {
      setLeaveNotice("ลบได้เฉพาะใบลาที่ยังรออนุมัติเท่านั้น");
      return;
    }
    if (!window.confirm("ลบใบลารายการนี้หรือไม่?")) return;
    const ok = await deleteLeave(id);
    if (!ok) {
      setLeaveNotice("ลบใบลาไม่สำเร็จ");
      return;
    }
    setLeaves((rows) => rows?.filter((x) => x.id !== id) ?? []);
    setLeaveNotice("ลบใบลาแล้ว");
  };

  const openEditLeave = (l: LeaveItem) => {
    setEditingLeaveId(l.id);
    setEditLeaveFrom(l.dateFrom);
    setEditLeaveTo(l.dateTo);
    setEditLeaveType(l.type);
    setEditLeaveReason(l.reason);
  };

  const saveEditLeave = async () => {
    if (!editingLeaveId) return;
    setEditLeaveBusy(true);
    const ok = await updateLeave(editingLeaveId, {
      dateFrom: editLeaveFrom,
      dateTo: editLeaveTo,
      type: editLeaveType,
      reason: editLeaveReason,
    });
    setEditLeaveBusy(false);
    if (!ok) {
      setLeaveNotice("แก้ไขใบลาไม่สำเร็จ — ตรวจการเชื่อมต่อ");
      return;
    }
    setLeaves((rows) =>
      rows?.map((x) =>
        x.id === editingLeaveId
          ? {
              ...x,
              dateFrom: editLeaveFrom,
              dateTo: editLeaveTo,
              type: editLeaveType,
              reason: editLeaveReason,
            }
          : x
      ) ?? []
    );
    setEditingLeaveId(null);
    setLeaveNotice("แก้ไขใบลาแล้ว");
  };

  const openEditRecord = (a: AttendanceRow) => {
    setEditRecord(a);
    setEditStatus(a.status);
    setEditCheckIn(a.checkInAt ? a.checkInAt.slice(0, 16) : "");
  };

  const saveEditRecord = async () => {
    if (!editRecord) return;
    setEditSaving(true);
    const ok = await updateAttendanceRecord(editRecord.id, {
      status: editStatus,
      check_in_at: editCheckIn ? editCheckIn + ":00" : null,
    });
    setEditSaving(false);
    if (!ok) {
      setLeaveNotice("แก้ไขเช็คชื่อไม่สำเร็จ");
      return;
    }
    setAttendance((rows) =>
      rows?.map((x) =>
        x.id === editRecord!.id ? { ...x, status: editStatus, checkInAt: editCheckIn ? editCheckIn + ":00" : null } : x
      ) ?? []
    );
    setEditRecord(null);
    setLeaveNotice("แก้ไขเช็คชื่อแล้ว");
    const refreshed = await fetchStudentAttendance(code);
    if (refreshed) setAttendance(refreshed ?? []);
  };

  const deleteRecord = async (recordId: string) => {
    if (!window.confirm("ลบแถวเช็คชื่อนี้หรือไม่?")) return;
    const ok = await deleteAttendanceRecord(recordId);
    if (!ok) {
      setLeaveNotice("ลบแถวเช็คชื่อไม่สำเร็จ");
      return;
    }
    setAttendance((rows) => rows?.filter((x) => x.id !== recordId) ?? []);
    setLeaveNotice("ลบแถวเช็คชื่อแล้ว");
  };

  const addBonusScore = async () => {
    const s = Number(bonusScore);
    if (!Number.isFinite(s) || s < 0) {
      setBonusNotice("กรอกคะแนนเป็นตัวเลข 0 ขึ้นไป");
      return;
    }
    setBonusBusy(true);
    const ok = await saveBonusScore(code, s, bonusReason.trim() || null);
    setBonusBusy(false);
    if (!ok) {
      setBonusNotice("บันทึกคะแนนพิเศษไม่สำเร็จ");
      return;
    }
    setBonusScore("");
    setBonusReason("");
    const bonus = await fetchBonusScores(code);
    setBonusScores(bonus ?? []);
    const total = await fetchBonusScoreTotal(code);
    setBonusTotal(total ?? 0);
    setBonusNotice("บันทึกคะแนนพิเศษแล้ว");
  };

  const removeBonusScore = async (id: string) => {
    if (!window.confirm("ลบคะแนนพิเศษรายการนี้หรือไม่?")) return;
    setBonusBusy(true);
    const { error } = await supabase.from("bonus_scores").delete().eq("id", id);
    if (error) {
      setBonusNotice("ลบคะแนนพิเศษไม่สำเร็จ");
      setBonusBusy(false);
      return;
    }
    setBonusBusy(false);
    const bonus = await fetchBonusScores(code);
    setBonusScores(bonus ?? []);
    const total = await fetchBonusScoreTotal(code);
    setBonusTotal(total ?? 0);
    setBonusNotice("ลบคะแนนพิเศษแล้ว");
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

  const loading = attendance === null || leaves === null || retakes === null;

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
              <button
                type="button"
                aria-label={`แก้ไขใบลา ${l.id}`}
                title="แก้ไขวันที่ / ชนิด / เหตุผลใบลา"
                onClick={() => void openEditLeave(l)}
                className="ml-2 rounded p-1 text-[#2474c6] hover:bg-[#e8f1fb]"
              >
                <PencilIcon className="h-4 w-4" />
              </button>
              {l.status === "pending" ? (
                <button
                  type="button"
                  aria-label={`ลบใบลา ${l.id}`}
                  title="ลบรายการใบลา"
                  onClick={() => void deleteLeaveItem(l.id)}
                  className="ml-2 rounded p-1 text-[#c62828] hover:bg-[#fdecec]"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-center text-[#5b6b82]">
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
              <button
                type="button"
                aria-label={`แก้ไขเช็คชื่อ ${a.id}`}
                title="แก้ไขสถานะ / เวลาเช็คชื่อ"
                onClick={() => void openEditRecord(a)}
                className="ml-2 rounded p-1 text-[#2474c6] hover:bg-[#e8f1fb]"
              >
                <PencilIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`ลบเช็คชื่อ ${a.id}`}
                title="ลบแถวเช็คชื่อนี้"
                onClick={() => void deleteRecord(a.id)}
                className="ml-2 rounded p-1 text-[#c62828] hover:bg-[#fdecec]"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-center text-[#5b6b82]">
          ยังไม่มีประวัติเช็กชื่อ — เริ่มสแกนที่หน้า Daily Scanner
        </p>
      )}

      {/* ประวัติสอบซ่อม */}
      <h4 className="mb-1.5 mt-4 text-[14.5px] font-bold text-[#16233a]">
        ประวัติสอบซ่อม ({retakes?.length ?? 0})
      </h4>
      {loading ? (
        <p className="py-2 text-center text-[13.5px] text-[#5b6b82]">กำลังโหลด...</p>
      ) : retakes && retakes.length > 0 ? (
        <div className="slim-scroll max-h-[220px] divide-y divide-[#eef2f7] overflow-y-auto rounded-lg border border-[#eef2f7]">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="bg-[#f8fafc] text-[12px] font-bold text-[#16233a]">
              <tr>
                <th className="px-3 py-1.5">งาน</th>
                <th className="px-3 py-1.5 text-center">ครั้งที่</th>
                <th className="px-3 py-1.5 text-center">คะแนน</th>
                <th className="px-3 py-1.5 text-center">เต็ม</th>
                <th className="px-3 py-1.5">วันที่สอบ</th>
                <th className="px-3 py-1.5 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {retakes.map((r) => (
                <tr key={r.id} className="border-t border-[#eef2f7]">
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.assignmentTitle}</td>
                  <td className="px-3 py-1.5 text-center">{r.attemptNo}</td>
                  <td className="px-3 py-1.5 text-center font-bold">
                    {r.score === null ? "-" : r.score}
                  </td>
                  <td className="px-3 py-1.5 text-center text-[#8a97ab]">{r.maxScore}</td>
                  <td className="px-3 py-1.5 text-[#5b6b82]">
                    {new Date(r.submittedAt).toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span
                      className={cn(
                        "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold",
                        r.isLatest
                          ? "bg-[#e6f4ea] text-[#166c2e]"
                          : "bg-[#f1f5fa] text-[#5b6b82]",
                      )}
                    >
                      {r.isLatest ? "คะแนนปัจจุบัน" : "เก่า"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-2 text-center text-[#5b6b82]">ยังไม่มีประวัติสอบซ่อม</p>
      )}

      {/* คะแนนพิเศษ */}
      <h4 className="mb-1.5 mt-4 text-[14.5px] font-bold text-[#16233a]">
        คะแนนพิเศษ ({bonusScores?.length ?? 0}) <span className="ml-2 text-[12px] font-normal text-[#5b6b82]">รวม {bonusTotal ?? 0} คะแนน</span>
      </h4>
      {loading ? (
        <p className="py-2 text-center text-[13.5px] text-[#5b6b82]">กำลังโหลด...</p>
      ) : bonusScores && bonusScores.length > 0 ? (
        <div className="slim-scroll max-h-[220px] divide-y divide-[#eef2f7] overflow-y-auto rounded-lg border border-[#eef2f7]">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="bg-[#fef6ec] text-[12px] font-bold text-[#e65100]">
              <tr>
                <th className="px-3 py-1.5 text-center">วันที่</th>
                <th className="px-3 py-1.5 text-center">คะแนน</th>
                <th className="px-3 py-1.5">เหตุผล</th>
                <th className="px-3 py-1.5 text-center">ลบ</th>
              </tr>
            </thead>
            <tbody>
              {bonusScores.map((b) => (
                <tr key={b.id} className="border-t border-[#eef2f7]">
                  <td className="px-3 py-1.5 text-[#5b6b82]">
                    {new Date(b.createdAt).toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-3 py-1.5 text-center font-bold text-[#e65100]">{b.score}</td>
                  <td className="px-3 py-1.5">{b.reason ?? "-"}</td>
                  <td className="px-3 py-1.5 text-center">
                    <button
                      type="button"
                      aria-label={`ลบคะแนนพิเศษ ${b.id}`}
                      onClick={() => void removeBonusScore(b.id)}
                      className="rounded p-1 text-[#c62828] hover:bg-[#fdecec]"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-2 text-center text-[#5b6b82]">ยังไม่มีคะแนนพิเศษ</p>
      )}

      {/* ฟอร์มเพิ่มคะแนนพิเศษ */}
      <div className="mt-3 rounded-lg border border-[#eef2f7] p-3">
        <h5 className="mb-2 text-[13px] font-bold text-[#16233a]">เพิ่มคะแนนพิเศษ</h5>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="block text-[13px] font-medium text-[#16233a]">
            คะแนน
            <input
              type="number"
              min="0"
              value={bonusScore}
              onChange={(e) => setBonusScore(e.target.value)}
              className="mt-1 h-10 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[13px] focus:border-[#2474c6] focus:outline-none"
            />
          </label>
          <label className="col-span-2 block text-[13px] font-medium text-[#16233a]">
            เหตุผล
            <input
              type="text"
              value={bonusReason}
              onChange={(e) => setBonusReason(e.target.value)}
              placeholder="เช่น ช่วยงานครู, สอบซ่อมพิเศษ"
              className="mt-1 h-10 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[13px] focus:border-[#2474c6] focus:outline-none"
            />
          </label>
          <div className="col-span-2">
            <button
              type="button"
              onClick={() => void addBonusScore()}
              disabled={bonusBusy}
              className="rounded-md bg-[#1e8e3e] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#1a5da3] disabled:opacity-40"
            >
              {bonusBusy ? "กำลังบันทึก..." : "บันทึกคะแนนพิเศษ"}
            </button>
            {bonusNotice ? (
              <span className="ml-3 text-[12px] font-medium text-[#1e8e3e]">{bonusNotice}</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* แก้ไขใบลา */}
      {editingLeaveId ? (
        <Modal title="แก้ไขใบลา" onClose={() => setEditingLeaveId(null)}>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-1 block text-[13px] font-medium text-[#16233a]">
              ลาตั้งแต่วันที่
              <input
                type="date"
                value={editLeaveFrom}
                onChange={(e) => setEditLeaveFrom(e.target.value)}
                className="mt-1 h-10 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[13px] focus:border-[#2474c6] focus:outline-none"
              />
            </label>
            <label className="col-span-1 block text-[13px] font-medium text-[#16233a]">
              ถึงวันที่
              <input
                type="date"
                value={editLeaveTo}
                onChange={(e) => setEditLeaveTo(e.target.value)}
                className="mt-1 h-10 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[13px] focus:border-[#2474c6] focus:outline-none"
              />
            </label>
            <label className="col-span-1 block text-[13px] font-medium text-[#16233a]">
              ประเภท
              <select
                value={editLeaveType}
                onChange={(e) => setEditLeaveType(e.target.value as LeaveType)}
                className="mt-1 h-10 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[13px] focus:border-[#2474c6] focus:outline-none"
              >
                <option value="sick">ลาป่วย</option>
                <option value="personal">ลากิจ</option>
                <option value="other">ลาอื่นๆ</option>
              </select>
            </label>
            <label className="col-span-2 block text-[13px] font-medium text-[#16233a]">
              เหตุผล
              <input
                value={editLeaveReason}
                onChange={(e) => setEditLeaveReason(e.target.value)}
                placeholder="เช่น ป่วยเป็นไข้"
                className="mt-1 h-10 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[13px] focus:border-[#2474c6] focus:outline-none"
              />
            </label>
          </div>
          {leaveNotice ? (
            <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-[12.5px] font-medium text-[#1a5da3]">
              {leaveNotice}
            </p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingLeaveId(null)}
              className="rounded-md bg-[#f1f5fa] px-3 py-1.5 text-[12.5px] font-semibold text-[#5b6b82] hover:bg-[#e4eaf3]"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => void saveEditLeave()}
              disabled={editLeaveBusy}
              className="rounded-md bg-[#2474c6] px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-[#1a5da3] disabled:opacity-40"
            >
              {editLeaveBusy ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </Modal>
      ) : null}

      {/* แก้ไขเช็คชื่อ */}
      {editRecord ? (
        <Modal title="แก้ไขเช็คชื่อ" onClose={() => setEditRecord(null)}>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-1 block text-[13px] font-medium text-[#16233a]">
              นักเรียน
              <span className="mt-1 block text-[13px]">{name}</span>
            </label>
            <label className="col-span-1 block text-[13px] font-medium text-[#16233a]">
              วันที่
              <span className="mt-1 block text-[13px]">{editRecord.date}</span>
            </label>
            <label className="col-span-1 block text-[13px] font-medium text-[#16233a]">
              สถานะ
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as AttendanceStatus)}
                className="mt-1 h-10 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[13px] focus:border-[#2474c6] focus:outline-none"
              >
                <option value="present">มาเรียน</option>
                <option value="late">มาสาย</option>
                <option value="absent">ขาดเรียน</option>
                <option value="activity">กิจกรรม</option>
              </select>
            </label>
            <label className="col-span-1 block text-[13px] font-medium text-[#16233a]">
              เวลาเช็คชื่อ
              <input
                type="datetime-local"
                value={editCheckIn}
                onChange={(e) => setEditCheckIn(e.target.value)}
                className="mt-1 h-10 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[13px] focus:border-[#2474c6] focus:outline-none"
              />
            </label>
          </div>
          {editSaving ? (
            <p className="mt-2 text-center text-[13px] text-[#5b6b82]">กำลังบันทึก...</p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditRecord(null)}
              className="rounded-md bg-[#f1f5fa] px-3 py-1.5 text-[12.5px] font-semibold text-[#5b6b82] hover:bg-[#e4eaf3]"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => void saveEditRecord()}
              disabled={editSaving}
              className="rounded-md bg-[#2474c6] px-3 py-1.5 text-[12.5px] font-bold text-white hover:bg-[#1a5da3] disabled:opacity-40"
            >
              บันทึก
            </button>
          </div>
        </Modal>
      ) : null}
    </Modal>
  );
}
