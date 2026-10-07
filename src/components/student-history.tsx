"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StudentShell } from "@/components/student-shell";
import { Card, CardTitle, UIButton } from "@/components/ui";
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

  if (!identity) {
    return (
      <StudentShell name="..." group="..." active="history">
        <p className="py-10 text-center text-[14px] text-[#5b6b82]">กำลังโหลด...</p>
      </StudentShell>
    );
  }

  return (
    <StudentShell name={identity.name} group={`${identity.code} · ${identity.group}`} active="history">
      <Card className="p-4 sm:p-5">
        <CardTitle className="mb-2">ประวัติเช็กชื่อ ({history?.attendance.length ?? 0})</CardTitle>
        {!history || history.attendance.length === 0 ? (
          <p className="py-4 text-center text-[14px] text-[#5b6b82]">ยังไม่มีประวัติเช็กชื่อ</p>
        ) : (
          <ul className="divide-y divide-[#eef2f7]">
            {history.attendance.map((a, i) => (
              <li key={`${a.date}-${i}`} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[#16233a]">
                    {fmtDate(a.date)} · {fmtTime(a.check_in_at)} · {a.grp}
                    {a.period_no !== null && a.period_no !== undefined ? ` · คาบที่ ${a.period_no}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-md px-2.5 py-1 text-[12.5px] font-bold text-white ${PILL[a.status] ?? "bg-[#5b6b82]"}`}
                >
                  {LABEL[a.status] ?? a.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-3 p-4 sm:p-5">
        <CardTitle className="mb-2">ประวัติการลา ({history?.leaves.length ?? 0})</CardTitle>
        {!history || history.leaves.length === 0 ? (
          <p className="py-4 text-center text-[14px] text-[#5b6b82]">ไม่มีประวัติการลา</p>
        ) : (
          <ul className="divide-y divide-[#eef2f7]">
            {history.leaves.map((l, i) => (
              <li key={`${l.date_from}-${i}`} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[#16233a]">
                    {fmtDate(l.date_from)}
                    {l.date_to !== l.date_from ? ` – ${fmtDate(l.date_to)}` : ""} ·{" "}
                    {LEAVE_TYPE[l.type] ?? l.type} · {l.reason ?? "-"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-md px-2.5 py-1 text-[12.5px] font-bold text-white ${PILL[l.status] ?? "bg-[#5b6b82]"}`}
                >
                  {LABEL[l.status] ?? l.status}
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
