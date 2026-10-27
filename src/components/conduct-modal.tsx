import { useEffect, useMemo, useState } from "react";
import { CalculatorIcon, SearchIcon } from "@/components/icons";
import { Modal, UIButton } from "@/components/ui";
import {
  calculateConductScore,
  calculateEffectiveAbsences,
  fetchConductAttendanceStats,
  splitConductScore,
  type StudentAttendanceStats,
} from "@/lib/conduct";
import { addAssignment, type SheetAssignment } from "@/lib/grading";
import type { SchoolTerm } from "@/lib/terms";

export type ConductModalProps = {
  isOpen: boolean;
  onClose: () => void;
  activeGroup: string;
  activeSubject: string;
  currentLevel: string;
  sheetTerm: SchoolTerm | null;
  assignments: SheetAssignment[];
  students: Array<{
    code: string;
    number: string;
    name: string;
    group: string;
  }>;
  onApplyScores: (
    scoresToApply: Array<{ assignmentId: string; studentCode: string; score: number }>,
    summaryMessage: string,
  ) => void;
  onReloadSheet: () => Promise<void>;
};

export function ConductModal({
  isOpen,
  onClose,
  activeGroup,
  activeSubject,
  currentLevel,
  sheetTerm,
  assignments,
  students,
  onApplyScores,
  onReloadSheet,
}: ConductModalProps) {
  const [loading, setLoading] = useState(false);
  const [creatingCols, setCreatingCols] = useState(false);
  const [stats, setStats] = useState<Map<string, StudentAttendanceStats>>(new Map());
  const [lateRatio, setLateRatio] = useState<number>(3);

  // ตรวจหาคอลัมน์จิตพิสัยเริ่มต้น
  const defaultSelection = useMemo(() => {
    const matches = assignments.filter((a) => {
      const t = a.title.toLowerCase();
      const c = a.category.toLowerCase();
      return t.includes("จิตพิสัย") || t.includes("conduct") || c.includes("จิตพิสัย");
    });

    if (matches.length >= 2) {
      return {
        mode: "split" as const,
        col1: matches[0].id,
        col2: matches[1].id,
      };
    }
    if (matches.length === 1) {
      const other = assignments.find((a) => a.id !== matches[0].id);
      return {
        mode: "single" as const,
        col1: matches[0].id,
        col2: other ? other.id : "",
      };
    }
    return {
      mode: "single" as const,
      col1: assignments[0]?.id ?? "",
      col2: assignments[1]?.id ?? assignments[0]?.id ?? "",
    };
  }, [assignments]);

  const [targetMode, setTargetMode] = useState<"single" | "split" | "half1" | "half2">(() => defaultSelection.mode);
  const [col1, setCol1] = useState<string>(() => defaultSelection.col1);
  const [col2, setCol2] = useState<string>(() => defaultSelection.col2);
  const [search, setSearch] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // โหลดสถิติการเช็คชื่อเมื่อเปิด Modal หรือเปลี่ยน activeGroup / term
  useEffect(() => {
    if (!isOpen || !activeGroup) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErrorMsg("");
      const res = await fetchConductAttendanceStats(
        activeGroup,
        sheetTerm ? { startsOn: sheetTerm.startsOn, endsOn: sheetTerm.endsOn } : null,
      );
      if (!cancelled) {
        setStats(res ?? new Map());
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeGroup, sheetTerm]);

  // สร้างคอลัมน์จิตพิสัยให้อัตโนมัติ (1 ช่อง 10 คะแนน)
  const handleQuickCreateSingle = async () => {
    setCreatingCols(true);
    setErrorMsg("");
    const due = sheetTerm?.endsOn || new Date().toISOString().slice(0, 10);
    const ok = await addAssignment({
      groupName: activeGroup,
      subject: activeSubject,
      title: "จิตพิสัย",
      max: 10,
      due,
      category: "จิตพิสัย",
    });
    setCreatingCols(false);
    if (ok) {
      await onReloadSheet();
      setTargetMode("single");
    } else {
      setErrorMsg("สร้างคอลัมน์ไม่สำเร็จ — โปรดลองใหม่อีกครั้ง");
    }
  };

  // สร้างคอลัมน์จิตพิสัยให้อัตโนมัติ (2 ช่อง ช่องละ 5 คะแนน)
  const handleQuickCreateSplit = async () => {
    setCreatingCols(true);
    setErrorMsg("");
    const due = sheetTerm?.endsOn || new Date().toISOString().slice(0, 10);
    const ok1 = await addAssignment({
      groupName: activeGroup,
      subject: activeSubject,
      title: "น.7-จิตพิสัย 1",
      max: 5,
      due,
      category: "จิตพิสัย",
    });
    const ok2 = await addAssignment({
      groupName: activeGroup,
      subject: activeSubject,
      title: "น.7-จิตพิสัย 2",
      max: 5,
      due,
      category: "จิตพิสัย",
    });
    setCreatingCols(false);
    if (ok1 && ok2) {
      await onReloadSheet();
      setTargetMode("split");
    } else {
      setErrorMsg("สร้างคอลัมน์ไม่สำเร็จ — โปรดลองใหม่อีกครั้ง");
    }
  };

  // คำนวณข้อมูลนักเรียนแต่ละคน
  const previewRows = useMemo(() => {
    return students.map((st) => {
      const sStats = stats.get(st.code);
      const absent = sStats?.absent ?? 0;
      const late = sStats?.late ?? 0;
      const effectiveAbs = calculateEffectiveAbsences(absent, late, lateRatio);
      const score = calculateConductScore(currentLevel, effectiveAbs);
      const split = splitConductScore(score);

      return {
        code: st.code,
        number: st.number,
        name: st.name,
        absent,
        late,
        effectiveAbs,
        score,
        splitCol1: split.col1,
        splitCol2: split.col2,
      };
    });
  }, [students, stats, lateRatio, currentLevel]);

  // สรุปสถิติภาพรวม
  const summary = useMemo(() => {
    let fullCount = 0;
    let deductedCount = 0;
    let zeroCount = 0;

    for (const r of previewRows) {
      if (r.score === 10) fullCount++;
      else if (r.score === 0) zeroCount++;
      else deductedCount++;
    }

    return {
      total: previewRows.length,
      fullCount,
      deductedCount,
      zeroCount,
    };
  }, [previewRows]);

  // กรองตามการค้นหา
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return previewRows;
    return previewRows.filter((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [previewRows, search]);

  // เลือกคอลัมน์เป้าหมาย
  const targetCol1Name = assignments.find((a) => a.id === col1)?.title || "ยังไม่ได้เลือก";
  const targetCol2Name = assignments.find((a) => a.id === col2)?.title || "ยังไม่ได้เลือก";

  // นำคะแนนลงตาราง
  const handleApply = () => {
    if (targetMode === "single" && !col1) {
      setErrorMsg("กรุณาเลือกคอลัมน์เป้าหมายสำหรับใส่คะแนนจิตพิสัย");
      return;
    }
    if (targetMode === "split" && (!col1 || !col2 || col1 === col2)) {
      setErrorMsg("กรุณาเลือก 2 คอลัมน์ที่แตกต่างกันเพื่อแบ่งคะแนน");
      return;
    }
    if (targetMode === "half1" && !col1) {
      setErrorMsg("กรุณาเลือกคอลัมน์ช่วงที่ 1");
      return;
    }
    if (targetMode === "half2" && !col2) {
      setErrorMsg("กรุณาเลือกคอลัมน์ช่วงที่ 2");
      return;
    }

    const scoresToApply: Array<{ assignmentId: string; studentCode: string; score: number }> = [];

    for (const r of previewRows) {
      if (targetMode === "single") {
        scoresToApply.push({ assignmentId: col1, studentCode: r.code, score: r.score });
      } else if (targetMode === "split") {
        scoresToApply.push({ assignmentId: col1, studentCode: r.code, score: r.splitCol1 });
        scoresToApply.push({ assignmentId: col2, studentCode: r.code, score: r.splitCol2 });
      } else if (targetMode === "half1") {
        scoresToApply.push({ assignmentId: col1, studentCode: r.code, score: r.splitCol1 });
      } else if (targetMode === "half2") {
        scoresToApply.push({ assignmentId: col2, studentCode: r.code, score: r.splitCol2 });
      }
    }

    const msg = `นำคะแนนจิตพิสัยลงตารางเรียบร้อย (${previewRows.length} คน, ${scoresToApply.length} ช่อง) — ตรวจทานแล้วกด "บันทึกคะแนน"`;
    onApplyScores(scoresToApply, msg);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal title="คำนวณคะแนนจิตพิสัยจากการเช็คชื่อ" onClose={onClose}>
      <div className="space-y-4 text-[#16233a]">
        {/* หัวข้อและห้องเรียน */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
          <div>
            <div className="text-[15px] font-bold text-[#16233a]">
              ห้อง {activeGroup} (ระดับ {currentLevel}) · วิชา {activeSubject || "-"}
            </div>
            <div className="text-[12.5px] text-[#5b6b82]">
              ดึงข้อมูล ขาด-สาย จากระบบเช็คชื่อ แล้วคำนวณคะแนนจิตพิสัยอัตโนมัติ (เต็ม 10 คะแนน)
            </div>
          </div>
          {sheetTerm ? (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[12px] font-medium text-blue-700">
              {sheetTerm.name}
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[12px] text-gray-700">
              ทุกภาคเรียน
            </span>
          )}
        </div>

        {/* เกณฑ์การคิดคะแนนตามระดับชั้น */}
        {currentLevel === "ม.3" ? (
          <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 text-[13px]">
            <div className="flex items-center gap-2 font-bold text-purple-900">
              <span className="rounded bg-purple-200 px-2 py-0.5 text-[11px] font-bold text-purple-900">
                เกณฑ์ระดับ ม.3
              </span>
              <span>คะแนนจิตพิสัยเต็ม 10 คะแนน</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] sm:grid-cols-4">
              <div>• ขาด 0-3 ครั้ง = <strong className="text-emerald-700">10 คะแนน</strong></div>
              <div>• ขาด 4 ครั้ง = <strong>9 คะแนน</strong></div>
              <div>• ขาด 5 ครั้ง = <strong>8 คะแนน</strong></div>
              <div>• ขาด 6 ครั้ง = <strong>7 คะแนน</strong></div>
              <div>• ขาด 7 ครั้ง = <strong>6 คะแนน</strong></div>
              <div>• ขาด 8 ครั้ง = <strong>5 คะแนน</strong></div>
              <div>• ขาด 9 ครั้ง = <strong>4 คะแนน</strong></div>
              <div>• ขาด 10 ครั้ง = <strong>3 คะแนน</strong></div>
              <div>• ขาด 11 ครั้ง = <strong>2 คะแนน</strong></div>
              <div>• ขาด 12 ครั้ง = <strong>1 คะแนน</strong></div>
              <div className="col-span-2 font-semibold text-rose-700">• ขาด 13 ครั้งขึ้นไป = 0 คะแนน</div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 text-[13px]">
            <div className="flex items-center gap-2 font-bold text-purple-900">
              <span className="rounded bg-purple-200 px-2 py-0.5 text-[11px] font-bold text-purple-900">
                เกณฑ์ระดับ {currentLevel} (ม.1 / ม.5)
              </span>
              <span>คะแนนจิตพิสัยเต็ม 10 คะแนน</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] sm:grid-cols-3">
              <div>• ขาด 0-3 ครั้ง = <strong className="text-emerald-700">10 คะแนน</strong></div>
              <div>• ขาด 4 ครั้ง = <strong>8 คะแนน</strong></div>
              <div>• ขาด 5 ครั้ง = <strong>6 คะแนน</strong></div>
              <div>• ขาด 6 ครั้ง = <strong>4 คะแนน</strong></div>
              <div>• ขาด 7 ครั้ง = <strong>2 คะแนน</strong></div>
              <div className="font-semibold text-rose-700">• ขาด 8 ครั้งขึ้นไป = 0 คะแนน</div>
            </div>
          </div>
        )}

        {/* แถบเงื่อนไขการนับมาสาย */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[12.5px] text-amber-900">
          <div className="flex items-center gap-1.5">
            <span>⏱️ <strong>การนับยอด:</strong> รวมการมาสายด้วย (มาสาย</span>
            <input
              type="number"
              min={1}
              max={10}
              value={lateRatio}
              onChange={(e) => setLateRatio(Math.max(1, Number(e.target.value) || 1))}
              className="h-6 w-11 rounded border border-amber-300 bg-white text-center font-bold text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <span>ครั้ง คิดเป็นขาด 1 ครั้ง)</span>
          </div>
          <span className="text-[11.5px] text-amber-800">
            {sheetTerm ? `ช่วง: ${sheetTerm.startsOn} ถึง ${sheetTerm.endsOn}` : "นับทุกช่วงวันที่"}
          </span>
        </div>

        {/* รูปแบบการใส่คะแนนลงคอลัมน์ */}
        <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50/50 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-[13px] font-bold text-[#16233a]">
              เลือกรูปแบบและคอลัมน์เป้าหมาย:
            </label>
            {/* Quick create buttons if teacher doesn't have columns */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleQuickCreateSingle()}
                disabled={creatingCols}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-[11.5px] font-medium text-[#16233a] hover:bg-gray-100 disabled:opacity-40"
              >
                + สร้างคอลัมน์จิตพิสัย (10)
              </button>
              <button
                type="button"
                onClick={() => void handleQuickCreateSplit()}
                disabled={creatingCols}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-[11.5px] font-medium text-[#16233a] hover:bg-gray-100 disabled:opacity-40"
              >
                + สร้าง 2 คอลัมน์ (5 + 5)
              </button>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-200/80 p-1 text-[12.5px] font-medium sm:grid-cols-4">
            <button
              type="button"
              onClick={() => setTargetMode("single")}
              className={`rounded-md py-1.5 transition-colors ${
                targetMode === "single" ? "bg-white font-bold text-purple-900 shadow-xs" : "text-gray-700 hover:text-black"
              }`}
            >
              1 คอลัมน์ (เต็ม 10)
            </button>
            <button
              type="button"
              onClick={() => setTargetMode("split")}
              className={`rounded-md py-1.5 transition-colors ${
                targetMode === "split" ? "bg-white font-bold text-purple-900 shadow-xs" : "text-gray-700 hover:text-black"
              }`}
            >
              แบ่ง 2 คอลัมน์ (5 + 5)
            </button>
            <button
              type="button"
              onClick={() => setTargetMode("half1")}
              className={`rounded-md py-1.5 transition-colors ${
                targetMode === "half1" ? "bg-white font-bold text-purple-900 shadow-xs" : "text-gray-700 hover:text-black"
              }`}
            >
              เฉพาะช่วงแรก (5)
            </button>
            <button
              type="button"
              onClick={() => setTargetMode("half2")}
              className={`rounded-md py-1.5 transition-colors ${
                targetMode === "half2" ? "bg-white font-bold text-purple-900 shadow-xs" : "text-gray-700 hover:text-black"
              }`}
            >
              เฉพาะช่วงหลัง (5)
            </button>
          </div>

          {/* Column Dropdowns */}
          {assignments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-3 text-center text-[13px] text-gray-500">
              วิชานี้ยังไม่มีคอลัมน์งานในตาราง — กดปุ่ม <strong>+ สร้างคอลัมน์จิตพิสัย</strong> ด้านบนเพื่อสร้างอัตโนมัติ
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
              {targetMode !== "half2" && (
                <div>
                  <label className="text-[12px] font-medium text-gray-600">
                    {targetMode === "single" ? "คอลัมน์เป้าหมาย (เต็ม 10 คะแนน):" : "คอลัมน์ที่ 1 (5 คะแนน):"}
                  </label>
                  <select
                    value={col1}
                    onChange={(e) => setCol1(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-[13px] text-[#16233a] focus:border-purple-500 focus:outline-none"
                  >
                    <option value="">-- เลือกคอลัมน์ --</option>
                    {assignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} (เต็ม {a.max} คะแนน)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(targetMode === "split" || targetMode === "half2") && (
                <div>
                  <label className="text-[12px] font-medium text-gray-600">
                    คอลัมน์ที่ 2 (5 คะแนน):
                  </label>
                  <select
                    value={col2}
                    onChange={(e) => setCol2(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-gray-300 bg-white px-2.5 text-[13px] text-[#16233a] focus:border-purple-500 focus:outline-none"
                  >
                    <option value="">-- เลือกคอลัมน์ --</option>
                    {assignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} (เต็ม {a.max} คะแนน)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* แถบสถิติภาพรวม & ช่องค้นหา */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-700">
              นักเรียน: <strong>{summary.total}</strong> คน
            </span>
            <span className="rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-800">
              ได้เต็ม (10): <strong>{summary.fullCount}</strong> คน
            </span>
            <span className="rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-800">
              ถูกหักคะแนน: <strong>{summary.deductedCount}</strong> คน
            </span>
            <span className="rounded-md bg-rose-50 px-2 py-1 font-medium text-rose-800">
              ได้ 0 คะแนน: <strong>{summary.zeroCount}</strong> คน
            </span>
          </div>
          <div className="relative w-full sm:w-56">
            <SearchIcon className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="ค้นหาชื่อ หรือ รหัส..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-md border border-gray-300 bg-white pr-3 pl-8 text-[12.5px] text-[#16233a] focus:border-purple-500 focus:outline-none"
            />
          </div>
        </div>

        {/* ตารางแสดงผลตัวอย่างการคำนวณ (Preview Table) */}
        <div className="max-h-[360px] overflow-auto rounded-lg border border-gray-200 bg-white">
          {loading ? (
            <div className="py-12 text-center text-[13.5px] text-gray-500">
              กำลังดึงข้อมูลสถิติการเช็คชื่อ...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-12 text-center text-[13.5px] text-gray-500">
              ไม่พบข้อมูลนักเรียน
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead className="sticky top-0 z-10 bg-gray-100 text-[12px] font-semibold text-gray-700 shadow-xs">
                <tr>
                  <th className="px-3 py-2 text-center">ลำดับ</th>
                  <th className="px-3 py-2">รหัส</th>
                  <th className="px-3 py-2">ชื่อ-นามสกุล</th>
                  <th className="px-2.5 py-2 text-center">ขาด</th>
                  <th className="px-2.5 py-2 text-center">สาย</th>
                  <th className="px-2.5 py-2 text-center" title="ขาด + floor(สาย / 3)">
                    ขาดเทียบเท่า
                  </th>
                  <th className="px-3 py-2 text-center font-bold text-purple-900">
                    จิตพิสัย (10)
                  </th>
                  <th className="px-3 py-2 text-right">
                    คะแนนที่จะลงคอลัมน์
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((r, idx) => (
                  <tr key={r.code} className="hover:bg-purple-50/30">
                    <td className="px-3 py-1.5 text-center text-gray-500">{r.number || idx + 1}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-600">{r.code}</td>
                    <td className="px-3 py-1.5 font-medium text-[#16233a]">{r.name}</td>
                    <td className="px-2.5 py-1.5 text-center">
                      {r.absent > 0 ? (
                        <span className="font-semibold text-rose-600">{r.absent}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-center">
                      {r.late > 0 ? (
                        <span className="font-semibold text-amber-600">{r.late}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-center">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[11.5px] font-bold ${
                        r.effectiveAbs === 0
                          ? "bg-emerald-50 text-emerald-700"
                          : r.effectiveAbs <= 3
                            ? "bg-blue-50 text-blue-700"
                            : "bg-rose-50 text-rose-700"
                      }`}>
                        {r.effectiveAbs} ครั้ง
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-block min-w-8 rounded-full px-2 py-0.5 text-center font-bold ${
                        r.score === 10
                          ? "bg-emerald-100 text-emerald-800"
                          : r.score >= 5
                            ? "bg-amber-100 text-amber-900"
                            : "bg-rose-100 text-rose-800"
                      }`}>
                        {r.score}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium">
                      {targetMode === "single" && (
                        <span className="text-purple-900">
                          {col1 ? `${targetCol1Name}: ` : ""}
                          <strong className="text-[13px]">{r.score}</strong>
                        </span>
                      )}
                      {targetMode === "split" && (
                        <span className="text-[11.5px] text-gray-700">
                          {col1 ? `${targetCol1Name}: ` : "ช่อง 1: "}<strong>{r.splitCol1}</strong>
                          {" | "}
                          {col2 ? `${targetCol2Name}: ` : "ช่อง 2: "}<strong>{r.splitCol2}</strong>
                        </span>
                      )}
                      {targetMode === "half1" && (
                        <span className="text-purple-900">
                          {col1 ? `${targetCol1Name}: ` : "ช่อง 1: "}
                          <strong className="text-[13px]">{r.splitCol1}</strong>
                        </span>
                      )}
                      {targetMode === "half2" && (
                        <span className="text-purple-900">
                          {col2 ? `${targetCol2Name}: ` : "ช่อง 2: "}
                          <strong className="text-[13px]">{r.splitCol2}</strong>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {errorMsg && (
          <div className="rounded-lg bg-rose-50 p-2.5 text-[13px] text-rose-700">
            {errorMsg}
          </div>
        )}

        {/* ปุ่มกดยืนยัน / ยกเลิก */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
          <div className="text-[12px] text-gray-500">
            💡 เมื่อกดยืนยัน ระบบจะหยอดคะแนนลงในตาราง (สามารถตรวจสอบหรือแก้ไขก่อนกดบันทึกจริง)
          </div>
          <div className="flex items-center gap-2">
            <UIButton
              variant="blue"
              onClick={onClose}
              className="h-9 bg-[#5b6b82] px-4 text-[13px] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40"
            >
              ยกเลิก
            </UIButton>
            <UIButton
              variant="blue"
              onClick={handleApply}
              disabled={loading || creatingCols || assignments.length === 0}
              className="h-9 bg-[#6b21a8] px-4 text-[13px] hover:bg-[#581c87] focus-visible:ring-[#6b21a8]/40 disabled:opacity-40"
            >
              <CalculatorIcon className="mr-1.5 h-3.5 w-3.5" />
              นำคะแนนลงตาราง ({previewRows.length} คน)
            </UIButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}
