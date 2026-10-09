"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import {
  AttendanceIcon,
  BellIcon,
  ManageIcon,
  ProfileIcon,
} from "@/components/icons";
import { Avatar, Card, CardTitle, ProgressBar, UIButton } from "@/components/ui";
import {
  type CheckIn,
  type StatItem,
  type TodayGroup,
} from "@/data/dashboard";
import {
  fetchAbsentCounts,
  fetchRecordsByDate,
  fetchSessionsByDate,
  todayStr,
  type AbsentCount,
  type DayRecord,
  type SessionInfo,
} from "@/lib/attendance";
import {
  fetchLimits,
  fetchTerms,
  levelOf,
} from "@/lib/terms";
import { useRoster } from "@/lib/school-data";
import { useTeacherGroup } from "@/lib/teacher-scope";
import { fetchPendingLeaves, type LeaveItem } from "@/lib/leaves";
import { fetchPendingDisputes, type StudentDispute } from "@/lib/disputes";
import { cn } from "@/lib/cn";

const STAT_ICONS = {
  manage: ManageIcon,
  profile: ProfileIcon,
  attendance: AttendanceIcon,
  bell: BellIcon,
} as const;

/* ---------- Stat card ---------- */
function StatCard({
  label,
  value,
  sub,
  icon,
  caption,
  accent,
}: StatItem) {
  const Icon = STAT_ICONS[icon];
  return (
    <Card className="flex min-h-[118px] flex-col justify-between p-4">
      <p className="text-[15px] font-semibold text-[#16233a]">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div>
          <p className="text-[34px] font-bold leading-none tracking-tight text-[#0f1b2d]">
            {value}
          </p>
          {sub ? (
            <p className="mt-1 text-[13px] font-medium text-[#5b6b82]">{sub}</p>
          ) : null}
        </div>
        <div className={cn("flex flex-col items-center gap-0.5", accent)}>
          <Icon className="h-[22px] w-[22px]" />
          <span className="text-[12px] font-medium">{caption}</span>
        </div>
      </div>
    </Card>
  );
}

/* ---------- Recent check-ins ---------- */
function RecentCheckIns({ items }: { items: CheckIn[] }) {
  return (
    <Card className="flex flex-col p-4 sm:p-5">
      <CardTitle className="mb-3">การเข้าเรียนล่าสุด</CardTitle>
      {items.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-[#5b6b82]">
          ยังไม่มีการเช็กชื่อวันนี้ — เริ่มที่หน้าเช็กชื่อเข้าเรียน
        </p>
      ) : (
      <ul className="slim-scroll -mr-1 max-h-[320px] space-y-1 overflow-y-auto pr-2">
        {items.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-3 border-b border-[#eef2f7] py-2.5 last:border-0"
          >
            <Avatar initials={s.initials} color={s.color} />
            <div className="min-w-0 leading-snug">
              <p className="truncate text-[14px] font-medium text-[#16233a]">
                {s.thaiName}
                {s.engName ? ` (${s.engName})` : ""} - {s.time}
              </p>
              <p className="text-[13px] text-[#5b6b82]">{s.group}</p>
            </div>
          </li>
        ))}
      </ul>
      )}
    </Card>
  );
}

/* ---------- Today groups ---------- */
function groupTone(status: TodayGroup["status"]) {
  if (status === "completed") return "green" as const;
  if (status === "pending") return "orange" as const;
  return "gray" as const;
}

function statusColor(status: TodayGroup["status"]) {
  if (status === "completed") return "text-[#1e8e3e]";
  if (status === "pending") return "text-[#16233a]";
  return "text-[#16233a]";
}

