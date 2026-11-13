"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout";
import { CameraSwitchIcon, ChevronDownIcon, RefreshIcon, ScanIcon } from "@/components/icons";
import { Avatar, Card, Modal, UIButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  buildCurrentMatch,
  buildRecentByGroup,
  type CurrentMatch,
  type ScanEntry,
} from "@/data/scanner";
import {
  isCombinedM1,
  isWeekend,
  bulkMarkStatus,
  closeSessionFull,
  deleteSessionFull,
  ensureSessionFull,
  fetchRecordsByDate,
  manualCheckIn,
  nowTime,
  todayStr,
  type DayRecord,
  type SessionFull,
} from "@/lib/attendance";
import { SessionQrModal } from "@/components/session-qr-modal";
import { playSuccessChime } from "@/lib/sound";
import {
  flushQueue,
  pendingCount,
  saveCheckin,
  type SaveResult,
} from "@/lib/offline-queue";
import {
  closeCamera,
  descriptorFromVideo,
  ensureFaceModels,
  findTopMatches,
  getCameraErrorMessage,
  isAmbiguous,
  openCamera,
  type CameraFacingMode,
  type EnrolledFace,
} from "@/lib/face";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { useRoster, type RosterStudent } from "@/lib/school-data";
import { useTeacherGroup } from "@/lib/teacher-scope";
import {
  type CheckinHelpRequest,
  fetchPendingHelpRequests,
  teacherApproveCheckinHelp,
  teacherRejectCheckinHelp,
} from "@/lib/student";

