"use client";

import { useEffect, useState } from "react";
import { UIButton } from "@/components/ui";
import { BrandMark } from "@/components/logo";
import {
  fetchStudentAttendance,
  type AttendanceRow,
} from "@/lib/attendance";
import {
  fetchStudentLeaves,
  LEAVE_TYPE_LABEL,
  type LeaveItem,
} from "@/lib/leaves";

export type StudentReportData = {
  code: string;
  name: string;
  group: string;
  number?: string;
};

export type StudentSummaryStats = {
  present: number;
  late: number;
  activity: number;
  absent: number;
  leave: number;
  sickCount: number;
  personalCount: number;
  otherCount: number;
  totalDays: number;
  pct: number;
  passed: boolean;
};

const fmtThaiDate = (isoOrDate: string | Date) => {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) return String(isoOrDate);
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const fmtDateShort = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

export function StudentAttendanceReportModal({
  open,
  onClose,
  student,
  preloadedSummary,
  preloadedAttendance,
  preloadedLeaves,
}: {
  open: boolean;
  onClose: () => void;
  student: StudentReportData | null;
  preloadedSummary?: StudentSummaryStats | null;
  preloadedAttendance?: AttendanceRow[] | null;
  preloadedLeaves?: LeaveItem[] | null;
}) {
  const [fetchedAttendance, setFetchedAttendance] = useState<AttendanceRow[] | null>(null);
  const [fetchedLeaves, setFetchedLeaves] = useState<LeaveItem[] | null>(null);
  const attendance = preloadedAttendance ?? fetchedAttendance;
  const leaves = preloadedLeaves ?? fetchedLeaves;
  const loading = !preloadedAttendance && fetchedAttendance === null;

  useEffect(() => {
    if (!open || !student) return;
    if (preloadedAttendance && preloadedLeaves) return;
    let cancelled = false;
    (async () => {
      const [att, lv] = await Promise.all([
        fetchStudentAttendance(student.code, 150),
        fetchStudentLeaves(student.code),
      ]);
      if (cancelled) return;
      setFetchedAttendance(att || []);
      setFetchedLeaves(lv || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, student, preloadedAttendance, preloadedLeaves]);

  if (!open || !student) return null;

  // คำนวณสรุปสถิติหากไม่มี preloadedSummary
  const summary: StudentSummaryStats = preloadedSummary ?? (() => {
    const att = attendance || [];
    const lv = leaves || [];
    const present = att.filter((a) => a.status === "present").length;
    const late = att.filter((a) => a.status === "late").length;
    const activity = att.filter((a) => a.status === "activity").length;
    const absent = att.filter((a) => a.status === "absent").length;
    const approvedLeaves = lv.filter((l) => l.status === "approved");
    const sickCount = approvedLeaves.filter((l) => l.type === "sick").length;
    const personalCount = approvedLeaves.filter((l) => l.type === "personal").length;
    const otherCount = approvedLeaves.filter((l) => l.type === "other").length;

    let leaveDays = 0;
    for (const l of approvedLeaves) {
      if (l.dateFrom && l.dateTo) {
        const d1 = new Date(l.dateFrom).getTime();
        const d2 = new Date(l.dateTo).getTime();
        const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
        leaveDays += isNaN(diff) || diff < 1 ? 1 : diff;
      } else {
        leaveDays += 1;
      }
    }

    const totalDays = present + late + activity + absent + leaveDays;
    const attended = present + late + activity;
    const pct = totalDays > 0 ? Math.round((attended / totalDays) * 1000) / 10 : 0;
    const passed = totalDays > 0 && pct >= 80;

    return {
      present,
      late,
      activity,
      absent,
      leave: approvedLeaves.length,
      sickCount,
      personalCount,
      otherCount,
      totalDays,
      pct,
      passed,
    };
  })();

  const handlePrint = () => {
    window.print();
  };

  const todayThai = fmtThaiDate(new Date());

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center overflow-y-auto bg-black/60 p-2 sm:p-4 print:p-0 print:bg-white">
      {/* แถบควบคุมด้านบน (ซ่อนตอนพิมพ์จริง) */}
      <div className="no-print mb-3 flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="text-xl">🖨️</span>
          <div>
            <p className="text-[14.5px] font-bold text-[#16233a]">
              ตัวอย่างใบรายงานสรุปเวลาเรียนรายบุคคล (A4)
            </p>
            <p className="text-[12px] text-[#5b6b82]">
              {student.name} ({student.code}) · กลุ่ม {student.group}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <UIButton
            variant="green"
            onClick={handlePrint}
            className="h-10 px-5 text-[14px] font-bold shadow-md hover:brightness-105 active:scale-95"
          >
            <span>🖨️ สั่งพิมพ์เอกสาร / บันทึก PDF</span>
          </UIButton>
          <UIButton
            variant="blue"
            onClick={onClose}
            className="h-10 bg-[#5b6b82] px-4 text-[13.5px] hover:bg-[#465364]"
          >
            ✕ ปิดหน้าต่าง
          </UIButton>
        </div>
      </div>

      {/* แผ่นกระดาษรายงาน A4 เสมือนจริง */}
      <div className="printable-report w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl sm:p-10 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        {/* หัวกระดาษเอกสารทางการ */}
        <div className="border-b-2 border-[#16233a] pb-4 text-center">
          <div className="mb-2 flex items-center justify-center gap-2.5">
            <BrandMark size={44} />
            <div className="text-left">
              <p className="text-[16px] font-black uppercase tracking-wider text-[#16233a]">
                LOOKMEE CHECK IN-OUT
              </p>
              <p className="text-[11px] text-[#5b6b82]">
                ระบบบันทึกเวลาเรียนและการประเมินเวลาเรียน
              </p>
            </div>
          </div>

          <h1 className="text-[20px] font-black tracking-tight text-[#16233a] sm:text-[22px]">
            แบบรายงานสรุปเวลาเรียนและประวัติการเข้าเรียนรายบุคคล
          </h1>
          <p className="mt-1 text-[13px] text-[#5b6b82]">
            ออกเอกสาร ณ วันที่ {todayThai}
          </p>
        </div>

        {/* ข้อมูลประจำตัวนักเรียน */}
        <div className="mt-5 rounded-xl border border-[#d8e0ec] bg-[#f8fafc] p-4 text-[13.5px] print:border-gray-400 print:bg-transparent">
          <div className="grid grid-cols-2 gap-y-2 sm:grid-cols-4">
            <div>
              <span className="text-[#5b6b82]">ชื่อ-นามสกุล: </span>
              <strong className="text-[#16233a]">{student.name}</strong>
            </div>
            <div>
              <span className="text-[#5b6b82]">รหัสประจำตัว: </span>
              <strong className="font-mono text-[#16233a]">{student.code}</strong>
            </div>
            <div>
              <span className="text-[#5b6b82]">ระดับชั้น/กลุ่ม: </span>
              <strong className="text-[#16233a]">{student.group}</strong>
            </div>
            <div>
              <span className="text-[#5b6b82]">เลขที่: </span>
              <strong className="text-[#16233a]">{student.number || "-"}</strong>
            </div>
          </div>
        </div>

        {/* ตารางสรุป 5 สถิติ ขาด ลา มา สาย กิจกรรม */}
        <div className="mt-5">
          <h2 className="text-[14.5px] font-bold text-[#16233a]">
            1. สรุปภาพรวมเวลาเรียนสะสม (Attendance Summary)
          </h2>

          <div className="mt-2.5 grid grid-cols-5 gap-2 text-center text-[13px]">
            {/* มาเรียน */}
            <div className="rounded-xl border border-emerald-300 bg-emerald-50/80 p-3 print:border-gray-400 print:bg-white">
              <p className="font-bold text-emerald-800 print:text-black">มาเรียน</p>
              <p className="my-0.5 text-[26px] font-black text-emerald-600 print:text-black">
                {summary.present}
              </p>
              <p className="text-[11px] text-emerald-700 print:text-gray-600">วัน</p>
            </div>

            {/* มาสาย */}
            <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-3 print:border-gray-400 print:bg-white">
              <p className="font-bold text-amber-800 print:text-black">มาสาย</p>
              <p className="my-0.5 text-[26px] font-black text-amber-600 print:text-black">
                {summary.late}
              </p>
              <p className="text-[11px] text-amber-700 print:text-gray-600">ครั้ง</p>
            </div>

            {/* กิจกรรม */}
            <div className="rounded-xl border border-teal-300 bg-teal-50/80 p-3 print:border-gray-400 print:bg-white">
              <p className="font-bold text-teal-800 print:text-black">กิจกรรม</p>
              <p className="my-0.5 text-[26px] font-black text-teal-700 print:text-black">
                {summary.activity}
              </p>
              <p className="text-[11px] text-teal-600 print:text-gray-600">ครั้ง</p>
            </div>

            {/* ขาดเรียน */}
            <div className="rounded-xl border border-rose-300 bg-rose-50/80 p-3 print:border-gray-400 print:bg-white">
              <p className="font-bold text-rose-700 print:text-black">ขาดเรียน</p>
              <p className="my-0.5 text-[26px] font-black text-rose-600 print:text-black">
                {summary.absent}
              </p>
              <p className="text-[11px] text-rose-600 print:text-gray-600">ครั้ง</p>
            </div>

            {/* ลาเรียน */}
            <div className="rounded-xl border border-sky-300 bg-sky-50/80 p-3 print:border-gray-400 print:bg-white">
              <p className="font-bold text-sky-800 print:text-black">ลาเรียน</p>
              <p className="my-0.5 text-[26px] font-black text-sky-600 print:text-black">
                {summary.leave}
              </p>
              <p className="text-[10px] text-sky-700 print:text-gray-600">
                ป่วย {summary.sickCount} · กิจ {summary.personalCount}
              </p>
            </div>
          </div>

          {/* สรุปร้อยละและเกณฑ์ประเมิน */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d8e0ec] bg-white p-3.5 text-[13px] print:border-gray-400">
            <div>
              <span>รวมวันเรียนที่มีข้อมูล: </span>
              <strong>{summary.totalDays}</strong> วัน ·
              <span> ร้อยละเวลาเรียนสะสม: </span>
              <strong className="text-[15px] font-black text-[#16233a]">{summary.pct}%</strong>
            </div>
            <div className="flex items-center gap-2">
              <span>ผลการประเมินเวลาเรียน:</span>
              <span
                className={`rounded-md px-2.5 py-1 text-[12px] font-bold text-white print:border print:text-black ${
                  summary.passed
                    ? "bg-[#1e8e3e] print:border-black print:bg-gray-100"
                    : "bg-[#c62828] print:border-black print:bg-gray-100"
                }`}
              >
                {summary.passed
                  ? "✓ ผ่านเกณฑ์เวลาเรียน (≥ 80%) มีสิทธิ์สอบ"
                  : "✗ ไม่ผ่านเกณฑ์เวลาเรียน (< 80%) หมดสิทธิ์สอบ"}
              </span>
            </div>
          </div>
        </div>

        {/* ตารางประวัติการเข้าเรียนและการลาย้อนหลัง */}
        <div className="mt-6">
          <h2 className="text-[14.5px] font-bold text-[#16233a]">
            2. ประวัติการเช็กชื่อและการลาย้อนหลัง
          </h2>

          {loading ? (
            <p className="py-6 text-center text-[13px] text-[#5b6b82]">
              กำลังรวบรวมประวัติ...
            </p>
          ) : attendance && attendance.length > 0 ? (
            <div className="mt-2.5 overflow-hidden rounded-xl border border-[#d8e0ec] print:border-gray-400">
              <table className="w-full border-collapse text-left text-[12px] print:text-[11px]">
                <thead className="bg-[#f8fafc] font-bold text-[#16233a] print:bg-gray-100">
                  <tr className="border-b border-[#d8e0ec] print:border-gray-400">
                    <th className="px-3 py-2 text-center w-12">ลำดับ</th>
                    <th className="px-3 py-2">วันที่</th>
                    <th className="px-3 py-2">เวลา</th>
                    <th className="px-3 py-2">กลุ่ม/ห้อง</th>
                    <th className="px-3 py-2 text-center">สถานะ</th>
                    <th className="px-3 py-2">รายละเอียด / หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef2f7] print:divide-gray-300">
                  {attendance.map((a, idx) => (
                    <tr key={a.id} className="hover:bg-[#f8fafc]">
                      <td className="px-3 py-1.5 text-center text-[#5b6b82]">{idx + 1}</td>
                      <td className="px-3 py-1.5 font-medium">{fmtDateShort(a.date)}</td>
                      <td className="px-3 py-1.5">{a.time}</td>
                      <td className="px-3 py-1.5">{a.group}</td>
                      <td className="px-3 py-1.5 text-center">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white print:border print:text-black print:bg-transparent ${
                            a.status === "present"
                              ? "bg-[#1e8e3e]"
                              : a.status === "absent"
                                ? "bg-[#c62828]"
                                : a.status === "late"
                                  ? "bg-[#ef8c1a]"
                                  : "bg-[#00897b]"
                          }`}
                        >
                          {a.status === "present"
                            ? "มาเรียน"
                            : a.status === "absent"
                              ? "ขาดเรียน"
                              : a.status === "late"
                                ? "มาสาย"
                                : "กิจกรรม"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-[#5b6b82]">
                        {a.activityName ? `กิจกรรม: ${a.activityName} · ` : ""}
                        {a.method === "manual"
                          ? "ครูยืนยันตัวตน"
                          : a.method === "qr"
                            ? "สแกน QR"
                            : "สแกนใบหน้า"}
                        {a.periodNo ? ` (คาบ ${a.periodNo})` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 rounded-lg border border-[#eef2f7] p-4 text-center text-[13px] text-[#5b6b82]">
              ยังไม่มีประวัติการเช็กชื่อในระบบ
            </p>
          )}

          {/* ตารางใบลา */}
          {leaves && leaves.length > 0 && (
            <div className="mt-4">
              <h3 className="text-[13.5px] font-bold text-[#16233a]">
                ประวัติการยื่นใบลา ({leaves.length} รายการ)
              </h3>
              <div className="mt-2 overflow-hidden rounded-xl border border-[#d8e0ec] print:border-gray-400">
                <table className="w-full border-collapse text-left text-[12px] print:text-[11px]">
                  <thead className="bg-[#f8fafc] font-bold text-[#16233a] print:bg-gray-100">
                    <tr className="border-b border-[#d8e0ec] print:border-gray-400">
                      <th className="px-3 py-1.5 text-center w-12">ลำดับ</th>
                      <th className="px-3 py-1.5">ช่วงวันที่ลา</th>
                      <th className="px-3 py-1.5">ประเภทการลา</th>
                      <th className="px-3 py-1.5">เหตุผล</th>
                      <th className="px-3 py-1.5 text-center">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eef2f7] print:divide-gray-300">
                    {leaves.map((l, idx) => (
                      <tr key={l.id}>
                        <td className="px-3 py-1.5 text-center text-[#5b6b82]">{idx + 1}</td>
                        <td className="px-3 py-1.5">
                          {fmtDateShort(l.dateFrom)}
                          {l.dateTo !== l.dateFrom ? ` - ${fmtDateShort(l.dateTo)}` : ""}
                        </td>
                        <td className="px-3 py-1.5 font-medium">
                          {LEAVE_TYPE_LABEL[l.type] || l.type}
                        </td>
                        <td className="px-3 py-1.5 text-[#5b6b82]">{l.reason || "-"}</td>
                        <td className="px-3 py-1.5 text-center">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold text-white print:border print:text-black print:bg-transparent ${
                              l.status === "approved"
                                ? "bg-[#1e8e3e]"
                                : l.status === "pending"
                                  ? "bg-[#ef8c1a]"
                                  : "bg-[#5b6b82]"
                            }`}
                          >
                            {l.status === "approved"
                              ? "อนุมัติ"
                              : l.status === "pending"
                                ? "รออนุมัติ"
                                : "ปฏิเสธ"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ลายมือชื่อผู้รับรอง */}
        <div className="mt-12 grid grid-cols-2 gap-8 text-center text-[13px] print:mt-10">
          <div>
            <p className="text-[#5b6b82]">ขอรับรองว่าข้อมูลดังกล่าวถูกต้องตามจริง</p>
            <div className="mx-auto mt-12 w-48 border-b border-black" />
            <p className="mt-2 font-bold text-[#16233a]">
              ( ............................................................ )
            </p>
            <p className="text-[12px] text-[#5b6b82]">ครูผู้สอน / ครูประจำชั้น</p>
            <p className="mt-1 text-[11px] text-[#8a97ab]">วันที่ ...... / ...... / ..........</p>
          </div>

          <div>
            <p className="text-[#5b6b82]">ได้รับทราบข้อมูลเวลาเรียนเรียบร้อยแล้ว</p>
            <div className="mx-auto mt-12 w-48 border-b border-black" />
            <p className="mt-2 font-bold text-[#16233a]">
              ( ............................................................ )
            </p>
            <p className="text-[12px] text-[#5b6b82]">ผู้ปกครองนักเรียน</p>
            <p className="mt-1 text-[11px] text-[#8a97ab]">วันที่ ...... / ...... / ..........</p>
          </div>
        </div>
      </div>
    </div>
  );
}