function TodayGroups({ items }: { items: TodayGroup[] }) {
  return (
    <Card id="today-groups" className="p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <CardTitle>ห้องที่สอนวันนี้</CardTitle>
        <span className="text-[12.5px] font-medium text-[#5b6b82]">{items.length} ห้อง</span>
      </div>
      <ul className="slim-scroll max-h-[520px] divide-y divide-[#eef2f7] overflow-y-auto pr-1">
        {items.map((g) => (
          <li key={g.id} className="py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14.5px] font-bold text-[#16233a]">{g.name}</p>
              <div className="flex items-center gap-3">
                <p
                  className={cn(
                    "text-[13.5px] font-medium",
                    statusColor(g.status),
                  )}
                >
                  {g.statusText}
                </p>
                {g.action ? (
                  <UIButton
                    variant={g.action.variant}
                    href={g.action.href}
                    className="h-8 px-3.5 text-[13.5px]"
                  >
                    {g.action.label}
                  </UIButton>
                ) : null}
              </div>
            </div>
            <div className="mt-1.5">
              <ProgressBar
                value={g.present}
                max={g.total === 0 ? 1 : g.total}
                tone={g.total === 0 ? "gray" : groupTone(g.status)}
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------- เฝ้าระวังขาดเรียน (เทอมปัจจุบัน) ---------- */
function Watchlist({ group }: { group: string }) {
  const [rows, setRows] = useState<
    Array<AbsentCount & { max: number; warn: boolean; over: boolean; termName: string }>
  >([]);
  const [termName, setTermName] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const terms = await fetchTerms();
      const term = terms?.find((t) => t.isCurrent) ?? null;
      if (!term || cancelled) return;
      const [lims, absents] = await Promise.all([
        fetchLimits(),
        fetchAbsentCounts(term.startsOn, term.endsOn),
      ]);
      if (cancelled || !absents || !lims) return;
      const limMap = new Map(lims.map((l) => [l.level, l]));
      const list: Array<AbsentCount & { max: number; warn: boolean; over: boolean; termName: string }> = [];
      for (const a of absents) {
        if (group && a.group !== group) continue;
        const lim = limMap.get(levelOf(a.group));
        if (!lim || lim.maxAbsent === null) continue;
        const remaining = lim.maxAbsent - a.count;
        if (remaining <= lim.warnBefore) {
          list.push({
            ...a,
            max: lim.maxAbsent,
            warn: remaining >= 0,
            over: remaining < 0,
            termName: term.name,
          });
        }
      }
      if (!cancelled) {
        setRows(list.slice(0, 8));
        setTermName(term.name);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [group]);

  if (rows.length === 0) return null;
  return (
    <Card className="mt-3 border-[#f0c98a] bg-[#fffdf5] p-4 sm:p-5">
      <CardTitle className="mb-1">
        เฝ้าระวังขาดเรียน
        <span className="ml-2 text-[12.5px] font-medium text-[#5b6b82]">{termName}</span>
      </CardTitle>
      <ul className="divide-y divide-[#f3e8d3]">
        {rows.map((r) => (
          <li key={r.code} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold text-[#16233a]">
                {r.name}
                <span className="ml-2 font-medium text-[#5b6b82]">{r.group}</span>
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1 text-[12.5px] font-bold text-white",
                r.over ? "bg-[#c62828]" : "bg-[#ef8c1a]",
              )}
            >
              {r.over ? `เกินเกณฑ์ (ขาด ${r.count}/${r.max})` : `ใกล้ครบ (ขาด ${r.count}/${r.max})`}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ActionCenter({
  incompleteGroups,
  unregisteredFaces,
  pendingLeaves,
  pendingDisputes,
}: {
  incompleteGroups: number;
  unregisteredFaces: number;
  pendingLeaves: number;
  pendingDisputes: number;
}) {
  const actions = [
    { label: "ห้องที่ยังเช็กชื่อไม่ครบ", count: incompleteGroups, href: "/#today-groups", tone: "text-[#c62828] bg-[#fdecec]" },
    { label: "นักเรียนยังไม่ลงทะเบียนใบหน้า", count: unregisteredFaces, href: "/students?action=unregistered", tone: "text-[#e65100] bg-[#fef6ec]" },
    { label: "ใบลารอตรวจ", count: pendingLeaves, href: "/reports#pending-leaves", tone: "text-[#2474c6] bg-[#e8f1fb]" },
    { label: "คำขอแก้ไขจากนักเรียน", count: pendingDisputes, href: "/reports#student-disputes", tone: "text-[#6a1b9a] bg-[#f3e5f5]" },
  ].filter((item) => item.count > 0);

  return (
    <Card className="mt-3 p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <CardTitle>งานที่ต้องจัดการ</CardTitle>
        <span className="rounded-full bg-[#f1f5fa] px-2.5 py-1 text-[12px] font-bold text-[#5b6b82]">
          {actions.reduce((sum, item) => sum + item.count, 0)} รายการ
        </span>
      </div>
      {actions.length === 0 ? (
        <p className="py-3 text-center text-[14px] text-[#5b6b82]">ไม่มีงานค้างในห้องที่เลือก</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {actions.map((item) => (
            <li key={item.label}>
              <Link href={item.href} className="flex min-h-[68px] items-center justify-between gap-3 rounded-lg border border-[#e4eaf3] px-3 py-2.5 hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2474c6]">
                <span className="text-[13.5px] font-semibold leading-snug text-[#16233a]">{item.label}</span>
                <span className={cn("inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2 text-[14px] font-bold", item.tone)}>{item.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Teacher home: สรุปตามห้องที่กำลังติดตาม ---------- */
export default function DashboardPage() {
  const { groups, students } = useRoster();
  const groupNames = useMemo(() => groups.map((g) => g.name), [groups]);
  const { selectedGroup, setSelectedGroup } = useTeacherGroup(groupNames);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveItem[] | null>(null);
  const [pendingDisputes, setPendingDisputes] = useState<StudentDispute[] | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [records, setRecords] = useState<DayRecord[]>([]);

  const scopeGroups = useMemo(
    () => groups.filter((g) => !selectedGroup || g.name === selectedGroup),
    [groups, selectedGroup],
  );
  const scopeStudents = useMemo(
    () => students.filter((s) => !selectedGroup || s.group === selectedGroup),
    [students, selectedGroup],
  );
  const scopeGroupNames = useMemo(() => new Set(scopeGroups.map((g) => g.name)), [scopeGroups]);
  const scopeSessions = useMemo(
    () => sessions.filter((s) => scopeGroupNames.has(s.group)),
    [sessions, scopeGroupNames],
  );
  const scopeRecords = useMemo(
    () => records.filter((r) => scopeGroupNames.has(r.group)),
    [records, scopeGroupNames],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSessionsByDate(todayStr()), fetchRecordsByDate(todayStr())]).then(
      ([s, r]) => {
        if (!cancelled) {
          setSessions(s ?? []);
          setRecords(r ?? []);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPendingLeaves(), fetchPendingDisputes()]).then(([leaves, disputes]) => {
      if (cancelled) return;
      setPendingLeaves(leaves);
      setPendingDisputes(disputes);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats: StatItem[] = useMemo(() => {
    const sessionGroups = new Set(scopeSessions.map((s) => s.group));
    const total = scopeGroups
      .filter((g) => sessionGroups.has(g.name))
      .reduce((a, g) => a + g.count, 0);
    const attended = scopeRecords.filter((r) =>
      ["present", "late", "activity"].includes(r.status),
    ).length;
    const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
    const pendingEnroll = scopeStudents.filter((s) => !s.registered).length;
    return [
      {
        id: "groups",
        label: "ห้องที่กำลังติดตาม",
        value: String(scopeGroups.length),
        sub: selectedGroup || "ทุกห้อง",
        icon: "manage",
        caption: "ห้องเรียน",
        accent: "text-[#2474c6]",
      },
      {
        id: "students",
        label: "จำนวนนักเรียน",
        value: String(scopeStudents.length),
        sub: selectedGroup || "ทุกห้อง",
        icon: "profile",
        caption: "รายชื่อ",
        accent: "text-[#2474c6]",
      },
      {
        id: "today",
        label: "การเข้าเรียนวันนี้",
        value: sessionGroups.size > 0 ? `${pct}%` : "–",
        sub:
          sessionGroups.size > 0
            ? `${attended}/${total} คน · เปิดรอบ ${sessionGroups.size}/${scopeGroups.length} ห้อง`
            : `ยังไม่เปิดรอบ · ${scopeGroups.length} ห้อง`,
        icon: "attendance",
        caption: "วันนี้",
        accent: "text-[#1e8e3e]",
      },
      {
        id: "alerts",
        label: "ยังไม่ลงทะเบียนใบหน้า",
        value: String(pendingEnroll),
        sub: selectedGroup || "ทุกห้อง",
        icon: "bell",
        caption: "ตั้งค่า",
        accent: "text-[#e65100]",
      },
    ];
  }, [scopeGroups, scopeStudents, scopeSessions, scopeRecords, selectedGroup]);

  const recentCheckIns: CheckIn[] = useMemo(() => {
    const meta = new Map(scopeStudents.map((s) => [s.code, s]));
    return [...scopeRecords]
      .filter((r) => r.checkInAt)
      .sort((a, b) => (b.checkInAt as string).localeCompare(a.checkInAt as string))
      .slice(0, 5)
      .map((r) => {
        const st = meta.get(r.studentCode);
        return {
          id: r.id,
          thaiName: r.name,
          time: r.time,
          group: r.group,
          initials: st?.initials ?? "?",
          color: st?.color ?? "bg-[#dbe7f5] text-[#1a5da3]",
        };
      });
  }, [scopeRecords, scopeStudents]);

  const todayGroups: TodayGroup[] = useMemo(() => {
    const byGroup = new Map<string, DayRecord[]>();
    scopeRecords.forEach((r) => {
      const arr = byGroup.get(r.group) ?? [];
      arr.push(r);
      byGroup.set(r.group, arr);
    });
    const sessionOf = new Map(scopeSessions.map((s) => [s.group, s]));
    return [...scopeGroups]
      .sort((a, b) => {
        const rank = (name: string) => {
          const status = sessionOf.get(name)?.status;
          return status === "completed" ? 2 : status ? 1 : 0;
        };
        return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "th", { numeric: true });
      })
      .map((g) => {
        const recs = byGroup.get(g.name) ?? [];
        const present = recs.filter((r) =>
          ["present", "late", "activity"].includes(r.status),
        ).length;
        const session = sessionOf.get(g.name);
        const done = session?.status === "completed";
        return {
          id: g.name,
          name: g.name,
          status: done ? ("completed" as const) : session ? ("pending" as const) : ("soon" as const),
          statusText: session
            ? `${done ? "เช็กชื่อครบ" : "กำลังเช็ก"} (${present}/${g.count})`
            : `ยังไม่เปิดรอบ (${g.count} คน)`,
          present,
          total: g.count,
          action: done
            ? undefined
            : { label: session ? "ทำต่อ" : "เริ่มเช็กชื่อ", variant: "green" as const, href: `/scanner?group=${encodeURIComponent(g.name)}` },
        };
      });
  }, [scopeGroups, scopeSessions, scopeRecords]);

  const sessionByGroup = new Map(scopeSessions.map((s) => [s.group, s]));
  const incompleteGroups = scopeGroups.filter((g) => sessionByGroup.get(g.name)?.status !== "completed").length;
  const leaveCount = (pendingLeaves ?? []).filter((l) => !selectedGroup || l.group === selectedGroup).length;
  const disputeCount = (pendingDisputes ?? []).filter((d) => !selectedGroup || d.group === selectedGroup).length;

  return (
    <AppShell active="dashboard" title="สวัสดี ครูลูกหมี">
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#e4eaf3] bg-white px-3 py-2.5">
        <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-[13px] font-semibold text-[#16233a] sm:flex-none">
          ห้องที่กำลังติดตาม
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="h-10 min-w-[150px] flex-1 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] font-medium sm:flex-none"
          >
            <option value="">ทุกห้อง</option>
            {groupNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <p className="text-[12px] text-[#5b6b82]">ระบบจำห้องที่เลือกไว้ในหน้าเช็กชื่อ รายงาน ตารางเรียน และกรอกคะแนน</p>
      </div>

      {/* stat cards: 1 col mobile / 2 cols tablet / 4 cols desktop */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.id} {...s} />
        ))}
      </div>

      <ActionCenter
        incompleteGroups={incompleteGroups}
        unregisteredFaces={scopeStudents.filter((s) => !s.registered).length}
        pendingLeaves={leaveCount}
        pendingDisputes={disputeCount}
      />

      {/* lower panels */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <RecentCheckIns items={recentCheckIns} />
        <TodayGroups items={todayGroups} />
      </div>

      <Watchlist group={selectedGroup} />

      {/* ทางลัดตามงานสอน */}
      <div className="mt-5">
        <h2 className="mb-2.5 text-[19px] font-bold text-[#16233a]">เริ่มงาน</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <UIButton
            variant="green"
            href={selectedGroup ? `/scanner?group=${encodeURIComponent(selectedGroup)}` : "/scanner"}
            className="h-11 w-full"
          >
            เริ่มเช็กชื่อ{selectedGroup ? ` ${selectedGroup}` : ""}
          </UIButton>
          <UIButton variant="blue" href="/grading" className="h-11 w-full">
            กรอกคะแนน
          </UIButton>
          <UIButton variant="blue" href="/reports" className="h-11 w-full">
            ดูรายงานการเข้าเรียน
          </UIButton>
        </div>
      </div>
    </AppShell>
  );
}
