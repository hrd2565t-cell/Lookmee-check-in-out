"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout";
import { ChevronDownIcon, PencilIcon, TrashIcon } from "@/components/icons";
import { Card, CardTitle, Modal, UIButton } from "@/components/ui";
import { DAY_NAMES, fetchPeriods, mergePeriods, type Period } from "@/lib/timetable";
import { supabase } from "@/lib/supabase/client";
import { compareGroupNames } from "@/lib/school-data";
import { levelOf } from "@/lib/terms";
import { useRoster } from "@/lib/school-data";
import { useTeacherGroup } from "@/lib/teacher-scope";
import { cn } from "@/lib/cn";

const inputCls =
  "h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] text-[#16233a] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none";

type FormState = {
  day: number;
  periodNo: string;
  subject: string;
  start: string;
  end: string;
  lateAfter: string;
  isDouble: boolean;
};

const emptyForm = (day = 1): FormState => ({
  day,
  periodNo: "",
  subject: "",
  start: "08:00",
  end: "08:50",
  lateAfter: "15",
  isDouble: false,
});

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const toHHMM = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/* ---------- หน้าตั้งค่าตารางคาบเรียนรายห้อง ---------- */
export default function TimetablePage() {
  const { groups: rosterGroups } = useRoster();
  const groupNames = useMemo(() => rosterGroups.map((g) => g.name), [rosterGroups]);
  const { selectedGroup, setSelectedGroup } = useTeacherGroup(groupNames);
  // เป้าหมายที่ตั้งค่า: ห้องเดียว หรือทั้งชั้น ("l:ม.1" = ทุกห้องในชั้น)
  const [target, setTarget] = useState("");
  const targetOpts = useMemo(() => {
    const levels = new Set<string>();
    groupNames.forEach((g) => levels.add(levelOf(g)));
    const sorted = [...levels].sort(compareGroupNames);
    return [
      ...sorted.map((l) => ({ value: `l:${l}`, label: `${l} (ทุกห้อง)` })),
      ...groupNames.map((g) => ({ value: `g:${g}`, label: g })),
    ];
  }, [groupNames]);
  const preferredGroupTarget = selectedGroup ? `g:${selectedGroup}` : "";
  const activeTarget = targetOpts.some((o) => o.value === target)
    ? target
    : targetOpts.some((o) => o.value === preferredGroupTarget)
      ? preferredGroupTarget
      : (targetOpts[0]?.value ?? "");
  const chooseTarget = (value: string) => {
    setTarget(value);
    if (value.startsWith("g:")) setSelectedGroup(value.slice(2));
  };
  const targetIsLevel = activeTarget.startsWith("l:");
  const targetName = activeTarget.slice(2);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [dbMode, setDbMode] = useState(false);
  const [modal, setModal] = useState<{ mode: "add"; day: number } | { mode: "edit"; id: string } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<"group" | "overview">("group");

  // ภาพรวมรายวัน: วัน + กรองระดับชั้น
  const jsToday = new Date().getDay(); // 0=อาทิตย์..6=เสาร์
  const defaultDay = jsToday >= 1 && jsToday <= 6 ? jsToday : 1;
  const [ovDay, setOvDay] = useState(defaultDay);
  const [ovLevel, setOvLevel] = useState("all");
  const levels = useMemo(() => {
    const set = new Set<string>();
    groupNames.forEach((g) => set.add(g.includes("/") ? g.split("/")[0] as string : "อื่น ๆ"));
    return [...set].sort(compareGroupNames);
  }, [groupNames]);
  const ovGroups = useMemo(
    () =>
      groupNames.filter((g) =>
        ovLevel === "all" ? true : (g.includes("/") ? g.split("/")[0] : "อื่น ๆ") === ovLevel,
      ),
    [groupNames, ovLevel],
  );
  // ภาพรวมใช้ตารางประสิทธิผล (ห้องทับชั้น) จึงเห็นแถวชั้นด้วย
  const ovEffective = useMemo(() => {
    const m = new Map<string, Period[]>();
    ovGroups.forEach((g) => m.set(g, mergePeriods(periods, g)));
    return m;
  }, [periods, ovGroups]);
  const ovPeriodNos = useMemo(() => {
    const set = new Set<number>();
    ovEffective.forEach((list) => {
      list.forEach((p) => {
        if (p.day === ovDay) set.add(p.periodNo);
      });
    });
    return [...set].sort((a, b) => a - b);
  }, [ovEffective, ovDay]);
  const ovCell = useMemo(() => {
    const m = new Map<string, Period>();
    ovEffective.forEach((list, g) => {
      list.forEach((p) => {
        if (p.day === ovDay) m.set(`${g}|${p.periodNo}`, p);
      });
    });
    return m;
  }, [ovEffective, ovDay]);
  const isToday = (() => {
    const d = new Date().getDay();
    return (d === 0 ? 1 : d) === ovDay;
  })();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const cellActive = (p: Period | undefined) => {
    if (!p || !isToday) return false;
    const [sh, sm] = p.start.split(":").map(Number);
    const [eh, em] = p.end.split(":").map(Number);
    return (sh ?? 0) * 60 + (sm ?? 0) <= nowMin && nowMin <= (eh ?? 0) * 60 + (em ?? 0);
  };

  const reload = async () => {
    const rows = await fetchPeriods();
    if (rows) {
      setPeriods(rows);
      setDbMode(true);
    }
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchPeriods();
      if (rows && !cancelled) {
        setPeriods(rows);
        setDbMode(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // แถวของเป้าหมายที่เลือก (ชั้น = แถว level ล้วน, ห้อง = รวม effective แต่โชว์เฉพาะแถวห้อง+แถวชั้นที่ทับ)
  // หมายเหตุ: มุมรายห้องโชว์แถวห้องของตัวเอง + แถวชั้นที่ยังไม่ถูกทับ (อ่านอย่างเดียว แก้ที่ต้นทาง)
  const ofTarget = useMemo(() => {
    if (targetIsLevel) return periods.filter((p) => p.level === targetName);
    const merged = mergePeriods(periods, targetName);
    return merged;
  }, [periods, targetIsLevel, targetName]);

  const groupIdOf = async (name: string): Promise<string | null> => {
    const { data } = await supabase
      .from("class_groups")
      .select("id")
      .eq("name", name)
      .single();
    return (data as { id: string } | null)?.id ?? null;
  };

  const openAdd = (day: number) => {
    setForm(emptyForm(day));
    setModal({ mode: "add", day });
    setNotice("");
  };
  const openEdit = (p: Period) => {
    setForm({
      day: p.day,
      periodNo: String(p.periodNo),
      subject: p.subject,
      start: p.start,
      end: p.end,
      lateAfter: String(p.lateAfterMin),
      isDouble: false,
    });
    setModal({ mode: "edit", id: p.id });
    setNotice("");
  };

  const save = async () => {
    const periodNo = Number(form.periodNo);
    const wantDouble = modal?.mode === "add" && form.isDouble;
    if (!Number.isInteger(periodNo) || periodNo < 1 || periodNo > 12) {
      setNotice("เลขคาบต้องเป็น 1–12");
      return;
    }
    if (wantDouble && periodNo >= 12) {
      setNotice("คาบคู่ต้องเริ่มไม่เกินคาบที่ 11");
      return;
    }
    if (!form.start || !form.end || form.start >= form.end) {
      setNotice(wantDouble ? "เวลาเริ่มต้องมาก่อนเวลาหมดคาบที่ 2" : "เวลาเริ่มต้องมาก่อนเวลาหมดคาบ");
      return;
    }
    // แตกคาบคู่เป็น 2 แถวเท่ากัน
    const slots = [{ no: periodNo, start: form.start, end: form.end }];
    if (wantDouble) {
      const totalMin = toMinutes(form.end) - toMinutes(form.start);
      if (totalMin < 20) {
        setNotice("คาบคู่ควรยาวอย่างน้อย 20 นาที");
        return;
      }
      const mid = toHHMM(toMinutes(form.start) + Math.floor(totalMin / 2));
      slots[0] = { no: periodNo, start: form.start, end: mid };
      slots.push({ no: periodNo + 1, start: mid, end: form.end });
    }
    const lateAfter = Math.max(0, Number(form.lateAfter) || 0);
    // ชนเฉพาะขอบเขตเดียวกัน (ห้องทับชั้นได้ ไม่ถือว่าชน)
    const sameScope = (p: Period) =>
      targetIsLevel ? p.level === targetName : p.level === null && p.groupName === targetName;
    if (modal?.mode === "add") {
      const clash = slots.find((s) =>
        periods.some((p) => sameScope(p) && p.day === form.day && p.periodNo === s.no),
      );
      if (clash) {
        setNotice(`วัน${DAY_NAMES[form.day] ?? ""} มีคาบที่ ${clash.no} แล้ว`);
        return;
      }
    }
    if (dbMode) {
      if (modal?.mode === "add") {
        const payload = targetIsLevel
          ? { group_id: null as string | null, level: targetName }
          : { group_id: await groupIdOf(targetName), level: null as string | null };
        if (!targetIsLevel && !payload.group_id) {
          setNotice("บันทึกไม่สำเร็จ — หากลุ่มไม่เจอ");
          return;
        }
        const { error } = await supabase.from("class_periods").insert(
          slots.map((s) => ({
            ...payload,
            day_of_week: form.day,
            period_no: s.no,
            subject: form.subject.trim(),
            start_time: s.start,
            end_time: s.end,
            late_after_min: lateAfter,
          })),
        );
        if (error) {
          setNotice(`บันทึกไม่สำเร็จ: ${error.message}`);
          return;
        }
      } else if (modal?.mode === "edit") {
        const { error } = await supabase
          .from("class_periods")
          .update({
            day_of_week: form.day,
            period_no: periodNo,
            subject: form.subject.trim(),
            start_time: form.start,
            end_time: form.end,
            late_after_min: lateAfter,
          })
          .eq("id", modal.id);
        if (error) {
          setNotice(`บันทึกไม่สำเร็จ: ${error.message}`);
          return;
        }
      }
      await reload();
    } else {
      // โหมด local (ยังไม่ต่อ DB)
      if (modal?.mode === "add") {
        const base = Date.now();
        setPeriods((ps) => [
          ...ps,
          ...slots.map((s, i) => ({
            id: `local-${base}-${i}`,
            groupId: null as string | null,
            groupName: targetIsLevel ? "" : targetName,
            level: targetIsLevel ? targetName : null,
            day: form.day,
            periodNo: s.no,
            subject: form.subject.trim(),
            start: s.start,
            end: s.end,
            lateAfterMin: lateAfter,
          })),
        ]);
      } else if (modal?.mode === "edit") {
        setPeriods((ps) =>
          ps.map((p) =>
            p.id === modal.id
              ? {
                  ...p,
                  day: form.day,
                  periodNo,
                  subject: form.subject.trim(),
                  start: form.start,
                  end: form.end,
                  lateAfterMin: lateAfter,
                }
              : p,
          ),
        );
      }
    }
    setModal(null);
    setNotice("");
  };

  const remove = async (p: Period) => {
    if (!window.confirm(`ลบคาบที่ ${p.periodNo} วัน${DAY_NAMES[p.day] ?? ""} (${p.subject || "ไม่ระบุวิชา"})?`)) return;
    if (dbMode && !p.id.startsWith("local-")) {
      const { error } = await supabase.from("class_periods").delete().eq("id", p.id);
      if (error) {
        setNotice(`ลบไม่สำเร็จ: ${error.message}`);
        return;
      }
      await reload();
    } else {
      setPeriods((ps) => ps.filter((x) => x.id !== p.id));
    }
  };

  return (
    <AppShell active="timetable" title="ตารางสอน">
      <div className="flex gap-2" role="tablist" aria-label="มุมมองตาราง">
        {(["group", "overview"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={
              view === v
                ? "h-10 flex-1 rounded-lg bg-[#16233a] text-[14.5px] font-bold text-white sm:flex-none sm:px-6"
                : "h-10 flex-1 rounded-lg border border-[#d8e0ec] bg-white text-[14.5px] font-semibold text-[#5b6b82] sm:flex-none sm:px-6"
            }
          >
            {v === "group" ? "รายห้อง" : "ภาพรวม"}
          </button>
        ))}
      </div>

      {view === "group" ? (
      <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="relative block min-w-[200px] flex-1 sm:max-w-[280px]">
          <span className="sr-only">เลือกห้องหรือชั้น</span>
          <select
            value={activeTarget}
            onChange={(e) => chooseTarget(e.target.value)}
            className="h-11 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-4 pr-10 text-[15px] font-medium text-[#16233a] focus:border-[#2474c6] focus:outline-none"
          >
            {targetOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value.startsWith("l:") ? `ชั้น${o.label}` : `ห้อง${o.label}`}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
        </label>
        {dbMode ? null : (
          <span className="rounded-full bg-[#f1f5fa] px-2.5 py-1 text-[12px] font-bold text-[#5b6b82]">
            ● Local
          </span>
        )}
      </div>
      {notice && !modal ? (
        <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-[13.5px] font-medium text-[#1a5da3]">
          {notice}
        </p>
      ) : null}

      {/* ตารางรายสัปดาห์ (ห้องที่เลือก + แถวชั้นที่สืบทอดมา) */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((day) => {
          const list = ofTarget
            .filter((p) => p.day === day)
            .sort((a, b) => a.periodNo - b.periodNo);
          return (
            <Card key={day} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <CardTitle>
                  วัน{DAY_NAMES[day] ?? day}
                  <span className="ml-2 text-[12.5px] font-medium text-[#5b6b82]">
                    {list.length} คาบ
                  </span>
                </CardTitle>
                <UIButton
                  variant="green"
                  onClick={() => openAdd(day)}
                  className="h-8 px-3 text-[13px]"
                >
                  + เพิ่มคาบ
                </UIButton>
              </div>
              {list.length === 0 ? (
                <p className="py-3 text-center text-[13px] text-[#8a97ab]">
                  ไม่มีคาบเรียน
                </p>
              ) : (
                <ul className="divide-y divide-[#eef2f7]">
                  {list.map((p) => {
                    const inherited = !targetIsLevel && p.level !== null;
                    return (
                    <li key={p.id} className="flex items-center gap-2 py-2">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#e8f1fb] text-[13px] font-bold text-[#1a5da3]">
                        {p.periodNo}
                      </span>
                      <div className="min-w-0 flex-1 leading-snug">
                        <p className="truncate text-[14px] font-semibold text-[#16233a]">
                          {p.subject || "ไม่ระบุวิชา"}
                          {p.level !== null ? (
                            <span className="ml-1.5 rounded bg-[#e8f1fb] px-1.5 py-px text-[11px] font-bold text-[#1a5da3]">
                              ชั้น
                            </span>
                          ) : null}
                        </p>
                        <p className="text-[12.5px] text-[#5b6b82]">
                          {p.start}–{p.end} · สายได้ {p.lateAfterMin} นาที
                        </p>
                      </div>
                      {inherited ? (
                        <span title={`มาจากตารางชั้น แก้ที่ ${p.level} (ทุกห้อง)`} className="px-1.5 text-[11.5px] text-[#8a97ab]">
                          จากชั้น
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-label={`แก้ไขคาบที่ ${p.periodNo}`}
                            onClick={() => openEdit(p)}
                            className="rounded p-1.5 text-[#2474c6] hover:bg-[#e8f1fb]"
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            aria-label={`ลบคาบที่ ${p.periodNo}`}
                            onClick={() => void remove(p)}
                            className="rounded p-1.5 text-[#c62828] hover:bg-[#fdecec]"
                          >
                            <TrashIcon />
                          </button>
                        </>
                      )}
                    </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
      </>
      ) : (
      <>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:max-w-[560px]">
          <label className="relative block">
            <span className="sr-only">เลือกวัน</span>
            <select
              value={ovDay}
              onChange={(e) => setOvDay(Number(e.target.value))}
              className="h-11 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-4 pr-10 text-[15px] font-medium text-[#16233a] focus:border-[#2474c6] focus:outline-none"
            >
              {[1, 2, 3, 4, 5, 6].map((d) => (
                <option key={d} value={d}>วัน{DAY_NAMES[d]}</option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
          </label>
          <label className="relative block">
            <span className="sr-only">กรองระดับชั้น</span>
            <select
              value={ovLevel}
              onChange={(e) => setOvLevel(e.target.value)}
              className="h-11 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-4 pr-10 text-[15px] font-medium text-[#16233a] focus:border-[#2474c6] focus:outline-none"
            >
              <option value="all">ทุกระดับชั้น</option>
              {levels.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
          </label>
        </div>

        <Card className="mt-3 overflow-hidden p-0">
          <div className="slim-scroll overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="bg-[#f1f5fa] text-[13px] font-bold text-[#16233a]">
                  <th className="sticky left-0 bg-[#f1f5fa] px-3 py-2.5">คาบ</th>
                  {ovGroups.map((g) => (
                    <th key={g} className="min-w-[110px] px-3 py-2.5">
                      <button
                        type="button"
                        title={`ไปตั้งค่าห้อง ${g}`}
                        onClick={() => {
                          chooseTarget(`g:${g}`);
                          setView("group");
                        }}
                        className="font-bold text-[#2474c6] hover:underline"
                      >
                        {g}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ovPeriodNos.length === 0 ? (
                  <tr>
                    <td colSpan={ovGroups.length + 1} className="px-3 py-8 text-center text-[14px] text-[#5b6b82]">
                      วันนี้ยังไม่มีคาบเรียนในระดับที่เลือก
                    </td>
                  </tr>
                ) : (
                  ovPeriodNos.map((n) => (
                    <tr key={n} className="border-t border-[#eef2f7]">
                      <td className="sticky left-0 bg-white px-3 py-2 text-center">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#e8f1fb] text-[13px] font-bold text-[#1a5da3]">
                          {n}
                        </span>
                      </td>
                      {ovGroups.map((g) => {
                        const p = ovCell.get(`${g}|${n}`);
                        const active = cellActive(p);
                        return (
                          <td key={g} className="px-3 py-2 align-top">
                            {p ? (
                              <span
                                className={
                                  active
                                    ? "block rounded-md bg-[#e6f4ea] px-2 py-1 ring-1 ring-[#1e8e3e]"
                                    : "block px-0.5 py-1"
                                }
                              >
                                <span className="block text-[13.5px] font-semibold leading-snug text-[#16233a]">
                                  {p.subject || "ไม่ระบุวิชา"}
                                </span>
                                <span className="block text-[12px] text-[#5b6b82]">
                                  {p.start}–{p.end}
                                </span>
                              </span>
                            ) : (
                              <span className="text-[#c9d2de]">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </>
      )}
      <p className="mt-3 text-[12.5px] text-[#8a97ab]">
        Scanner ใช้ตารางนี้หาคาบปัจจุบันอัตโนมัติ และตัดสิน “สาย” จากเวลาเริ่มคาบ + จำนวนนาทีที่ผ่อนผัน
      </p>

      {modal ? (
        <Modal
          title={modal.mode === "add" ? `เพิ่มคาบ วัน${DAY_NAMES[form.day] ?? ""}` : "แก้ไขคาบเรียน"}
          onClose={() => {
            setModal(null);
            setNotice("");
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              วัน
              <select
                value={form.day}
                onChange={(e) => setForm({ ...form, day: Number(e.target.value) })}
                className={cn(inputCls, "mt-1")}
              >
                {[1, 2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>วัน{DAY_NAMES[d]}</option>
                ))}
              </select>
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              คาบที่
              <input
                value={form.periodNo}
                onChange={(e) => setForm({ ...form, periodNo: e.target.value })}
                inputMode="numeric"
                placeholder="1"
                className={cn(inputCls, "mt-1")}
              />
            </label>
            <label className="col-span-2 block text-[14px] font-medium text-[#16233a]">
              วิชา
              <input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="เช่น คณิตศาสตร์ หรือ ฝึก รด."
                className={cn(inputCls, "mt-1")}
              />
              <span className="mt-1 block text-[12px] font-normal text-[#5b6b82]">
                คาบที่มีคำว่า “รด.” จะยกเว้นนักเรียนติดธง รด. ให้อัตโนมัติ
              </span>
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              เริ่ม
              <input
                type="time"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
                className={cn(inputCls, "mt-1")}
              />
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              หมดคาบ{modal?.mode === "add" && form.isDouble ? "ที่ 2" : ""}
              <input
                type="time"
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
                className={cn(inputCls, "mt-1")}
              />
            </label>
            {modal?.mode === "add" ? (
              <label className="col-span-1 flex cursor-pointer items-center gap-2 text-[14px] font-medium text-[#16233a]">
                <input
                  type="checkbox"
                  checked={form.isDouble}
                  onChange={(e) => setForm({ ...form, isDouble: e.target.checked })}
                  className="h-4 w-4 accent-[#1e8e3e]"
                />
                กิน 2 คาบติดกัน
              </label>
            ) : (
              <span className="col-span-1" />
            )}
            <label className="col-span-2 block text-[14px] font-medium text-[#16233a]">
              สายได้ (นาที)
              <input
                value={form.lateAfter}
                onChange={(e) => setForm({ ...form, lateAfter: e.target.value })}
                inputMode="numeric"
                placeholder="15"
                className={cn(inputCls, "mt-1")}
              />
            </label>
          </div>
          {notice ? (
            <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-[13.5px] font-medium text-[#1a5da3]">
              {notice}
            </p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <UIButton
              variant="blue"
              onClick={() => {
                setModal(null);
                setNotice("");
              }}
              className="h-10 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40"
            >
              ยกเลิก
            </UIButton>
            <UIButton variant="green" onClick={() => void save()} className="h-10">
              บันทึก
            </UIButton>
          </div>
        </Modal>
      ) : null}
    </AppShell>
  );
}
