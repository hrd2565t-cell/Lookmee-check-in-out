"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Card, CardTitle, Modal, UIButton } from "@/components/ui";
import { BrandMark } from "@/components/logo";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  ReportIcon,
  ScanIcon,
} from "@/components/icons";
import {
  fetchMyHistory,
  getStudentCode,
  lookupStudent,
  submitDispute as apiDispute,
  submitLeaveSelf as apiLeave,
  type MyHistory,
  type StudentIdentity,
} from "@/lib/student";
import {
  fetchAbsencesInRange,
  fetchLimits,
  fetchTerms,
  levelOf,
} from "@/lib/terms";
import { cn } from "@/lib/cn";

/* ================= shell ฝั่งนักเรียน (sidebar เข้ม) ================= */

export function StudentSummaryShell({
  identity,
  active,
  onDataChange,
  children,
}: {
  identity: StudentIdentity;
  active: "summary" | "scan";
  onDataChange?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const logout = () => {
    document.cookie = "lookmee_student=; Path=/; Max-Age=0; SameSite=Lax";
    router.push("/login");
    router.refresh();
  };
  const initials = identity.name.replace(/^(เด็กชาย|เด็กหญิง|นาย|นางสาว)/, "").trim().slice(0, 2);

  // modal กลาง (ใช้ร่วมทุกหน้าฝั่งนักเรียน)
  const [modal, setModal] = useState<"leave" | "dispute" | "help" | null>(null);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [fFrom, setFFrom] = useState(todayStr);
  const [fTo, setFTo] = useState(todayStr);
  const [fType, setFType] = useState<"sick" | "personal">("sick");
  const [fReason, setFReason] = useState("");
  const [formMsg, setFormMsg] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [disputeMsg, setDisputeMsg] = useState("");

  const openAction = (a: "leave" | "dispute" | "help") => {
    setFormMsg("");
    setDisputeMsg("");
    if (a === "leave") {
      setFFrom(todayStr);
      setFTo(todayStr);
      setFType("sick");
      setFReason("");
    }
    setModal(a);
  };

  // ให้เนื้อเพจสั่งเปิด modal ของ shell ได้ (ปุ่มในเนื้อหา)
  useEffect(() => {
    const handler = (e: Event) => {
      const which = (e as CustomEvent<"leave" | "dispute" | "help">).detail;
      if (which === "leave" || which === "dispute" || which === "help") openAction(which);
    };
    window.addEventListener("lookmee:modal", handler);
    return () => window.removeEventListener("lookmee:modal", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitLeave = async () => {
    if (!fFrom || !fTo) {
      setFormMsg("กรุณาเลือกวันที่");
      return;
    }
    setFormBusy(true);
    const r = await apiLeave({
      code: identity.code,
      from: fFrom,
      to: fTo,
      type: fType,
      reason: fReason.trim(),
    });
    setFormBusy(false);
    if (r === "saved") {
      setModal(null);
      onDataChange?.();
    } else if (r === "bad_dates") {
      setFormMsg("วันที่ไม่ถูกต้อง (วันสิ้นสุดต้องไม่ก่อนวันเริ่ม)");
    } else {
      setFormMsg("บันทึกไม่สำเร็จ — ลองอีกครั้ง");
    }
  };

  const submitDispute = async () => {
    if (disputeMsg.trim().length < 5) {
      setFormMsg("กรุณาอธิบายอย่างน้อย 5 ตัวอักษร");
      return;
    }
    setFormBusy(true);
    const r = await apiDispute(identity.code, disputeMsg.trim());
    setFormBusy(false);
    if (r === "saved") {
      setModal(null);
      setDisputeMsg("");
    } else if (r === "too_short") {
      setFormMsg("กรุณาอธิบายอย่างน้อย 5 ตัวอักษร");
    } else {
      setFormMsg("บันทึกไม่สำเร็จ — ลองอีกครั้ง");
    }
  };

  const navBtn =
    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors";
  const item = (isActive: boolean, icon: React.ReactNode, thai: string, eng: string) => (
    <span className={cn(navBtn, isActive ? "bg-[#1e8e3e] font-bold text-white" : "text-white/85 hover:bg-white/10")}>
      {isActive ? <span className="absolute left-0 h-6 w-1 rounded-r-full bg-[#3ecf6f]" /> : null}
      <span className="relative flex items-center gap-2.5">
        {icon}
        <span className="leading-tight">
          <span className="block text-[14.5px]">{thai}</span>
          <span className="block text-[11.5px] font-normal text-white/60">{eng}</span>
        </span>
      </span>
    </span>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#eaf1f8]">
      {/* mobile nav */}
      <div className="flex items-center gap-2 overflow-x-auto bg-[#0f2a4a] px-3 py-2 lg:hidden">
        <BrandMark size={32} />
        <Link href="/student" className="min-w-max rounded-md px-3 py-1.5 text-[13.5px] font-semibold text-white/85">ประวัติ</Link>
        <Link href="/student/scan" className="min-w-max rounded-md px-3 py-1.5 text-[13.5px] font-semibold text-white/85">สแกน</Link>
        <button type="button" onClick={() => openAction("leave")} className="min-w-max rounded-md px-3 py-1.5 text-[13.5px] font-semibold text-white/85">ยื่นใบลา</button>
        <button type="button" onClick={logout} className="ml-auto min-w-max rounded-md px-3 py-1.5 text-[13.5px] font-semibold text-white/60">ออก</button>
      </div>

      <div className="mx-auto flex w-full max-w-[1280px] flex-1 items-stretch gap-0 px-0 sm:px-4 lg:gap-5 lg:px-6 lg:py-5">
        {/* sidebar */}
        <aside className="sticky top-5 hidden h-fit w-[228px] shrink-0 flex-col rounded-xl bg-[#0f2a4a] p-3 shadow-lg lg:flex">
          <div className="flex items-center gap-2 px-1 pb-3">
            <BrandMark size={40} />
            <div className="leading-tight">
              <p className="text-[15px] font-bold tracking-wide text-white">LOOKMEE</p>
              <p className="text-[10.5px] font-semibold tracking-wider text-white/60">CHECK IN-OUT</p>
            </div>
          </div>
          <nav aria-label="เมนูนักเรียน" className="relative flex flex-col gap-1">
            <Link href="/student">{item(active === "summary", <ScanIcon className="h-5 w-5" />, "ประวัติเข้าเรียน", "(Attendance Status)")}</Link>
            <Link href="/student/scan">{item(active === "scan", <ScanIcon className="h-5 w-5" />, "สแกนเข้าเรียน", "(Face Scan)")}</Link>
            <button type="button" onClick={() => openAction("leave")}>
              {item(false, <ReportIcon className="h-5 w-5" />, "ยื่นใบลา", "(Request Leave)")}
            </button>
            <button type="button" onClick={() => openAction("dispute")}>
              {item(false, <AlertCircleIcon className="h-5 w-5" />, "แจ้งปัญหา", "(Dispute)")}
            </button>
            <button type="button" onClick={() => openAction("help")}>
              {item(false, <CheckCircleIcon className="h-5 w-5" />, "ช่วยเหลือ", "(Help)")}
            </button>
          </nav>
          <button
            type="button"
            onClick={logout}
            className="mt-4 rounded-lg border border-white/20 px-3 py-2 text-[13px] font-semibold text-white/70 hover:bg-white/10"
          >
            ออกจากระบบ
          </button>
        </aside>

        {/* main */}
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-2 lg:px-1 lg:py-0">
          {/* topbar โปรไฟล์ */}
          <div className="mb-4 flex items-center justify-end gap-2.5">
            <span className="relative rounded-full p-1 text-[#5b6b82]">
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#c62828]" />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden="true">
                <path d="M6 9.5a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4s2-1.5 2-6.5" />
                <path d="M10 20a2.2 2.2 0 0 0 4 0" />
              </svg>
            </span>
            {identity.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={identity.photo} alt={identity.name} className="h-9 w-9 rounded-full border border-[#e4eaf3] object-cover" />
            ) : (
              <Avatar initials={initials} color="bg-[#dbe7f5] text-[#1a5da3]" size="sm" />
            )}
            <div className="leading-tight">
              <p className="text-[14px] font-bold text-[#16233a]">{identity.name}</p>
              <p className="text-[12px] text-[#5b6b82]">{identity.code} | {identity.group}</p>
            </div>
          </div>
          {children}
        </main>
      </div>

      {/* modal ยื่นใบลา */}
      {modal === "leave" ? (
        <Modal title="ยื่นใบลาออนไลน์" onClose={() => setModal(null)}>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              ลาตั้งแต่วันที่
              <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none" />
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              ถึงวันที่
              <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none" />
            </label>
            <label className="col-span-2 block text-[14px] font-medium text-[#16233a]">
              ประเภท
              <select value={fType} onChange={(e) => setFType(e.target.value as "sick" | "personal")} className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none">
                <option value="sick">ลาป่วย</option>
                <option value="personal">ลากิจ</option>
              </select>
            </label>
            <label className="col-span-2 block text-[14px] font-medium text-[#16233a]">
              เหตุผล
              <input value={fReason} onChange={(e) => setFReason(e.target.value)} placeholder="เช่น ป่วยเป็นไข้" className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none" />
            </label>
          </div>
          {formMsg ? (
            <p role="alert" className="mt-2 rounded-lg bg-[#fdecec] px-3 py-2 text-[13.5px] font-semibold text-[#c62828]">{formMsg}</p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <UIButton variant="blue" onClick={() => setModal(null)} className="h-10 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40">ยกเลิก</UIButton>
            <UIButton variant="green" onClick={() => void submitLeave()} disabled={formBusy} className="h-10 disabled:opacity-40">
              {formBusy ? "กำลังส่ง..." : "ยื่นใบลา"}
            </UIButton>
          </div>
        </Modal>
      ) : null}

      {/* modal แจ้งปัญหา */}
      {modal === "dispute" ? (
        <Modal title="แจ้งขอแก้ไขข้อมูล" onClose={() => setModal(null)}>
          <label className="block text-[14px] font-medium text-[#16233a]">
            อธิบายสิ่งที่ต้องการแก้ไข
            <textarea
              value={disputeMsg}
              onChange={(e) => setDisputeMsg(e.target.value)}
              rows={4}
              placeholder="เช่น วันที่ 02/10 ผมมาสแกนแล้วแต่ระบบขึ้นว่าขาด"
              className="mt-1 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 py-2 text-[14px] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
            />
          </label>
          {formMsg ? (
            <p role="alert" className="mt-2 rounded-lg bg-[#fdecec] px-3 py-2 text-[13.5px] font-semibold text-[#c62828]">{formMsg}</p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <UIButton variant="blue" onClick={() => setModal(null)} className="h-10 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40">ยกเลิก</UIButton>
            <UIButton variant="green" onClick={() => void submitDispute()} disabled={formBusy} className="h-10 disabled:opacity-40">
              {formBusy ? "กำลังส่ง..." : "ส่งเรื่อง"}
            </UIButton>
          </div>
        </Modal>
      ) : null}

      {/* modal ช่วยเหลือ */}
      {modal === "help" ? (
        <Modal title="ช่วยเหลือ" onClose={() => setModal(null)}>
          <ul className="space-y-2 text-[14px] text-[#16233a]">
            <li>• เช็กชื่อทุกเช้าที่หน้า <b>สแกนเข้าเรียน</b> ยืนหน้าตรงให้อยู่ในกรอบ</li>
            <li>• ลาป่วย/ลากิจล่วงหน้าที่ปุ่ม <b>ยื่นใบลาออนไลน์</b> รอครูอนุมัติ</li>
            <li>• ข้อมูลผิด กด <b>แจ้งขอแก้ไขข้อมูล</b> อธิบายมาได้เลย</li>
            <li>• เกณฑ์ผ่าน: มาเรียนสะสม ≥ 80%</li>
            <li>• ติดปัญหาติดต่อครูประจำชั้นโดยตรง</li>
          </ul>
          <div className="mt-3 flex justify-end">
            <UIButton variant="green" onClick={() => setModal(null)} className="h-10">เข้าใจแล้ว</UIButton>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* ================= หน้าสรุปประวัติ ================= */

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const THAI_DOW = ["Sun", "Mo", "Tie", "Wd", "Thu", "Fr", "Sa"];
const PASS_THRESHOLD = 80;

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
};
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d} ก.${(["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."] as string[])[Number(m)]} ${Number(y) + 543}` : iso;
};

export const openStudentModal = (which: "leave" | "dispute" | "help") => {
  window.dispatchEvent(new CustomEvent("lookmee:modal", { detail: which }));
};

type DayStatus = "present" | "absent" | "late" | "activity" | "leave";

export default function StudentSummaryPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<StudentIdentity | null>(null);
  const [history, setHistory] = useState<MyHistory | null>(null);
  const [month, setMonth] = useState(monthKey(new Date()));
  const [limitInfo, setLimitInfo] = useState<{
    max: number | null;
    absent: number;
    termName: string;
  } | null>(null);

  const load = async (code: string, ym: string) =>
    fetchMyHistory(code, ym);

  useEffect(() => {
    const code = getStudentCode();
    if (!code) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      const [id, h] = await Promise.all([lookupStudent(code), load(code, month)]);
      if (cancelled) return;
      if (!id) {
        router.replace("/login");
        return;
      }
      setIdentity(id);
      setHistory(h ?? { attendance: [], leaves: [] });
    })();
    return () => {
      cancelled = true;
    };
  }, [router, month]);

  const att = useMemo(() => history?.attendance ?? [], [history]);
  const leaves = useMemo(() => history?.leaves ?? [], [history]);

  const refresh = async () => {
    const code = getStudentCode();
    if (!code) return;
    const h = await load(code, month);
    if (h) setHistory(h);
  };

  // เกณฑ์ขาดของเทอมนี้ (แบนเนอร์ใต้ % bar)
  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    (async () => {
      const [terms, limits] = await Promise.all([fetchTerms(), fetchLimits()]);
      const term = terms?.find((t) => t.isCurrent) ?? null;
      const lim = limits?.find((l) => l.level === levelOf(identity.group)) ?? null;
      if (!term || !lim || lim.maxAbsent === null) {
        if (!cancelled) setLimitInfo(null);
        return;
      }
      const absent =
        (await fetchAbsencesInRange(identity.code, term.startsOn, term.endsOn)) ?? 0;
      if (!cancelled) {
        setLimitInfo({ max: lim.maxAbsent, absent, termName: term.name });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identity]);

  const present = att.filter((a) => a.status === "present").length;
  const late = att.filter((a) => a.status === "late").length;
  const absent = att.filter((a) => a.status === "absent").length;
  const activity = att.filter((a) => a.status === "activity").length;
  const leaveApproved = leaves.filter((l) => l.status === "approved");
  const sickCount = leaveApproved.filter((l) => l.type === "sick").length;
  const personalCount = leaveApproved.filter((l) => l.type === "personal").length;
  const total = att.length;
  const attended = present + late + activity;
  const pct = total > 0 ? Math.round((attended / total) * 1000) / 10 : 0;
  const passed = total > 0 && pct >= PASS_THRESHOLD;

  // ปฏิทิน: วันที่ → สถานะ (เช็กชื่อก่อน, ใบลาครอบคลุมทีหลัง)
  const dayStatus = useMemo(() => {
    const m = new Map<string, DayStatus>();
    leaves.forEach((l) => {
      const cur = new Date(`${l.date_from}T00:00:00`);
      const end = new Date(`${l.date_to}T00:00:00`);
      while (cur <= end) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
        if (!m.has(key)) m.set(key, "leave");
        cur.setDate(cur.getDate() + 1);
      }
    });
    att.forEach((a) => {
      const s = a.status;
      if (s === "present" || s === "absent" || s === "late" || s === "activity") m.set(a.date, s);
    });
    return m;
  }, [att, leaves]);

  const [calY, calM] = month.split("-").map(Number) as [number, number];
  const firstDow = new Date(calY, (calM ?? 1) - 1, 1).getDay();
  const daysInMonth = new Date(calY, calM ?? 1, 0).getDate();
  const cells: Array<{ day: number | null; date: string | null }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, date: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      date: `${calY}-${String(calM).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }

  const dot: Record<DayStatus, string> = {
    present: "bg-[#1e8e3e]",
    absent: "bg-[#c62828]",
    leave: "bg-[#2474c6]",
    late: "bg-[#f0a020]",
    activity: "bg-[#00897b]",
  };
  const ring: Record<DayStatus, string> = {
    present: "",
    absent: "ring-2 ring-[#c62828]",
    leave: "ring-2 ring-[#2474c6]",
    late: "ring-2 ring-[#f0a020]",
    activity: "",
  };

  // รายการที่ไม่ปกติ: ขาด/สาย/กิจกรรม + ใบลาทั้งหมด
  const exceptions = useMemo(() => {
    const rows: Array<{
      key: string;
      date: string;
      dateLabel: string;
      type: string;
      detail: string;
      proof: string;
      status: "approved" | "pending" | "rejected";
      statusLabel: string;
    }> = [];
    att.forEach((a, i) => {
      if (a.status === "absent") {
        rows.push({ key: `a-${i}`, date: a.date, dateLabel: fmtDate(a.date), type: "ขาดเรียน", detail: "ไม่ปรากฏตัว", proof: "-", status: "pending", statusLabel: "รอดำเนินการ" });
      } else if (a.status === "late") {
        rows.push({ key: `a-${i}`, date: a.date, dateLabel: fmtDate(a.date), type: "มาสาย", detail: "สแกนหน้าตอนสาย", proof: "-", status: "approved", statusLabel: "อนุมัติแล้ว" });
      } else if (a.status === "activity") {
        rows.push({ key: `a-${i}`, date: a.date, dateLabel: fmtDate(a.date), type: "กิจกรรม", detail: "เข้าร่วมกิจกรรม", proof: "-", status: "approved", statusLabel: "อนุมัติแล้ว" });
      }
    });
    leaves.forEach((l, i) => {
      rows.push({
        key: `l-${i}`,
        date: l.date_from,
        dateLabel: fmtDate(l.date_from),
        type: l.type === "sick" ? "ลาป่วย" : "ลากิจ",
        detail: l.reason ?? "-",
        proof: "-",
        status: l.status === "approved" ? "approved" : l.status === "rejected" ? "rejected" : "pending",
        statusLabel: l.status === "approved" ? "อนุมัติแล้ว" : l.status === "rejected" ? "ปฏิเสธ" : "รอดำเนินการ",
      });
    });
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [att, leaves]);

  const shiftMonth = (delta: number) => {
    const d = new Date(calY, (calM ?? 1) - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  if (!identity) {
    return (
      <StudentSummaryShell
        identity={{ code: "", name: "...", group: "...", hasFace: false, descriptor: null, photo: null }}
        active="summary"
      >
        <p className="py-10 text-center text-[14px] text-[#5b6b82]">กำลังโหลด...</p>
      </StudentSummaryShell>
    );
  }

  const statCards = [
    { label: "มาเรียน", eng: "Present", value: present, unit: "วัน", num: "text-[#1e8e3e]", icon: <CheckCircleIcon className="h-6 w-6 text-[#1e8e3e]" />, sub: null as string | null },
    { label: "ขาดเรียน", eng: "Absent", value: absent, unit: "วัน", num: "text-[#c62828]", icon: <AlertCircleIcon className="h-6 w-6 text-[#c62828]" />, sub: null },
    { label: "ลาเรียน", eng: "Leave", value: leaveApproved.length, unit: "วัน", num: "text-[#2474c6]", icon: <ReportIcon className="h-6 w-6 text-[#2474c6]" />, sub: `ป่วย ${sickCount} / กิจ ${personalCount}` },
    { label: "มาสาย", eng: "Late", value: late, unit: "วัน", num: "text-[#e69500]", icon: <ClockIcon className="h-6 w-6 text-[#e69500]" />, sub: null },
    { label: "รวมวันเรียนสะสม", eng: "Total Days", value: total, unit: "วัน", num: "text-[#5b6b82]", icon: null, sub: null },
  ];

  return (
    <StudentSummaryShell identity={identity} active="summary" onDataChange={() => void refresh()}>
      <h1 className="mb-3 text-[24px] font-bold leading-tight text-[#16233a] sm:text-[30px]">
        สรุปประวัติการเข้าเรียน{" "}
        <span className="whitespace-nowrap text-[0.65em] font-semibold">(Attendance &amp; Leave Summary)</span>
      </h1>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_190px]">
        {/* แถบ % + การ์ดสถิติ */}
        <div className="min-w-0">
          <Card className="p-4" >
            <div id="summary-top" className="relative h-11 overflow-hidden rounded-lg bg-[#d5dde8]">
              <div
                className={cn("flex h-full items-center rounded-lg", passed ? "bg-[#1e8e3e]" : "bg-[#e65100]")}
                style={{ width: `${total > 0 ? Math.max(38, Math.min(100, pct)) : 0}%` }}
              >
                <p className="whitespace-nowrap px-4 text-[14px] font-bold text-white sm:text-[16px]">
                  {total > 0 ? (
                    <>ร้อยละการเข้าเรียนสะสม: {pct}% ({passed ? "ผ่านเกณฑ์" : "ไม่ผ่านเกณฑ์"})</>
                  ) : (
                    <>ยังไม่มีข้อมูลเดือนนี้</>
                  )}
                </p>
              </div>
            </div>
            <p className="mt-1.5 text-right text-[12.5px] text-[#5b6b82]">เกณฑ์ขั้นต่ำ 80.0%</p>
          </Card>

          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
            {statCards.map((c) => (
              <Card key={c.label} className="flex min-h-[118px] flex-col justify-between p-3.5">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[14px] font-bold leading-tight text-[#16233a]">
                    {c.label}
                    <span className="block text-[11.5px] font-medium text-[#5b6b82]">{c.eng}</span>
                  </p>
                  {c.icon}
                </div>
                <div>
                  <p className={cn("text-[30px] font-bold leading-none", c.num)}>
                    {c.value} <span className="text-[16px] font-semibold">วัน</span>
                  </p>
                  {c.sub ? <p className="mt-1 text-[12px] text-[#5b6b82]">{c.sub}</p> : null}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* ปุ่มขวา */}
        <div className="flex flex-row gap-2 lg:flex-col">
          <UIButton variant="green" onClick={() => openStudentModal("leave")} className="h-auto min-h-[52px] flex-1 flex-col gap-0 px-3 py-2 text-[14.5px] leading-snug lg:w-full lg:flex-none">
            ยื่นใบลาออนไลน์
            <span className="text-[11.5px] font-medium opacity-90">(Apply for Leave)</span>
          </UIButton>
          <button
            type="button"
            onClick={() => openStudentModal("dispute")}
            className="min-h-[52px] flex-1 rounded-md border-2 border-[#c62828]/60 bg-[#fef6f6] px-3 py-2 text-[14.5px] font-bold leading-snug text-[#c62828] hover:bg-[#fdecec] lg:w-full lg:flex-none"
          >
            แจ้งขอแก้ไขข้อมูล
            <span className="block text-[11.5px] font-medium">(Dispute Error)</span>
          </button>
          <button
            type="button"
            onClick={() => document.getElementById("summary-top")?.scrollIntoView({ behavior: "smooth" })}
            className="min-h-[52px] flex-1 rounded-md border border-[#d8e0ec] bg-[#eef3f9] px-3 py-2 text-[14.5px] font-bold leading-snug text-[#5b6b82] hover:bg-[#e4ecf5] lg:w-full lg:flex-none"
          >
            รวมวันเรียนสะสม
            <span className="block text-[11.5px] font-medium">(Total Days)</span>
          </button>
        </div>
      </div>

      {limitInfo ? (
        limitInfo.absent >= (limitInfo.max ?? Number.MAX_SAFE_INTEGER) ? (
          <p role="alert" className="mt-3 rounded-xl bg-[#c62828] px-4 py-3 text-center text-[15px] font-bold text-white">
            ไม่มีสิทธิ์สอบ — ขาด {limitInfo.absent}/{limitInfo.max} ครั้งใน{limitInfo.termName} (ติดต่อครูประจำชั้น)
          </p>
        ) : (
          <p role="status" className="mt-3 rounded-xl border border-[#e4eaf3] bg-white px-4 py-2.5 text-center text-[14px] font-semibold text-[#16233a]">
            เทอมนี้ขาดได้อีก {(limitInfo.max ?? 0) - limitInfo.absent} ครั้ง
            <span className="font-normal text-[#5b6b82]"> (ขาดแล้ว {limitInfo.absent}/{limitInfo.max} · {limitInfo.termName})</span>
          </p>
        )
      ) : null}

      {/* ปฏิทิน + ตาราง */}
      <div id="records" className="mt-3 grid scroll-mt-4 grid-cols-1 gap-3 lg:grid-cols-[340px_1fr]">
        <Card className="p-4">
          <CardTitle className="mb-2">ปฏิทินการมาเรียน</CardTitle>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="เดือนก่อน" onClick={() => shiftMonth(-1)} className="rounded-md px-2 py-1 text-[18px] text-[#5b6b82] hover:bg-[#f1f5fa]">‹</button>
            <p className="text-[15px] font-bold text-[#16233a]">{monthLabel(month)}</p>
            <button type="button" aria-label="เดือนถัดไป" onClick={() => shiftMonth(1)} className="rounded-md px-2 py-1 text-[18px] text-[#5b6b82] hover:bg-[#f1f5fa]">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[12px] font-semibold text-[#5b6b82]">
            {THAI_DOW.map((d) => (
              <span key={d} className="py-1">{d}</span>
            ))}
            {cells.map((c, i) =>
              c.day === null ? (
                <span key={`e-${i}`} />
              ) : (
                (() => {
                  const st = c.date ? dayStatus.get(c.date) : undefined;
                  return (
                    <span
                      key={c.date}
                      title={st ? `${c.day}: ${st}` : `${c.day}`}
                      className={cn(
                        "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-medium",
                        st ? "text-white" : "text-[#16233a]",
                        st ? dot[st] : "",
                        st ? ring[st] : "",
                      )}
                    >
                      {c.day}
                    </span>
                  );
                })()
              ),
            )}
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[12px] text-[#5b6b82]">
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#1e8e3e]" />มาเรียน</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#c62828]" />ขาด</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#2474c6]" />ลา</span>
            <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-[#f0a020]" />สาย</span>
          </div>
        </Card>

        <Card className="p-4">
          <CardTitle>รายการที่ไม่ปกติ</CardTitle>
          <p className="mb-2 text-[12.5px] text-[#5b6b82]">Non-Attendance &amp; Exception Log</p>
          {exceptions.length === 0 ? (
            <p className="py-6 text-center text-[14px] text-[#5b6b82]">
              {total === 0 ? "เดือนนี้ยังไม่มีข้อมูล" : "ไม่มีรายการผิดปกติ — ดีมาก!"}
            </p>
          ) : (
            <div className="slim-scroll -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="text-[13px] font-bold text-[#16233a]">
                    <th className="py-2 pr-3">วันที่</th>
                    <th className="py-2 pr-3">ประเภท</th>
                    <th className="py-2 pr-3">รายละเอียด</th>
                    <th className="py-2 pr-3">หลักฐาน</th>
                    <th className="py-2 text-right">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.map((r) => (
                    <tr key={r.key} className="border-t border-[#eef2f7] align-middle">
                      <td className="whitespace-nowrap py-2 pr-3 text-[13.5px] text-[#16233a]">{r.dateLabel}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-[13.5px] font-semibold text-[#2474c6]">{r.type}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-[13.5px] text-[#16233a]">{r.detail}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-[13.5px] text-[#5b6b82]">{r.proof}</td>
                      <td className="whitespace-nowrap py-2 text-right">
                        <span className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12.5px] font-bold",
                          r.status === "approved" ? "bg-[#e6f4ea] text-[#166c2e]" : "bg-[#fef6ec] text-[#e65100]",
                        )}>
                          {r.status === "approved" ? "✓" : "!"} {r.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </StudentSummaryShell>
  );
}
