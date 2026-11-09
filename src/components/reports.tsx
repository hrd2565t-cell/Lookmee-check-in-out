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
  PencilIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/icons";
import { Avatar, Card, CardTitle, DonutChart, Modal, UIButton } from "@/components/ui";
import { StudentDetail } from "@/components/student-detail";
import { StudentAttendanceReportModal, type StudentReportData } from "@/components/student-attendance-report-modal";
import { FaceEnrollModal } from "@/components/face-enroll";
import type { Student } from "@/data/students";
import {
  PAGE_SIZE,
  type ReportRow,
} from "@/data/reports";
  import {
    isCombinedM1,
    M1_SUBGROUPS,
    calculateAffectiveScore,
    checkIn,
    bulkMarkStatus,
    ensureSession,
    fetchGroupRangeSummary,
    fetchStudentAttendance,
    fetchRecordsByDate,
    fetchSessionsByDate,
    fillAbsentForLeave,
    markActivity,
    todayStr as dbToday,
    type DayRecord,
    type RangeSummaryRow,
    type SessionInfo,
    type AttendanceStatus,
    updateAttendanceRecord,
    deleteAttendanceRecord,
  } from "@/lib/attendance";
import { downloadCsv } from "@/lib/export";
import { useRoster } from "@/lib/school-data";
import { useTeacherGroup } from "@/lib/teacher-scope";
import {
  createLeave,
  decideLeave,
  deleteLeave,
  fetchPendingLeaves,
  fetchStudentLeaves,
  LEAVE_TYPE_LABEL,
  type LeaveItem,
  type LeaveType,
  updateLeave,
} from "@/lib/leaves";
import { cn } from "@/lib/cn";
import { fetchPendingDisputes, resolveDispute, type StudentDispute } from "@/lib/disputes";
import { playSuccessChime } from "@/lib/sound";

/* ---------- CSV export (เปิดใน Excel ได้, รองรับภาษาไทย) ---------- */
function downloadReportsCsv(filename: string, rows: ReportRow[]) {
  downloadCsv(
    filename,
    ["เลขที่", "ชื่อ-นามสกุล", "รหัสประจำตัว", "กลุ่ม", "เวลา", "สถานะ", "วิธีเช็กชื่อ"],
    rows.map((r) => [
      r.number ?? "-",
      r.name,
      r.id,
      r.group,
      r.time,
      STATUS_LABEL[r.status],
      r.method === "manual" ? "ครูยืนยัน" : "สแกนใบหน้า",
    ]),
  );
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
  return (
    <DonutChart pct={pct} size={48} track="rgba(255,255,255,0.35)" bar="#fff">
      <span className="h-[15px] w-[15px] rounded-full bg-white/90" />
    </DonutChart>
  );
}

