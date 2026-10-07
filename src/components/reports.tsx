"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout";
import {
  ChevronDownIcon,
  DownloadIcon,
  PageFirstIcon,
  PageLastIcon,
  PageNextIcon,
  PagePrevIcon,
  SearchIcon,
} from "@/components/icons";
import { Avatar, Card, CardTitle, Modal, UIButton } from "@/components/ui";
import { StudentDetail } from "@/components/student-detail";
import { FaceEnrollModal } from "@/components/face-enroll";
import type { Student } from "@/data/students";
import {
  PAGE_SIZE,
  type AttendanceStatus,
  type ReportRow,
} from "@/data/reports";
import {
  fetchRecordsByDate,
  fetchSessionsByDate,
  type DayRecord,
  type SessionInfo,
} from "@/lib/attendance";
import { useRoster } from "@/lib/school-data";
import { ensureSession, markActivity, todayStr as dbToday } from "@/lib/attendance";
import {
  createLeave,
  decideLeave,
  fetchPendingLeaves,
  LEAVE_TYPE_LABEL,
  type LeaveItem,
  type LeaveType,
} from "@/lib/leaves";
import { cn } from "@/lib/cn";

/* ---------- CSV export (เปิดใน Excel ได้, รองรับภาษาไทย) ---------- */
function downloadCsv(filename: string, rows: ReportRow[]) {
  const header = "ชื่อ,รหัสประจำตัว,กลุ่ม,เวลา,สถานะ";
  const body = rows.map((r) =>
    [r.name, r.id, r.group, r.time, STATUS_LABEL[r.status]].join(","),
  );
  const blob = new Blob(["\uFEFF" + [header, ...body].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- status pill ---------- */
const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: "bg-[#1e8e3e]",
  absent: "bg-[#c62828]",
  late: "bg-[#ef8c1a]",
  activity: "bg-[#00897b]",
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  activity: "Activity",
};

function StatusBadge({ status }: { status: AttendanceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-[76px] items-center justify-center rounded-md px-3 text-[13.5px] font-semibold text-white",
        STATUS_STYLE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/* ---------- donut (pure SVG, no asset) ---------- */
function Donut({ pct }: { pct: number }) {
  const r = 15.5;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 40 40" className="h-12 w-12 shrink-0" aria-hidden="true">
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="5"
      />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * c} ${c}`}
        transform="rotate(-90 20 20)"
      />
      <circle cx="20" cy="20" r="7.5" fill="rgba(255,255,255,0.9)" />
    </svg>
  );
}

function SummaryBox({
  label,
  value,
  pct,
  className,
}: {
  label: string;
  value: string;
  pct: number;
  className: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg px-3.5 py-3 text-white",
        className,
      )}
    >
      <div>
        <p className="text-[14px] font-medium">{label}</p>
        <p className="text-[21px] font-bold leading-tight">{value}</p>
        <p className="text-[13.5px] font-medium">({pct}%)</p>
      </div>
      <Donut pct={pct} />
    </div>
  );
}

/* ---------- page ---------- */
export default function ReportsPage() {
  const { groups: rosterGroups, students: rosterStudents } = useRoster();
  const reportGroups = useMemo(
    () => rosterGroups.map((g) => g.name),
    [rosterGroups],
  );
  const [groupSel, setGroupSel] = useState("");
  const group = reportGroups.includes(groupSel) ? groupSel : (reportGroups[0] ?? "");
  const [date, setDate] = useState(dbToday());
  const [daySessions, setDaySessions] = useState<SessionInfo[]>([]);
  const [dayRecords, setDayRecords] = useState<DayRecord[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // โหลดรอบ + ผลจริงของวันที่เลือก
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSessionsByDate(date), fetchRecordsByDate(date)]).then(
      ([s, r]) => {
        if (!cancelled) {
          setDaySessions(s ?? []);
          setDayRecords(r ?? []);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [date, refreshKey]);

  const groupSize = rosterGroups.find((g) => g.name === group)?.count ?? 0;
  const session = daySessions.find((s) => s.group === group);
  const grec = useMemo(
    () => dayRecords.filter((r) => r.group === group),
    [dayRecords, group],
  );

  const summary = useMemo(() => {
    const present = grec.filter((r) => r.status === "present").length;
    const late = grec.filter((r) => r.status === "late").length;
    const activity = grec.filter((r) => r.status === "activity").length;
    const absentRecs = grec.filter((r) => r.status === "absent").length;
    const missing = groupSize - (present + late + activity + absentRecs);
    // ยังไม่ปิดรอบ: คนที่ไม่มีแถว = ยังไม่สแกน (ไม่ใช่ขาด)
    const absent = absentRecs + (session?.status === "completed" ? Math.max(0, missing) : 0);
    return { present, absent, late, activity, total: groupSize };
  }, [grec, groupSize, session]);

  /* ---------- ใบลา ---------- */
  const [leaves, setLeaves] = useState<LeaveItem[]>([]);
  const [dbLeaves, setDbLeaves] = useState(false);
  const [leaveModal, setLeaveModal] = useState(false);
  const [leaveNotice, setLeaveNotice] = useState("");
  const todayStr = new Date().toISOString().slice(0, 10);
  const [fGroup, setFGroup] = useState("");
  const [fStudent, setFStudent] = useState("");
  const [fFrom, setFFrom] = useState(todayStr);
  const [fTo, setFTo] = useState(todayStr);
  const [fType, setFType] = useState<LeaveType>("sick");
  const [fReason, setFReason] = useState("");
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [enrollCode, setEnrollCode] = useState<string | null>(null);
  const reportStudents: Student[] = useMemo(
    () =>
      rosterStudents.map((s) => ({
        id: s.code,
        thaiName: s.name,
        studentId: s.code,
        group: s.group,
        registered: false,
        initials: s.initials,
        color: s.color,
      })),
    [rosterStudents],
  );

  /* ---------- บันทึกกิจกรรม ---------- */
  const [actModal, setActModal] = useState(false);
  const [actGroup, setActGroup] = useState("");
  const [actDate, setActDate] = useState(dbToday());
  const [actName, setActName] = useState("");
  const [actSelected, setActSelected] = useState<Set<string>>(new Set());
  const [actNotice, setActNotice] = useState("");
  const [actSaving, setActSaving] = useState(false);
  const [actBanner, setActBanner] = useState("");

  const openActivityModal = () => {
    const g = group || reportGroups[0] || "";
    setActGroup(g);
    setActDate(dbToday());
    setActName("");
    setActSelected(new Set());
    setActNotice("");
    setActModal(true);
  };

  const toggleActStudent = (code: string) => {
    setActSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleActAll = () => {
    const inGroup = rosterStudents.filter((s) => s.group === actGroup);
    setActSelected((prev) => {
      if (inGroup.every((s) => prev.has(s.code))) return new Set();
      return new Set(inGroup.map((s) => s.code));
    });
  };

  const submitActivity = async () => {
    if (!actName.trim()) {
      setActNotice("กรุณากรอกชื่อกิจกรรม");
      return;
    }
    if (actSelected.size === 0) {
      setActNotice("กรุณาเลือกนักเรียนอย่างน้อย 1 คน");
      return;
    }
    setActSaving(true);
    const sessionId = await ensureSession(actGroup, actDate);
    if (!sessionId) {
      setActNotice("บันทึกไม่ได้ — ต่อ DB ไม่ติด");
      setActSaving(false);
      return;
    }
    let ok = 0;
    for (const code of actSelected) {
      const r = await markActivity(sessionId, code, actName.trim());
      if (r === "saved") ok++;
    }
    setActSaving(false);
    setActModal(false);
    setActBanner(`บันทึกกิจกรรม “${actName.trim()}” ให้ ${ok} คนแล้ว (${actGroup} ${actDate})`);
    setRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    fetchPendingLeaves().then((rows) => {
      if (rows) {
        setLeaves(rows);
        setDbLeaves(true);
      }
    });
  }, []);

  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  const openLeaveModal = () => {
    const g = group || reportGroups[0] || "";
    const first = rosterStudents.find((s) => s.group === g);
    setFGroup(g);
    setFStudent(first?.code ?? "");
    setFFrom(todayStr);
    setFTo(todayStr);
    setFType("sick");
    setFReason("");
    setLeaveNotice("");
    setLeaveModal(true);
  };

  const submitLeave = async () => {
    const st = rosterStudents.find((s) => s.code === fStudent);
    if (!st) {
      setLeaveNotice("กรุณาเลือกนักเรียน");
      return;
    }
    if (!fFrom || !fTo || fFrom > fTo) {
      setLeaveNotice("ช่วงวันที่ไม่ถูกต้อง");
      return;
    }
    const base = {
      studentCode: st.code,
      studentName: st.name,
      group: st.group,
      dateFrom: fFrom,
      dateTo: fTo,
      type: fType,
      reason: fReason.trim() || "-",
      status: "pending" as const,
    };
    if (dbLeaves) {
      const id = await createLeave({
        studentCode: st.code,
        dateFrom: fFrom,
        dateTo: fTo,
        type: fType,
        reason: fReason.trim(),
      });
      if (!id) {
        setLeaveNotice("บันทึกใบลาไม่สำเร็จ — ตรวจสอบการเชื่อมต่อ");
        return;
      }
      setLeaves((l) => [...l, { ...base, id }]);
    } else {
      setLeaves((l) => [...l, { ...base, id: `local-${Date.now()}` }]);
    }
    setLeaveModal(false);
  };

  const onDecide = async (id: string, status: "approved" | "rejected") => {
    const ok = await decideLeave(id, status);
    if (!ok) {
      setLeaveNotice("บันทึกผลไม่สำเร็จ");
      return;
    }
    setLeaves((l) => l.filter((x) => x.id !== id));
  };
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const pct = (n: number) =>
    summary.total > 0 ? Math.round((n / summary.total) * 100) : 0;

  const rows: ReportRow[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const meta = new Map(rosterStudents.map((s) => [s.code, s]));
    return grec
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .map((r) => {
        const st = meta.get(r.studentCode);
        return {
          id: r.studentCode,
          name: r.name,
          group: r.group,
          time: r.periodNo !== null ? `${r.time} · คาบ ${r.periodNo}` : r.time,
          status: r.status,
          initials: st?.initials ?? "?",
          color: st?.color ?? "bg-[#dbe7f5] text-[#1a5da3]",
          method: r.method === "manual" ? ("manual" as const) : ("face" as const),
        };
      });
  }, [grec, query, rosterStudents]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const applyFilters = () => {
    setQuery(draftQuery);
    setPage(1);
  };

  const pagerBtn =
    "rounded-md p-1.5 text-[#5b6b82] hover:bg-[#eef3f9] disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <AppShell
      active="reports"
      title={
        <>
          รายงานการเข้าเรียน (Reports)
          <span className="mt-0.5 block text-[15px] font-medium text-[#16233a]">
            ค้นหาและตรวจสอบข้อมูลกลุ่มและรายบุคคล
          </span>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[290px_1fr]">
        {/* filter card */}
        <Card className="h-fit p-4 sm:p-5">
          <CardTitle className="mb-2.5">กรองข้อมูล</CardTitle>

          <label className="block text-[14px] font-medium text-[#16233a]">
            เลือกกลุ่มเรียน: {group}
            <span className="relative mt-1 block">
              <select
                value={group}
                onChange={(e) => {
                  setGroupSel(e.target.value);
                  setPage(1);
                }}
                className="h-10 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-9 text-[14px] text-[#16233a] focus:border-[#2474c6] focus:outline-none"
              >
                {reportGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
            </span>
          </label>

          <label className="mt-3 block text-[14px] font-medium text-[#16233a]">
            เลือกวันที่:
            <span className="relative mt-1 block">
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setPage(1);
                }}
                className="h-10 w-full rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-3 text-[14px] text-[#16233a] focus:border-[#2474c6] focus:outline-none"
              />
            </span>
          </label>

          <div className="relative mt-3">
            <span className="sr-only">ค้นหาชื่อนักเรียน</span>
            <input
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
              placeholder="ค้นหาชื่อนักเรียน..."
              className="h-10 w-full rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-10 text-[14px] text-[#16233a] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
            />
            <button
              type="button"
              aria-label="ค้นหา"
              onClick={applyFilters}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-[#5b6b82] hover:bg-[#eef3f9]"
            >
              <SearchIcon />
            </button>
          </div>

          <UIButton
            variant="green"
            className="mt-3 h-11 w-full"
            onClick={applyFilters}
          >
            ดูรายงาน
          </UIButton>
        </Card>

        {/* right column */}
        <div className="min-w-0 space-y-3 sm:space-y-4">
          <Card className="p-4 sm:p-5">
            <CardTitle className="mb-2.5">ภาพรวมรายวัน</CardTitle>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <SummaryBox
                label="มาเรียน"
                value={`${summary.present}/${summary.total}`}
                pct={pct(summary.present)}
                className="bg-[#1e8e3e]"
              />
              <SummaryBox
                label="ขาดเรียน"
                value={`${summary.absent}/${summary.total}`}
                pct={pct(summary.absent)}
                className="bg-[#c62828]"
              />
              <SummaryBox
                label="มาสาย"
                value={`${summary.late}/${summary.total}`}
                pct={pct(summary.late)}
                className="bg-[#ef8c1a]"
              />
              <SummaryBox
                label="กิจกรรม"
                value={`${summary.activity}/${summary.total}`}
                pct={pct(summary.activity)}
                className="bg-[#00897b]"
              />
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-[16px] font-bold text-[#16233a]">
                รายชื่อนักเรียน {group} ({fmtDate(date)})
              </h2>              <span className="text-[13.5px] font-medium text-[#5b6b82]">
                ภาพรวมกลุ่ม /
              </span>
              <button
                type="button"
                aria-label="พิมพ์รายงานเป็น PDF"
                title="พิมพ์ / บันทึกเป็น PDF"
                onClick={() => window.print()}
                className="rounded bg-[#c62828] px-1.5 py-0.5 text-[11px] font-bold text-white hover:brightness-110"
              >
                PDF
              </button>
              <button
                type="button"
                aria-label="ดาวน์โหลดรายงานเป็น Excel (CSV)"
                title="ดาวน์โหลดเป็น CSV เปิดใน Excel ได้"
                onClick={() =>
                  downloadCsv(`report-${group}.csv`, rows)
                }
                className="rounded bg-[#1e8e3e] px-1.5 py-0.5 text-[11px] font-bold text-white hover:brightness-110"
              >
                Excel
              </button>
              <button
                type="button"
                onClick={openLeaveModal}
                className="rounded-md bg-[#2474c6] px-2.5 py-1 text-[12.5px] font-semibold text-white hover:bg-[#1a5da3]"
              >
                + ยื่นใบลา
              </button>
              <button
                type="button"
                onClick={openActivityModal}
                className="rounded-md bg-[#00897b] px-2.5 py-1 text-[12.5px] font-semibold text-white hover:brightness-110"
              >
                + บันทึกกิจกรรม
              </button>
            </div>
            {actBanner ? (
              <p role="status" className="mt-2 rounded-lg bg-[#e0f2f1] px-3 py-2 text-[13.5px] font-medium text-[#00695c]">
                {actBanner}
              </p>
            ) : null}

            <div className="slim-scroll -mx-4 mt-1 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className="w-full min-w-[680px] border-collapse text-left">
                <thead>
                  <tr className="text-[13.5px] font-bold text-[#16233a]">
                    <th className="py-2 pr-3 font-bold">Photo</th>
                    <th className="py-2 pr-3 font-bold">ชื่อ</th>
                    <th className="py-2 pr-3 font-bold">Student ID</th>
                    <th className="py-2 pr-3 font-bold">Time</th>
                    <th className="py-2 pr-3 font-bold">Status</th>
                    <th className="py-2 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-[#eef2f7] align-middle"
                    >
                      <td className="py-1.5 pr-3">
                        <Avatar
                          initials={r.initials}
                          color={r.color}
                          size="sm"
                        />
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-[14px] font-medium text-[#16233a]">
                        <button
                          type="button"
                          title="ดูประวัติรายคน"
                          onClick={() => setDetailCode(r.id)}
                          className="hover:text-[#2474c6] hover:underline"
                        >
                          {r.name}
                        </button>
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-[14px] text-[#16233a]">
                        {r.group}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-[14px] text-[#16233a]">
                        {r.time}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3">
                        <StatusBadge status={r.status} />
                        <span className="mt-0.5 block text-[11.5px] text-[#8a97ab]">
                          {r.method === "manual" ? "ครูยืนยัน" : "สแกนใบหน้า"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-1.5 text-right">
                        <button
                          type="button"
                          aria-label={`ดาวน์โหลดรายงาน ${r.name}`}
                          title="ดาวน์โหลดรายคน (CSV)"
                          onClick={() => downloadCsv(`report-${r.id}.csv`, [r])}
                          className="rounded p-1.5 text-[#c62828] hover:bg-[#fdecec]"
                        >
                          <DownloadIcon className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pageRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-8 text-center text-[14px] text-[#5b6b82]"
                      >
                        {session
                          ? "ไม่พบข้อมูลรายงานตามเงื่อนไข"
                          : `ยังไม่มีรอบเช็กชื่อของกลุ่ม ${group} ในวันที่เลือก — เปิดรอบที่หน้า Scanner หรือบันทึกกิจกรรม`}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* pagination */}
            <div className="mt-2 flex items-center gap-1 border-t border-[#eef2f7] pt-2.5 text-[13.5px] text-[#5b6b82]">
              <button
                type="button"
                aria-label="หน้าแรก"
                disabled={safePage <= 1}
                onClick={() => setPage(1)}
                className={pagerBtn}
              >
                <PageFirstIcon />
              </button>
              <button
                type="button"
                aria-label="ก่อนหน้า"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => p - 1)}
                className={pagerBtn}
              >
                <PagePrevIcon />
              </button>
              <span className="mx-auto font-medium text-[#16233a]">
                หน้าที่ {safePage} จาก {totalPages}
              </span>
              <button
                type="button"
                aria-label="ถัดไป"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className={pagerBtn}
              >
                <PageNextIcon />
              </button>
              <button
                type="button"
                aria-label="หน้าสุดท้าย"
                disabled={safePage >= totalPages}
                onClick={() => setPage(totalPages)}
                className={pagerBtn}
              >
                <PageLastIcon />
              </button>
            </div>
          </Card>

          {/* ใบลารออนุมัติ */}
          <Card className="p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <CardTitle className="mr-auto">
                ใบลารออนุมัติ ({leaves.length})
              </CardTitle>
              {dbLeaves ? null : (
                <span className="rounded-full bg-[#f1f5fa] px-2.5 py-1 text-[12px] font-bold text-[#5b6b82]">
                  ● Local
                </span>
              )}
            </div>
            {leaveNotice ? (
              <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-[13.5px] font-medium text-[#1a5da3]">
                {leaveNotice}
              </p>
            ) : null}
            {leaves.length === 0 ? (
              <p className="py-4 text-center text-[14px] text-[#5b6b82]">
                ไม่มีใบลารออนุมัติ
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[#eef2f7]">
                {leaves.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold text-[#16233a]">
                        {l.studentName}
                        <span className="ml-2 font-medium text-[#5b6b82]">{l.group}</span>
                      </p>
                      <p className="mt-0.5 text-[13px] text-[#5b6b82]">
                        {fmtDate(l.dateFrom)}
                        {l.dateTo !== l.dateFrom ? ` – ${fmtDate(l.dateTo)}` : ""} ·{" "}
                        <span className="font-semibold text-[#16233a]">
                          {LEAVE_TYPE_LABEL[l.type]}
                        </span>{" "}
                        · {l.reason}
                      </p>
                    </div>
                    <UIButton
                      variant="green"
                      onClick={() => void onDecide(l.id, "approved")}
                      className="h-9 px-3.5 text-[13.5px]"
                    >
                      อนุมัติ
                    </UIButton>
                    <UIButton
                      variant="blue"
                      onClick={() => void onDecide(l.id, "rejected")}
                      className="h-9 bg-[#5b6b82] px-3.5 text-[13.5px] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40"
                    >
                      ปฏิเสธ
                    </UIButton>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* ฟอร์มบันทึกกิจกรรม */}
      {actModal ? (
        <Modal title="บันทึกกิจกรรม" onClose={() => setActModal(false)}>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              กลุ่ม
              <select
                value={actGroup}
                onChange={(e) => {
                  setActGroup(e.target.value);
                  setActSelected(new Set());
                }}
                className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
              >
                {reportGroups.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              วันที่
              <input
                type="date"
                value={actDate}
                onChange={(e) => setActDate(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
              />
            </label>
            <label className="col-span-2 block text-[14px] font-medium text-[#16233a]">
              ชื่อกิจกรรม
              <input
                value={actName}
                onChange={(e) => setActName(e.target.value)}
                placeholder="เช่น ซ้อมกีฬา, แข่งทักษะวิชาการ"
                className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
              />
            </label>
          </div>
          <div className="mb-1 mt-3 flex items-center justify-between">
            <p className="text-[14px] font-bold text-[#16233a]">
              เลือกนักเรียน ({actSelected.size} คน)
            </p>
            <button
              type="button"
              onClick={toggleActAll}
              className="text-[13px] font-semibold text-[#2474c6] hover:underline"
            >
              เลือกทั้งหมด / ล้าง
            </button>
          </div>
          <ul className="slim-scroll max-h-[220px] divide-y divide-[#eef2f7] overflow-y-auto rounded-lg border border-[#eef2f7] px-3">
            {rosterStudents
              .filter((s) => s.group === actGroup)
              .map((s) => (
                <li key={s.code}>
                  <label className="flex cursor-pointer items-center gap-2.5 py-2">
                    <input
                      type="checkbox"
                      checked={actSelected.has(s.code)}
                      onChange={() => toggleActStudent(s.code)}
                      className="h-4 w-4 accent-[#00897b]"
                    />
                    <span className="text-[14px] text-[#16233a]">
                      {s.name}
                      <span className="ml-2 text-[12.5px] text-[#8a97ab]">{s.code}</span>
                    </span>
                  </label>
                </li>
              ))}
          </ul>
          {actNotice ? (
            <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-[13.5px] font-medium text-[#1a5da3]">
              {actNotice}
            </p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <UIButton
              variant="blue"
              onClick={() => setActModal(false)}
              className="h-10 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40"
            >
              ยกเลิก
            </UIButton>
            <UIButton variant="green" onClick={() => void submitActivity()} disabled={actSaving} className="h-10 disabled:opacity-40">
              {actSaving ? "กำลังบันทึก..." : "บันทึกกิจกรรม"}
            </UIButton>
          </div>
        </Modal>
      ) : null}

      {/* ฟอร์มยื่นใบลา */}
      {leaveModal ? (
        <Modal title="ยื่นใบลา" onClose={() => setLeaveModal(false)}>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              กลุ่ม
              <select
                value={fGroup}
                onChange={(e) => {
                  setFGroup(e.target.value);
                  const first = rosterStudents.find((s) => s.group === e.target.value);
                  setFStudent(first?.code ?? "");
                }}
                className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
              >
                {reportGroups.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              ประเภท
              <select
                value={fType}
                onChange={(e) => setFType(e.target.value as LeaveType)}
                className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
              >
                <option value="sick">ลาป่วย</option>
                <option value="personal">ลากิจ</option>
              </select>
            </label>
            <label className="col-span-2 block text-[14px] font-medium text-[#16233a]">
              นักเรียน
              <select
                value={fStudent}
                onChange={(e) => setFStudent(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
              >
                {rosterStudents
                  .filter((s) => s.group === fGroup)
                  .map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
              </select>
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              ลาตั้งแต่วันที่
              <input
                type="date"
                value={fFrom}
                onChange={(e) => setFFrom(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
              />
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              ถึงวันที่
              <input
                type="date"
                value={fTo}
                onChange={(e) => setFTo(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
              />
            </label>
            <label className="col-span-2 block text-[14px] font-medium text-[#16233a]">
              เหตุผล
              <input
                value={fReason}
                onChange={(e) => setFReason(e.target.value)}
                placeholder="เช่น ป่วยเป็นไข้"
                className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
              />
            </label>
          </div>
          {leaveNotice && leaveModal ? (
            <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-[13.5px] font-medium text-[#1a5da3]">
              {leaveNotice}
            </p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <UIButton
              variant="blue"
              onClick={() => setLeaveModal(false)}
              className="h-10 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40"
            >
              ยกเลิก
            </UIButton>
            <UIButton variant="green" onClick={() => void submitLeave()} className="h-10">
              ยื่นใบลา
            </UIButton>
          </div>
        </Modal>
      ) : null}

      {/* ประวัติรายคน */}
      {(() => {
        const st = rosterStudents.find((s) => s.code === detailCode);
        return st ? (
          <StudentDetail
            code={st.code}
            name={st.name}
            group={st.group}
            onClose={() => setDetailCode(null)}
            onEnroll={(code) => {
              setDetailCode(null);
              setEnrollCode(code);
            }}
          />
        ) : null;
      })()}
      {/* ลงทะเบียนใบหน้า */}
      {enrollCode ? (
        <FaceEnrollModal
          initialCode={enrollCode}
          students={reportStudents}
          onSaved={() => {}}
          onClose={() => setEnrollCode(null)}
        />
      ) : null}
    </AppShell>
  );
}
