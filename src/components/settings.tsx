"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout";
import { PencilIcon, TrashIcon, DownloadIcon } from "@/components/icons";
import { Card, CardTitle, Modal, UIButton } from "@/components/ui";
import {
  fetchLimits,
  fetchTerms,
  levelOf,
  type AbsenceLimit,
  type SchoolTerm,
} from "@/lib/terms";
import {
  fetchGradeScales,
  saveGradeScales,
  fetchCategoryWeights,
  saveCategoryWeights,
  fetchRoomGradeScales,
  saveRoomGradeScales,
  type CategoryWeight,
  type GradeScale,
} from "@/lib/grading";
import { fetchAbsentCounts } from "@/lib/attendance";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { useRoster } from "@/lib/school-data";
import { fetchFullBackup, downloadBackup, backupStats } from "@/lib/backup";
import { cn } from "@/lib/cn";

const inputCls =
  "h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] text-[#16233a] focus:border-[#2474c6] focus:outline-none";

const CATEGORIES = ["ใบงาน/การบ้าน", "คะแนนย่อย", "สอบกลางภาค", "สอบปลายภาค", "ชิ้นงาน"];

/* ---------- ตั้งค่าเทอม + เกณฑ์ขาดเรียนรายชั้น ---------- */
export default function SettingsPage() {
  const { groups: rosterGroups } = useRoster();
  const [terms, setTerms] = useState<SchoolTerm[]>([]);
  const [limits, setLimits] = useState<AbsenceLimit[]>([]);
  const [dbMode, setDbMode] = useState(false);
  const [notice, setNotice] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupNotice, setBackupNotice] = useState("");
  const [backupSummary, setBackupSummary] = useState<Array<{ table: string; rows: number }>>([]);
  const [tName, setTName] = useState("");
  const [tStart, setTStart] = useState("");
  const [tEnd, setTEnd] = useState("");
  const [newLevel, setNewLevel] = useState("");
  const [termModal, setTermModal] = useState<null | { id: string; name: string; start: string; end: string }>(null);
  const [scaleLevel, setScaleLevel] = useState("ม.1");
  const [scales, setScales] = useState<GradeScale[]>([]);
  const [scalesMsg, setScalesMsg] = useState("");
  const [watchlist, setWatchlist] = useState<Array<{
    code: string;
    name: string;
    group: string;
    level: string;
    absent: number;
    maxAbsent: number | null;
    warnBefore: number;
  }>>([]);
  const [watchlistLoaded, setWatchlistLoaded] = useState(false);
  const [watchlistBusy, setWatchlistBusy] = useState(false);
  const [weightRoom, setWeightRoom] = useState("");
  const [weightValues, setWeightValues] = useState<Record<string, string>>({});
  const [weightMsg, setWeightMsg] = useState("");
  const [scaleRoom, setScaleRoom] = useState("");
  const [roomScales, setRoomScales] = useState<GradeScale[]>([]);
  const [roomScalesMsg, setRoomScalesMsg] = useState("");
  const [newRoomGrade, setNewRoomGrade] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await fetchGradeScales(scaleLevel);
      if (!cancelled && rows) setScales(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [scaleLevel]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!terms.length || !limits.length) return;
      const current = terms.find((t) => t.isCurrent);
      if (!current) {
        setWatchlist([]);
        setWatchlistLoaded(true);
        return;
      }
      setWatchlistBusy(true);
      try {
        const rows = await fetchAbsentCounts(current.startsOn, current.endsOn);
        const list = (rows ?? [])
          .map((r) => {
            const level = levelOf(r.group);
            const limit = limits.find((l) => l.level === level);
            const maxAbsent = limit?.maxAbsent ?? null;
            const warnBefore = limit?.warnBefore ?? 0;
            return {
              code: r.code,
              name: r.name,
              group: r.group,
              level,
              absent: r.count,
              maxAbsent,
              warnBefore,
            };
          })
          .sort((a, b) => b.absent - a.absent);
        if (!cancelled) {
          setWatchlist(list);
          setWatchlistLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setWatchlist([]);
          setWatchlistLoaded(true);
        }
      } finally {
        if (!cancelled) setWatchlistBusy(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [terms, limits]);

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

  const removeTerm = async (id: string, name: string) => {
    if (!window.confirm(`ลบ${name}? (รอบเช็กชื่อเดิมยังอยู่เพราะอ้างวันที่โดยตรง)`)) return;
    const { error } = await supabase.from("school_terms").delete().eq("id", id);
    if (error) {
      setNotice(`ลบไม่สำเร็จ: ${error.message}`);
      return;
    }
    setNotice(`ลบ${name} แล้ว`);
    await reload();
  };

  const saveTermEdit = async () => {
    if (!termModal) return;
    if (!termModal.name.trim() || !termModal.start || !termModal.end) {
      setNotice("กรอกชื่อและช่วงวันให้ครบ");
      return;
    }
    if (termModal.end < termModal.start) {
      setNotice("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
      return;
    }
    const { error } = await supabase
      .from("school_terms")
      .update({ name: termModal.name.trim(), starts_on: termModal.start, ends_on: termModal.end })
      .eq("id", termModal.id);
    if (error) {
      setNotice(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    setTermModal(null);
    setNotice("แก้ไขเทอมแล้ว");
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

  const exportBackup = async () => {
    setBackupBusy(true);
    setBackupNotice("");
    const data = await fetchFullBackup();
    setBackupBusy(false);
    if (!data) {
      setBackupNotice("สำรองไม่สำเร็จ — ตรวจการเชื่อมต่อ");
      return;
    }
    downloadBackup(data);
    setBackupSummary(backupStats(data));
    const total = Object.values(data.tables).reduce(
      (n, rows) => n + (Array.isArray(rows) ? rows.length : 0),
      0,
    );
    setBackupNotice(`สำรองข้อมูลแล้ว ${total} แถว`);
  };

  /* ---------- สัดส่วนคะแนนรายห้อง ---------- */
  const loadWeights = async (room: string) => {
    if (!room) return;
    const rows = await fetchCategoryWeights(room);
    const map: Record<string, string> = {};
    for (const c of CATEGORIES) {
      const w = rows?.find((r) => r.category === c);
      map[c] = w ? String(w.weight) : "";
    }
    setWeightValues(map);
    setWeightMsg("");
  };

  const saveWeights = async () => {
    if (!weightRoom) return;
    const items: CategoryWeight[] = [];
    let sum = 0;
    for (const c of CATEGORIES) {
      const v = weightValues[c]?.trim();
      if (v === "") continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        setWeightMsg("น้ำหนักต้องเป็นตัวเลข 0 ขึ้นไป");
        return;
      }
      items.push({ category: c, weight: n });
      sum += n;
    }
    if (Math.round(sum) !== 100) {
      setWeightMsg(`น้ำหนักรวมต้องเท่ากับ 100 (ตอนนี้ ${sum})`);
      return;
    }
    const ok = await saveCategoryWeights(weightRoom, items);
    setWeightMsg(ok ? "บันทึกสัดส่วนคะแนนแล้ว" : "บันทึกไม่สำเร็จ");
  };

  /* ---------- เกณฑ์ตัดเกรดรายห้อง ---------- */
  const loadRoomScales = async (room: string) => {
    if (!room) return;
    const rows = await fetchRoomGradeScales(room);
    setRoomScales(rows ?? []);
    setRoomScalesMsg("");
  };

  const saveRoomScales = async () => {
    if (!scaleRoom) return;
    const rows = roomScales.filter((s) => s.grade.trim() !== "");
    const ok = await saveRoomGradeScales(scaleRoom, rows);
    setRoomScalesMsg(ok ? "บันทึกเกณฑ์เกรดแล้ว" : "บันทึกไม่สำเร็จ");
  };

  const addRoomGrade = () => {
    const g = newRoomGrade.trim();
    if (!g) return;
    if (roomScales.some((s) => s.grade === g)) {
      setRoomScalesMsg(`มีเกรด ${g} แล้ว`);
      return;
    }
    setRoomScales((prev) => [...prev, { grade: g, min: 0 }]);
    setNewRoomGrade("");
    setRoomScalesMsg("");
  };

  useEffect(() => {
    if (weightRoom) void loadWeights(weightRoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightRoom]);

  useEffect(() => {
    if (scaleRoom) void loadRoomScales(scaleRoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scaleRoom]);

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
                <button
                  type="button"
                  aria-label={`แก้ไข${t.name}`}
                  onClick={() => setTermModal({ id: t.id, name: t.name, start: t.startsOn, end: t.endsOn })}
                  className="rounded p-1.5 text-[#2474c6] hover:bg-[#e8f1fb]"
                >
                  <PencilIcon />
                </button>
                {!t.isCurrent ? (
                  <button
                    type="button"
                    aria-label={`ลบ${t.name}`}
                    onClick={() => void removeTerm(t.id, t.name)}
                    className="rounded p-1.5 text-[#c62828] hover:bg-[#fdecec]"
                  >
                    <TrashIcon />
                  </button>
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

        {/* เกณฑ์ตัดเกรด */}
        <Card id="grade-scales" className="h-fit p-4 sm:p-5 lg:col-span-2">
          <CardTitle className="mb-1">เกณฑ์ตัดเกรดรายระดับชั้น (คะแนนเต็ม 100)</CardTitle>
          <p className="mb-2 text-[12.5px] text-[#5b6b82]">ฝั่งนักเรียนเห็นเกรดตามเกณฑ์ชั้นตัวเอง</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-[140px] text-[13.5px] font-medium text-[#16233a]">
              ระดับชั้น
              <select
                value={scaleLevel}
                onChange={(e) => setScaleLevel(e.target.value)}
                className={cn(inputCls, "mt-1")}
              >
                {["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {scales.map((s) => (
              <label key={s.grade} className="flex items-center gap-2 rounded-lg border border-[#eef2f7] px-2.5 py-2 text-[14px] font-bold text-[#16233a]">
                <span className="w-8">{s.grade}</span>
                <span className="font-normal text-[#8a97ab]">≥</span>
                <input
                  value={s.min}
                  onChange={(e) =>
                    setScales((prev) =>
                      prev.map((x) =>
                        x.grade === s.grade ? { ...x, min: Number(e.target.value) || 0 } : x,
                      ),
                    )
                  }
                  inputMode="decimal"
                  aria-label={`เกณฑ์ ${s.grade}`}
                  className="h-9 w-full rounded-md border border-[#d8e0ec] px-2 text-center focus:border-[#2474c6] focus:outline-none"
                />
              </label>
            ))}
          </div>
          {scalesMsg ? (
            <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-[13.5px] font-medium text-[#1a5da3]">
              {scalesMsg}
            </p>
          ) : null}
          <div className="mt-3">
            <UIButton
              variant="green"
              onClick={() =>
                void (async () => {
                  const ok = await saveGradeScales(scaleLevel, scales);
                  setScalesMsg(ok ? `บันทึกเกณฑ์ ${scaleLevel} แล้ว` : "บันทึกไม่สำเร็จ");
                })()
              }
              className="h-10 w-full sm:w-auto sm:px-8"
            >
              บันทึกเกณฑ์ {scaleLevel}
            </UIButton>
          </div>
        </Card>
      </div>

      {/* สัดส่วนคะแนนรายห้อง */}
      <Card className="mt-3 p-4 sm:p-5">
        <CardTitle className="mb-1">สัดส่วนคะแนนรายห้อง (รวม 100)</CardTitle>
        <p className="mb-2 text-[12.5px] text-[#5b6b82]">
          กำหนดน้ำหนัก % แต่ละหมวดต่อห้อง — ใช้กับทุกวิชาในห้องนั้น คะแนนรวมจะถ่วงน้ำหนักตามหมวด
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[180px] text-[13.5px] font-medium text-[#16233a]">
            ห้อง
            <select value={weightRoom} onChange={(e) => setWeightRoom(e.target.value)} className={cn(inputCls, "mt-1")}>
              <option value="">เลือกห้อง...</option>
              {rosterGroups.map((g) => (
                <option key={g.name} value={g.name}>{g.name}</option>
              ))}
            </select>
          </label>
        </div>
        {weightRoom ? (
          <>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {CATEGORIES.map((c) => (
                <label key={c} className="block text-[13px] font-medium text-[#16233a]">
                  {c}
                  <input
                    value={weightValues[c] ?? ""}
                    onChange={(e) => setWeightValues((prev) => ({ ...prev, [c]: e.target.value }))}
                    inputMode="decimal"
                    placeholder="0"
                    className="mt-1 h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-center text-[14px] focus:border-[#2474c6] focus:outline-none"
                  />
                </label>
              ))}
            </div>
            {weightMsg ? (
              <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-[13.5px] font-medium text-[#1a5da3]">{weightMsg}</p>
            ) : null}
            <div className="mt-3">
              <UIButton variant="green" onClick={() => void saveWeights()} className="h-10 w-full sm:w-auto sm:px-8">
                บันทึกสัดส่วน
              </UIButton>
            </div>
          </>
        ) : null}
      </Card>

      {/* เกณฑ์ตัดเกรดรายห้อง */}
      <Card className="mt-3 p-4 sm:p-5">
        <CardTitle className="mb-1">เกณฑ์ตัดเกรดรายห้อง (คะแนนเต็ม 100)</CardTitle>
        <p className="mb-2 text-[12.5px] text-[#5b6b82]">
          ตั้งเกณฑ์เฉพาะห้อง — ห้องไหนไม่ตั้ง ใช้เกณฑ์ของระดับชั้น
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[180px] text-[13.5px] font-medium text-[#16233a]">
            ห้อง
            <select value={scaleRoom} onChange={(e) => setScaleRoom(e.target.value)} className={cn(inputCls, "mt-1")}>
              <option value="">เลือกห้อง...</option>
              {rosterGroups.map((g) => (
                <option key={g.name} value={g.name}>{g.name}</option>
              ))}
            </select>
          </label>
        </div>
        {scaleRoom ? (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {roomScales.map((s) => (
                <label key={s.grade} className="flex items-center gap-2 rounded-lg border border-[#eef2f7] px-2.5 py-2 text-[14px] font-bold text-[#16233a]">
                  <span className="w-8">{s.grade}</span>
                  <span className="font-normal text-[#8a97ab]">≥</span>
                  <input
                    value={s.min}
                    onChange={(e) =>
                      setRoomScales((prev) =>
                        prev.map((x) => (x.grade === s.grade ? { ...x, min: Number(e.target.value) || 0 } : x)),
                      )
                    }
                    inputMode="decimal"
                    aria-label={`เกณฑ์ ${s.grade}`}
                    className="h-9 w-full rounded-md border border-[#d8e0ec] px-2 text-center focus:border-[#2474c6] focus:outline-none"
                  />
                </label>
              ))}
            </div>
            {roomScales.length === 0 ? (
              <p className="mt-2 text-[13px] text-[#5b6b82]">ยังไม่มีเกณฑ์ห้องนี้ — เพิ่มเกรดด้านล่าง</p>
            ) : null}
            <div className="mt-2 flex gap-2">
              <input
                value={newRoomGrade}
                onChange={(e) => setNewRoomGrade(e.target.value)}
                placeholder="เกรด เช่น A, B+"
                className="h-10 w-40 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] focus:border-[#2474c6] focus:outline-none"
              />
              <UIButton variant="blue" onClick={addRoomGrade} className="h-10">เพิ่มเกรด</UIButton>
            </div>
            {roomScalesMsg ? (
              <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-[13.5px] font-medium text-[#1a5da3]">{roomScalesMsg}</p>
            ) : null}
            <div className="mt-3">
              <UIButton variant="green" onClick={() => void saveRoomScales()} className="h-10 w-full sm:w-auto sm:px-8">
                บันทึกเกณฑ์
              </UIButton>
            </div>
          </>
        ) : null}
      </Card>

      {/* Watchlist นักเรียนขาดเกินเกณฑ์ในเทอมปัจจุบัน */}
      <Card className="mt-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="mr-auto">นักเรียนขาดเกินเกณฑ์ (Watchlist)</CardTitle>
          <p className="text-[12.5px] text-[#5b6b82]">
            ยอดขาดในเทอมปัจจุบัน vs เกณฑ์ที่ตั้งไว้ — เกินเกณฑ์ควรเรียกผู้ปกครองพบ
          </p>
        </div>
        {!watchlistLoaded && !watchlistBusy ? (
          <p className="mt-2 text-center text-[13px] text-[#5b6b82]">กำลังโหลดข้อมูล...</p>
        ) : watchlistBusy ? (
          <p className="mt-2 text-center text-[13px] text-[#5b6b82]">กำลังคำนวณยอดขาด...</p>
        ) : terms.find((t) => t.isCurrent) === undefined ? (
          <p className="mt-2 rounded-lg bg-[#fef6ec] px-3 py-2 text-[13px] font-semibold text-[#e65100]">
            ยังไม่มีเทอมปัจจุบัน — ตั้งค่าเทอมในหน้านี้ก่อน
          </p>
        ) : watchlist.length === 0 ? (
          <p className="mt-2 rounded-lg bg-[#e6f4ea] px-3 py-2 text-[13px] font-semibold text-[#166c2e]">
            ไม่มีนักเรียนขาดเกินเกณฑ์ในเทอมนี้
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <thead className="bg-[#f8fafc] text-[12.5px] font-bold text-[#16233a]">
                <tr>
                  <th className="px-3 py-2 text-center">ลำดับ</th>
                  <th className="px-3 py-2">รหัสประจำตัว</th>
                  <th className="px-3 py-2">ชื่อ-นามสกุล</th>
                  <th className="px-3 py-2">กลุ่มเรียน</th>
                  <th className="px-3 py-2 text-center">ระดับ</th>
                  <th className="px-3 py-2 text-center">ขาด</th>
                  <th className="px-3 py-2 text-center">เกณฑ์</th>
                  <th className="px-3 py-2 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((r, i) => {
                  const exceeded =
                    r.maxAbsent !== null && r.absent > r.maxAbsent;
                  const warning =
                    !exceeded && r.warnBefore > 0 && r.absent >= r.warnBefore;
                  return (
                    <tr
                      key={r.code}
                      className={cn(
                        "border-t border-[#eef2f7]",
                        exceeded
                          ? "bg-[#fdecec]"
                          : warning
                          ? "bg-[#fef6ec]"
                          : "",
                      )}
                    >
                      <td className="px-3 py-1.5 text-center text-[#5b6b82]">
                        {i + 1}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{r.code}</td>
                      <td className="px-3 py-1.5 font-medium text-[#16233a]">
                        {r.name}
                      </td>
                      <td className="px-3 py-1.5">{r.group}</td>
                      <td className="px-3 py-1.5 text-center font-semibold">
                        {r.level}
                      </td>
                      <td className="px-3 py-1.5 text-center font-bold text-[#c62828]">
                        {r.absent}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {r.maxAbsent === null ? "ไม่จำกัด" : String(r.maxAbsent)}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold text-white",
                            exceeded
                              ? "bg-[#c62828]"
                              : warning
                              ? "bg-[#ef8c1a]"
                              : "bg-[#1e8e3e]",
                          )}
                        >
                          {exceeded
                            ? "เกินเกณฑ์"
                            : warning
                            ? "เตือน"
                            : "ปกติ"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* สำรอง/กู้คืนข้อมูล */}
      <Card className="mt-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="mr-auto">สำรองข้อมูลทั้งระบบ (JSON)</CardTitle>
          <p className="text-[12.5px] text-[#5b6b82]">
            ดาวน์โหลดข้อมูลทุกตารางเป็นไฟล์ JSON หนึ่งไฟล์ ไว้กู้คืนหรือย้ายเครื่องได้
          </p>
          <UIButton variant="green" onClick={() => void exportBackup()} disabled={backupBusy} className="h-10 px-4 text-[13.5px] disabled:opacity-40">
            {backupBusy ? "กำลังสำรอง..." : (<><DownloadIcon className="mr-1 h-4 w-4" /> สำรองข้อมูล</>)}
          </UIButton>
        </div>
        {backupNotice ? (
          <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-[13.5px] font-medium text-[#1a5da3]">{backupNotice}</p>
        ) : null}
        {backupSummary && backupSummary.length > 0 ? (
          <ul className="mt-2 divide-y divide-[#eef2f7] text-[13px]">
            {backupSummary.map((row) => (
              <li key={row.table} className="flex justify-between py-1.5">
                <span>{row.table}</span><span className="text-[#5b6b82]">{row.rows} แถว</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {termModal ? (
        <Modal title={`แก้ไข${termModal.name}`} onClose={() => setTermModal(null)}>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 block text-[14px] font-medium text-[#16233a]">
              ชื่อเทอม
              <input
                value={termModal.name}
                onChange={(e) => setTermModal({ ...termModal, name: e.target.value })}
                className={cn(inputCls, "mt-1")}
              />
            </label>
            <label className="block text-[14px] font-medium text-[#16233a]">
              เริ่ม
              <input
                type="date"
                value={termModal.start}
                onChange={(e) => setTermModal({ ...termModal, start: e.target.value })}
                className={cn(inputCls, "mt-1")}
              />
            </label>
            <label className="block text-[14px] font-medium text-[#16233a]">
              สิ้นสุด
              <input
                type="date"
                value={termModal.end}
                onChange={(e) => setTermModal({ ...termModal, end: e.target.value })}
                className={cn(inputCls, "mt-1")}
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <UIButton variant="blue" onClick={() => setTermModal(null)} className="h-10 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40">
              ยกเลิก
            </UIButton>
            <UIButton variant="green" onClick={() => void saveTermEdit()} className="h-10">
              บันทึก
            </UIButton>
          </div>
        </Modal>
      ) : null}
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
