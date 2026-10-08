"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout";
import { Card, CardTitle, UIButton } from "@/components/ui";
import {
  fetchLimits,
  fetchTerms,
  levelOf,
  type AbsenceLimit,
  type SchoolTerm,
} from "@/lib/terms";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { useRoster } from "@/lib/school-data";
import { cn } from "@/lib/cn";

const inputCls =
  "h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] text-[#16233a] focus:border-[#2474c6] focus:outline-none";

/* ---------- ตั้งค่าเทอม + เกณฑ์ขาดเรียนรายชั้น ---------- */
export default function SettingsPage() {
  const { groups: rosterGroups } = useRoster();
  const [terms, setTerms] = useState<SchoolTerm[]>([]);
  const [limits, setLimits] = useState<AbsenceLimit[]>([]);
  const [dbMode, setDbMode] = useState(false);
  const [notice, setNotice] = useState("");
  const [tName, setTName] = useState("");
  const [tStart, setTStart] = useState("");
  const [tEnd, setTEnd] = useState("");
  const [newLevel, setNewLevel] = useState("");

  const reload = async () => {
    const [t, l] = await Promise.all([fetchTerms(), fetchLimits()]);
    if (t) {
      setTerms(t);
      setDbMode(true);
    }
    if (l) setLimits(l);
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [t, l] = await Promise.all([fetchTerms(), fetchLimits()]);
      if (cancelled) return;
      if (t) {
        setTerms(t);
        setDbMode(true);
      }
      if (l) setLimits(l);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const existingLevels = useMemo(() => new Set(limits.map((l) => l.level)), [limits]);
  const missingLevels = useMemo(() => {
    const set = new Set<string>();
    rosterGroups.forEach((g) => set.add(levelOf(g.name)));
    return [...set].filter((l) => !existingLevels.has(l));
  }, [rosterGroups, existingLevels]);

  const setCurrentTerm = async (id: string) => {
    const { error: e1 } = await supabase.from("school_terms").update({ is_current: false }).eq("is_current", true);
    if (e1) {
      setNotice(`บันทึกไม่สำเร็จ: ${e1.message}`);
      return;
    }
    const { error: e2 } = await supabase.from("school_terms").update({ is_current: true }).eq("id", id);
    if (e2) {
      setNotice(`บันทึกไม่สำเร็จ: ${e2.message}`);
      return;
    }
    setNotice("ตั้งเทอมปัจจุบันแล้ว");
    await reload();
  };

  const addTerm = async () => {
    if (!tName.trim() || !tStart || !tEnd) {
      setNotice("กรอกชื่อเทอมและช่วงวันให้ครบ");
      return;
    }
    if (tEnd < tStart) {
      setNotice("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
      return;
    }
    const { error } = await supabase
      .from("school_terms")
      .insert({ name: tName.trim(), starts_on: tStart, ends_on: tEnd, is_current: terms.length === 0 });
    if (error) {
      setNotice(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    setTName("");
    setTStart("");
    setTEnd("");
    setNotice("เพิ่มเทอมแล้ว");
    await reload();
  };

  const saveLimit = async (level: string, maxAbsent: number | null, warnBefore: number) => {
    if (maxAbsent !== null && (!Number.isInteger(maxAbsent) || maxAbsent < 0)) {
      setNotice(`เกณฑ์ ${level}: ใส่จำนวนเต็ม ≥ 0 หรือเว้นว่าง (ไม่จำกัด)`);
      return;
    }
    const { error } = await supabase
      .from("absence_limits")
      .upsert({ level, max_absent: maxAbsent, warn_before: Math.max(0, warnBefore || 0) }, { onConflict: "level" });
    if (error) {
      setNotice(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    setNotice(`บันทึกเกณฑ์ ${level} แล้ว`);
    await reload();
  };

  const addLevel = async () => {
    if (!newLevel.trim()) return;
    if (existingLevels.has(newLevel.trim())) {
      setNotice(`มี ${newLevel.trim()} แล้ว`);
      return;
    }
    const { error } = await supabase
      .from("absence_limits")
      .insert({ level: newLevel.trim(), max_absent: null, warn_before: 2 });
    if (error) {
      setNotice(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    setNewLevel("");
    await reload();
  };

  return (
    <AppShell active="settings" title="ตั้งค่าระบบ">
      {notice ? (
        <p role="status" className="mb-3 rounded-lg bg-[#e8f1fb] px-3 py-2 text-[13.5px] font-medium text-[#1a5da3]">
          {notice}
        </p>
      ) : null}
      {!dbMode && isSupabaseConfigured ? (
        <p className="mb-3 rounded-lg bg-[#fef6ec] px-3 py-2 text-[13.5px] font-semibold text-[#e65100]">
          ต่อฐานข้อมูลไม่ได้ — ตั้งค่าได้หลังล็อกอิน
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        {/* เทอม */}
        <Card className="h-fit p-4 sm:p-5">
          <CardTitle className="mb-2">ภาคเรียน (นับยอดขาดในเทอมปัจจุบัน)</CardTitle>
          <ul className="divide-y divide-[#eef2f7]">
            {terms.map((t) => (
              <li key={t.id} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold text-[#16233a]">
                    {t.name}
                    {t.isCurrent ? (
                      <span className="ml-2 rounded-full bg-[#e6f4ea] px-2 py-0.5 text-[11.5px] font-bold text-[#166c2e]">
                        ปัจจุบัน
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[12.5px] text-[#5b6b82]">{t.startsOn} – {t.endsOn}</p>
                </div>
                {!t.isCurrent ? (
                  <UIButton variant="blue" onClick={() => void setCurrentTerm(t.id)} className="h-8 px-3 text-[13px]">
                    ตั้งเป็นปัจจุบัน
                  </UIButton>
                ) : null}
              </li>
            ))}
            {terms.length === 0 ? (
              <li className="py-4 text-center text-[13.5px] text-[#5b6b82]">ยังไม่มีเทอม</li>
            ) : null}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#eef2f7] pt-3">
            <label className="col-span-2 block text-[13.5px] font-medium text-[#16233a]">
              ชื่อเทอมใหม่
              <input value={tName} onChange={(e) => setTName(e.target.value)} placeholder="เช่น ภาคเรียนที่ 1/2570" className={cn(inputCls, "mt-1")} />
            </label>
            <label className="block text-[13.5px] font-medium text-[#16233a]">
              เริ่ม
              <input type="date" value={tStart} onChange={(e) => setTStart(e.target.value)} className={cn(inputCls, "mt-1")} />
            </label>
            <label className="block text-[13.5px] font-medium text-[#16233a]">
              สิ้นสุด
              <input type="date" value={tEnd} onChange={(e) => setTEnd(e.target.value)} className={cn(inputCls, "mt-1")} />
            </label>
            <div className="col-span-2">
              <UIButton variant="green" onClick={() => void addTerm()} className="h-10 w-full">
                เพิ่มเทอม
              </UIButton>
            </div>
          </div>
        </Card>

        {/* เกณฑ์ขาดรายชั้น */}
        <Card className="h-fit p-4 sm:p-5">
          <CardTitle className="mb-1">เกณฑ์ขาดเรียนรายระดับชั้น</CardTitle>
          <p className="mb-2 text-[12.5px] text-[#5b6b82]">เว้นว่าง = ไม่จำกัด · ขาดนับเฉพาะสถานะขาดในเทอมปัจจุบัน</p>
          <ul className="divide-y divide-[#eef2f7]">
            {limits.map((l) => (
              <LimitRow key={l.level} limit={l} onSave={saveLimit} />
            ))}
            {limits.length === 0 ? (
              <li className="py-4 text-center text-[13.5px] text-[#5b6b82]">ยังไม่มีเกณฑ์</li>
            ) : null}
          </ul>
          <div className="mt-3 flex gap-2 border-t border-[#eef2f7] pt-3">
            <select
              value={newLevel}
              onChange={(e) => setNewLevel(e.target.value)}
              className={cn(inputCls, "flex-1")}
              aria-label="เพิ่มระดับชั้น"
            >
              <option value="">+ เพิ่มระดับชั้น...</option>
              {missingLevels.map((l) => (
                <option key={l} value={l}>{l} (จากทะเบียน)</option>
              ))}
            </select>
            <UIButton variant="green" onClick={() => void addLevel()} className="h-10 shrink-0">
              เพิ่ม
            </UIButton>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function LimitRow({
  limit,
  onSave,
}: {
  limit: AbsenceLimit;
  onSave: (level: string, max: number | null, warn: number) => Promise<void>;
}) {
  const [max, setMax] = useState(limit.maxAbsent === null ? "" : String(limit.maxAbsent));
  const [warn, setWarn] = useState(String(limit.warnBefore));
  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      <span className="w-12 text-[14.5px] font-bold text-[#16233a]">{limit.level}</span>
      <label className="flex flex-1 items-center gap-1.5 text-[13px] text-[#5b6b82]">
        ขาดได้
        <input
          value={max}
          onChange={(e) => setMax(e.target.value)}
          inputMode="numeric"
          placeholder="ไม่จำกัด"
          className="h-9 w-20 rounded-lg border border-[#d8e0ec] px-2 text-center text-[14px] focus:border-[#2474c6] focus:outline-none"
        />
        ครั้ง
      </label>
      <label className="flex items-center gap-1.5 text-[13px] text-[#5b6b82]">
        เตือนก่อน
        <input
          value={warn}
          onChange={(e) => setWarn(e.target.value)}
          inputMode="numeric"
          className="h-9 w-14 rounded-lg border border-[#d8e0ec] px-2 text-center text-[14px] focus:border-[#2474c6] focus:outline-none"
        />
      </label>
      <UIButton
        variant="blue"
        onClick={() => void onSave(limit.level, max.trim() === "" ? null : Number(max), Number(warn))}
        className="h-9 px-3 text-[13px]"
      >
        บันทึก
      </UIButton>
    </li>
  );
}
