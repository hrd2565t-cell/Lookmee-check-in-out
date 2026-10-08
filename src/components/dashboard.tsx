"use client";

import { useEffect, useMemo, useState } from "react";
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
          ยังไม่มีการเช็กชื่อวันนี้ — เริ่มที่หน้า Daily Scanner
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
    <Card className="p-4 sm:p-5">
      <CardTitle className="mb-2">กลุ่มเรียนวันนี้</CardTitle>
      <ul className="divide-y divide-[#eef2f7]">
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
function Watchlist() {
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
  }, []);

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

/* ---------- Page (ตัวเลขจริงจาก DB ทั้งหมด) ---------- */
export default function DashboardPage() {
  const { groups, students } = useRoster();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [records, setRecords] = useState<DayRecord[]>([]);

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

  const sizeOf = useMemo(() => {
    const m = new Map(groups.map((g) => [g.name, g.count]));
    return (name: string) => m.get(name) ?? 0;
  }, [groups]);

  const stats: StatItem[] = useMemo(() => {
    const sessionGroups = new Set(sessions.map((s) => s.group));
    const total = [...sessionGroups].reduce((a, g) => a + sizeOf(g), 0);
    const attended = records.filter((r) =>
      ["present", "late", "activity"].includes(r.status),
    ).length;
    const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
    const pendingEnroll = students.filter((s) => !s.registered).length;
    return [
      {
        id: "groups",
        label: "จำนวนกลุ่มเรียน",
        value: String(groups.length),
        icon: "manage",
        caption: "manage",
        accent: "text-[#2474c6]",
      },
      {
        id: "students",
        label: "จำนวนนักเรียน",
        value: String(students.length),
        icon: "profile",
        caption: "profile",
        accent: "text-[#2474c6]",
      },
      {
        id: "today",
        label: "การเข้าเรียนวันนี้",
        value: sessionGroups.size > 0 ? `${pct}%` : "–",
        sub:
          sessionGroups.size > 0
            ? `${attended}/${total}`
            : "ยังไม่มีรอบวันนี้",
        icon: "attendance",
        caption: "attendance",
        accent: "text-[#1e8e3e]",
      },
      {
        id: "alerts",
        label: "แจ้งเตือนสำคัญ",
        value: String(pendingEnroll),
        sub: "รอลงทะเบียนใบหน้า",
        icon: "bell",
        caption: "bell",
        accent: "text-[#c62828]",
      },
    ];
  }, [groups, students, sessions, records, sizeOf]);

  const recentCheckIns: CheckIn[] = useMemo(() => {
    const meta = new Map(students.map((s) => [s.code, s]));
    return [...records]
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
  }, [records, students]);

  const todayGroups: TodayGroup[] = useMemo(() => {
    const byGroup = new Map<string, DayRecord[]>();
    records.forEach((r) => {
      const arr = byGroup.get(r.group) ?? [];
      arr.push(r);
      byGroup.set(r.group, arr);
    });
    const sessionOf = new Map(sessions.map((s) => [s.group, s]));
    return [...groups]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((g, i) => {
        const recs = byGroup.get(g.name) ?? [];
        const present = recs.filter((r) =>
          ["present", "late", "activity"].includes(r.status),
        ).length;
        const session = sessionOf.get(g.name);
        const done = session?.status === "completed";
        return {
          id: `g${i}`,
          name: g.name,
          status: done ? ("completed" as const) : session ? ("pending" as const) : ("soon" as const),
          statusText: session
            ? `${done ? "Completed" : "Pending"} (${present}/${g.count})`
            : `ยังไม่เปิดรอบ (${g.count} คน)`,
          present,
          total: g.count,
          action: done
            ? undefined
            : { label: "เริ่มสแกน", variant: "green" as const, href: "/scanner" },
        };
      });
  }, [groups, sessions, records]);
  return (
    <AppShell active="dashboard" title="สวัสดี ครูลูกหมี">
      {/* stat cards: 1 col mobile / 2 cols tablet / 4 cols desktop */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.id} {...s} />
        ))}
      </div>

      {/* lower panels */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <RecentCheckIns items={recentCheckIns} />
        <TodayGroups items={todayGroups} />
      </div>

      <Watchlist />

      {/* quick actions */}
      <div className="mt-5">
        <h2 className="mb-2.5 text-[19px] font-bold text-[#16233a]">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <UIButton variant="green" href="/students" className="h-11 w-full">
            เพิ่มกลุ่มเรียนใหม่
          </UIButton>
          <UIButton variant="blue" href="/students" className="h-11 w-full">
            เพิ่มนักเรียนใหม่
          </UIButton>
          <UIButton variant="blue" href="/reports" className="h-11 w-full">
            ดูรายงานวันนี้
          </UIButton>
        </div>
      </div>
    </AppShell>
  );
}
