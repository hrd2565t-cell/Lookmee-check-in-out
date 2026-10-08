"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout";
import { ChevronDownIcon, DownloadIcon, EyeIcon, EyeOffIcon, PencilIcon, SearchIcon, TrashIcon } from "@/components/icons";
import { Card, Modal, ScoreCell, UIButton } from "@/components/ui";
import {
  addAssignment,
  countSubjectScores,
  createStandardSet,
  deleteAssignment,
  deleteSubject,
  fetchSheet,
  fetchSubjects,
  removeAssignmentFile,
  renameSubject,
  saveScores,
  toggleAssignmentVisible,
  updateAssignment,
  uploadAssignmentFile,
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
  const [subjectModal, setSubjectModal] = useState(false);
  const [subjectName, setSubjectName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAttachment, setEditAttachment] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateDue, setTemplateDue] = useState(new Date().toISOString().slice(0, 10));
  const [templateBusy, setTemplateBusy] = useState(false);
  const [modalMsg, setModalMsg] = useState("");
  const [colForm, setColForm] = useState({ subject: "", title: "", max: "10", due: "", category: "ใบงาน/การบ้าน" });

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
    setColForm({ subject: activeSubject, title: "", max: "10", due: new Date().toISOString().slice(0, 10), category: "ใบงาน/การบ้าน" });
    setModalMsg("");
    setEditingId(null);
    setEditAttachment(null);
    setColModal(true);
  };

  const openEditColumn = (a: SheetAssignment) => {
    setColForm({
      subject: a.subject,
      title: a.title,
      max: String(a.max),
      due: a.due,
      category: a.category || "ใบงาน/การบ้าน",
    });
    setModalMsg("");
    setEditingId(a.id);
    setEditAttachment(a.attachment);
    setColModal(true);
  };

  const openTemplate = () => {
    setTemplateSubject(activeSubject || "");
    setTemplateDue(new Date().toISOString().slice(0, 10));
    setModalMsg("");
    setTemplateModal(true);
  };

  const saveTemplate = async () => {
    const subject = templateSubject.trim();
    if (!subject) {
      setModalMsg("กรอกชื่อวิชาก่อน");
      return;
    }
    if (!templateDue) {
      setModalMsg("เลือกวันกำหนดส่ง");
      return;
    }
    const existing = new Set(assignments.map((a) => a.title));
    const items = [
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({
        title: `น.${n}`,
        max: 10,
        category: "ใบงาน/การบ้าน",
        due: templateDue,
      })),
      { title: "กลางภาค", max: 10, category: "สอบกลางภาค", due: templateDue },
      { title: "ปลายภาค", max: 20, category: "สอบปลายภาค", due: templateDue },
    ].filter((it) => !existing.has(it.title));
    if (items.length === 0) {
      setModalMsg("มีครบทั้ง 9 คอลัมน์แล้ว");
      return;
    }
    setTemplateBusy(true);
    const r = await createStandardSet(activeGroup, subject, items);
    setTemplateBusy(false);
    if (!r.ok) {
      setModalMsg("สร้างไม่สำเร็จ — ลองอีกครั้ง");
      return;
    }
    setTemplateModal(false);
    setNotice(`สร้างชุดมาตรฐาน ${r.created} คอลัมน์ (รวม 100 คะแนน) แล้ว`);
    const subs = await fetchSubjects(activeGroup);
    if (subs) {
      setSubjects(subs);
      if (!subs.includes(subject)) setSubjects([...subs, subject]);
      setSubject(subject);
    }
    await reloadSheet();
  };

  const toggleVisible = async (a: (typeof assignments)[number]) => {
    const ok = await toggleAssignmentVisible(a.id, !a.visible);
    if (!ok) {
      setNotice("บันทึกไม่สำเร็จ");
      return;
    }
    await reloadSheet();
  };

  const publishFirstFive = async () => {
    const first5 = [...assignments].sort((a, b) => a.title.localeCompare(b.title, "th")).slice(0, 5);
    if (first5.length === 0) return;
    let failed = 0;
    for (const a of assignments) {
      const should = first5.some((f) => f.id === a.id);
      if ((a.visible && should) || (!a.visible && !should)) continue;
      const ok = await toggleAssignmentVisible(a.id, should);
      if (!ok) failed++;
    }
    setNotice(
      failed ? `มีบางคอลัมน์บันทึกไม่สำเร็จ (${failed})` : "เผยแพร่เฉพาะ 5 งานแรกแล้ว ที่เหลือครูเห็นคนเดียว",
    );
    await reloadSheet();
  };

  const saveColumn = async () => {
    const subject = colForm.subject.trim() || activeSubject;
    if (!subject) {
      setModalMsg("กรอกชื่อวิชาก่อน (เช่น เทคโนโลยี)");
      return;
    }
    if (!colForm.title.trim()) {
      setModalMsg("กรอกชื่องาน");
      return;
    }
    const max = Number(colForm.max);
    if (!Number.isFinite(max) || max <= 0) {
      setModalMsg("คะแนนเต็มต้องมากกว่า 0");
      return;
    }
    if (!colForm.due) {
      setModalMsg("เลือกวันกำหนดส่ง");
      return;
    }
    // โหมดแก้ไข
    if (editingId) {
      const ok = await updateAssignment(editingId, {
        subject,
        title: colForm.title.trim(),
        max,
        due: colForm.due,
        category: colForm.category,
      });
      if (!ok) {
        setModalMsg("บันทึกไม่สำเร็จ — ตรวจการเชื่อมต่อแล้วลองใหม่");
        return;
      }
      setColModal(false);
      setEditingId(null);
      setNotice(`แก้ไขคอลัมน์ “${colForm.title.trim()}” แล้ว`);
      const subs = await fetchSubjects(activeGroup);
      if (subs) {
        const next = subs.includes(subject) ? subs : [...subs, subject];
        setSubjects(next);
        setSubject(subject);
      }
      await reloadSheet();
      return;
    }
    const ok = await addAssignment({
      groupName: activeGroup,
      subject,
      title: colForm.title.trim(),
      max,
      due: colForm.due,
      category: colForm.category,
    });
    if (!ok) {
      setModalMsg("เพิ่มคอลัมน์ไม่สำเร็จ — ตรวจการเชื่อมต่อแล้วลองใหม่");
      return;
    }
    setColModal(false);
    setEditingId(null);
    setNotice(`เพิ่มคอลัมน์ “${colForm.title.trim()}” แล้ว`);
    const subs = await fetchSubjects(activeGroup);
    if (subs) {
      const next = subs.includes(subject) ? subs : [...subs, subject];
      setSubjects(next);
      setSubject(subject);
    }
    await reloadSheet();
  };

  const pickFile = async (file: File) => {
    if (!editingId) return;
    const okType = file.type.startsWith("image/") || file.type === "application/pdf";
    if (!okType) {
      setModalMsg("รับเฉพาะไฟล์รูปภาพหรือ PDF");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setModalMsg("ไฟล์ใหญ่เกิน 5MB");
      return;
    }
    setUploading(true);
    const url = await uploadAssignmentFile(editingId, file);
    setUploading(false);
    if (!url) {
      setModalMsg("อัปโหลดไม่สำเร็จ — ลองอีกครั้ง");
      return;
    }
    setEditAttachment(url);
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

  // จัดการระดับวิชา: แก้ชื่อ / ลบทั้งวิชา
  const openRenameSubject = () => {
    setSubjectName(activeSubject);
    setModalMsg("");
    setSubjectModal(true);
  };

  const saveRenameSubject = async () => {
    const ok = await renameSubject(activeGroup, activeSubject, subjectName);
    if (!ok) {
      setModalMsg("บันทึกไม่สำเร็จ — ชื่อว่าง/ซ้ำเดิม");
      return;
    }
    setSubjectModal(false);
    setNotice(`เปลี่ยนชื่อวิชาเป็น “${subjectName.trim()}” แล้ว`);
    const subs = await fetchSubjects(activeGroup);
    if (subs) {
      setSubjects(subs);
      setSubject(subjectName.trim());
    }
    await reloadSheet();
  };

  const removeSubject = async () => {
    const cols = assignments.length;
    const scores = await countSubjectScores(activeGroup, activeSubject);
    if (
      !window.confirm(
        `ลบวิชา “${activeSubject}” ทั้งหมด (${cols} คอลัมน์, คะแนน ${scores} ช่อง)? กู้ไม่ได้`,
      )
    )
      return;
    const n = await deleteSubject(activeGroup, activeSubject);
    if (n === 0) {
      setNotice("ลบไม่สำเร็จ");
      return;
    }
    setNotice(`ลบวิชา “${activeSubject}” (${n} คอลัมน์) แล้ว`);
    const subs = await fetchSubjects(activeGroup);
    if (subs) {
      setSubjects(subs);
      setSubject(subs[0] ?? "");
    }
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
            <span className="flex items-center justify-between">
              เลือกวิชา
              <span className="flex gap-0.5">
                <button
                  type="button"
                  aria-label={`แก้ไขชื่อวิชา ${activeSubject}`}
                  title="แก้ไขชื่อวิชา"
                  onClick={openRenameSubject}
                  disabled={!activeSubject}
                  className="rounded p-1 text-[#2474c6] hover:bg-[#e8f1fb] disabled:opacity-30"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`ลบวิชา ${activeSubject} ทั้งหมด`}
                  title="ลบวิชาทั้งหมด"
                  onClick={() => void removeSubject()}
                  disabled={!activeSubject}
                  className="rounded p-1 text-[#c62828] hover:bg-[#fdecec] disabled:opacity-30"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            </span>
            <span className="relative mt-1 block">
              <select
                value={activeSubject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-9 text-[14px] focus:border-[#2474c6] focus:outline-none"
              >
                {subjects.map((s) => (
                  <option key={s} value={s}>{s === "" ? "(ไม่ระบุวิชา)" : s}</option>
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
          <UIButton variant="green" onClick={openTemplate} className="h-9 bg-[#166c2e] px-3 text-[13px] hover:bg-[#145c27] focus-visible:ring-[#1e8e3e]/40">
            สร้างชุดมาตรฐาน
          </UIButton>
          <UIButton variant="blue" onClick={() => void publishFirstFive()} className="h-9 bg-[#00897b] px-3 text-[13px] hover:brightness-110 focus-visible:ring-[#00897b]/40">
            เผยแพร่ 5 งานแรก
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
                  <th className="sticky left-0 w-12 bg-white py-2 pr-3">ลำดับ</th>
                  <th className="sticky left-12 min-w-[110px] whitespace-nowrap bg-white py-2 pr-3">รหัสประจำตัว</th>
                  <th className="min-w-[200px] whitespace-nowrap py-2 pr-3">ชื่อ-นามสกุล</th>
                  {assignments.map((a) => (
                    <th key={a.id} className="max-w-[110px] px-1.5 py-2 text-center" title={`${a.title} · ส่ง ${a.due}`}>
                      <span className="block truncate">{a.title}</span>
                      <span className="block font-medium text-[#5b6b82]">({a.max})</span>
                      {!a.visible ? (
                        <span className="mx-auto mt-0.5 block text-[10px] font-bold text-[#8a97ab]">ซ่อนอยู่</span>
                      ) : null}
                      <span className="mx-auto mt-0.5 flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          aria-label={`แก้ไขคอลัมน์ ${a.title}`}
                          title={`แก้ไข ${a.title}`}
                          onClick={() => openEditColumn(a)}
                          className="rounded p-0.5 text-[#c9d2de] hover:bg-[#e8f1fb] hover:text-[#2474c6]"
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={a.visible ? `ซ่อนคอลัมน์ ${a.title} จากนักเรียน` : `เผยแพร่คอลัมน์ ${a.title}`}
                          title={a.title + (a.visible ? " (นักเรียนเห็น)" : " (ครูเห็นคนเดียว)")}
                          onClick={() => void toggleVisible(a)}
                          className="rounded p-0.5 text-[#c9d2de] hover:bg-[#e8f1fb] hover:text-[#2474c6]"
                        >
                          {a.visible ? <EyeIcon className="h-3.5 w-3.5" /> : <EyeOffIcon className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          aria-label={`ลบคอลัมน์ ${a.title}`}
                          title={a.title}
                          onClick={() => void removeColumn(a)}
                          className="rounded p-0.5 text-[#c9d2de] hover:bg-[#fdecec] hover:text-[#c62828]"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </span>
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
                      <td className="sticky left-0 w-12 bg-white py-1.5 pr-3 text-[13.5px] text-[#5b6b82]">
                        {(safePage - 1) * PAGE_SIZE + ri + 1}
                      </td>
                      <td className="sticky left-12 min-w-[110px] whitespace-nowrap bg-white py-1.5 pr-3 text-[13.5px] text-[#16233a]">
                        {s.code}
                      </td>
                      <td className="min-w-[200px] whitespace-nowrap py-1.5 pr-3 text-[13.5px] font-medium text-[#16233a]">
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

      {/* modal แก้ไขชื่อวิชา */}
      {subjectModal ? (
        <Modal title={`แก้ไขชื่อวิชา “${activeSubject}”`} onClose={() => setSubjectModal(false)}>
          <label className="block text-[14px] font-medium text-[#16233a]">
            ชื่อวิชาใหม่
            <input
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveRenameSubject();
              }}
              placeholder="เช่น ภาษาอังกฤษ"
              className={cn(inputCls, "mt-1")}
            />
          </label>
          <p className="mt-1.5 text-[12.5px] text-[#5b6b82]">
            เปลี่ยนทุกคอลัมน์ของวิชานี้ในห้อง {activeGroup} ทีเดียว
          </p>
          {modalMsg ? (
            <p role="alert" className="mt-2 rounded-lg bg-[#fdecec] px-3 py-2 text-[13.5px] font-semibold text-[#c62828]">{modalMsg}</p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <UIButton variant="blue" onClick={() => setSubjectModal(false)} className="h-10 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40">ยกเลิก</UIButton>
            <UIButton variant="green" onClick={() => void saveRenameSubject()} className="h-10">บันทึกชื่อวิชา</UIButton>
          </div>
        </Modal>
      ) : null}

      {/* modal เพิ่ม/แก้ไขคอลัมน์ */}
      {colModal ? (
        <Modal title={editingId ? "แก้ไขคอลัมน์งาน" : "เพิ่มคอลัมน์งาน"} onClose={() => { setColModal(false); setEditingId(null); }}>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              วิชา
              <input value={colForm.subject} onChange={(e) => setColForm({ ...colForm, subject: e.target.value })} placeholder="เช่น เทคโนโลยี" className={cn(inputCls, "mt-1")} />
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
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
            {editingId ? (
              <div className="col-span-2 rounded-lg border border-[#eef2f7] p-2.5">
                <p className="text-[13.5px] font-bold text-[#16233a]">ไฟล์ตัวอย่างงาน (รูป/PDF ไม่เกิน 5MB)</p>
                {editAttachment ? (
                  <p className="mt-1 flex items-center gap-2 text-[13px]">
                    <a href={editAttachment} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#2474c6] hover:underline">
                      ดูไฟล์ปัจจุบัน
                    </a>
                    <button
                      type="button"
                      onClick={() => void (async () => {
                        await removeAssignmentFile(editingId, editAttachment);
                        setEditAttachment(null);
                        await reloadSheet();
                      })()}
                      className="font-semibold text-[#c62828] hover:underline"
                    >
                      ลบไฟล์
                    </button>
                  </p>
                ) : (
                  <label className="mt-1.5 flex h-10 cursor-pointer items-center justify-center rounded-md border border-dashed border-[#b9c6d8] px-4 text-[13.5px] font-semibold text-[#2474c6] hover:bg-[#f1f5fa]">
                    เลือกไฟล์
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void pickFile(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                {uploading ? <p className="mt-1 text-[12.5px] text-[#5b6b82]">กำลังอัปโหลด...</p> : null}
              </div>
            ) : (
              <p className="col-span-2 text-[12.5px] text-[#8a97ab]">
                บันทึกคอลัมน์ก่อน แล้วกดดินสอเพื่อแนบไฟล์ตัวอย่าง
              </p>
            )}
          </div>
          {modalMsg ? (
            <p role="alert" className="mt-2 rounded-lg bg-[#fdecec] px-3 py-2 text-[13.5px] font-semibold text-[#c62828]">{modalMsg}</p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <UIButton variant="blue" onClick={() => { setColModal(false); setEditingId(null); }} className="h-10 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40">ยกเลิก</UIButton>
            <UIButton variant="green" onClick={() => void saveColumn()} className="h-10">{editingId ? "บันทึกการแก้ไข" : "เพิ่มคอลัมน์"}</UIButton>
          </div>
        </Modal>
      ) : null}

      {/* modal ชุดมาตรฐาน */}
      {templateModal ? (
        <Modal title="สร้างชุดมาตรฐาน (รวม 100)" onClose={() => setTemplateModal(false)}>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              วิชา
              <input value={templateSubject} onChange={(e) => setTemplateSubject(e.target.value)} placeholder="เช่น เทคโนโลยี" className={cn(inputCls, "mt-1")} />
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              กำหนดส่ง (ทุกงาน)
              <input type="date" value={templateDue} onChange={(e) => setTemplateDue(e.target.value)} className={cn(inputCls, "mt-1")} />
            </label>
          </div>
          <ul className="mt-2 divide-y divide-[#eef2f7] rounded-lg border border-[#eef2f7] px-3 text-[13.5px] text-[#16233a]">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <li key={n} className="flex justify-between py-1.5"><span>น.{n}</span><span className="font-bold">10 คะแนน</span></li>
            ))}
            <li className="flex justify-between py-1.5"><span>กลางภาค</span><span className="font-bold">10 คะแนน</span></li>
            <li className="flex justify-between py-1.5"><span>ปลายภาค</span><span className="font-bold">20 คะแนน</span></li>
          </ul>
          {modalMsg ? (
            <p role="alert" className="mt-2 rounded-lg bg-[#fdecec] px-3 py-2 text-[13.5px] font-semibold text-[#c62828]">{modalMsg}</p>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <UIButton variant="blue" onClick={() => setTemplateModal(false)} className="h-10 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40">ยกเลิก</UIButton>
            <UIButton variant="green" onClick={() => void saveTemplate()} disabled={templateBusy} className="h-10 disabled:opacity-40">
              {templateBusy ? "กำลังสร้าง..." : "สร้าง 9 คอลัมน์"}
            </UIButton>
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
