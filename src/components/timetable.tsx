"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout";
import { ChevronDownIcon, PencilIcon, TrashIcon } from "@/components/icons";
import { Card, CardTitle, Modal, UIButton } from "@/components/ui";
import { DAY_NAMES, fetchPeriods, type Period } from "@/lib/timetable";
import { supabase } from "@/lib/supabase/client";
import { useRoster } from "@/lib/school-data";
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
};

const emptyForm = (day = 1): FormState => ({
  day,
  periodNo: "",
  subject: "",
  start: "08:00",
  end: "08:50",
  lateAfter: "15",
});

/* ---------- หน้าตั้งค่าตารางคาบเรียนรายห้อง ---------- */
export default function TimetablePage() {
  const { groups: rosterGroups } = useRoster();
  const groupNames = useMemo(() => rosterGroups.map((g) => g.name), [rosterGroups]);
  const [group, setGroup] = useState("");
  const activeGroup = groupNames.includes(group) ? group : (groupNames[0] ?? "");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [dbMode, setDbMode] = useState(false);
  const [modal, setModal] = useState<{ mode: "add"; day: number } | { mode: "edit"; id: string } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [notice, setNotice] = useState("");

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

  const ofGroup = useMemo(
    () => periods.filter((p) => p.groupName === activeGroup),
    [periods, activeGroup],
  );

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
    });
    setModal({ mode: "edit", id: p.id });
    setNotice("");
  };

  const save = async () => {
    const periodNo = Number(form.periodNo);
    if (!Number.isInteger(periodNo) || periodNo < 1 || periodNo > 12) {
      setNotice("เลขคาบต้องเป็น 1–12");
      return;
    }
    if (!form.start || !form.end || form.start >= form.end) {
      setNotice("เวลาเริ่มต้องมาก่อนเวลาหมดคาบ");
      return;
    }
    const lateAfter = Math.max(0, Number(form.lateAfter) || 0);
    if (
      modal?.mode === "add" &&
      ofGroup.some((p) => p.day === form.day && p.periodNo === periodNo)
    ) {
      setNotice(`วัน${DAY_NAMES[form.day] ?? ""} มีคาบที่ ${periodNo} แล้ว`);
      return;
    }
    if (dbMode) {
      if (modal?.mode === "add") {
        const gid = await groupIdOf(activeGroup);
        if (!gid) {
          setNotice("บันทึกไม่สำเร็จ — หากลุ่มไม่เจอ");
          return;
        }
        const { data, error } = await supabase
          .from("class_periods")
          .insert({
            group_id: gid,
            day_of_week: form.day,
            period_no: periodNo,
            subject: form.subject.trim(),
            start_time: form.start,
            end_time: form.end,
            late_after_min: lateAfter,
          })
          .select("id")
          .single();
        if (error || !data) {
          setNotice(`บันทึกไม่สำเร็จ: ${error?.message ?? "conflict"}`);
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
        setPeriods((ps) => [
          ...ps,
          {
            id: `local-${Date.now()}`,
            groupId: "",
            groupName: activeGroup,
            day: form.day,
            periodNo,
            subject: form.subject.trim(),
            start: form.start,
            end: form.end,
            lateAfterMin: lateAfter,
          },
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
    <AppShell active="timetable" title="ตารางคาบเรียน">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative block min-w-[200px] flex-1 sm:max-w-[280px]">
          <span className="sr-only">เลือกกลุ่มเรียน</span>
          <select
            value={activeGroup}
            onChange={(e) => setGroup(e.target.value)}
            className="h-11 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-4 pr-10 text-[15px] font-medium text-[#16233a] focus:border-[#2474c6] focus:outline-none"
          >
            {groupNames.map((g) => (
              <option key={g} value={g}>
                กลุ่มเรียน: {g}
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

      {/* ตารางรายสัปดาห์ */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((day) => {
          const list = ofGroup
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
                  {list.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 py-2">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#e8f1fb] text-[13px] font-bold text-[#1a5da3]">
                        {p.periodNo}
                      </span>
                      <div className="min-w-0 flex-1 leading-snug">
                        <p className="truncate text-[14px] font-semibold text-[#16233a]">
                          {p.subject || "ไม่ระบุวิชา"}
                        </p>
                        <p className="text-[12.5px] text-[#5b6b82]">
                          {p.start}–{p.end} · สายได้ {p.lateAfterMin} นาที
                        </p>
                      </div>
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
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
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
                placeholder="เช่น คณิตศาสตร์"
                className={cn(inputCls, "mt-1")}
              />
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
              หมดคาบ
              <input
                type="time"
                value={form.end}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
                className={cn(inputCls, "mt-1")}
              />
            </label>
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