function SummaryBox({
  label,
  value,
  pct,
  className,
  active,
  onClick,
  onOpenModal,
}: {
  label: string;
  value: string;
  pct: number;
  className: string;
  active?: boolean;
  onClick?: () => void;
  onOpenModal?: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "group flex w-full cursor-pointer flex-col justify-between rounded-xl p-3.5 text-left text-white shadow-xs transition-all duration-150 hover:brightness-105 active:scale-[0.98]",
        className,
        active
          ? "ring-4 ring-[#16233a] ring-offset-2 ring-offset-white brightness-105 scale-[1.02]"
          : "opacity-95 hover:opacity-100",
      )}
      title={`คลิกเพื่อดูรายชื่อนักเรียน: ${label} (เปิดป๊อปอัป + กรองตาราง)`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[14px] font-bold">
            <span>{label}</span>
            {active && (
              <span className="rounded bg-white/35 px-1.5 py-0.2 text-[10px] font-bold tracking-tight text-white shadow-xs">
                เลือกอยู่
              </span>
            )}
          </p>
          <p className="mt-1 text-[22px] font-extrabold leading-none">{value}</p>
          <p className="mt-0.5 text-[13px] font-medium opacity-90">({pct}%)</p>
        </div>
        <Donut pct={pct} />
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-white/20 pt-2 text-[11px]">
        <span className="font-semibold underline opacity-90 group-hover:opacity-100">
          {active ? "✕ ล้างตัวกรอง" : "คลิกดูรายชื่อ"}
        </span>
        {onOpenModal && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenModal();
            }}
            className="rounded bg-white/25 px-2 py-0.5 font-bold text-white shadow-2xs backdrop-blur-xs transition hover:bg-white hover:text-[#16233a]"
            title={`เปิดป๊อปอัปดูรายชื่อ ${label}`}
          >
            🔍 ป๊อปอัป
          </button>
        )}
      </div>
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
  const { selectedGroup, setSelectedGroup } = useTeacherGroup(reportGroups);
  const group = selectedGroup || (reportGroups[0] ?? "");
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

  const [m1SubgroupFilter, setM1SubgroupFilter] = useState<string>("all");

  const groupStudents = useMemo(() => {
    if (isCombinedM1(group)) {
      const allM1 = rosterStudents.filter((s) => s.group.startsWith("ม.1/"));
      return m1SubgroupFilter === "all" ? allM1 : allM1.filter((s) => s.group === m1SubgroupFilter);
    }
    return rosterStudents.filter((s) => s.group === group);
  }, [group, rosterStudents, m1SubgroupFilter]);

  const session = daySessions.find((s) =>
    isCombinedM1(group) ? s.group.startsWith("ม.1/") : s.group === group,
  );
  const grec = useMemo(
    () =>
      dayRecords.filter((r) =>
        isCombinedM1(group) ? r.group.startsWith("ม.1/") : r.group === group,
      ),
    [dayRecords, group],
  );

  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | null>(null);
  const [statusModal, setStatusModal] = useState<AttendanceStatus | null>(null);
  const [modalSearch, setModalSearch] = useState("");
  const [modalRoomFilter, setModalRoomFilter] = useState("all");

  const summary = useMemo(() => {
    const recordMap = new Map(grec.map((r) => [r.studentCode, r]));
    let present = 0;
    let late = 0;
    let activity = 0;
    let absent = 0;

    for (const st of groupStudents) {
      const r = recordMap.get(st.code);
      if (!r) {
        absent++;
      } else if (r.status === "present") {
        present++;
      } else if (r.status === "late") {
        late++;
      } else if (r.status === "activity") {
        activity++;
      } else if (r.status === "absent") {
        absent++;
      }
    }

    return {
      present,
      absent,
      late,
      activity,
      total: groupStudents.length,
    };
  }, [grec, groupStudents]);

  /* ---------- สรุปช่วงวันที่ (ทั้งเทอม/เดือน) ---------- */
  const monthStart = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  })();
  const [rangeFrom, setRangeFrom] = useState(monthStart);
  const [rangeTo, setRangeTo] = useState(dbToday());
  const [rangeRows, setRangeRows] = useState<RangeSummaryRow[] | null>(null);
  const [rangeBusy, setRangeBusy] = useState(false);
  const [rangeNotice, setRangeNotice] = useState("");

  /* ---------- สรุปรายบุคคล (Individual Summary) ---------- */
  const [individualStudentCode, setIndividualStudentCode] = useState<string>("");
  const [printReportStudent, setPrintReportStudent] = useState<StudentReportData | null>(null);
  const [individualStats, setIndividualStats] = useState<{
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
  } | null>(null);
  const individualLoading = Boolean(individualStudentCode && !individualStats);

  useEffect(() => {
    if (!individualStudentCode) return;
    let cancelled = false;
    (async () => {
      const [att, lv] = await Promise.all([
        fetchStudentAttendance(individualStudentCode, 100),
        fetchStudentLeaves(individualStudentCode),
      ]);
      if (cancelled) return;
      const present = (att || []).filter((a) => a.status === "present").length;
      const late = (att || []).filter((a) => a.status === "late").length;
      const activity = (att || []).filter((a) => a.status === "activity").length;
      const absent = (att || []).filter((a) => a.status === "absent").length;
      const approvedLeaves = (lv || []).filter((l) => l.status === "approved");
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
      setIndividualStats({
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
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [individualStudentCode]);

  const selectedIndividualStudent = useMemo(() => {
    if (!individualStudentCode) return null;
    return groupStudents.find((s) => s.code === individualStudentCode) ?? null;
  }, [individualStudentCode, groupStudents]);

  const loadRange = async (exportIt: boolean) => {
    if (!group) return;
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) {
      setRangeNotice("ช่วงวันที่ไม่ถูกต้อง");
      return;
    }
    setRangeBusy(true);
    const rows = await fetchGroupRangeSummary(group, rangeFrom, rangeTo);
    setRangeBusy(false);
    if (!rows) {
      setRangeRows(null);
      setRangeNotice("โหลดสรุปไม่สำเร็จ — ตรวจการเชื่อมต่อ");
      return;
    }
    setRangeRows(rows);
    if (!exportIt) {
      setRangeNotice(rows.length ? "" : "ไม่พบข้อมูลในช่วงวันที่นี้");
      return;
    }
    downloadCsv(
      `summary-${group}-${rangeFrom}-${rangeTo}.csv`,
      ["ลำดับ", "รหัสประจำตัว", "เลขที่", "ชื่อ-นามสกุล", "มาเรียน", "มาสาย", "กิจกรรม", "ขาด", "ลาเรียน", "วันที่มีข้อมูล", "% มาเรียน", "คะแนนจิตพิสัย (เต็ม 10)"],
      rows.map((r, i) => {
        const attended = r.present + r.late + r.activity;
        const score = calculateAffectiveScore(group, r.absent);
        return [
          i + 1, r.code, r.number, r.name,
          r.present, r.late, r.activity, r.absent, r.leave ?? 0, r.days,
          r.days ? Math.round((attended / r.days) * 100) : 0,
          score,
        ];
      }),
    );
    setRangeNotice(`ส่งออก ${rows.length} คนแล้ว`);
  };

  const exportSeparatedM1 = () => {
    if (!rangeRows || rangeRows.length === 0) return;
    const meta = new Map(rosterStudents.map((s) => [s.code, s.group]));
    const byRoom = new Map<string, RangeSummaryRow[]>();
    for (const r of rangeRows) {
      const room = meta.get(r.code) || "ม.1";
      if (!byRoom.has(room)) byRoom.set(room, []);
      byRoom.get(room)!.push(r);
    }

    let exportedCount = 0;
    for (const [room, list] of byRoom.entries()) {
      downloadCsv(
        `summary-${room.replace("/", "-")}-${rangeFrom}-${rangeTo}.csv`,
        ["ลำดับ", "รหัสประจำตัว", "เลขที่", "ชื่อ-นามสกุล", "ห้อง", "มาเรียน", "มาสาย", "กิจกรรม", "ขาด", "ลาเรียน", "วันที่มีข้อมูล", "% มาเรียน", "คะแนนจิตพิสัย (เต็ม 10)"],
        list.map((r, i) => {
          const attended = r.present + r.late + r.activity;
          const score = calculateAffectiveScore(room, r.absent);
          return [
            i + 1, r.code, r.number, r.name, room,
            r.present, r.late, r.activity, r.absent, r.leave ?? 0, r.days,
            r.days ? Math.round((attended / r.days) * 100) : 0,
            score,
          ];
        }),
      );
      exportedCount++;
    }
    setRangeNotice(`ส่งออกแยกไฟล์สำเร็จ ${exportedCount} ห้องแล้ว`);
  };

  /* ---------- ใบลา ---------- */
  const [leaves, setLeaves] = useState<LeaveItem[]>([]);
  const [dbLeaves, setDbLeaves] = useState(false);
  const [leaveModal, setLeaveModal] = useState(false);
  const [leaveNotice, setLeaveNotice] = useState("");
  const [studentDisputes, setStudentDisputes] = useState<StudentDispute[] | null>(null);
  const [disputeNotice, setDisputeNotice] = useState("");
  const todayStr = new Date().toISOString().slice(0, 10);
  const [fGroup, setFGroup] = useState("");
  const [fStudent, setFStudent] = useState("");
  const [fFrom, setFFrom] = useState(todayStr);
  const [fTo, setFTo] = useState(todayStr);
  const [fType, setFType] = useState<LeaveType>("sick");
  const [fReason, setFReason] = useState("");
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [enrollCode, setEnrollCode] = useState<string | null>(null);
  /* ---------- แก้ไขเช็คชื่อรายคน ---------- */
  const [editRecord, setEditRecord] = useState<DayRecord | null>(null);
  const [editStatus, setEditStatus] = useState<AttendanceStatus>("present");
  const [editCheckIn, setEditCheckIn] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  /* ---------- แก้ไขใบลาที่ยังรออนุมัติ ---------- */
  const [editLeave, setEditLeave] = useState<LeaveItem | null>(null);
  const [editLeaveFrom, setEditLeaveFrom] = useState("");
  const [editLeaveTo, setEditLeaveTo] = useState("");
  const [editLeaveType, setEditLeaveType] = useState<LeaveType>("sick");
  const [editLeaveReason, setEditLeaveReason] = useState("");
  const [editLeaveSaving, setEditLeaveSaving] = useState(false);
  const reportStudents: Student[] = useMemo(
    () =>
      rosterStudents.map((s) => ({
        id: s.code,
        thaiName: s.name,
        studentId: s.code,
        group: s.group,
        registered: false,
        isRotc: false,
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

  const openEditRecord = (studentCode: string) => {
    const d = grec.find((x) => x.studentCode === studentCode);
    if (d) {
      setEditRecord(d);
      setEditStatus(d.status);
      setEditCheckIn(d.checkInAt ? d.checkInAt.slice(0, 16) : "");
    } else {
      const st = groupStudents.find((s) => s.code === studentCode);
      if (!st) return;
      const fakeRec: DayRecord = {
        id: `new-${studentCode}`,
        studentCode,
        name: st.name,
        group: st.group,
        time: "-",
        checkInAt: null,
        status: "absent",
        method: "manual",
        periodNo: null,
        sessionId: "",
        sessionStatus: "open",
      };
      setEditRecord(fakeRec);
      setEditStatus("present");
      setEditCheckIn(new Date().toISOString().slice(0, 16));
    }
  };

  const saveEditRecord = async () => {
    if (!editRecord) return;
    setEditSaving(true);
    if (editRecord.id.startsWith("new-")) {
      const sessionId = await ensureSession(editRecord.group, date);
      if (!sessionId) {
        setEditSaving(false);
        return;
      }
      if (editStatus === "activity") {
        await markActivity(sessionId, editRecord.studentCode, "กิจกรรมโรงเรียน");
      } else if (editStatus === "absent") {
        await bulkMarkStatus([{ group: editRecord.group, code: editRecord.studentCode }], "absent");
      } else {
        await checkIn(sessionId, editRecord.studentCode, 1.0, {
          status: editStatus,
          method: "manual",
        });
      }
    } else {
      await updateAttendanceRecord(editRecord.id, {
        status: editStatus,
        check_in_at: editCheckIn ? editCheckIn + ":00" : null,
      });
    }
    setEditSaving(false);
    setEditRecord(null);
    setRefreshKey((k) => k + 1);
  };

  const deleteRecord = async (recordId: string) => {
    if (!window.confirm("ลบแถวเช็คชื่อนี้หรือไม่?")) return;
    const ok = await deleteAttendanceRecord(recordId);
    if (!ok) {
      setLeaveNotice("ลบไม่สำเร็จ — ตรวจการเชื่อมต่อ");
      return;
    }
    setRefreshKey((k) => k + 1);
  };

  const openEditLeave = (l: LeaveItem) => {
    setEditLeave(l);
    setEditLeaveFrom(l.dateFrom);
    setEditLeaveTo(l.dateTo);
    setEditLeaveType(l.type);
    setEditLeaveReason(l.reason);
  };

  const saveEditLeave = async () => {
    if (!editLeave) return;
    setEditLeaveSaving(true);
    const ok = await updateLeave(editLeave.id, {
      dateFrom: editLeaveFrom,
      dateTo: editLeaveTo,
      type: editLeaveType,
      reason: editLeaveReason,
    });
    setEditLeaveSaving(false);
    if (!ok) {
      setLeaveNotice("แก้ไขใบลาไม่สำเร็จ");
      return;
    }
    setLeaves((rows) =>
      rows.map((x) =>
        x.id === editLeave!.id
          ? { ...x, dateFrom: editLeaveFrom, dateTo: editLeaveTo, type: editLeaveType, reason: editLeaveReason }
          : x,
      ),
    );
    setEditLeave(null);
    setLeaveNotice("แก้ไขใบลาแล้ว");
  };

  useEffect(() => {
    fetchPendingLeaves().then((rows) => {
      if (rows) {
        setLeaves(rows);
        setDbLeaves(true);
      }
    });
  }, []);

  useEffect(() => {
    fetchPendingDisputes().then((rows) => setStudentDisputes(rows));
  }, []);

  const onDeleteLeave = async (id: string) => {
    const target = visibleLeaves.find((l) => l.id === id) ?? null;
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
    setLeaves((rows) => rows.filter((x) => x.id !== id));
    setLeaveNotice("ลบใบลาแล้ว");
  };

  const onResolveDispute = async (id: string) => {
    const ok = await resolveDispute(id);
    if (!ok) {
      setDisputeNotice("ปิดคำขอไม่สำเร็จ — ลองอีกครั้ง");
      return;
    }
    setStudentDisputes((rows) => rows?.filter((row) => row.id !== id) ?? []);
    setDisputeNotice("รับทราบและปิดคำขอแล้ว");
  };

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
    if (fType === "other" && !fReason.trim()) {
      setLeaveNotice("ลาอื่นๆ กรุณาระบุเหตุผล");
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
    const target = leaves.find((x) => x.id === id) ?? null;
    const ok = await decideLeave(id, status);
    if (!ok) {
      setLeaveNotice("บันทึกผลไม่สำเร็จ");
      return;
    }
    setLeaves((l) => l.filter((x) => x.id !== id));
    // ปฏิเสธ = ปักขาดย้อนหลังเฉพาะวันที่ยังไม่มีแถว (รออนุมัติไม่นับ)
    if (status === "rejected" && target && !target.id.startsWith("local-")) {
      const { filled } = await fillAbsentForLeave(
        target.group,
        target.studentCode,
        target.dateFrom,
        target.dateTo,
      );
      setLeaveNotice(
        filled > 0
          ? `ปฏิเสธใบลาแล้ว — ปักขาดให้ ${filled} วัน`
          : "ปฏิเสธใบลาแล้ว",
      );
      setRefreshKey((k) => k + 1);
    }
  };
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [reportSortBy, setReportSortBy] = useState<"number" | "code" | "name">("number");

  const pct = (n: number) =>
    summary.total > 0 ? Math.round((n / summary.total) * 100) : 0;

  /* ---------- ข้อมูลนักเรียนทั้งหมดพร้อมสถานะของวันนั้น ---------- */
  const allRosterRows = useMemo<ReportRow[]>(() => {
    const recordMap = new Map(grec.map((r) => [r.studentCode, r]));
    return groupStudents.map((st) => {
      const r = recordMap.get(st.code);
      if (r) {
        return {
          id: st.code,
          name: st.name,
          group: st.group,
          number: st.number || "",
          time: r.periodNo !== null ? `${r.time} · คาบ ${r.periodNo}` : r.time,
          status: r.status,
          initials: st.initials,
          color: st.color,
          method: r.method === "manual" ? ("manual" as const) : ("face" as const),
        };
      }
      return {
        id: st.code,
        name: st.name,
        group: st.group,
        number: st.number || "",
        time: "-",
        status: "absent" as AttendanceStatus,
        initials: st.initials,
        color: st.color,
        method: "manual" as const,
      };
    });
  }, [groupStudents, grec]);

  /* ---------- รายชื่อนักเรียนสำหรับตารางหลัก ---------- */
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = allRosterRows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.id.includes(q) ||
        Boolean(row.number && row.number.includes(q))
      );
    });

    return filtered.sort((a, b) => {
      if (reportSortBy === "number") {
        const numA = Number(a.number) || 999;
        const numB = Number(b.number) || 999;
        return numA - numB || a.id.localeCompare(b.id, "th", { numeric: true });
      }
      if (reportSortBy === "name") {
        return a.name.localeCompare(b.name, "th");
      }
      return a.id.localeCompare(b.id, "th", { numeric: true });
    });
  }, [allRosterRows, query, statusFilter, reportSortBy]);

  /* ---------- รายชื่อนักเรียนสำหรับ Quick View Modal ป๊อปอัป ---------- */
  const statusModalRows = useMemo(() => {
    if (!statusModal) return [];
    const q = modalSearch.trim().toLowerCase();
    const filtered = allRosterRows.filter((row) => {
      if (row.status !== statusModal) return false;
      if (modalRoomFilter !== "all" && row.group !== modalRoomFilter) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        row.id.includes(q) ||
        Boolean(row.number && row.number.includes(q))
      );
    });

    return filtered.sort((a, b) => {
      const numA = Number(a.number) || 999;
      const numB = Number(b.number) || 999;
      return numA - numB || a.id.localeCompare(b.id, "th", { numeric: true });
    });
  }, [allRosterRows, statusModal, modalSearch, modalRoomFilter]);

  /* ---------- ฟังก์ชันเปลี่ยนสถานะด่วนในคลิกเดียว (Quick Check-in) ---------- */
  const handleQuickMarkStatus = async (studentCode: string, targetStatus: AttendanceStatus) => {
    const existingRec = grec.find((x) => x.studentCode === studentCode);
    const st = groupStudents.find((s) => s.code === studentCode);
    if (!st) return;

    if (!existingRec) {
      const sessionId = await ensureSession(st.group, date);
      if (!sessionId) return;
      if (targetStatus === "activity") {
        await markActivity(sessionId, studentCode, "กิจกรรมโรงเรียน");
      } else if (targetStatus === "absent") {
        await bulkMarkStatus([{ group: st.group, code: studentCode }], "absent");
      } else {
        await checkIn(sessionId, studentCode, 1.0, {
          status: targetStatus,
          method: "manual",
        });
      }
    } else {
      await updateAttendanceRecord(existingRec.id, {
        status: targetStatus,
        check_in_at: targetStatus === "absent" ? null : (existingRec.checkInAt || new Date().toISOString()),
      });
    }
    try {
      playSuccessChime();
    } catch {
      // ignore
    }
    setRefreshKey((k) => k + 1);
  };

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const recordIdByCode = useMemo(
    () => new Map(grec.map((d) => [d.studentCode, d.id])),
    [grec],
  );

  const applyFilters = () => {
    setQuery(draftQuery);
    setPage(1);
  };

  const pagerBtn =
    "rounded-md p-1.5 text-[#5b6b82] hover:bg-[#eef3f9] disabled:opacity-30 disabled:hover:bg-transparent";
  const visibleLeaves = selectedGroup ? leaves.filter((leave) => leave.group === selectedGroup) : leaves;
  const visibleDisputes = studentDisputes?.filter((request) => !selectedGroup || request.group === selectedGroup) ?? null;

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
                  setSelectedGroup(e.target.value);
                  setM1SubgroupFilter("all");
                  setPage(1);
                  setRangeRows(null);
                  setRangeNotice("");
                  setIndividualStudentCode("");
                  setIndividualStats(null);
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
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <CardTitle>ภาพรวมรายวัน</CardTitle>
              <span className="text-[12.5px] font-medium text-[#5b6b82]">
                💡 คลิกที่การ์ดเพื่อดูรายชื่อนักเรียนกลุ่มนั้น (เปิดป๊อปอัป + กรองตารางทันที)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <SummaryBox
                label="มาเรียน"
                value={`${summary.present}/${summary.total}`}
                pct={pct(summary.present)}
                className="bg-[#1e8e3e]"
                active={statusFilter === "present"}
                onClick={() => {
                  setStatusFilter((prev) => (prev === "present" ? null : "present"));
                  setStatusModal("present");
                  setPage(1);
                  document.getElementById("daily-roster-section")?.scrollIntoView({ behavior: "smooth" });
                }}
                onOpenModal={() => setStatusModal("present")}
              />
              <SummaryBox
                label="ขาดเรียน"
                value={`${summary.absent}/${summary.total}`}
                pct={pct(summary.absent)}
                className="bg-[#c62828]"
                active={statusFilter === "absent"}
                onClick={() => {
                  setStatusFilter((prev) => (prev === "absent" ? null : "absent"));
                  setStatusModal("absent");
                  setPage(1);
                  document.getElementById("daily-roster-section")?.scrollIntoView({ behavior: "smooth" });
                }}
                onOpenModal={() => setStatusModal("absent")}
              />
              <SummaryBox
                label="มาสาย"
                value={`${summary.late}/${summary.total}`}
                pct={pct(summary.late)}
                className="bg-[#ef8c1a]"
                active={statusFilter === "late"}
                onClick={() => {
                  setStatusFilter((prev) => (prev === "late" ? null : "late"));
                  setStatusModal("late");
                  setPage(1);
                  document.getElementById("daily-roster-section")?.scrollIntoView({ behavior: "smooth" });
                }}
                onOpenModal={() => setStatusModal("late")}
              />
              <SummaryBox
                label="กิจกรรม"
                value={`${summary.activity}/${summary.total}`}
                pct={pct(summary.activity)}
                className="bg-[#00897b]"
                active={statusFilter === "activity"}
                onClick={() => {
                  setStatusFilter((prev) => (prev === "activity" ? null : "activity"));
                  setStatusModal("activity");
                  setPage(1);
                  document.getElementById("daily-roster-section")?.scrollIntoView({ behavior: "smooth" });
                }}
                onOpenModal={() => setStatusModal("activity")}
              />
            </div>
          </Card>

          <Card id="daily-roster-section" className="p-4 sm:p-5">
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
                  downloadReportsCsv(`report-${group}-${date}.csv`, rows)
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

            {statusFilter && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#d8e0ec] bg-[#f8fafc] px-3.5 py-2">
                <span className="flex items-center gap-2 text-[13px] font-semibold text-[#16233a]">
                  <span>กำลังกรองแสดงเฉพาะ:</span>
                  <span
                    className={cn(
                      "rounded px-2.5 py-0.5 text-[12px] font-bold text-white",
                      statusFilter === "present" && "bg-[#1e8e3e]",
                      statusFilter === "absent" && "bg-[#c62828]",
                      statusFilter === "late" && "bg-[#ef8c1a]",
                      statusFilter === "activity" && "bg-[#00897b]",
                    )}
                  >
                    {statusFilter === "present"
                      ? "✓ มาเรียน"
                      : statusFilter === "absent"
                        ? "✗ ขาดเรียน"
                        : statusFilter === "late"
                          ? "⏱ มาสาย"
                          : "★ กิจกรรม"}{" "}
                    ({rows.length} คน)
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStatusModal(statusFilter)}
                    className="rounded-md bg-[#16233a] px-2.5 py-1 text-[12px] font-bold text-white shadow-2xs hover:bg-[#20314f]"
                  >
                    👁️ เปิดป๊อปอัปรายชื่อ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter(null);
                      setPage(1);
                    }}
                    className="rounded-md border border-[#d8e0ec] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#5b6b82] shadow-2xs hover:bg-[#eef2f7]"
                  >
                    ✕ แสดงนักเรียนทั้งหมด ({groupStudents.length} คน)
                  </button>
                </div>
              </div>
            )}

            {isCombinedM1(group) && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-[#f8fafc] p-2.5">
                <span className="mr-1 text-[12.5px] font-bold text-[#16233a]">
                  ห้องเรียน:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setM1SubgroupFilter("all");
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[12px] font-bold transition-colors",
                    m1SubgroupFilter === "all"
                      ? "bg-[#16233a] text-white shadow-xs"
                      : "border border-[#d8e0ec] bg-white text-[#5b6b82] hover:bg-[#eef2f7]",
                  )}
                >
                  ทั้งหมด ({rosterStudents.filter((s) => s.group.startsWith("ม.1/")).length} คน)
                </button>
                {M1_SUBGROUPS.map((rm) => {
                  const count = rosterStudents.filter((s) => s.group === rm).length;
                  return (
                    <button
                      key={rm}
                      type="button"
                      onClick={() => {
                        setM1SubgroupFilter(rm);
                        setPage(1);
                      }}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[12px] font-bold transition-colors",
                        m1SubgroupFilter === rm
                          ? "bg-[#2474c6] text-white shadow-xs"
                          : "border border-[#d8e0ec] bg-white text-[#5b6b82] hover:bg-[#eef2f7]",
                      )}
                    >
                      {rm} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#eef2f7] pt-2.5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-[12.5px]">
                  <span className="font-medium text-[#5b6b82]">สถานะ:</span>
                  <div className="inline-flex rounded-md border border-[#d8e0ec] bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter(null);
                        setPage(1);
                      }}
                      className={cn(
                        "rounded px-2 py-0.5 font-bold transition-colors",
                        statusFilter === null
                          ? "bg-[#16233a] text-white"
                          : "text-[#5b6b82] hover:bg-[#f1f5fa]",
                      )}
                    >
                      ทั้งหมด ({groupStudents.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter("present");
                        setPage(1);
                      }}
                      className={cn(
                        "rounded px-2 py-0.5 font-bold transition-colors",
                        statusFilter === "present"
                          ? "bg-[#1e8e3e] text-white"
                          : "text-[#1e8e3e] hover:bg-[#e3f2e6]",
                      )}
                    >
                      มาเรียน ({summary.present})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter("absent");
                        setPage(1);
                      }}
                      className={cn(
                        "rounded px-2 py-0.5 font-bold transition-colors",
                        statusFilter === "absent"
                          ? "bg-[#c62828] text-white"
                          : "text-[#c62828] hover:bg-[#fdecec]",
                      )}
                    >
                      ขาดเรียน ({summary.absent})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter("late");
                        setPage(1);
                      }}
                      className={cn(
                        "rounded px-2 py-0.5 font-bold transition-colors",
                        statusFilter === "late"
                          ? "bg-[#ef8c1a] text-white"
                          : "text-[#ef8c1a] hover:bg-[#fef6ec]",
                      )}
                    >
                      สาย ({summary.late})
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[12.5px]">
                  <span className="font-medium text-[#5b6b82]">เรียงตาม:</span>
                  <div className="inline-flex rounded-md border border-[#d8e0ec] bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setReportSortBy("number");
                        setPage(1);
                      }}
                      className={cn(
                        "rounded px-2 py-0.5 font-bold transition-colors",
                        reportSortBy === "number"
                          ? "bg-[#16233a] text-white"
                          : "text-[#5b6b82] hover:bg-[#f1f5fa]",
                      )}
                    >
                      เลขที่
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReportSortBy("code");
                        setPage(1);
                      }}
                      className={cn(
                        "rounded px-2 py-0.5 font-bold transition-colors",
                        reportSortBy === "code"
                          ? "bg-[#16233a] text-white"
                          : "text-[#5b6b82] hover:bg-[#f1f5fa]",
                      )}
                    >
                      รหัส
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReportSortBy("name");
                        setPage(1);
                      }}
                      className={cn(
                        "rounded px-2 py-0.5 font-bold transition-colors",
                        reportSortBy === "name"
                          ? "bg-[#16233a] text-white"
                          : "text-[#5b6b82] hover:bg-[#f1f5fa]",
                      )}
                    >
                      ชื่อ
                    </button>
                  </div>
                </div>
              </div>
              <span className="text-[12.5px] text-[#5b6b82]">
                แสดง {rows.length} คน
              </span>
            </div>

            <div className="slim-scroll -mx-4 mt-2 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="text-[13.5px] font-bold text-[#16233a]">
                    <th className="py-2 pr-3 font-bold">Photo</th>
                    <th className="py-2 pr-3 font-bold">เลขที่</th>
                    <th className="py-2 pr-3 font-bold">ชื่อ-นามสกุล</th>
                    <th className="py-2 pr-3 font-bold">Student ID</th>
                    <th className="py-2 pr-3 font-bold">กลุ่ม</th>
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
                      <td className="whitespace-nowrap py-1.5 pr-3 text-[14px] font-bold text-[#2474c6]">
                        {r.number || "-"}
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
                      <td className="whitespace-nowrap py-1.5 pr-3 font-mono text-[13.5px] text-[#5b6b82]">
                        {r.id}
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
                        {r.status === "absent" && (
                          <button
                            type="button"
                            onClick={() => void handleQuickMarkStatus(r.id, "present")}
                            className="mr-1.5 rounded bg-[#1e8e3e] px-2 py-1 text-[11px] font-bold text-white shadow-2xs transition hover:brightness-110 active:scale-95"
                            title="เช็คชื่อให้นักเรียน (มาเรียน)"
                          >
                            ✓ เช็คชื่อให้
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`แก้ไข ${r.name}`}
                          title="แก้ไขสถานะ / เวลาเช็คชื่อ"
                          onClick={() => void openEditRecord(r.id)}
                          className="rounded p-1.5 text-[#2474c6] hover:bg-[#e8f1fb]"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
    <button
      type="button"
      aria-label={`ลบแถวเช็คชื่อ ${r.name}`}
      title="ลบแถวเช็คชื่อนี้"
      onClick={() => {
        const recordId = recordIdByCode.get(r.id);
        if (recordId) void deleteRecord(recordId);
      }}
      className="rounded p-1.5 text-[#c62828] hover:bg-[#fdecec]"
    >
      <TrashIcon className="h-5 w-5" />
    </button>
                        <button
                          type="button"
                          aria-label={`ดาวน์โหลดรายงาน ${r.name}`}
                          title="ดาวน์โหลดรายคน (CSV)"
                          onClick={() => downloadReportsCsv(`report-${r.id}-${date}.csv`, [r])}
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
                        colSpan={8}
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

          <Card className="p-4 sm:p-5">
            <CardTitle className="mb-0.5">สรุปการมาเรียนช่วงวันที่</CardTitle>
            <p className="mb-2 text-[12.5px] text-[#5b6b82]">
              รวมยอดมา/สาย/กิจกรรม/ขาดรายคนของห้อง {group} — ใช้ส่งฝ่ายวิชาการหรือเก็บเป็นหลักฐาน
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block text-[13.5px] font-medium text-[#16233a]">
                ตั้งแต่วันที่
                <input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  className="mt-1 h-10 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
                />
              </label>
              <label className="block text-[13.5px] font-medium text-[#16233a]">
                ถึงวันที่
                <input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="mt-1 h-10 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
                />
              </label>
              <UIButton variant="blue" onClick={() => void loadRange(false)} disabled={rangeBusy} className="h-10 bg-[#5b6b82] px-3 text-[13.5px] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40 disabled:opacity-40">
                {rangeBusy ? "กำลังโหลด..." : "ดูสรุป"}
              </UIButton>
              <UIButton variant="green" onClick={() => void loadRange(true)} disabled={rangeBusy} className="h-10 px-3 text-[13.5px] disabled:opacity-40">
                ส่งออก (Excel)
              </UIButton>
              {isCombinedM1(group) && rangeRows && rangeRows.length > 0 && (
                <UIButton
                  variant="blue"
                  onClick={exportSeparatedM1}
                  className="h-10 bg-[#16233a] px-3 text-[13.5px] hover:bg-[#20314f]"
                >
                  📥 แยกส่งออกรายห้องจริง (1/1 - 1/11)
                </UIButton>
              )}
            </div>
            {rangeNotice ? (
              <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-[13.5px] font-medium text-[#1a5da3]">
                {rangeNotice}
              </p>
            ) : null}
            {rangeRows && rangeRows.length > 0 ? (
              <div className="slim-scroll mt-2 max-h-64 overflow-auto rounded-lg border border-[#eef2f7]">
                <table className="w-full min-w-[680px] border-collapse text-left text-[13px]">
                  <thead className="sticky top-0 bg-[#f8fafc] text-[12.5px] font-bold text-[#16233a]">
                    <tr>
                      <th className="px-2.5 py-2">ลำดับ</th>
                      <th className="px-2.5 py-2">เลขที่</th>
                      <th className="px-2.5 py-2">รหัส</th>
                      <th className="px-2.5 py-2">ชื่อ-นามสกุล</th>
                      <th className="px-2.5 py-2 text-center text-[#1e8e3e]">มา</th>
                      <th className="px-2.5 py-2 text-center text-[#ef8c1a]">สาย</th>
                      <th className="px-2.5 py-2 text-center text-[#00897b]">กิจกรรม</th>
                      <th className="px-2.5 py-2 text-center text-[#c62828]">ขาด</th>
                      <th className="px-2.5 py-2 text-center text-[#2474c6]">ลา</th>
                      <th className="px-2.5 py-2 text-center">วันที่มีข้อมูล</th>
                      <th className="px-2.5 py-2 text-center">% มาเรียน</th>
                      <th className="px-2.5 py-2 text-center text-[#1a5da3]">จิตพิสัย (10)</th>
                      <th className="px-2.5 py-2 text-center">สรุปรายคน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rangeRows.map((r, i) => {
                      const attended = r.present + r.late + r.activity;
                      const pctAttend = r.days ? Math.round((attended / r.days) * 100) : 0;
                      const score = calculateAffectiveScore(group, r.absent);
                      return (
                        <tr key={r.code} className="border-t border-[#eef2f7] hover:bg-[#f8fafc]">
                          <td className="px-2.5 py-1.5 text-[#5b6b82]">{i + 1}</td>
                          <td className="px-2.5 py-1.5 font-bold text-[#2474c6]">{r.number || "-"}</td>
                          <td className="px-2.5 py-1.5 font-mono">{r.code}</td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 font-medium text-[#16233a]">
                            <button
                              type="button"
                              onClick={() => {
                                setIndividualStudentCode(r.code);
                                setDetailCode(r.code);
                              }}
                              className="text-left font-medium text-[#16233a] hover:text-[#2474c6] hover:underline"
                              title="คลิกเพื่อดูสรุปรายบุคคลฉบับเต็ม"
                            >
                              {r.name}
                            </button>
                          </td>
                          <td className="px-2.5 py-1.5 text-center font-semibold text-[#1e8e3e]">{r.present}</td>
                          <td className="px-2.5 py-1.5 text-center font-semibold text-[#ef8c1a]">{r.late}</td>
                          <td className="px-2.5 py-1.5 text-center font-semibold text-[#00897b]">{r.activity}</td>
                          <td className="px-2.5 py-1.5 text-center font-semibold text-[#c62828]">{r.absent}</td>
                          <td className="px-2.5 py-1.5 text-center font-semibold text-[#2474c6]">{r.leave ?? 0}</td>
                          <td className="px-2.5 py-1.5 text-center text-[#5b6b82]">{r.days}</td>
                          <td className="px-2.5 py-1.5 text-center font-bold text-[#16233a]">{pctAttend}%</td>
                          <td className="px-2.5 py-1.5 text-center font-bold text-[#1a5da3]">{score}/10</td>
                          <td className="px-2.5 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setIndividualStudentCode(r.code);
                                setDetailCode(r.code);
                              }}
                              className="rounded bg-[#e8f1fb] px-2 py-0.5 text-[11.5px] font-bold text-[#1a5da3] hover:bg-[#d0e3f7]"
                            >
                              ดูสรุป
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>

          {/* สรุปการเข้าเรียนรายบุคคล */}
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef2f7] pb-3">
              <div>
                <CardTitle className="mb-0.5">👤 สรุปการเข้าเรียนรายบุคคล (Individual Summary)</CardTitle>
                <p className="text-[12.5px] text-[#5b6b82]">
                  เลือกนักเรียนในกลุ่ม {group} เพื่อดูสรุปยอด ขาด ลา มา สาย กิจกรรม และร้อยละการเข้าเรียนสะสม
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="min-w-[240px] flex-1 text-[13.5px] font-medium text-[#16233a]">
                เลือกนักเรียน:
                <span className="relative mt-1 block">
                  <select
                    value={individualStudentCode}
                    onChange={(e) => {
                      const next = e.target.value;
                      setIndividualStudentCode(next);
                      if (!next) setIndividualStats(null);
                    }}
                    className="h-10 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-9 text-[14px] text-[#16233a] focus:border-[#2474c6] focus:outline-none"
                  >
                    <option value="">-- เลือกนักเรียนที่ต้องการดูสรุป --</option>
                    {groupStudents.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.number ? `เลขที่ ${s.number} - ` : ""}{s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
                </span>
              </label>

              {individualStudentCode && (
                <div className="flex flex-wrap items-end gap-2 pt-2 sm:pt-5">
                  <UIButton
                    variant="green"
                    onClick={() => {
                      const st = selectedIndividualStudent ?? {
                        code: individualStudentCode,
                        name: "",
                        group,
                        number: "",
                      };
                      setPrintReportStudent({
                        code: st.code,
                        name: st.name,
                        group: st.group,
                        number: st.number,
                      });
                    }}
                    className="h-10 px-4 text-[13.5px] font-bold shadow-md hover:brightness-105 active:scale-95"
                  >
                    🖨️ พิมพ์ใบรายงานผล (PDF / A4)
                  </UIButton>
                  <UIButton
                    variant="blue"
                    onClick={() => setDetailCode(individualStudentCode)}
                    className="h-10 bg-[#5b6b82] px-3.5 text-[13.5px] font-semibold hover:bg-[#465364]"
                  >
                    👁️ ดูประวัตินักเรียน
                  </UIButton>
                </div>
              )}
            </div>

            {selectedIndividualStudent ? (
              <div className="mt-4 rounded-xl border border-[#d8e0ec] bg-[#f8fafc] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef2f7] pb-2.5">
                  <div>
                    <span className="text-[15px] font-bold text-[#16233a]">
                      {selectedIndividualStudent.name}
                    </span>
                    <span className="ml-2 text-[13px] text-[#5b6b82]">
                      (รหัส {selectedIndividualStudent.code} {selectedIndividualStudent.number ? `· เลขที่ ${selectedIndividualStudent.number}` : ""} · {selectedIndividualStudent.group})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailCode(selectedIndividualStudent.code)}
                    className="text-[12.5px] font-bold text-[#2474c6] hover:underline"
                  >
                    เปิดรายละเอียดทั้งหมด ➔
                  </button>
                </div>

                {individualLoading ? (
                  <p className="py-6 text-center text-[13.5px] text-[#5b6b82]">กำลังโหลดสรุปรายบุคคล...</p>
                ) : (
                  <>
                    {/* กล่องสรุป 5 ช่อง: ขาด ลา มา สาย กิจกรรม */}
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                      <div className="flex flex-col items-center justify-center rounded-xl border border-rose-200 bg-rose-50/70 p-2.5 text-center">
                        <span className="text-[12px] font-bold text-rose-700">ขาดเรียน</span>
                        <span className="my-0.5 text-[24px] font-black text-rose-600">
                          {individualStats ? individualStats.absent : 0}
                        </span>
                        <span className="text-[11px] font-medium text-rose-600">ครั้ง</span>
                      </div>
                      <div className="flex flex-col items-center justify-center rounded-xl border border-sky-200 bg-sky-50/70 p-2.5 text-center">
                        <span className="text-[12px] font-bold text-sky-800">ลาเรียน</span>
                        <span className="my-0.5 text-[24px] font-black text-sky-600">
                          {individualStats ? individualStats.leave : 0}
                        </span>
                        <span
                          className="text-[10px] text-sky-700"
                          title={`ป่วย ${individualStats?.sickCount ?? 0} / กิจ ${individualStats?.personalCount ?? 0} / อื่นๆ ${individualStats?.otherCount ?? 0}`}
                        >
                          ป่วย {individualStats?.sickCount ?? 0} · กิจ {individualStats?.personalCount ?? 0}
                        </span>
                      </div>
                      <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5 text-center">
                        <span className="text-[12px] font-bold text-emerald-800">มาเรียน</span>
                        <span className="my-0.5 text-[24px] font-black text-emerald-600">
                          {individualStats ? individualStats.present : 0}
                        </span>
                        <span className="text-[11px] font-medium text-emerald-600">วัน</span>
                      </div>
                      <div className="flex flex-col items-center justify-center rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-center">
                        <span className="text-[12px] font-bold text-amber-800">มาสาย</span>
                        <span className="my-0.5 text-[24px] font-black text-amber-600">
                          {individualStats ? individualStats.late : 0}
                        </span>
                        <span className="text-[11px] font-medium text-amber-600">ครั้ง</span>
                      </div>
                      <div className="col-span-2 sm:col-span-1 flex flex-col items-center justify-center rounded-xl border border-teal-200 bg-teal-50/70 p-2.5 text-center">
                        <span className="text-[12px] font-bold text-teal-800">กิจกรรม</span>
                        <span className="my-0.5 text-[24px] font-black text-teal-700">
                          {individualStats ? individualStats.activity : 0}
                        </span>
                        <span className="text-[11px] font-medium text-teal-600">ครั้ง</span>
                      </div>
                    </div>

                    {individualStats && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#eef2f7] pt-2 text-[12px] text-[#5b6b82]">
                        <span>
                          รวมวันที่มีข้อมูล: <strong>{individualStats.totalDays}</strong> วัน · ร้อยละการเข้าเรียน:{" "}
                          <strong className={individualStats.passed ? "text-[#1e8e3e]" : "text-[#c62828]"}>
                            {individualStats.pct}% ({individualStats.passed ? "✓ ผ่านเกณฑ์" : "⚠️ ต่ำกว่าเกณฑ์ 80%"})
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPrintReportStudent({
                              code: selectedIndividualStudent.code,
                              name: selectedIndividualStudent.name,
                              group: selectedIndividualStudent.group,
                              number: selectedIndividualStudent.number,
                            });
                          }}
                          className="inline-flex items-center gap-1 font-bold text-[#1e8e3e] hover:underline"
                        >
                          🖨️ พิมพ์ใบรายงานผลของนักเรียนคนนี้ (A4 / PDF)
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </Card>

          {/* ใบลารออนุมัติ */}
          <Card id="pending-leaves" className="p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <CardTitle className="mr-auto">
                ใบลารออนุมัติ ({visibleLeaves.length})
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
            {visibleLeaves.length === 0 ? (
              <p className="py-4 text-center text-[14px] text-[#5b6b82]">
                ไม่มีใบลารออนุมัติ
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[#eef2f7]">
                {visibleLeaves.map((l) => (
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
                    <button
                      type="button"
                      onClick={() => void openEditLeave(l)}
                      title="แก้ไขวันที่ / ชนิด / เหตุผลใบลา"
                      className="rounded p-1.5 text-[#2474c6] hover:bg-[#e8f1fb]"
                    >
                      <PencilIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`ลบใบลา ${l.id}`}
                      title="ลบรายการใบลา"
                      onClick={() => void onDeleteLeave(l.id)}
                      className={l.status !== "pending" ? "opacity-0 pointer-events-none" : "rounded p-1.5 text-[#c62828] hover:bg-[#fdecec]"}
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card id="student-disputes" className="p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <CardTitle className="mr-auto">
                คำขอแก้ไขข้อมูลจากนักเรียน ({visibleDisputes?.length ?? 0})
              </CardTitle>
            </div>
            {selectedGroup ? <p className="mt-0.5 text-[12px] text-[#5b6b82]">แสดงคำขอของห้อง {selectedGroup}</p> : null}
            {disputeNotice ? (
              <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-[13.5px] font-medium text-[#1a5da3]">
                {disputeNotice}
              </p>
            ) : null}
            {studentDisputes === null ? (
              <p className="py-4 text-center text-[14px] text-[#5b6b82]">กำลังโหลดคำขอ...</p>
            ) : visibleDisputes?.length === 0 ? (
              <p className="py-4 text-center text-[14px] text-[#5b6b82]">ไม่มีคำขอแก้ไขที่รอตรวจ</p>
            ) : (
              <ul className="mt-2 divide-y divide-[#eef2f7]">
                {visibleDisputes?.map((request) => (
                  <li key={request.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold text-[#16233a]">
                        {request.studentName}
                        <span className="ml-2 font-medium text-[#5b6b82]">{request.group} · {request.studentCode}</span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-[13.5px] text-[#5b6b82]">{request.message}</p>
                      <p className="mt-0.5 text-[11.5px] text-[#8a97ab]">
                        {new Date(request.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <UIButton variant="blue" onClick={() => setDetailCode(request.studentCode)} className="h-9 px-3 text-[13px]">
                        ดูประวัติ
                      </UIButton>
                      <UIButton variant="green" onClick={() => void onResolveDispute(request.id)} className="h-9 px-3 text-[13px]">
                        รับทราบ / ปิดคำขอ
                      </UIButton>
                    </div>
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
                <option value="other">ลาอื่นๆ (ระบุเหตุผล)</option>
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
              เหตุผล {fType === "other" ? "(จำเป็น)" : "(ถ้ามี)"}
              <input
                value={fReason}
                onChange={(e) => setFReason(e.target.value)}
                required={fType === "other"}
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

      {/* พิมพ์รายงานสรุปรายบุคคล */}
      <StudentAttendanceReportModal
        open={Boolean(printReportStudent)}
        onClose={() => setPrintReportStudent(null)}
        student={printReportStudent}
        preloadedSummary={printReportStudent?.code === individualStudentCode ? individualStats : null}
      />
      {/* ลงทะเบียนใบหน้า */}
      {enrollCode ? (
        <FaceEnrollModal
          initialCode={enrollCode}
          students={reportStudents}
          onSaved={() => {}}
          onClose={() => setEnrollCode(null)}
        />
      ) : null}
      {/* แก้ไขเช็คชื่อรายคน */}
      {editRecord ? (
        <Modal title="แก้ไขเช็คชื่อ" onClose={() => setEditRecord(null)}>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              นักเรียน
              <span className="mt-1 block text-[14px]">
                {editRecord.name} ({editRecord.studentCode})
              </span>
            </label>
              <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
                กลุ่ม / วันที่
                <span className="mt-1 block text-[14px]">
                  {editRecord.group} · {editRecord.checkInAt ? editRecord.checkInAt.slice(0, 10) : "-"}
                </span>
              </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              สถานะ
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as AttendanceStatus)}
                className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
              >
                <option value="present">มาเรียน</option>
                <option value="late">มาสาย</option>
                <option value="absent">ขาดเรียน</option>
                <option value="activity">กิจกรรม</option>
              </select>
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              เวลาเช็คชื่อ
              <input
                type="datetime-local"
                value={editCheckIn}
                onChange={(e) => setEditCheckIn(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <UIButton
              variant="blue"
              onClick={() => setEditRecord(null)}
              className="h-10 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40"
            >
              ยกเลิก
            </UIButton>
            <UIButton
              variant="green"
              onClick={() => void saveEditRecord()}
              disabled={editSaving}
              className="h-10 disabled:opacity-40"
            >
              บันทึก
            </UIButton>
          </div>
        </Modal>
      ) : null}

      {/* แก้ไขใบลา */}
      {editLeave ? (
        <Modal title="แก้ไขใบลา" onClose={() => setEditLeave(null)}>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              นักเรียน
              <span className="mt-1 block text-[14px]">
                {editLeave.studentName} ({editLeave.studentCode})
              </span>
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              กลุ่ม
              <span className="mt-1 block text-[14px]">{editLeave.group}</span>
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              ลาตั้งแต่วันที่
              <input
                type="date"
                value={editLeaveFrom}
                onChange={(e) => setEditLeaveFrom(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
              />
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              ถึงวันที่
              <input
                type="date"
                value={editLeaveTo}
                onChange={(e) => setEditLeaveTo(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
              />
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              ประเภท
              <select
                value={editLeaveType}
                onChange={(e) => setEditLeaveType(e.target.value as LeaveType)}
                className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
              >
                <option value="sick">ลาป่วย</option>
                <option value="personal">ลากิจ</option>
                <option value="other">ลาอื่นๆ</option>
              </select>
            </label>
            <label className="col-span-2 block text-[14px] font-medium text-[#16233a]">
              เหตุผล
              <input
                value={editLeaveReason}
                onChange={(e) => setEditLeaveReason(e.target.value)}
                placeholder="เช่น ป่วยเป็นไข้"
                className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <UIButton
              variant="blue"
              onClick={() => setEditLeave(null)}
              className="h-10 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40"
            >
              ยกเลิก
            </UIButton>
            <UIButton
              variant="green"
              onClick={() => void saveEditLeave()}
              disabled={editLeaveSaving}
              className="h-10 disabled:opacity-40"
            >
              บันทึก
            </UIButton>
          </div>
        </Modal>
      ) : null}
      {/* Quick View Modal สรุปรายชื่อตามสถานะ */}
      {statusModal && (
        <Modal
          title={`รายชื่อนักเรียน: ${
            statusModal === "present"
              ? "✓ มาเรียน"
              : statusModal === "absent"
                ? "✗ ขาดเรียน"
                : statusModal === "late"
                  ? "⏱ มาสาย"
                  : "★ ร่วมกิจกรรม"
          } (${statusModalRows.length} คน)`}
          maxWidth="max-w-2xl"
          onClose={() => {
            setStatusModal(null);
            setModalSearch("");
            setModalRoomFilter("all");
          }}
        >
          <div className="space-y-3">
            {/* Context Subtitle */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef2f7] pb-2 text-[13px] text-[#5b6b82]">
              <div>
                <span>ประจำวันที่: </span>
                <span className="font-bold text-[#16233a]">{fmtDate(date)}</span>
                <span className="mx-2">·</span>
                <span>กลุ่ม: </span>
                <span className="font-bold text-[#16233a]">{group}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadReportsCsv(
                      `report-${group}-${date}-${statusModal}.csv`,
                      statusModalRows,
                    )
                  }
                  className="rounded-md bg-[#1e8e3e] px-2.5 py-1 text-[12px] font-bold text-white shadow-2xs hover:brightness-110"
                >
                  📥 ส่งออก Excel (${statusModalRows.length})
                </button>
              </div>
            </div>

            {/* Filter controls inside modal */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <input
                  type="text"
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  placeholder="ค้นหาชื่อ, รหัส, เลขที่..."
                  className="h-9 w-full rounded-md border border-[#d8e0ec] bg-white pl-3 pr-8 text-[13.5px] text-[#16233a] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
                />
                {modalSearch && (
                  <button
                    type="button"
                    onClick={() => setModalSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[14px] text-[#8a97ab] hover:text-[#16233a]"
                  >
                    ×
                  </button>
                )}
              </div>

              {isCombinedM1(group) && (
                <select
                  value={modalRoomFilter}
                  onChange={(e) => setModalRoomFilter(e.target.value)}
                  className="h-9 rounded-md border border-[#d8e0ec] bg-white px-2.5 text-[13px] font-medium text-[#16233a] focus:border-[#2474c6] focus:outline-none"
                >
                  <option value="all">ทุกห้อง (1/1 - 1/11)</option>
                  {M1_SUBGROUPS.map((rm) => (
                    <option key={rm} value={rm}>
                      {rm}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Student list */}
            {statusModalRows.length === 0 ? (
              <div className="py-8 text-center text-[14px] text-[#5b6b82]">
                {modalSearch || modalRoomFilter !== "all"
                  ? "ไม่พบนักเรียนตามเงื่อนไขที่ค้นหา"
                  : statusModal === "absent"
                    ? "🎉 ยอดเยี่ยม! ไม่มีนักเรียนขาดเรียนในวันนี้ (มาครบ 100%)"
                    : statusModal === "present"
                      ? "ยังไม่มีนักเรียนที่มาเรียนในกลุ่มนี้"
                      : "ไม่มีข้อมูลนักเรียนในสถานะนี้"}
              </div>
            ) : (
              <div className="slim-scroll max-h-[380px] divide-y divide-[#eef2f7] overflow-y-auto rounded-lg border border-[#eef2f7] bg-white pr-1">
                {statusModalRows.map((r, i) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 transition hover:bg-[#f8fafc]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-center text-[12px] font-semibold text-[#8a97ab]">
                        {i + 1}
                      </span>
                      <Avatar initials={r.initials} color={r.color} size="sm" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-[#f1f5fa] px-1.5 py-0.2 text-[12px] font-bold text-[#2474c6]">
                            เลขที่ {r.number || "-"}
                          </span>
                          <span className="text-[14px] font-bold text-[#16233a]">
                            {r.name}
                          </span>
                        </div>
                        <p className="text-[12.5px] text-[#5b6b82]">
                          รหัส: <span className="font-mono font-medium">{r.id}</span> · {r.group}
                          {r.time !== "-" ? ` · เวลา ${r.time} น.` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {statusModal === "absent" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleQuickMarkStatus(r.id, "present")}
                            className="rounded-md bg-[#1e8e3e] px-2.5 py-1 text-[12px] font-bold text-white shadow-2xs transition hover:brightness-110 active:scale-95"
                            title="เช็คชื่อให้นักเรียนเป็นมาเรียน"
                          >
                            ✓ เช็คชื่อให้ (มา)
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleQuickMarkStatus(r.id, "late")}
                            className="rounded-md bg-[#ef8c1a] px-2 py-1 text-[12px] font-bold text-white shadow-2xs transition hover:brightness-110 active:scale-95"
                            title="เช็คชื่อให้นักเรียนเป็นมาสาย"
                          >
                            ⏱ สาย
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleQuickMarkStatus(r.id, "absent")}
                            className="rounded-md border border-[#fed7d7] bg-[#fff5f5] px-2 py-1 text-[12px] font-bold text-[#c62828] shadow-2xs transition hover:bg-[#fdecec] active:scale-95"
                            title="เปลี่ยนสถานะเป็นขาดเรียน"
                          >
                            ✗ ขาด
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setStatusModal(null);
                              void openEditRecord(r.id);
                            }}
                            className="rounded-md border border-[#d8e0ec] bg-white px-2 py-1 text-[12px] font-semibold text-[#5b6b82] shadow-2xs hover:bg-[#eef2f7]"
                            title="แก้ไขรายละเอียด"
                          >
                            ✏️ แก้ไข
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Modal footer */}
            <div className="flex items-center justify-between border-t border-[#eef2f7] pt-2.5">
              <span className="text-[12.5px] font-medium text-[#5b6b82]">
                รวม ${statusModalRows.length} คน
              </span>
              <button
                type="button"
                onClick={() => {
                  setStatusModal(null);
                  setModalSearch("");
                  setModalRoomFilter("all");
                }}
                className="rounded-md bg-[#16233a] px-4 py-1.5 text-[13px] font-bold text-white shadow-2xs hover:bg-[#20314f]"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