/* ---------- Group select (styled native select) ---------- */
function GroupSelect({
  groups,
  value,
  onChange,
}: {
  groups: string[];
  value: string;
  onChange: (g: string) => void;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">เลือกกลุ่มเรียน</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-4 pr-10 text-[15.5px] font-medium text-[#16233a] shadow-[0_1px_2px_rgba(16,24,40,0.05)] focus:border-[#2474c6] focus:outline-none"
      >
        {groups.map((g) => (
          <option key={g} value={g}>
            เลือกกลุ่มเรียน: {g}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
    </label>
  );
}

/* ---------- Face corner bracket ---------- */
function Corner({
  className,
}: {
  className: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`absolute h-9 w-9 border-[#3ecf6f] ${className}`}
    />
  );
}

/* ----------
 * Camera viewport — ภาพกล้องเป็น live feed จึงไม่ตัดเป็น asset;
 * สร้างด้วย CSS + SVG ล้วน (พื้นหลัง, กรอบมุม, badge, แถบชื่อ)
 * ---------- */
function ScannerViewport({
  match,
  videoRef,
  camOn,
  facingMode,
  onToggleCamera,
  onRetryCamera,
  camStatus,
}: {
  match: CurrentMatch;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  camOn: boolean;
  facingMode: CameraFacingMode;
  onToggleCamera: () => void;
  onRetryCamera: () => void;
  camStatus: string;
}) {
  const isFront = facingMode === "user";
  const isCameraError = !camOn && (camStatus.includes("ไม่ได้") || camStatus.includes("ปฏิเสธ") || camStatus.includes("HTTPS"));

  return (
    <div className="relative overflow-hidden rounded-lg bg-[#3a4148]">
      {/* live camera (ทับ placeholder เมื่อกล้องติด) — กล้องหน้ากลับด้านแนวนอน (-scale-x-100) ให้เหมือนกระจกเงา */}
      <video
        ref={videoRef}
        muted
        playsInline
        className={
          camOn
            ? `absolute inset-0 h-full w-full object-cover ${isFront ? "-scale-x-100" : ""}`
            : "hidden"
        }
      />
      {/* simulated camera background (fallback ตอนกล้องไม่ติด หรือเกิดข้อผิดพลาด) */}
      <div
        aria-hidden={!isCameraError}
        className="flex aspect-[16/10] flex-col items-center justify-center bg-gradient-to-b from-[#9aa3ad] via-[#7d868f] to-[#5c646d] p-4 text-center"
      >
        {isCameraError ? (
          <div className="z-10 flex max-w-md flex-col items-center rounded-xl bg-black/75 p-5 text-white shadow-xl backdrop-blur-xs">
            <span className="text-3xl">📷</span>
            <p className="mt-2 text-[14.5px] font-bold text-rose-300">
              {camStatus}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-gray-200">
              💡 <strong>วิธีเปิดสิทธิ์กล้อง:</strong> คลิกไอคอน 🔒 (หรือไอคอนกล้อง 📷) ที่แถบ URL ด้านบนของเบราว์เซอร์ แล้วเลือก <strong>อนุญาต (Allow)</strong> หรือปิดแอปอื่นที่ใช้กล้องอยู่
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={onRetryCamera}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#2474c6] px-4 py-2 text-[13px] font-bold text-white shadow-sm hover:bg-[#1d5ea2] active:scale-95"
              >
                <RefreshIcon className="h-4 w-4" />
                ลองเปิดกล้องใหม่
              </button>
              <button
                type="button"
                onClick={onToggleCamera}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/20 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-white/30 active:scale-95"
              >
                <CameraSwitchIcon className="h-4 w-4" />
                สลับกล้อง ({isFront ? "ลองกล้องหลัง" : "ลองกล้องหน้า"})
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* subject silhouette placeholder */}
            <svg
              viewBox="0 0 120 120"
              className="h-40 w-40 text-white/85 sm:h-48 sm:w-48"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="60" cy="42" r="24" opacity="0.95" />
              <path
                d="M14 118c4-26 24-40 46-40s42 14 46 40z"
                opacity="0.95"
              />
            </svg>
            <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-black/35 px-3 py-1 text-[12.5px] font-medium text-white">
              <ScanIcon className="h-4 w-4" />
              {camStatus || "กำลังสแกน…"}
            </span>
          </>
        )}
      </div>

      {/* Floating Camera Switch Button ในช่องมองกล้อง */}
      <button
        type="button"
        onClick={onToggleCamera}
        title={`คลิกเพื่อสลับเป็น${isFront ? "กล้องหลัง" : "กล้องหน้า"}`}
        className="absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[12px] font-semibold text-white shadow-md backdrop-blur-xs transition hover:bg-black/90 active:scale-95"
      >
        <CameraSwitchIcon className="h-3.5 w-3.5 text-emerald-400" />
        <span>{isFront ? "กล้องหน้า" : "กล้องหลัง"}</span>
        <span className="rounded bg-white/25 px-1.5 py-0.5 text-[10.5px] font-medium text-white/95">สลับ</span>
      </button>

      {/* face frame corners */}
      <Corner className="left-[30%] top-[12%] border-l-4 border-t-4" />
      <Corner className="right-[30%] top-[12%] border-r-4 border-t-4" />
      <Corner className="bottom-[30%] left-[30%] border-b-4 border-l-4" />
      <Corner className="bottom-[30%] right-[30%] border-b-4 border-r-4" />

      {/* confidence badge */}
      <div className="absolute left-1/2 top-[58%] -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2aa84a] px-3 py-1.5 text-center shadow-lg">
        <p className="text-[13px] font-semibold leading-tight text-white">
          ตรวจจับใบหน้า
        </p>
        <p className="text-[12.5px] font-bold leading-tight text-white">
          CONFIDENCE: {match.confidence}%
        </p>
      </div>

      {/* matched name bar */}
      <div className="absolute inset-x-0 bottom-0 bg-black/55 px-4 py-2.5 text-center">
        <p className="text-[16px] font-semibold text-white sm:text-[18px]">
          เทียบชื่อ: {match.thaiName}
        </p>
      </div>
    </div>
  );
}

/* ---------- Match result panel ---------- */
function MatchResult({ match }: { match: CurrentMatch }) {
  return (
    <div className="rounded-b-lg border border-t-0 border-[#e4eaf3] bg-white px-4 py-3 text-center">
      <p className="text-[19px] font-bold tracking-tight text-[#1e8e3e] sm:text-[22px]">
        MATCHED: {match.engName || match.thaiName}
      </p>
      <p className="mt-0.5 text-[14.5px] font-medium text-[#16233a]">
        Status: {match.status} | Time: {match.time}
      </p>
    </div>
  );
}

/* ---------- Recent check-ins side panel ---------- */
function RecentPanel({ group, entries }: { group: string; entries: ScanEntry[] }) {
  return (
    <Card className="flex flex-col p-4">
      <h2 className="text-[16px] font-bold uppercase leading-6 tracking-tight text-[#16233a]">
        Recent Check-ins
        <span className="block text-[14px] font-semibold normal-case text-[#16233a]">
          (Group: {group})
        </span>
      </h2>
      {entries.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-[#5b6b82]">
          ยังไม่มีการเช็กชื่อในกลุ่มนี้
        </p>
      ) : (
        <ul className="slim-scroll -mr-1 mt-1 max-h-[300px] space-y-0.5 overflow-y-auto pr-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2.5 border-b border-[#eef2f7] py-2 last:border-0"
            >
              <Avatar initials={e.initials} color={e.color} size="sm" />
              <div className="min-w-0 leading-snug">
                <p className="truncate text-[14px] font-medium text-[#16233a]">
                  {e.name} - {e.time}
                </p>
                <p className="text-[13px] text-[#5b6b82]">{e.group}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Page ---------- */
export default function ScannerPage() {
  const { groups: rosterGroups, students } = useRoster();
  const groups = useMemo(() => rosterGroups.map((g) => g.name), [rosterGroups]);
  const recentByGroup = useMemo(
    () => buildRecentByGroup(rosterGroups, students),
    [rosterGroups, students],
  );
  const matchFallback = useMemo(() => buildCurrentMatch(students), [students]);
  const [override, setOverride] = useState<CurrentMatch | null>(null);
  const match = override ?? matchFallback;
  const { selectedGroup, setSelectedGroup } = useTeacherGroup(groups);
  const activeGroup = selectedGroup || (groups[0] ?? "");
  const [notice, setNotice] = useState("");
  const [round, setRound] = useState<SessionFull | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [cameraPaused, setCameraPaused] = useState(false);
  const qrModalOpenRef = useRef(false);
  qrModalOpenRef.current = qrModalOpen;
  const cameraPausedRef = useRef(false);
  cameraPausedRef.current = cameraPaused;

  useEffect(() => {
    const url = new URL(window.location.href);
    const requestedGroup = url.searchParams.get("group");
    if (!requestedGroup || !groups.includes(requestedGroup)) return;
    setSelectedGroup(requestedGroup);
    window.history.replaceState(null, "", url.pathname);
  }, [groups, setSelectedGroup]);

  // โหลดสถานะรอบวันนี้ของกลุ่มที่เลือก
  useEffect(() => {
    if (!activeGroup) return;
    let cancelled = false;
    (async () => {
      let query = supabase
        .from("attendance_sessions")
        .select("id,pin,status,class_groups!inner(name)")
        .eq("session_date", todayStr());
      if (isCombinedM1(activeGroup)) {
        query = query.eq("class_groups.name", "ม.1/1");
      } else {
        query = query.eq("class_groups.name", activeGroup);
      }
      const { data } = await query.maybeSingle();
      if (!cancelled && data) {
        const r = data as unknown as { id: string; pin: string | null; status: string };
        setRound({ id: r.id, pin: r.pin, status: r.status });
      } else if (!cancelled) {
        setRound(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeGroup]);

  const openRound = async () => {
    const today = todayStr();
    if (isWeekend(today)) {
      setNotice("⚠️ วันนี้เป็นวันหยุดสุดสัปดาห์ (เสาร์/อาทิตย์) ไม่มีการเรียนการสอน จึงไม่สามารถเปิดรอบเช็คชื่อได้");
      return;
    }
    setNotice("กำลังเปิดรอบ...");
    const s = await ensureSessionFull(activeGroup, today);
    if (!s) {
      setNotice("เปิดรอบไม่ได้ — ต่อ DB ไม่ติด หรือเป็นวันหยุด");
      return;
    }
    setRound(s);
    setNotice(
      isCombinedM1(activeGroup)
        ? `เปิดรอบกลุ่มรวม ม.1 แล้ว — แจ้งรหัส PIN ${s.pin} ให้นักเรียน ม.1 ทุกห้อง (1/1 - 1/11) ใช้รหัสนี้ร่วมกันได้เลย`
        : `เปิดรอบ ${activeGroup} แล้ว — แจ้งรหัส ${s.pin} ให้นักเรียน`,
    );
  };

  const closeRound = async () => {
    if (!round) return;
    if (!window.confirm(`ปิดรอบ ${activeGroup} วันนี้? (บันทึกเพิ่มไม่ได้แล้ว)`)) return;
    const ok = await closeSessionFull(activeGroup, todayStr(), round.id);
    if (!ok) {
      setNotice("ปิดรอบไม่สำเร็จ — ลองอีกครั้ง");
      return;
    }
    setRound({ ...round, status: "completed" });
    setNotice(`ปิดรอบ ${activeGroup} แล้ว`);
  };

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const handleDeleteRound = async () => {
    setDeleteBusy(true);
    const res = await deleteSessionFull(activeGroup, todayStr(), round?.id);
    setDeleteBusy(false);
    if (!res.success) {
      setNotice(`ลบรอบไม่สำเร็จ: ${res.error || "เกิดข้อผิดพลาด"}`);
      return;
    }
    setDeleteModalOpen(false);
    setDeleteConfirmed(false);
    setRound(null);
    await reloadDayRecords();
    try {
      playSuccessChime();
    } catch {
      // ignore
    }
    setNotice(
      res.deletedRecordsCount > 0
        ? `✓ ลบรอบ ${activeGroup} และล้างข้อมูลเช็คชื่อ ${res.deletedRecordsCount} คนเรียบร้อยแล้ว (รีเซ็ตเป็นยังไม่เปิดรอบ)`
        : `✓ ยกเลิกรอบ ${activeGroup} เรียบร้อยแล้ว (รีเซ็ตเป็นยังไม่เปิดรอบ)`,
    );
  };
  const [online, setOnline] = useState(
    typeof window === "undefined" ? true : window.navigator.onLine,
  );
  const [pending, setPending] = useState(() =>
    typeof window === "undefined" ? 0 : pendingCount(),
  );
  const [dayRecords, setDayRecords] = useState<DayRecord[]>([]);
  const [dayLive, setDayLive] = useState(false);
  const [helpRequests, setHelpRequests] = useState<CheckinHelpRequest[]>([]);
  const isReloadingRef = useRef(false);
  const roundRef = useRef<SessionFull | null>(null);
  roundRef.current = round;

  const loadHelpRequests = async () => {
    if (!roundRef.current?.id) {
      setHelpRequests([]);
      return;
    }
    const reqs = await fetchPendingHelpRequests(roundRef.current.id);
    setHelpRequests(reqs);
  };

  const handleApproveHelp = async (req: CheckinHelpRequest, status: "present" | "late") => {
    const ok = await teacherApproveCheckinHelp(req.id, status);
    if (ok) {
      try {
        playSuccessChime();
      } catch {
        // ignore
      }
      setNotice(`✓ อนุมัติการเช็คชื่อ (${status === "present" ? "มาเรียน" : "มาสาย"}) ให้ ${req.student_name} แล้ว`);
      setHelpRequests((prev) => prev.filter((r) => r.id !== req.id));
      await reloadDayRecords();
    } else {
      setNotice("บันทึกไม่สำเร็จ — ตรวจสอบการเชื่อมต่อ");
    }
  };

  const handleRejectHelp = async (req: CheckinHelpRequest) => {
    const ok = await teacherRejectCheckinHelp(req.id);
    if (ok) {
      setNotice(`ปฏิเสธคำขอของ ${req.student_name} แล้ว`);
      setHelpRequests((prev) => prev.filter((r) => r.id !== req.id));
    }
  };

  const reloadDayRecords = async () => {
    if (isReloadingRef.current) return;
    isReloadingRef.current = true;
    try {
      const r = await fetchRecordsByDate(todayStr());
      if (r) {
        setDayRecords(r);
        setDayLive(true);
      }
    } finally {
      isReloadingRef.current = false;
    }
  };

  const syncNow = async () => {
    const r = await flushQueue();
    setPending(r.remaining);
    if (r.synced > 0) {
      setNotice(`ซิงก์คิวขึ้น server แล้ว ${r.synced} แถว`);
      await reloadDayRecords();
    } else if (r.remaining > 0) {
      setNotice(`ยังค้าง ${r.remaining} แถว — ตรวจเน็ตแล้วกดซิงก์ใหม่`);
    } else {
      setNotice("ไม่มีคิวค้างซิงก์");
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetchRecordsByDate(todayStr());
      if (r && !cancelled) {
        setDayRecords(r);
        setDayLive(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ออนไลน์/ออฟไลน์ + ซิงก์อัตโนมัติ (เน็ตกลับ + ทุก 30 วิ)
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void (async () => {
        const r = await flushQueue();
        setPending(r.remaining);
        if (r.synced > 0) {
          setNotice(`เน็ตกลับแล้ว — ซิงก์ ${r.synced} แถว`);
          await reloadDayRecords();
        }
      })();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const timer = setInterval(() => {
      void (async () => {
        if (!window.navigator.onLine) return;
        const r = await flushQueue();
        setPending((prev) => (prev === r.remaining ? prev : r.remaining));
        if (r.synced > 0) await reloadDayRecords();
      })();
    }, 30_000);

    // ซิงก์ข้อมูลเช็กชื่อล่าสุดทุก 6 วินาที เพื่อให้นักเรียนที่เช็กผ่านมือถือตนเองปรากฏบนจอครูแบบ Realtime
    const pollTimer = setInterval(() => {
      if (typeof document !== "undefined" && !document.hidden && window.navigator.onLine) {
        void reloadDayRecords();
        void loadHelpRequests();
      }
    }, 6000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(timer);
      clearInterval(pollTimer);
    };
  }, []);

  useEffect(() => {
    void loadHelpRequests();
  }, [round?.id]);
  const [mode, setMode] = useState<"face" | "manual">("face");
  const [manualCode, setManualCode] = useState("");
  const [manualFound, setManualFound] = useState<{
    code: string;
    name: string;
    group: string;
    photo: string | null;
  } | null>(null);
  const [manualMsg, setManualMsg] = useState("");

  const lookupManual = async () => {
    const code = manualCode.trim();
    setManualFound(null);
    setManualMsg("");
    const st = studentsRef.current.find((s) => s.code === code);
    if (!st) {
      setManualMsg("ไม่พบรหัสนี้ในระบบ");
      return;
    }
    let photo: string | null = null;
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from("students")
        .select("photo_url")
        .eq("student_code", code)
        .single();
      photo = (data as { photo_url: string | null } | null)?.photo_url ?? null;
    }
    if (!photo) {
      setManualMsg(`${st.name} ยังไม่มีรูปลงทะเบียน — ใช้โหมดสำรองไม่ได้`);
      return;
    }
    setManualFound({ code: st.code, name: st.name, group: st.group, photo });
  };

  const confirmManual = async () => {
    if (!manualFound) return;
    setManualMsg("กำลังบันทึก...");
    const out = await saveCheckin({
      group: manualFound.group,
      code: manualFound.code,
      confidence: 0,
      method: "manual",
    });
    setPending(out.queued);
    if (out.result === "saved") {
      setManualMsg(
        `ครูยืนยันตัวตน ${manualFound.name} แล้ว${out.periodNo !== null ? ` (คาบที่ ${out.periodNo}${out.late ? " · สาย" : ""})` : ""}`,
      );
      setDayRecords((prev) => {
        if (prev.some((r) => r.studentCode === manualFound.code)) return prev;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        return [
          {
            id: `opt-${manualFound.code}-${Date.now()}`,
            studentCode: manualFound.code,
            name: manualFound.name,
            group: manualFound.group,
            time: timeStr,
            checkInAt: now.toISOString(),
            status: out.late ? "late" : "present",
            method: "manual",
            periodNo: out.periodNo,
            sessionId: "",
            sessionStatus: "open",
          },
          ...prev,
        ];
      });
      void reloadDayRecords();
      setManualFound(null);
      setManualCode("");
    } else if (out.result === "duplicate") {
      setManualMsg(`${manualFound.name} เช็กชื่อวันนี้ไปแล้ว`);
    } else if (out.result === "queued") {
      setManualMsg(`เน็ตหลุด — เก็บ ${manualFound.name} เข้าคิวแล้ว (ค้าง ${out.queued})`);
      setManualFound(null);
      setManualCode("");
    } else {
      setManualMsg("บันทึกไม่ได้ — ลองอีกครั้ง");
    }
  };
  const [camStatus, setCamStatus] = useState("กำลังเตรียมกล้อง...");
  const [facingMode, setFacingMode] = useState<CameraFacingMode>("user");

  const toggleCamera = async () => {
    const nextMode: CameraFacingMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);
    setCamStatus(`กำลังสลับเป็น${nextMode === "user" ? "กล้องหน้า" : "กล้องหลัง"}...`);
    const video = videoRef.current;
    if (!video) return;
    try {
      await openCamera(video, nextMode);
      setCamOn(true);
      setCamStatus(`กำลังสแกนด้วย${nextMode === "user" ? "กล้องหน้า" : "กล้องหลัง"}อัตโนมัติ...`);
    } catch (err) {
      setCamOn(false);
      setCamStatus(getCameraErrorMessage(err));
    }
  };

  const retryCamera = async () => {
    setCamStatus("กำลังลองเปิดกล้องใหม่...");
    const video = videoRef.current;
    if (!video) return;
    try {
      await openCamera(video, facingMode);
      setCamOn(true);
      setCamStatus(`กำลังสแกนด้วย${facingMode === "user" ? "กล้องหน้า" : "กล้องหลัง"}อัตโนมัติ...`);
    } catch (err) {
      setCamOn(false);
      setCamStatus(getCameraErrorMessage(err));
    }
  };

  const confirmCandidate = async (code: string, label: string) => {
    const st = studentsRef.current.find((s) => s.code === code);
    if (!st) return;
    setNotice("กำลังบันทึก...");
    const out = await saveCheckin({
      group: st.group,
      code: st.code,
      confidence: 0,
      method: "manual",
    });
    setPending(out.queued);
    if (out.result === "saved") {
      setNotice(`ครูยืนยันมือ (${label}): ${st.name} แล้ว`);
      setCandidates(null);
      setDayRecords((prev) => {
        if (prev.some((r) => r.studentCode === st.code)) return prev;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        return [
          {
            id: `opt-${st.code}-${Date.now()}`,
            studentCode: st.code,
            name: st.name,
            group: st.group,
            time: timeStr,
            checkInAt: now.toISOString(),
            status: out.late ? "late" : "present",
            method: "manual",
            periodNo: out.periodNo,
            sessionId: "",
            sessionStatus: "open",
          },
          ...prev,
        ];
      });
      void reloadDayRecords();
    } else if (out.result === "duplicate") {
      setNotice(`${st.name} เช็กชื่อวันนี้ไปแล้ว`);
    } else if (out.result === "queued") {
      setNotice(`เน็ตหลุด — เก็บ ${st.name} เข้าคิวแล้ว`);
    } else {
      setNotice("บันทึกไม่ได้ — ลองอีกครั้ง");
    }
  };
  const [camOn, setCamOn] = useState(false);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const enrolledRef = useRef<EnrolledFace[]>([]);
  const twinRef = useRef(new Map<string, boolean>());
  const photoRef = useRef(new Map<string, string | null>());
  const cooldownRef = useRef(new Map<string, number>());
  const [candidates, setCandidates] = useState<{
    reason: "ambiguous" | "twin";
    list: Array<{
      code: string;
      name: string;
      group: string;
      photo: string | null;
      initials: string;
      color: string;
      distance: number;
    }>;
  } | null>(null);
  const studentsRef = useRef(students);
  useEffect(() => {
    studentsRef.current = students;
  });

  const saveMatch = async (m: CurrentMatch) => {
    if (!m.code) {
      setNotice("บันทึกไม่ได้ — ไม่พบรหัสนักเรียน");
      return;
    }
    const out = await saveCheckin({
      group: m.group,
      code: m.code,
      confidence: m.confidence,
      method: "face",
    });
    setPending(out.queued);
    const periodLabel =
      out.periodNo !== null ? ` (คาบที่ ${out.periodNo}${out.late ? " · สาย" : ""})` : "";
    const label: Record<SaveResult, string> = {
      saved: `บันทึกเช็กชื่อ ${m.thaiName} แล้ว${periodLabel}`,
      duplicate: `${m.thaiName} เช็กชื่อวันนี้ไปแล้ว`,
      queued: `เน็ตหลุด — เก็บ ${m.thaiName} เข้าคิวแล้ว (ค้าง ${out.queued})`,
      failed: "บันทึกไม่ได้ — ลองอีกครั้ง",
    };
    setNotice(label[out.result]);
    if (out.result === "saved" || out.result === "duplicate") {
      setDayRecords((prev) => {
        if (prev.some((r) => r.studentCode === m.code)) return prev;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        return [
          {
            id: `opt-${m.code}-${Date.now()}`,
            studentCode: m.code,
            name: m.thaiName,
            group: m.group,
            time: timeStr,
            checkInAt: now.toISOString(),
            status: out.late ? "late" : "present",
            method: "face",
            periodNo: out.periodNo,
            sessionId: "",
            sessionStatus: "open",
          },
          ...prev,
        ];
      });
      void reloadDayRecords();
    }
  };
  const saveMatchRef = useRef(saveMatch);
  useEffect(() => {
    saveMatchRef.current = saveMatch;
  });

  // โหลดทะเบียนใบหน้า + เปิดกล้อง + วนลูปแมตช์อัตโนมัติ
  useEffect(() => {
    let cancelled = false;
    let loopTimer: ReturnType<typeof setTimeout> | null = null;
    const video = videoRef.current;
    (async () => {
      try {
        if (!window.isSecureContext) {
          setCamStatus("ต้องเปิดผ่าน HTTPS หรือ localhost กล้องถึงจะทำงาน");
          return;
        }
        // ทะเบียนใบหน้าจาก DB (+ธงแฝด + รูป)
        if (isSupabaseConfigured) {
          const { data } = await supabase
            .from("students")
            .select("student_code,face_data,photo_url,twin_flag")
            .eq("face_status", "registered");
          const list: EnrolledFace[] = [];
          const twins = new Map<string, boolean>();
          const photos = new Map<string, string | null>();
          for (const r of (data ?? []) as Array<{ student_code: string | null; face_data: string | null; photo_url: string | null; twin_flag: boolean | null }>) {
            if (!r.student_code || !r.face_data) continue;
            try {
              const d = JSON.parse(r.face_data) as number[];
              if (Array.isArray(d) && d.length === 128) list.push({ code: r.student_code, descriptor: d });
            } catch {
              /* ข้ามแถวเสีย */
            }
            twins.set(r.student_code, r.twin_flag === true);
            photos.set(r.student_code, r.photo_url);
          }
          enrolledRef.current = list;
          twinRef.current = twins;
          photoRef.current = photos;
          if (!cancelled) setEnrolledCount(list.length);
        }
        if (cancelled) return;
        setCamStatus("กำลังโหลดโมเดลใบหน้า...");
        await ensureFaceModels();
        if (cancelled || !video) return;
        await openCamera(video, facingMode);
        if (cancelled) return;
        setCamOn(true);
        setCamStatus(`กำลังสแกนด้วย${facingMode === "user" ? "กล้องหน้า" : "กล้องหลัง"}อัตโนมัติ...`);
        let isBusy = false;

        const runScanLoop = async () => {
          if (
            cancelled ||
            enrolledRef.current.length === 0 ||
            isBusy ||
            !videoRef.current ||
            qrModalOpenRef.current ||
            cameraPausedRef.current ||
            (typeof document !== "undefined" && document.hidden)
          ) {
            // เมื่อเปิด QR Code Modal หรือกดพักกล้อง หรือแท็บพับอยู่ ให้หยุดการทำงาน AI เพื่อป้องกันเครื่องครูร้อน/ค้าง
            if (!cancelled) {
              loopTimer = setTimeout(() => {
                void runScanLoop();
              }, 1000);
            }
            return;
          }
          isBusy = true;
          try {
            const desc = await descriptorFromVideo(videoRef.current);
            if (!desc || cancelled) return;
            const top = findTopMatches(desc, enrolledRef.current, 0.55, 2);
            if (top.length === 0) return;
            const hit = top[0] as { code: string; distance: number };

            const toCandidate = (code: string, distance: number) => {
              const st = studentsRef.current.find((s) => s.code === code);
              if (!st) return null;
              return {
                code: st.code,
                name: st.name,
                group: st.group,
                photo: photoRef.current.get(st.code) ?? null,
                initials: st.initials,
                color: st.color,
                distance,
              };
            };

            // ปักธงแฝด/หน้าเหมือน → บังคับยืนยันมือเสมอ
            if (twinRef.current.get(hit.code) === true) {
              const one = toCandidate(hit.code, hit.distance);
              if (!one) return;
              const lastTwin = cooldownRef.current.get(`twin:${hit.code}`) ?? 0;
              if (Date.now() - lastTwin < 30_000) return;
              cooldownRef.current.set(`twin:${hit.code}`, Date.now());
              setCandidates({ reason: "twin", list: [one] });
              setNotice(`${one.name} ถูกปักธงแฝด — ให้ครูเทียบรูปแล้วยืนยันมือ`);
              return;
            }
            // คะแนนอันดับ 1-2 ใกล้กัน → ระบบไม่แน่ใจ ส่งให้ครูตัดสิน
            if (isAmbiguous(top)) {
              const list = top
                .map((t) => toCandidate(t.code, t.distance))
                .filter((x): x is NonNullable<typeof x> => x !== null);
              if (list.length === 0) return;
              const key = `panel:${list.map((x) => x.code).join("+")}`;
              const lastPanel = cooldownRef.current.get(key) ?? 0;
              if (Date.now() - lastPanel < 30_000) return;
              cooldownRef.current.set(key, Date.now());
              setCandidates({ reason: "ambiguous", list });
              setNotice("ใบหน้าใกล้เคียงกันมากกว่า 1 คน — ให้ครูเทียบแล้วยืนยัน");
              return;
            }

            const last = cooldownRef.current.get(hit.code) ?? 0;
            if (Date.now() - last < 30_000) return;
            cooldownRef.current.set(hit.code, Date.now());
            const st = studentsRef.current.find((s) => s.code === hit.code);
            if (!st) return;
            const m: CurrentMatch = {
              code: st.code,
              group: st.group,
              thaiName: st.name,
              engName: "",
              status: "Present",
              time: nowTime(),
              confidence: Math.round((1 - hit.distance) * 100),
            };
            setOverride(m);
            if (!isCombinedM1(activeGroup)) {
              setSelectedGroup(st.group);
            }
            await saveMatchRef.current(m);
          } catch (err) {
            console.error("Scanner scan error:", err);
          } finally {
            isBusy = false;
            if (!cancelled) {
              loopTimer = setTimeout(() => {
                void runScanLoop();
              }, 600);
            }
          }
        };

        loopTimer = setTimeout(() => {
          void runScanLoop();
        }, 500);
      } catch (err) {
        if (!cancelled) {
          setCamOn(false);
          setCamStatus(getCameraErrorMessage(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      if (loopTimer) clearTimeout(loopTimer);
      closeCamera(video);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSelectedGroup]);

  const onSave = () => {
    setNotice("กำลังบันทึก...");
    void saveMatchRef.current(match);
  };

  const panelEntries: ScanEntry[] = useMemo(() => {
    const isMatchGroup = (grp: string) =>
      isCombinedM1(activeGroup) ? grp.startsWith("ม.1/") : grp === activeGroup;
    if (!dayLive) {
      if (isCombinedM1(activeGroup)) {
        return Object.entries(recentByGroup)
          .filter(([grp]) => grp.startsWith("ม.1/"))
          .flatMap(([, list]) => list)
          .slice(0, 10);
      }
      return recentByGroup[activeGroup] ?? [];
    }
    const meta = new Map(students.map((s) => [s.code, s]));
    return dayRecords
      .filter((r) => isMatchGroup(r.group) && r.checkInAt)
      .sort((a, b) => (b.checkInAt as string).localeCompare(a.checkInAt as string))
      .map((r) => {
        const st = meta.get(r.studentCode);
        return {
          id: r.id,
          name: r.name,
          time: r.time,
          group: r.group,
          initials: st?.initials ?? "?",
          color: st?.color ?? "bg-[#dbe7f5] text-[#1a5da3]",
        };
      });
  }, [dayLive, dayRecords, activeGroup, recentByGroup, students]);

  // นักเรียนในกลุ่มที่เลือก (ถ้ารวม ม.1 จะรวมห้อง 1/1 - 1/11 ทั้งหมด)
  const groupStudents = useMemo(() => {
    if (isCombinedM1(activeGroup)) {
      return students.filter((s) => s.group.startsWith("ม.1/"));
    }
    return students.filter((s) => s.group === activeGroup);
  }, [activeGroup, students]);

  // แมปผลการเช็กชื่อของนักเรียนวันนี้
  const checkedMap = useMemo(() => {
    const map = new Map<string, DayRecord>();
    for (const r of dayRecords) {
      if (r.checkInAt || r.status === "present" || r.status === "late" || r.status === "activity") {
        map.set(r.studentCode, r);
      }
    }
    return map;
  }, [dayRecords]);

  const totalStudentsCount = groupStudents.length;
  const checkedStudentsCount = useMemo(
    () => groupStudents.filter((s) => checkedMap.has(s.code)).length,
    [groupStudents, checkedMap],
  );
  const uncheckedStudentsCount = Math.max(0, totalStudentsCount - checkedStudentsCount);

  const [checklistFilter, setChecklistFilter] = useState<"unchecked" | "all" | "checked">("unchecked");
  const [checklistSort, setChecklistSort] = useState<"number" | "code" | "name">("number");
  const [checklistSearch, setChecklistSearch] = useState("");
  const [actingStudentCode, setActingStudentCode] = useState<string | null>(null);

  const displayedStudents = useMemo(() => {
    let list = groupStudents;
    if (checklistFilter === "unchecked") {
      list = list.filter((s) => !checkedMap.has(s.code));
    } else if (checklistFilter === "checked") {
      list = list.filter((s) => checkedMap.has(s.code));
    }
    const q = checklistSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.code.includes(q) ||
          s.number.includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (isCombinedM1(activeGroup)) {
        const roomCmp = a.group.localeCompare(b.group, "th", { numeric: true });
        if (roomCmp !== 0) return roomCmp;
      }
      if (checklistSort === "number") {
        const numA = Number(a.number) || 999;
        const numB = Number(b.number) || 999;
        return numA - numB || a.code.localeCompare(b.code, "th", { numeric: true });
      }
      if (checklistSort === "code") {
        return a.code.localeCompare(b.code, "th", { numeric: true });
      }
      return a.name.localeCompare(b.name, "th");
    });
  }, [groupStudents, checkedMap, checklistFilter, checklistSearch, checklistSort, activeGroup]);

  const handleQuickCheckIn = async (st: RosterStudent, status: "present" | "late") => {
    setActingStudentCode(st.code);
    const ok = await manualCheckIn(st.group, st.code, status);
    setActingStudentCode(null);
    if (ok) {
      playSuccessChime();
      setNotice(
        `✓ บันทึก ${status === "present" ? "มาเรียน" : "มาสาย"} ให้ เลขที่ ${st.number || "-"} ${st.name} แล้ว`,
      );
      await reloadDayRecords();
    } else {
      setNotice("บันทึกไม่สำเร็จ — ตรวจสอบการเชื่อมต่อ");
    }
  };

  const handleBulkMarkAbsent = async () => {
    const uncheckeds = groupStudents.filter((s) => !checkedMap.has(s.code));
    if (uncheckeds.length === 0) return;
    if (
      !window.confirm(
        `ยืนยันมาร์กนักเรียนที่ยังไม่เช็กชื่อ ${uncheckeds.length} คน ของกลุ่ม ${activeGroup} เป็น "ขาดเรียน" ใช่หรือไม่?`,
      )
    ) {
      return;
    }
    setNotice(`กำลังบันทึกขาดเรียน ${uncheckeds.length} คน...`);
    const r = await bulkMarkStatus(
      uncheckeds.map((s) => ({ group: s.group, code: s.code })),
      "absent",
    );
    setNotice(`✓ บันทึกสถานะขาดเรียนให้ ${r.success} คน เรียบร้อยแล้ว`);
    await reloadDayRecords();
  };

  return (
    <AppShell active="scanner" title="เช็กชื่อเข้าเรียน">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        {/* left: selector + viewport + result */}
        <div className="min-w-0">
            <GroupSelect groups={groups} value={activeGroup} onChange={setSelectedGroup} />
          {/* รอบวันนี้ + รหัสให้นักเรียน */}
          <Card className="mt-3 flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-[#16233a]">
                รอบวันนี้ {activeGroup}:{" "}
                {!round ? (
                  <span className="text-[#e65100]">ยังไม่เปิด</span>
                ) : round.status === "completed" ? (
                  <span className="text-[#5b6b82]">ปิดรอบแล้ว</span>
                ) : (
                  <span className="text-[#1e8e3e]">เปิดอยู่</span>
                )}
              </p>
              {round && round.status !== "completed" ? (
                <p className="mt-1 text-[13px] text-[#5b6b82]">
                  รหัสให้นักเรียนกรอก:{" "}
                  <span className="rounded bg-[#16233a] px-2.5 py-1 text-[18px] font-bold tracking-[0.3em] text-white">
                    {round.pin ?? "----"}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-[13px] text-[#5b6b82]">
                  เปิดรอบก่อน นักเรียนถึงจะเช็กชื่อเองได้
                </p>
              )}
              <p className="mt-1.5 text-[12.5px] font-medium text-[#5b6b82]">
                เช็กชื่อแล้ว: <span className="font-bold text-[#1e8e3e]">{checkedStudentsCount}/{totalStudentsCount} คน</span>
                {uncheckedStudentsCount > 0 ? (
                  <span className="ml-1 text-[#e65100]">(ยังไม่เช็ก {uncheckedStudentsCount} คน)</span>
                ) : (
                  <span className="ml-1 text-[#1e8e3e]">✓ ครบทุกคนแล้ว</span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!round || round.status === "completed" ? (
                <UIButton variant="green" onClick={() => void openRound()} className="h-10 shrink-0">
                  เปิดรอบวันนี้
                </UIButton>
              ) : (
                <UIButton
                  variant="blue"
                  onClick={() => void closeRound()}
                  className="h-10 shrink-0 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40"
                >
                  ปิดรอบ
                </UIButton>
              )}

              {(round !== null || checkedStudentsCount > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteConfirmed(false);
                    setDeleteModalOpen(true);
                  }}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-[#fed7d7] bg-[#fff5f5] px-3 text-[12.5px] font-bold text-[#c62828] shadow-2xs transition hover:bg-[#fdecec] active:scale-95 cursor-pointer"
                  title="ยกเลิกรอบและลบข้อมูลเช็คชื่อของห้องนี้ในวันนี้ทั้งหมด"
                >
                  <span>🗑️ ลบรอบวันนี้</span>
                </button>
              )}
            </div>

            {round && round.status !== "completed" && (
              <div className="flex w-full flex-wrap items-center gap-2 border-t border-[#eef2f7] pt-3">
                <button
                  type="button"
                  onClick={() => setQrModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#16233a] px-3 py-1.5 text-[12.5px] font-bold text-white shadow-2xs transition hover:bg-[#20314f] active:scale-95"
                >
                  <span>📺 แสดง QR Code จอใหญ่หน้าห้อง</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const shareUrl = `${window.location.origin}/student/scan?openExternalBrowser=1${round.pin ? `&pin=${encodeURIComponent(round.pin)}` : ""}`;
                    void navigator.clipboard.writeText(shareUrl);
                    setNotice("✓ คัดลอกลิงก์สำหรับส่งใน LINE แล้ว (เปิดจะเด้งเข้า Chrome/Safari ทันที)");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#16233a] shadow-2xs transition hover:bg-[#f1f5fa] active:scale-95"
                >
                  <span>📋 คัดลอกลิงก์ส่งใน LINE</span>
                </button>
              </div>
            )}
          </Card>

          {/* แบนเนอร์แจ้งเตือนคำขอช่วยเช็คชื่อจากนักเรียนที่เครื่องค้าง/กล้องมีปัญหา */}
          {helpRequests.length > 0 && (
            <Card className="mt-3 border-2 border-amber-400 bg-amber-50/90 p-4 shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl animate-bounce">🚨</span>
                  <div>
                    <p className="text-[15px] font-bold text-amber-950">
                      นักเรียนแจ้งโทรศัพท์มีปัญหา / ขอให้ครูช่วยเช็คชื่อ ({helpRequests.length} คน)
                    </p>
                    <p className="text-[12px] text-amber-800">
                      นักเรียนกรอกรหัสรอบถูกต้องแล้ว — ตรวจสอบนักเรียนในห้องแล้วกดอนุมัติ
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-3 divide-y divide-amber-200">
                {helpRequests.map((req) => (
                  <div key={req.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-200 text-base font-bold text-amber-900 shadow-2xs">
                        👤
                      </span>
                      <div>
                        <p className="text-[14.5px] font-bold text-[#16233a]">{req.student_name}</p>
                        <p className="text-[12px] text-[#5b6b82]">
                          รหัส <span className="font-mono font-semibold text-[#16233a]">{req.student_code}</span> · {req.group_name}
                          <span className="ml-2 font-medium text-amber-700">({new Date(req.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.)</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleApproveHelp(req, "present")}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-[12.5px] font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-95"
                      >
                        <span>✓ อนุมัติ (มาเรียน)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleApproveHelp(req, "late")}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-[12.5px] font-bold text-white shadow-sm hover:bg-amber-700 active:scale-95"
                      >
                        <span>⏰ สาย</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRejectHelp(req)}
                        className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-gray-600 hover:bg-gray-100"
                        title="ปฏิเสธคำขอ"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="mt-2 flex gap-2" role="tablist" aria-label="โหมดสแกน">
            {(["face", "manual"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={
                  mode === m
                    ? "h-9 flex-1 rounded-md bg-[#16233a] text-[14px] font-bold text-white"
                    : "h-9 flex-1 rounded-md border border-[#d8e0ec] bg-white text-[14px] font-semibold text-[#5b6b82]"
                }
              >
                {m === "face" ? "สแกนใบหน้า" : "โหมดสำรอง (กรอกรหัส)"}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-[#5b6b82]">
            <span className="flex items-center gap-1.5">
              <span className={camOn ? "font-bold text-[#1e8e3e]" : "font-bold text-[#e65100]"}>
                ●
              </span>{" "}
              <span>{camStatus}</span>
              {!camOn && (
                <button
                  type="button"
                  onClick={() => void retryCamera()}
                  className="ml-1 inline-flex items-center gap-1 rounded bg-[#e8f1fb] px-2 py-0.5 text-[11.5px] font-bold text-[#1a5da3] hover:bg-[#d8e7f8]"
                >
                  <RefreshIcon className="h-3 w-3" /> ลองใหม่
                </button>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCameraPaused((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11.5px] font-semibold shadow-2xs transition hover:opacity-90 active:scale-95 ${
                  cameraPaused
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-[#d8e0ec] bg-white text-[#16233a] hover:bg-[#f1f5fa]"
                }`}
                title={cameraPaused ? "คลิกเพื่อเปิดกล้องสแกนต่อ" : "คลิกเพื่อพักการทำงานกล้องและประหยัดแบตเตอรี่"}
              >
                {cameraPaused ? "▶ ดำเนินการกล้องต่อ" : "⏸ พักกล้อง"}
              </button>
              <button
                type="button"
                onClick={() => void toggleCamera()}
                className="inline-flex items-center gap-1 rounded-md border border-[#d8e0ec] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#16233a] shadow-2xs hover:bg-[#f1f5fa]"
              >
                <CameraSwitchIcon className="h-3.5 w-3.5 text-[#2474c6]" />
                สลับกล้อง ({facingMode === "user" ? "กล้องหน้า" : "กล้องหลัง"})
              </button>
              <span>ทะเบียน {enrolledCount} คน</span>
            </div>
          </div>
          {!online || pending > 0 ? (
            <div
              role="status"
              className={
                !online
                  ? "mt-2 flex items-center justify-between gap-2 rounded-lg bg-[#fdecec] px-3 py-2 text-[13px] font-semibold text-[#c62828]"
                  : "mt-2 flex items-center justify-between gap-2 rounded-lg bg-[#fef6ec] px-3 py-2 text-[13px] font-semibold text-[#e65100]"
              }
            >
              <span>
                {!online
                  ? "ออฟไลน์ — ผลสแกนจะเก็บเข้าคิวอัตโนมัติ"
                  : `ค้างซิงก์ ${pending} แถว`}
              </span>
              {online && pending > 0 ? (
                <button
                  type="button"
                  onClick={() => void syncNow()}
                  className="shrink-0 rounded-md bg-[#e65100] px-3 py-1 text-[12.5px] font-bold text-white hover:brightness-110"
                >
                  ซิงก์ตอนนี้
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="mt-2 overflow-hidden rounded-lg">
            <ScannerViewport
              match={match}
              videoRef={videoRef}
              camOn={camOn}
              facingMode={facingMode}
              onToggleCamera={() => void toggleCamera()}
              onRetryCamera={() => void retryCamera()}
              camStatus={camStatus}
            />
            <MatchResult match={match} />
          </div>
          {candidates ? (
            <Card className="mt-3 border-[#f0c020] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[14px] font-bold text-[#16233a]">
                  {candidates.reason === "twin"
                    ? "ปักธงแฝด — ต้องยืนยันมือ"
                    : "หน้าใกล้เคียงกัน — ให้ครูตัดสิน"}
                </p>
                <button
                  type="button"
                  onClick={() => setCandidates(null)}
                  className="text-[12.5px] font-semibold text-[#5b6b82] hover:underline"
                >
                  ปิด
                </button>
              </div>
              <ul className="mt-2 space-y-2">
                {candidates.list.map((c) => (
                  <li key={c.code} className="flex items-center gap-3 rounded-lg bg-[#f8fafc] p-2">
                    {c.photo ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={c.photo}
                        alt={`รูปลงทะเบียนของ ${c.name}`}
                        className="h-16 w-14 shrink-0 rounded-md border border-[#e4eaf3] object-cover"
                      />
                    ) : (
                      <Avatar initials={c.initials} color={c.color} size="sm" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-[#16233a]">{c.name}</p>
                      <p className="text-[12.5px] text-[#5b6b82]">
                        {c.code} · {c.group}
                      </p>
                    </div>
                    <UIButton
                      variant="green"
                      onClick={() =>
                        void confirmCandidate(
                          c.code,
                          candidates.reason === "twin" ? "ปักธงแฝด" : "หน้าใกล้เคียง",
                        )
                      }
                      className="h-9 shrink-0 px-3 text-[13px]"
                    >
                      ยืนยันคนนี้
                    </UIButton>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {mode === "manual" ? (
            <Card className="mt-3 p-4">
              <p className="text-[14px] font-bold text-[#16233a]">
                เช็กชื่อสำรอง — เทียบรูปแล้วให้ครูกดยืนยัน
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void lookupManual();
                  }}
                  placeholder="กรอกเลขประจำตัว เช่น 47591"
                  inputMode="numeric"
                  className="h-11 min-w-0 flex-1 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[15px] focus:border-[#2474c6] focus:outline-none"
                />
                <UIButton variant="blue" onClick={() => void lookupManual()} className="h-11 shrink-0">
                  ค้นหา
                </UIButton>
              </div>
              {manualMsg ? (
                <p role="status" className="mt-2 text-[13.5px] font-medium text-[#1a5da3]">
                  {manualMsg}
                </p>
              ) : null}
              {manualFound?.photo ? (
                <div className="mt-3 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={manualFound.photo}
                    alt={`รูปลงทะเบียนของ ${manualFound.name}`}
                    className="h-28 w-24 shrink-0 rounded-lg border border-[#e4eaf3] object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-[#16233a]">{manualFound.name}</p>
                    <p className="text-[13px] text-[#5b6b82]">
                      {manualFound.code} · {manualFound.group}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-[#e65100]">
                      เทียบกับตัวจริงในกล้องแล้วกดยืนยัน
                    </p>
                  </div>
                </div>
              ) : null}
              {manualFound?.photo ? (
                <UIButton variant="green" onClick={() => void confirmManual()} className="mt-3 h-11 w-full">
                  ยืนยันตัวตน — เช็กชื่อ
                </UIButton>
              ) : null}
            </Card>
          ) : null}
          <UIButton variant="green" onClick={() => void onSave()} className="mt-3 h-11 w-full">
            บันทึกเช็กชื่อ
          </UIButton>
          {notice ? (
            <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-center text-[13.5px] font-medium text-[#1a5da3]">
              {notice}
            </p>
          ) : null}

          {/* สถานะเช็กชื่อวันนี้ (Checklist รายบุคคล) */}
          <Card className="mt-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef2f7] pb-3">
              <div>
                <h3 className="text-[16px] font-bold text-[#16233a]">
                  สถานะเช็กชื่อวันนี้ ({activeGroup})
                </h3>
                <p className="text-[12.5px] text-[#5b6b82]">
                  คลิกปุ่ม &quot;✓ มาเรียน&quot; หรือ &quot;สาย&quot; เพื่อเช็กชื่อให้นักเรียนที่กล้องมีปัญหาได้ทันที
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#e3f2e6] px-2.5 py-0.5 text-[12.5px] font-bold text-[#166c2e]">
                  มาแล้ว {checkedStudentsCount}/{totalStudentsCount}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#fef6ec] px-2.5 py-0.5 text-[12.5px] font-bold text-[#e65100]">
                  ยังไม่เช็ก {uncheckedStudentsCount}
                </span>
              </div>
            </div>

            {/* Filter Tabs & Sort Controls */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {/* Filter Tabs */}
              <div className="inline-flex rounded-lg border border-[#d8e0ec] bg-[#f8fafc] p-0.5 text-[13px]">
                <button
                  type="button"
                  onClick={() => setChecklistFilter("unchecked")}
                  className={cn(
                    "rounded-md px-3 py-1 font-semibold transition-colors",
                    checklistFilter === "unchecked"
                      ? "bg-[#16233a] text-white shadow-xs"
                      : "text-[#5b6b82] hover:text-[#16233a]",
                  )}
                >
                  ยังไม่เช็ก ({uncheckedStudentsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setChecklistFilter("all")}
                  className={cn(
                    "rounded-md px-3 py-1 font-semibold transition-colors",
                    checklistFilter === "all"
                      ? "bg-[#16233a] text-white shadow-xs"
                      : "text-[#5b6b82] hover:text-[#16233a]",
                  )}
                >
                  ทั้งหมด ({totalStudentsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setChecklistFilter("checked")}
                  className={cn(
                    "rounded-md px-3 py-1 font-semibold transition-colors",
                    checklistFilter === "checked"
                      ? "bg-[#16233a] text-white shadow-xs"
                      : "text-[#5b6b82] hover:text-[#16233a]",
                  )}
                >
                  เช็กแล้ว ({checkedStudentsCount})
                </button>
              </div>

              {/* Sort pills */}
              <div className="flex items-center gap-1.5 text-[12.5px]">
                <span className="font-medium text-[#5b6b82]">เรียงตาม:</span>
                <div className="inline-flex rounded-md border border-[#d8e0ec] bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setChecklistSort("number")}
                    className={cn(
                      "rounded px-2 py-0.5 font-bold transition-colors",
                      checklistSort === "number"
                        ? "bg-[#2474c6] text-white"
                        : "text-[#5b6b82] hover:bg-[#f1f5fa]",
                    )}
                  >
                    เลขที่
                  </button>
                  <button
                    type="button"
                    onClick={() => setChecklistSort("code")}
                    className={cn(
                      "rounded px-2 py-0.5 font-bold transition-colors",
                      checklistSort === "code"
                        ? "bg-[#2474c6] text-white"
                        : "text-[#5b6b82] hover:bg-[#f1f5fa]",
                    )}
                  >
                    รหัส
                  </button>
                  <button
                    type="button"
                    onClick={() => setChecklistSort("name")}
                    className={cn(
                      "rounded px-2 py-0.5 font-bold transition-colors",
                      checklistSort === "name"
                        ? "bg-[#2474c6] text-white"
                        : "text-[#5b6b82] hover:bg-[#f1f5fa]",
                    )}
                  >
                    ชื่อ
                  </button>
                </div>
              </div>
            </div>

            {/* Quick search input */}
            <div className="mt-2.5">
              <input
                type="text"
                value={checklistSearch}
                onChange={(e) => setChecklistSearch(e.target.value)}
                placeholder="ค้นหาชื่อ, เลขประจำตัว, หรือเลขที่..."
                className="h-9 w-full rounded-md border border-[#d8e0ec] bg-white px-3 text-[13.5px] text-[#16233a] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
              />
            </div>

            {/* Quick bulk action for unchecked */}
            {checklistFilter === "unchecked" && uncheckedStudentsCount > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#fed7aa] bg-[#fff8f0] px-3 py-2">
                <span className="text-[12.5px] font-semibold text-[#9a3412]">
                  เหลือนักเรียนยังไม่เช็กชื่อ {uncheckedStudentsCount} คน
                </span>
                <button
                  type="button"
                  onClick={() => void handleBulkMarkAbsent()}
                  className="rounded-md bg-[#c62828] px-3 py-1.5 text-[12px] font-bold text-white shadow-2xs transition hover:bg-[#b71c1c] active:scale-95"
                >
                  มาร์กคนที่เหลือเป็น &quot;ขาด&quot; ทั้งหมด ({uncheckedStudentsCount})
                </button>
              </div>
            )}

            {/* Student list */}
            <div className="slim-scroll mt-3 max-h-[380px] space-y-1.5 overflow-y-auto pr-1">
              {displayedStudents.length === 0 ? (
                <div className="py-8 text-center text-[13.5px] text-[#5b6b82]">
                  {checklistFilter === "unchecked"
                    ? "🎉 ยอดเยี่ยม! เช็กชื่อครบทุกคนในกลุ่มนี้แล้ว"
                    : "ไม่พบข้อมูลนักเรียนตามเงื่อนไข"}
                </div>
              ) : (
                displayedStudents.map((st) => {
                  const rec = checkedMap.get(st.code);
                  const isChecked = !!rec;
                  const isActing = actingStudentCode === st.code;

                  return (
                    <div
                      key={st.code}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border p-2.5 transition-colors",
                        isChecked
                          ? "border-[#d1e7dd] bg-[#f8fcf9]"
                          : "border-[#eef2f7] bg-white hover:bg-[#fafbfe]",
                      )}
                    >
                      {/* Left: number badge + avatar + name info */}
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
                            st.number
                              ? "bg-[#16233a] text-white"
                              : "bg-[#e2e8f0] text-[#64748b]",
                          )}
                          title={`เลขที่ ${st.number || "-"}`}
                        >
                          {st.number || "-"}
                        </span>
                        <Avatar initials={st.initials} color={st.color} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-bold text-[#16233a]">
                            {st.name}
                          </p>
                          <p className="text-[12px] text-[#5b6b82]">
                            รหัส {st.code} {isCombinedM1(activeGroup) ? `· ห้อง ${st.group}` : ""}
                          </p>
                        </div>
                      </div>

                      {/* Right: action buttons or status pill */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isChecked ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-md px-2.5 py-1 text-[12px] font-bold text-white",
                                rec.status === "late" ? "bg-[#ef8c1a]" : "bg-[#1e8e3e]",
                              )}
                            >
                              {rec.status === "late" ? "⏱ สาย" : "✓ มาเรียน"} {rec.time ? `(${rec.time})` : ""}
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleQuickCheckIn(st, rec.status === "late" ? "present" : "late")}
                              disabled={isActing}
                              title="สลับสถานะ มาเรียน / สาย"
                              className="rounded border border-[#d8e0ec] bg-white px-1.5 py-1 text-[11px] font-semibold text-[#5b6b82] hover:bg-[#f1f5fa]"
                            >
                              {rec.status === "late" ? "แก้เป็นมา" : "แก้เป็นสาย"}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleQuickCheckIn(st, "present")}
                              disabled={isActing}
                              className="rounded-md bg-[#1e8e3e] px-3 py-1.5 text-[12.5px] font-bold text-white shadow-2xs hover:bg-[#166c2e] active:scale-95 disabled:opacity-50"
                            >
                              {isActing ? "กำลังบันทึก..." : "✓ มาเรียน"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleQuickCheckIn(st, "late")}
                              disabled={isActing}
                              className="rounded-md bg-[#ef8c1a] px-2.5 py-1.5 text-[12.5px] font-bold text-white shadow-2xs hover:bg-[#c97412] active:scale-95 disabled:opacity-50"
                            >
                              สาย
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* right: recent + actions */}
        <div className="flex min-w-0 flex-col gap-3">
          <RecentPanel group={activeGroup} entries={panelEntries} />
          <UIButton variant="blue" href="/reports" className="h-11 w-full">
            ดูรายงานวันนี้
          </UIButton>
          <UIButton variant="blue" href="/students" className="h-11 w-full">
            จัดการกลุ่มเรียน {activeGroup}
          </UIButton>
        </div>
      </div>

      <SessionQrModal
        open={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        groupName={activeGroup}
        pin={round?.pin ?? null}
      />

      {/* Modal ยืนยันการลบรอบ / รีเซ็ตข้อมูลวันนี้ */}
      {deleteModalOpen && (
        <Modal
          title={
            checkedStudentsCount > 0
              ? `⚠️ ยืนยันลบข้อมูลรอบเช็คชื่อ ${activeGroup}`
              : `ยกเลิกรอบเช็คชื่อ ${activeGroup}`
          }
          onClose={() => {
            if (!deleteBusy) {
              setDeleteModalOpen(false);
              setDeleteConfirmed(false);
            }
          }}
          maxWidth="max-w-lg"
        >
          <div className="space-y-4 pt-1">
            <div className="rounded-lg border border-[#eef2f7] bg-[#f8fafc] p-3 text-[13px] text-[#5b6b82]">
              <p>
                <span className="font-semibold text-[#16233a]">กลุ่ม/ห้อง:</span>{" "}
                <span className="font-bold text-[#2474c6]">{activeGroup}</span>
              </p>
              <p className="mt-1">
                <span className="font-semibold text-[#16233a]">ประจำวันที่:</span>{" "}
                <span className="font-bold text-[#16233a]">{todayStr()}</span>
              </p>
            </div>

            {checkedStudentsCount === 0 ? (
              <div className="rounded-lg border border-[#d1fae5] bg-[#ecfdf5] p-3 text-[13.5px] text-[#065f46]">
                <p className="font-bold">✓ ยังไม่มีนักเรียนเช็คชื่อเข้ามาในรอบนี้</p>
                <p className="mt-1 text-[12.5px] text-[#047857]">
                  คุณสามารถยกเลิกการเปิดรอบได้ทันทีโดยไม่มีข้อมูลสูญหาย และห้องนี้จะกลับสู่สถานะยังไม่เคยเปิดรอบ
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-[#fed7aa] bg-[#fff7ed] p-3 text-[13px] text-[#9a3412]">
                  <p className="font-bold text-[14px] text-[#c2410c]">
                    ⚠️ มีนักเรียนเช็คชื่อในรอบนี้แล้ว {checkedStudentsCount} คน
                  </p>
                  <p className="mt-1 leading-relaxed text-[#7c2d12]">
                    หากลบรอบนี้ ข้อมูลการเช็คชื่อของนักเรียนทั้ง{" "}
                    <span className="font-bold">{checkedStudentsCount} คน</span>{" "}
                    จะถูกลบออกจากฐานข้อมูลทั้งหมด และห้องนี้จะถูกรีเซ็ตเหมือนยังไม่เคยเปิดเช็คชื่อในวันนี้
                    (ไม่นำไปนับในสถิติการเรียนหรือคะแนนจิตพิสัย)
                  </p>
                </div>

                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[#fed7d7] bg-[#fff5f5] p-3 transition hover:bg-[#fee2e2]">
                  <input
                    type="checkbox"
                    checked={deleteConfirmed}
                    onChange={(e) => setDeleteConfirmed(e.target.checked)}
                    disabled={deleteBusy}
                    className="mt-0.5 h-4 w-4 rounded border-[#e53e3e] accent-[#c62828]"
                  />
                  <span className="text-[13px] font-bold text-[#c62828] select-none">
                    ฉันเข้าใจและยืนยันว่าต้องการลบข้อมูลเช็คชื่อของนักเรียนทั้งหมด {checkedStudentsCount} คนในรอบนี้
                  </span>
                </label>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-[#eef2f7] pt-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteConfirmed(false);
                }}
                disabled={deleteBusy}
                className="rounded-lg border border-[#d8e0ec] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#5b6b82] hover:bg-[#f1f5fa] disabled:opacity-40 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteRound()}
                disabled={deleteBusy || (checkedStudentsCount > 0 && !deleteConfirmed)}
                className="rounded-lg bg-[#c62828] px-4 py-2 text-[13px] font-bold text-white shadow-2xs transition hover:bg-[#b71c1c] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {deleteBusy ? "กำลังลบข้อมูล..." : checkedStudentsCount > 0 ? "ยืนยันลบข้อมูลทั้งหมด" : "ยืนยันยกเลิกรอบ"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
