"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StudentSummaryShell, openStudentModal } from "@/components/student-summary";
import { Card, CardTitle, DonutChart, ProgressBar, UIButton } from "@/components/ui";
import { ChevronDownIcon, SearchIcon } from "@/components/icons";
import {
  fetchAssignments,
  fetchAssignmentSummary,
  getStudentCode,
  lookupStudent,
  type AssignmentRow,
  type AssignmentSummary,
  type StudentIdentity,
} from "@/lib/student";
import { fetchGradeScales, gradeOf, GRADE_POINTS, type GradeScale } from "@/lib/grading";
import { cn } from "@/lib/cn";

const STATUS_STYLE: Record<string, string> = {
  submitted: "bg-[#1e8e3e]",
  missing: "bg-[#c62828]",
  pending: "bg-[#ef8c1a]",
  upcoming: "bg-[#5b6b82]",
};
const STATUS_LABEL: Record<string, string> = {
  submitted: "มาส่ง",
  missing: "ขาดส่ง",
  pending: "รอตรวจ",
  upcoming: "รอส่ง",
};

const CAT_TONES = ["green", "blue", "orange", "purple"] as const;

/** ระดับชั้นจากชื่อกลุ่ม เช่น "ม.1/1" → "ม.1" */
const levelOfGroup = (g: string) => (g.includes("/") ? (g.split("/")[0] as string) : g);

const fmtDue = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : iso;
};

type FilterKey = "all" | "submitted" | "missing" | "pending";

