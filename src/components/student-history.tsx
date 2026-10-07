"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StudentShell } from "@/components/student-shell";
import { Card, CardTitle, UIButton } from "@/components/ui";
import { ChevronDownIcon } from "@/components/icons";
import {
  fetchMyHistory,
  getStudentCode,
  lookupStudent,
  type MyHistory,
  type StudentIdentity,
} from "@/lib/student";

const PILL: Record<string, string> = {
  present: "bg-[#1e8e3e]",
  absent: "bg-[#c62828]",
  late: "bg-[#ef8c1a]",
  activity: "bg-[#00897b]",
  pending: "bg-[#ef8c1a]",
  approved: "bg-[#1e8e3e]",
  rejected: "bg-[#5b6b82]",
};
const LABEL: Record<string, string> = {
  present: "มา",
  absent: "ขาด",
  late: "สาย",
  activity: "กิจกรรม",
  pending: "รออนุมัติ",
  approved: "อนุมัติ",
  rejected: "ปฏิเสธ",
};
const LEAVE_TYPE: Record<string, string> = { sick: "ลาป่วย", personal: "ลากิจ" };

type FilterKey = "all" | "present" | "late" | "absent" | "activity" | "leave";

const FILTERS: Array<{ value: FilterKey; label: string }> = [
  { value: "all", label: "ทั้งหมด" },
  { value: "present", label: "มา" },
  { value: "late", label: "สาย" },
  { value: "absent", label: "ขาด" },
  { value: "activity", label: "กิจกรรม" },
  { value: "leave", label: "ลา" },
];

type DetailRow = {
  key: string;
  sortKey: string;
  date: string;
  kind: "checkin" | "leave";
  filter: Exclude<FilterKey, "all">;
  detail: string;
  status: string;
};

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};
const fmtTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "-";

export default function StudentHistoryPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<StudentIdentity | null>(null);
  const [history, setHistory] = useState<MyHistory | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    const code = getStudentCode();
    if (!code) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      const [id, h] = await Promise.all([lookupStudent(code), fetchMyHistory(code)]);
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
  }, [router]);

  const rows: DetailRow[] = useMemo(() => {
    if (!history) return [];
    const out: DetailRow[] = history.attendance.map((a, i) => ({
      key: `a-${a.date}-${i}`,
      sortKey: `${a.date} ${a.check_in_at ?? ""}`,
      date: a.date,
      kind: "checkin" as const,
      filter: (["present", "late", "absent", "activity"] as const).includes(
        a.status as "present" | "absent" | "late" | "activity",
      )
        ? (a.status as "present" | "absent" | "late" | "activity")
        : "present",
      detail: `${fmtTime(a.check_in_at)} · ${a.grp}${
        a.period_no !== null && a.period_no !== undefined ? ` · คาบที่ ${a.period_no}` : ""
      }`,
      status: a.status,
    }));
    history.leaves.forEach((l, i) => {
      out.push({
        key: `l-${l.date_from}-${i}`,
        sortKey: `${l.date_from} `,
        date: l.date_from,
        kind: "leave",
        filter: "leave",
        detail: `${l.date_to !== l.date_from ? `ถึง ${fmtDate(l.date_to)} · ` : ""}${LEAVE_TYPE[l.type] ?? l.type} · ${l.reason ?? "-"}`,
        status: l.status,
      });
    });
    return out.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [history]);

  const counts = useMemo(() => {
    const c: Record<Exclude<FilterKey, "all">, number> = {
      present: 0,
      late: 0,
      absent: 0,
      activity: 0,
      leave: 0,
    };
    rows.forEach((r) => {
      if (r.kind === "leave") {
        if (r.status === "approved") c.leave++;
      } else if (r.filter === "present" || r.filter === "late" || r.filter === "absent" || r.filter === "activity") {
        c[r.filter]++;
      }
    });
    return c;
  }, [rows]);

  const checkinTotal =
    counts.present + counts.late + counts.absent + counts.activity;
  const attendPct =
    checkinTotal > 0
      ? Math.round(((counts.present + counts.late + counts.activity) / checkinTotal) * 100)
      : 0;

  const shown = rows.filter((r) => filter === "all" || r.filter === filter);

  const cards: Array<{ label: string; value: number; cls: string }> = [
    { label: "มา", value: counts.present, cls: "bg-[#1e8e3e]" },
    { label: "สาย", value: counts.late, cls: "bg-[#ef8c1a]" },
    { label: "ขาด", value: counts.absent, cls: "bg-[#c62828]" },
    { label: "ลา", value: counts.leave, cls: "bg-[#2474c6]" },
    { label: "กิจกรรม", value: counts.activity, cls: "bg-[#00897b]" },
  ];

  if (!identity) {
    return (
      <StudentShell name="..." group="..." active="history">
        <p className="py-10 text-center text-[14px] text-[#5b6b82]">กำลังโหลด...</p>
      </StudentShell>
    );
  }

  return (
    <StudentShell name={identity.name} group={`${identity.code} · ${identity.group}`} active="history">
      {/* การ์ดสรุป */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl px-3 py-2.5 text-white ${c.cls}`}>
            <p className="text-[13px] font-medium">{c.label}</p>
            <p className="text-[22px] font-bold leading-tight">{c.value}</p>
          </div>
        ))}
        <div className="rounded-xl bg-[#16233a] px-3 py-2.5 text-white">
          <p className="text-[13px] font-medium">มาเรียน</p>
          <p className="text-[22px] font-bold leading-tight">{checkinTotal > 0 ? `${attendPct}%` : "–"}</p>
        </div>
      </div>
      <p className="mt-1.5 text-[12px] text-[#8a97ab]">
        สรุปจากข้อมูล {rows.length} รายการล่าสุด · ลา = ใบลาที่อนุมัติแล้ว
      </p>

      {/* ตารางรายละเอียด + dropdown */}
      <Card className="mt-3 p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <CardTitle className="mr-auto">รายละเอียด ({shown.length})</CardTitle>
          <label className="relative block w-[150px]">
            <span className="sr-only">กรองตามสถานะ</span>
            <select
              aria-label="กรองตามสถานะ"
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterKey)}
              className="h-10 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-9 text-[14px] text-[#16233a] focus:border-[#2474c6] focus:outline-none"
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
          </label>
        </div>
        {shown.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-[#5b6b82]">
            {rows.length === 0 ? "ยังไม่มีประวัติ" : "ไม่มีรายการตามเงื่อนไข"}
          </p>
        ) : (
          <ul className="divide-y divide-[#eef2f7]">
            {shown.map((r) => (
              <li key={r.key} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-[#16233a]">{fmtDate(r.date)}</p>
                  <p className="truncate text-[13px] text-[#5b6b82]">{r.detail}</p>
                </div>
                <span
                  className={`shrink-0 rounded-md px-2.5 py-1 text-[12.5px] font-bold text-white ${PILL[r.status] ?? "bg-[#5b6b82]"}`}
                >
                  {r.kind === "leave" && r.status === "approved"
                    ? "ลา"
                    : (LABEL[r.status] ?? r.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <UIButton href="/student/scan" variant="green" className="mt-3 h-11 w-full">
        ไปสแกนใบหน้าเช็กชื่อ
      </UIButton>
    </StudentShell>
  );
}
