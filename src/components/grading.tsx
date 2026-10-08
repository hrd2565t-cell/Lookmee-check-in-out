"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout";
import { ChevronDownIcon, DownloadIcon, SearchIcon, TrashIcon } from "@/components/icons";
import { Card, Modal, ScoreCell, UIButton } from "@/components/ui";
import {
  addAssignment,
  deleteAssignment,
  fetchSheet,
  fetchSubjects,
  saveScores,
  type SheetAssignment,
} from "@/lib/grading";
import { fetchTerms, type SchoolTerm } from "@/lib/terms";
import { useRoster } from "@/lib/school-data";
import { cn } from "@/lib/cn";

const inputCls =
  "h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] text-[#16233a] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none";

/* ---------- หน้ากรอกคะแนนรายบุคคล (Grading Sheets) ---------- */
export default function GradingPage() {
  const { groups: rosterGroups, students: rosterStudents } = useRoster();
  const groupNames = useMemo(() => rosterGroups.map((g) => g.name), [rosterGroups]);
  const [group, setGroup] = useState("");
  const activeGroup = groupNames.includes(group) ? group : (groupNames[0] ?? "");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [terms, setTerms] = useState<SchoolTerm[]>([]);
  const [termId, setTermId] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const pagerBtn =
    "rounded-md px-2 py-1 text-[16px] font-bold text-[#5b6b82] hover:bg-[#eef3f9] disabled:opacity-30 disabled:hover:bg-transparent";

  const [assignments, setAssignments] = useState<SheetAssignment[]>([]);
  const [savedScores, setSavedScores] = useState<Map<string, number | null>>(new Map());
  const [drafts, setDrafts] = useState<Map<string, string>>(new Map());
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [colModal, setColModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [colForm, setColForm] = useState({ title: "", max: "10", due: "", category: "ใบงาน/การบ้าน" });

  const activeSubject = subjects.includes(subject) ? subject : (subjects[0] ?? "");
  const activeTerm = terms.find((t) => t.id === termId) ?? null;

  const reloadSheet = async (g = activeGroup, s = activeSubject, t = activeTerm) => {
    if (!g || !s) {
      setAssignments([]);
      setSavedScores(new Map());
      return;
    }
    const sheet = await fetchSheet(
      g,
      s,
      t ? { startsOn: t.startsOn, endsOn: t.endsOn } : null,
    );
    if (sheet) {
      setAssignments(sheet.assignments);
      setSavedScores(sheet.scores);
      setDrafts(new Map());
    }
  };

  // โหลดวิชา + เทอม
  useEffect(() => {
    if (!activeGroup) return;
    let cancelled = false;
    (async () => {
      const [subs, ts] = await Promise.all([fetchSubjects(activeGroup), fetchTerms()]);
      if (cancelled) return;
      setSubjects(subs ?? []);
      if (ts) {
        setTerms(ts);
        const cur = ts.find((t) => t.isCurrent);
        if (cur) setTermId(cur.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeGroup]);

  // โหลดชีทเมื่อตัวกรองเปลี่ยน
  useEffect(() => {
    if (!activeGroup || !activeSubject) return;
    let cancelled = false;
    (async () => {
      const sheet = await fetchSheet(
        activeGroup,
        activeSubject,
        activeTerm ? { startsOn: activeTerm.startsOn, endsOn: activeTerm.endsOn } : null,
      );
      if (!cancelled && sheet) {
        setAssignments(sheet.assignments);
        setSavedScores(sheet.scores);
        setDrafts(new Map());
        setPage(1);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup, activeSubject, activeTerm?.id]);

  const students = useMemo(
    () => rosterStudents.filter((s) => s.group === activeGroup),
    [rosterStudents, activeGroup],
  );

  const cellKey = (aId: string, code: string) => `${aId}|${code}`;
  const cellValue = (aId: string, code: string): string => {
    const d = drafts.get(cellKey(aId, code));
    if (d !== undefined) return d;
    const s = savedScores.get(cellKey(aId, code));
    return s === null || s === undefined ? "" : String(s);
  };

  const rowTotal = (code: string) =>
    assignments.reduce((sum, a) => {
      const d = drafts.get(cellKey(a.id, code));
      const v = d !== undefined ? (d === "" ? 0 : Number(d)) : (savedScores.get(cellKey(a.id, code)) ?? 0);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);

  const rowSaved = (code: string) =>
    assignments.length > 0 &&
    assignments.every((a) => {
      const d = drafts.get(cellKey(a.id, code));
      if (d !== undefined) return d !== "";
      const s = savedScores.get(cellKey(a.id, code));
      return s !== null && s !== undefined;
    });

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.code.includes(q),
    );
  }, [students, query]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredStudents.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const dirtyCount = drafts.size;

  const setDraft = (aId: string, code: string, v: string) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      const saved = savedScores.get(cellKey(aId, code));
      const savedStr = saved === null || saved === undefined ? "" : String(saved);
      if (v === savedStr) next.delete(cellKey(aId, code));
      else next.set(cellKey(aId, code), v);
      return next;
    });
  };

  const saveAll = async () => {
    const rows: Array<{ assignmentId: string; studentCode: string; score: number | null }> = [];
    for (const [key, v] of drafts) {
      const [aId, code] = key.split("|") as [string, string];
      const a = assignments.find((x) => x.id === aId);
      if (!a) continue;
      if (v.trim() === "") {
        rows.push({ assignmentId: aId, studentCode: code, score: null });
        continue;
      }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > a.max) {
        setNotice(`คะแนนไม่ถูกต้อง (ต้อง 0–${a.max}) — ตรวจช่องสีเหลือง`);
        return;
      }
      rows.push({ assignmentId: aId, studentCode: code, score: n });
    }
    if (rows.length === 0) {
      setNotice("ไม่มีช่องที่แก้ไข");
      return;
    }
    setSaving(true);
    const { ok, failed } = await saveScores(
      rows.map((r) => ({ ...r, groupName: activeGroup })),
    );
    setSaving(false);
    if (failed > 0 && ok === 0) {
      setNotice("บันทึกไม่สำเร็จ — ตรวจการเชื่อมต่อ");
      return;
    }
    setNotice(`บันทึกแล้ว ${ok} ช่อง${failed ? ` (พลาด ${failed})` : ""}`);
    await reloadSheet();
  };

  const exportCsv = () => {
    const header = ["ลำดับ", "รหัสประจำตัว", "ชื่อ", ...assignments.map((a) => `${a.title} (${a.max})`), "รวม"];
    const lines = filteredStudents.map((s, i) => {
      const total = rowTotal(s.code);
      const cells = assignments.map((a) => {
        const d = drafts.get(cellKey(a.id, s.code));
        const v = d !== undefined ? d : (savedScores.get(cellKey(a.id, s.code)) ?? "");
        return v === null ? "" : String(v);
      });
      return [i + 1, s.code, s.name, ...cells, total].join(",");
    });
    const blob = new Blob(["\uFEFF" + [header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grades-${activeGroup}-${activeSubject}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadScoreTemplate = () => {
    const header = ["เลขประจำตัว", ...assignments.map((a) => a.title)];
    const blob = new Blob(["\uFEFF" + header.join(",") + "\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-import-scores.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importScores = async (file: File) => {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      setNotice("ไฟล์ว่าง");
      return;
    }
    const header = (lines[0] ?? "").split(",").map((c) => c.trim());
    if (header[0] !== "เลขประจำตัว") {
      setNotice("คอลัมน์แรกต้องเป็นเลขประจำตัว — โหลดเทมเพลตมากรอกใหม่");
      return;
    }
    const colAssign = header.slice(1).map((t) => assignments.find((a) => a.title === t) ?? null);
    if (colAssign.some((c) => !c)) {
      setNotice("ชื่อคอลัมน์งานไม่ตรงกับตาราง — โหลดเทมเพลตมากรอกใหม่");
      return;
    }
    const rows: Array<{ assignmentId: string; studentCode: string; score: number | null }> = [];
    const problems: string[] = [];
    const codeSet = new Set(students.map((s) => s.code));
    lines.slice(1).forEach((line, i) => {
      const cols = line.split(",").map((c) => c.trim());
      const code = cols[0] ?? "";
      if (!codeSet.has(code)) {
        problems.push(`แถวที่ ${i + 2}: ไม่มีรหัส ${code} ในห้องนี้`);
        return;
      }
      cols.slice(1).forEach((cell, j) => {
        const a = colAssign[j];
        if (!a) return;
        if (cell === "") {
          rows.push({ assignmentId: a.id, studentCode: code, score: null });
          return;
        }
        const n = Number(cell);
        if (!Number.isFinite(n) || n < 0 || n > a.max) {
          problems.push(`แถวที่ ${i + 2} (${a.title}): ต้อง 0–${a.max}`);
          return;
        }
        rows.push({ assignmentId: a.id, studentCode: code, score: n });
      });
    });
    if (rows.length === 0) {
      setNotice("ไม่มีแถวที่ใช้ได้" + (problems[0] ? ` — ${problems[0]}` : ""));
      return;
    }
    const { ok, failed } = await saveScores(rows.map((r) => ({ ...r, groupName: activeGroup })));
    setNotice(
      `นำเข้าคะแนน ${ok} ช่อง${failed ? ` (พลาด ${failed})` : ""}` +
        (problems.length ? ` · ข้าม: ${problems.slice(0, 2).join("; ")}${problems.length > 2 ? ` และอีก ${problems.length - 2}` : ""}` : ""),
    );
    setImportModal(false);
    await reloadSheet();
  };

  const openAddColumn = () => {
    setColForm({ title: "", max: "10", due: new Date().toISOString().slice(0, 10), category: "ใบงาน/การบ้าน" });
    setColModal(true);
  };

  const saveColumn = async () => {
    if (!colForm.title.trim()) {
      setNotice("กรอกชื่องาน");
      return;
    }
    const max = Number(colForm.max);
    if (!Number.isFinite(max) || max <= 0) {
      setNotice("คะแนนเต็มต้องมากกว่า 0");
      return;
    }
    if (!colForm.due) {
      setNotice("เลือกวันกำหนดส่ง");
      return;
    }
    const ok = await addAssignment({
      groupName: activeGroup,
      subject: activeSubject,
      title: colForm.title.trim(),
      max,
      due: colForm.due,
      category: colForm.category,
    });
    if (!ok) {
      setNotice("เพิ่มคอลัมน์ไม่สำเร็จ");
      return;
    }
    setColModal(false);
    setNotice(`เพิ่มคอลัมน์ “${colForm.title.trim()}” แล้ว`);
    const subs = await fetchSubjects(activeGroup);
    if (subs) setSubjects(subs);
    await reloadSheet();
  };

  const removeColumn = async (a: (typeof assignments)[number]) => {
    if (!window.confirm(`ลบคอลัมน์ “${a.title}” และคะแนนทั้งหมดในคอลัมน์?`)) return;
    const ok = await deleteAssignment(a.id);
    if (!ok) {
      setNotice("ลบไม่สำเร็จ");
      return;
    }
    setNotice(`ลบคอลัมน์ “${a.title}” แล้ว`);
    await reloadSheet();
  };

  return (
    <AppShell active="grading" title="บันทึกคะแนนนักเรียน (Student Grading Sheets) / ครูผู้สอน">
      <p className="-mt-3 mb-3 text-[13.5px] text-[#5b6b82]">หน้าแรก / บันทึกคะแนน และประเมินผล</p>

      {/* ฟิลเตอร์ */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[180px_1fr_140px_auto] sm:items-end">
          <label className="block text-[13.5px] font-medium text-[#16233a]">
            เลือกกลุ่มเรียน
            <span className="relative mt-1 block">
              <select
                value={activeGroup}
                onChange={(e) => setGroup(e.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-9 text-[14px] focus:border-[#2474c6] focus:outline-none"
              >
                {groupNames.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
            </span>
          </label>
          <label className="block text-[13.5px] font-medium text-[#16233a]">
            เลือกวิชา
            <span className="relative mt-1 block">
              <select
                value={activeSubject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-9 text-[14px] focus:border-[#2474c6] focus:outline-none"
              >
                {subjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
            </span>
          </label>
          <label className="block text-[13.5px] font-medium text-[#16233a]">
            ภาคเรียน
            <span className="relative mt-1 block">
              <select
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-9 text-[14px] focus:border-[#2474c6] focus:outline-none"
              >
                <option value="all">ทุกภาคเรียน</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
            </span>
          </label>
          <div className="flex gap-2">
            <UIButton variant="blue" onClick={() => setImportModal(true)} className="h-10 flex-1 px-3 text-[13.5px]">
              นำเข้าไฟล์ (Excel)
            </UIButton>
            <UIButton variant="green" onClick={() => void saveAll()} disabled={saving || dirtyCount === 0} className="h-10 flex-1 px-3 text-[13.5px] disabled:opacity-40">
              {saving ? "..." : `บันทึกทั้งหมด${dirtyCount ? ` (${dirtyCount})` : ""} (Save All)`}
            </UIButton>
          </div>
        </div>
        <label className="relative mt-2 block sm:max-w-[320px]">
          <span className="sr-only">ค้นหาชื่อนักเรียน</span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="ค้นหาชื่อนักเรียน..."
            className="h-10 w-full rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-10 text-[14px] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
          />
          <SearchIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
        </label>
        {notice ? (
          <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-[13.5px] font-medium text-[#1a5da3]">
            {notice}
          </p>
        ) : null}
      </Card>

      {/* ตาราง */}
      <Card className="mt-3 p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-[16px] font-bold text-[#16233a]">
            คะแนนรายบุคคล {activeGroup} (วิชา{activeSubject || "-"})
          </h2>
          <UIButton variant="green" onClick={openAddColumn} className="h-9 px-3 text-[13px]">
            + เพิ่มคอลัมน์งาน
          </UIButton>
          <UIButton variant="blue" onClick={() => void saveAll()} disabled={saving || dirtyCount === 0} className="h-9 px-3 text-[13px] disabled:opacity-40">
            บันทึกคะแนน
          </UIButton>
          <UIButton variant="blue" onClick={exportCsv} className="h-9 bg-[#5b6b82] px-3 text-[13px] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40">
            ส่งออก (Excel)
          </UIButton>
        </div>
        {assignments.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-[#5b6b82]">
            ยังไม่มีคอลัมน์งานในวิชานี้ — กด “+ เพิ่มคอลัมน์งาน” เพื่อเริ่ม
          </p>
        ) : (
          <div className="slim-scroll -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="text-[12.5px] font-bold text-[#16233a]">
                  <th className="sticky left-0 bg-white py-2 pr-3">ลำดับ</th>
                  <th className="sticky left-[52px] bg-white py-2 pr-3">รหัสประจำตัว</th>
                  <th className="py-2 pr-3">ชื่อ-นามสกุล</th>
                  {assignments.map((a, i) => (
                    <th key={a.id} className="px-1.5 py-2 text-center" title={`${a.title} · ส่ง ${a.due}`}>
                      <span className="block">น.{i + 1}</span>
                      <span className="block font-medium text-[#5b6b82]">({a.max})</span>
                      <button
                        type="button"
                        aria-label={`ลบคอลัมน์ ${a.title}`}
                        title={a.title}
                        onClick={() => void removeColumn(a)}
                        className="mx-auto mt-0.5 block rounded p-0.5 text-[#c9d2de] hover:bg-[#fdecec] hover:text-[#c62828]"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center">รวม</th>
                  <th className="py-2 text-right">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s, ri) => {
                  const saved = rowSaved(s.code);
                  return (
                    <tr key={s.code} className="border-t border-[#eef2f7] align-middle">
                      <td className="sticky left-0 bg-white py-1.5 pr-3 text-[13.5px] text-[#5b6b82]">
                        {(safePage - 1) * PAGE_SIZE + ri + 1}
                      </td>
                      <td className="sticky left-[52px] bg-white whitespace-nowrap py-1.5 pr-3 text-[13.5px] text-[#16233a]">
                        {s.code}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-[13.5px] font-medium text-[#16233a]">
                        {s.name}
                      </td>
                      {assignments.map((a) => (
                        <td key={a.id} className="px-1.5 py-1.5 text-center">
                          <ScoreCell
                            value={cellValue(a.id, s.code)}
                            max={a.max}
                            dirty={drafts.has(cellKey(a.id, s.code))}
                            onChange={(v) => setDraft(a.id, s.code, v)}
                            label={`${s.name} ${a.title} เต็ม ${a.max}`}
                          />
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-2 py-1.5 text-center text-[14px] font-bold text-[#16233a]">
                        {rowTotal(s.code)}
                      </td>
                      <td className="whitespace-nowrap py-1.5 text-right">
                        <span
                          className={cn(
                            "inline-flex min-w-[86px] items-center justify-center rounded-md px-2 py-1 text-[12px] font-bold text-white",
                            saved ? "bg-[#1e8e3e]" : "bg-[#ef8c1a]",
                          )}
                        >
                          {saved ? "บันทึกแล้ว" : "ยังไม่บันทึก"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={5 + assignments.length} className="py-8 text-center text-[14px] text-[#5b6b82]">
                      ไม่พบนักเรียนตามเงื่อนไข
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
        {/* pagination */}
        <div className="mt-2 flex items-center gap-1 border-t border-[#eef2f7] pt-2.5 text-[13.5px] text-[#5b6b82]">
          <span className="font-medium text-[#16233a]">
            หน้าที่ {safePage} จาก {totalPages}
          </span>
          <span className="ml-auto flex gap-1">
            <button type="button" aria-label="ก่อนหน้า" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)} className={pagerBtn}>‹</button>
            <button type="button" aria-label="ถัดไป" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)} className={pagerBtn}>›</button>
          </span>
        </div>
      </Card>

      {/* modal เพิ่มคอลัมน์ */}
      {colModal ? (
        <Modal title="เพิ่มคอลัมน์งาน" onClose={() => setColModal(false)}>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 block text-[14px] font-medium text-[#16233a]">
              ชื่องาน
              <input value={colForm.title} onChange={(e) => setColForm({ ...colForm, title: e.target.value })} placeholder="เช่น ใบงานที่ 1" className={cn(inputCls, "mt-1")} />
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              คะแนนเต็ม
              <input value={colForm.max} onChange={(e) => setColForm({ ...colForm, max: e.target.value })} inputMode="decimal" placeholder="10" className={cn(inputCls, "mt-1")} />
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              กำหนดส่ง
              <input type="date" value={colForm.due} onChange={(e) => setColForm({ ...colForm, due: e.target.value })} className={cn(inputCls, "mt-1")} />
            </label>
            <label className="col-span-2 block text-[14px] font-medium text-[#16233a]">
              หมวด
              <select value={colForm.category} onChange={(e) => setColForm({ ...colForm, category: e.target.value })} className={cn(inputCls, "mt-1")}>
                {["ใบงาน/การบ้าน", "คะแนนย่อย", "สอบกลางภาค", "สอบปลายภาค", "ชิ้นงาน"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <UIButton variant="blue" onClick={() => setColModal(false)} className="h-10 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40">ยกเลิก</UIButton>
            <UIButton variant="green" onClick={() => void saveColumn()} className="h-10">เพิ่มคอลัมน์</UIButton>
          </div>
        </Modal>
      ) : null}

      {/* modal นำเข้า */}
      {importModal ? (
        <Modal title="นำเข้าคะแนน (CSV)" onClose={() => setImportModal(false)}>
          <p className="text-[13.5px] text-[#16233a]">
            1. กด <b>โหลดเทมเพลต</b> ไปกรอก (คอลัมน์แรก = เลขประจำตัว, ถัดไป = ชื่องานตามตาราง)
          </p>
          <div className="mt-2 flex gap-2">
            <UIButton variant="blue" onClick={downloadScoreTemplate} className="h-10 flex-1">
              <DownloadIcon className="mr-1 h-4 w-4" /> โหลดเทมเพลต
            </UIButton>
            <label className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-md bg-[#1e8e3e] px-4 text-[15px] font-semibold text-white">
              เลือกไฟล์
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importScores(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="mt-2 text-[12.5px] text-[#5b6b82]">ค่าว่าง = ล้างคะแนนช่องนั้น · เกินคะแนนเต็มจะถูกข้ามพร้อมแจ้ง</p>
        </Modal>
      ) : null}
    </AppShell>
  );
}