export default function StudentGradesPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<StudentIdentity | null>(null);
  const [summary, setSummary] = useState<AssignmentSummary | null>(null);
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [scales, setScales] = useState<GradeScale[] | null>(null);

  useEffect(() => {
    const code = getStudentCode();
    if (!code) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      const [id, s, r] = await Promise.all([
        lookupStudent(code),
        fetchAssignmentSummary(code),
        fetchAssignments(code),
      ]);
      if (cancelled) return;
      if (!id) {
        router.replace("/login");
        return;
      }
      setIdentity(id);
      setSummary(s ?? { total: 0, submitted: 0, missing: 0, pending: 0, earned: 0, max: 0, cats: [] });
      setRows(r ?? []);
      const sc = await fetchGradeScales(levelOfGroup(id.group));
      if (!cancelled) setScales(sc);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const avgPct =
    summary && summary.max > 0 ? Math.round((summary.earned / summary.max) * 1000) / 10 : 0;
  const gradeLetter = gradeOf(scales, avgPct);
  const gradePoints =
    gradeLetter !== null ? (GRADE_POINTS[gradeLetter] ?? null) : null;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" || r.st === filter) &&
        (!q ||
          r.title.toLowerCase().includes(q) ||
          r.subject.toLowerCase().includes(q)),
    );
  }, [rows, filter, query]);

  const shellIdentity: StudentIdentity =
    identity ?? { code: "", name: "...", group: "...", hasFace: false, descriptor: null, photo: null };

  return (
    <StudentSummaryShell identity={shellIdentity} active="grades">
      {!identity ? (
        <p className="py-10 text-center text-[14px] text-[#5b6b82]">กำลังโหลด...</p>
      ) : (
        <>
          <h1 className="mb-3 text-[24px] font-bold leading-tight text-[#16233a] sm:text-[30px]">
            สรุปการส่งงาน &amp; คะแนนสะสม{" "}
            <span className="whitespace-nowrap text-[0.65em] font-semibold">(Assignments &amp; Grades)</span>
          </h1>

          {/* การ์ดสถิติ 4 ใบ */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-[14px] font-bold text-[#16233a]">
                คะแนนเก็บสะสม
                <span className="block text-[11.5px] font-medium text-[#5b6b82]">(Cumulative Score)</span>
              </p>
              <p className="mt-1 text-[26px] font-bold leading-none text-[#1e8e3e]">
                {summary?.earned ?? 0} <span className="text-[15px] font-semibold text-[#5b6b82]">/ {summary?.max ?? 0} คะแนน</span>
              </p>
              <p className="mt-1 text-[12.5px] text-[#5b6b82]">
                {gradeLetter !== null && gradePoints !== null ? (
                  <>เกรด: {gradeLetter} ({gradePoints.toFixed(1)})</>
                ) : (
                  <>เกรดเฉลี่ย: –</>
                )}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[14px] font-bold text-[#16233a]">
                งานทั้งหมด
                <span className="block text-[11.5px] font-medium text-[#5b6b82]">(Total Assignments)</span>
              </p>
              <p className="mt-1 text-[26px] font-bold leading-none text-[#16233a]">
                {summary?.total ?? 0} <span className="text-[15px] font-semibold text-[#5b6b82]">งาน</span>
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[14px] font-bold text-[#16233a]">
                ส่งแล้ว
                <span className="block text-[11.5px] font-medium text-[#5b6b82]">(Submitted)</span>
              </p>
              <p className="mt-1 text-[26px] font-bold leading-none text-[#1e8e3e]">
                {summary?.submitted ?? 0} <span className="text-[15px] font-semibold text-[#5b6b82]">งาน</span>
              </p>
            </Card>
            <div className="grid grid-cols-1 gap-2.5">
              <Card className="flex items-center justify-between px-4 py-2.5">
                <p className="text-[14px] font-bold text-[#16233a]">
                  ขาดส่ง
                  <span className="block text-[11.5px] font-medium text-[#5b6b82]">(Missing)</span>
                </p>
                <p className="text-[24px] font-bold leading-none text-[#c62828]">
                  {summary?.missing ?? 0} <span className="text-[14px] font-semibold">งาน</span>
                </p>
              </Card>
              <Card className="flex items-center justify-between px-4 py-2.5">
                <p className="text-[14px] font-bold text-[#16233a]">
                  รอตรวจ
                  <span className="block text-[11.5px] font-medium text-[#5b6b82]">(Pending Evaluation)</span>
                </p>
                <p className="text-[24px] font-bold leading-none text-[#e69500]">
                  {summary?.pending ?? 0} <span className="text-[14px] font-semibold">งาน</span>
                </p>
              </Card>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[340px_1fr]">
            {/* สรุปตามหมวด */}
            <Card className="p-4">
              <CardTitle className="mb-1">สรุปคะแนนตามประเมิน</CardTitle>
              <p className="mb-3 text-[12.5px] text-[#5b6b82]">(Score Breakdown)</p>
              <div className="flex items-center gap-4">
                <DonutChart pct={avgPct} size={110} track="#e6ebf2" bar="#1e8e3e" thickness={6}>
                  <span className="text-[22px] font-bold text-[#16233a]">{summary?.earned ?? 0}</span>
                  <span className="text-[11px] text-[#5b6b82]">คะแนน ({avgPct}%)</span>
                </DonutChart>
                <div className="min-w-0 flex-1 space-y-2">
                  {(summary?.cats ?? []).map((c, i) => (
                    <div key={c.category}>
                      <p className="flex justify-between text-[12.5px] text-[#16233a]">
                        <span className="truncate font-medium">{c.category}</span>
                        <span className="ml-2 shrink-0 font-bold">{c.earned}/{c.max} คะแนน</span>
                      </p>
                      <ProgressBar
                        value={c.earned}
                        max={c.max === 0 ? 1 : c.max}
                        tone={CAT_TONES[i % CAT_TONES.length] ?? "green"}
                      />
                    </div>
                  ))}
                  {(summary?.cats ?? []).length === 0 ? (
                    <p className="text-[13px] text-[#8a97ab]">ยังไม่มีงานที่ถึงกำหนด</p>
                  ) : null}
                </div>
              </div>
            </Card>

            {/* ประวัติการส่ง */}
            <Card className="p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="mr-auto">
                  <CardTitle>ประวัติและสถานะการส่งงาน</CardTitle>
                  <p className="text-[12.5px] text-[#5b6b82]">(Assignment History)</p>
                </div>
                <UIButton variant="green" onClick={() => openStudentModal("leave")} className="h-9 px-3 text-[13px]">
                  ยื่นใบลา
                </UIButton>
              </div>
              <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_170px]">
                <label className="relative block">
                  <span className="sr-only">ค้นหางาน</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ค้นหา"
                    className="h-10 w-full rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-10 text-[14px] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
                  />
                  <SearchIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
                </label>
                <label className="relative block">
                  <span className="sr-only">กรองสถานะ</span>
                  <select
                    aria-label="กรองสถานะ"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as typeof filter)}
                    className="h-10 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-9 text-[14px] text-[#16233a] focus:border-[#2474c6] focus:outline-none"
                  >
                    <option value="all">ทั้งหมด</option>
                    <option value="submitted">ส่งแล้ว</option>
                    <option value="missing">ขาดส่ง (Missing)</option>
                    <option value="pending">รอตรวจ</option>
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
                </label>
              </div>
              {shown.length === 0 ? (
                <p className="py-6 text-center text-[14px] text-[#5b6b82]">
                  {rows.length === 0 ? "ยังไม่มีงานที่ถึงกำหนดส่ง" : "ไม่พบงานตามเงื่อนไข"}
                </p>
              ) : (
                <div className="slim-scroll -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
                  <table className="w-full min-w-[620px] border-collapse text-left">
                    <thead>
                      <tr className="text-[13px] font-bold text-[#16233a]">
                        <th className="py-2 pr-3">ชื่องาน</th>
                        <th className="py-2 pr-3">วิชา</th>
                        <th className="py-2 pr-3">กำหนดส่ง</th>
                        <th className="py-2 pr-3">สถานะ</th>
                        <th className="py-2 text-right">คะแนนที่ได้</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r, i) => (
                        <tr key={`${r.title}-${i}`} className="border-t border-[#eef2f7] align-middle">
                          <td className="py-2 pr-3 text-[13.5px] font-medium text-[#16233a]">{r.title}</td>
                          <td className="whitespace-nowrap py-2 pr-3 text-[13.5px] text-[#16233a]">{r.subject}</td>
                          <td className="whitespace-nowrap py-2 pr-3 text-[13.5px] text-[#16233a]">{fmtDue(r.due)}</td>
                          <td className="whitespace-nowrap py-2 pr-3">
                            <span className={cn("inline-flex min-w-[64px] items-center justify-center rounded-md px-2 py-0.5 text-[12.5px] font-bold text-white", STATUS_STYLE[r.st] ?? "bg-[#5b6b82]")}>
                              {STATUS_LABEL[r.st] ?? r.st}
                            </span>
                          </td>
                          <td className="whitespace-nowrap py-2 text-right text-[13.5px] font-bold text-[#16233a]">
                            {r.st === "submitted" ? `${r.score ?? 0}/${r.max_score}` : r.st === "missing" ? `-/ ${r.max_score}` : `${r.max_score}`}
                            {r.st === "missing" ? (
                              <span className="ml-1 rounded bg-[#c62828] px-1 py-px text-[10.5px] font-bold text-white">เกินกำหนด</span>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </StudentSummaryShell>
  );
}
