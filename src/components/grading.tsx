"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout";
import { ChevronDownIcon, CopyIcon, EyeIcon, EyeOffIcon, PencilIcon, SearchIcon, TrashIcon } from "@/components/icons";
import { Card, FilePreviewModal, Modal, ScoreCell, UIButton } from "@/components/ui";
import { SubjectManager } from "@/components/subject-manager";
import {
  addAssignment,
  deleteAssignment,
  fetchSheet,
  fetchSubjects,
  reorderAssignments,
  removeAssignmentFile,
  saveScores,
  toggleAssignmentVisible,
  updateAssignment,
  uploadAssignmentFile,
  fetchCategoryWeights,
  computeWeightedScore,
  fetchRoomGradeScales,
  fetchGradeScales,
  gradeOf,
  STANDARD_NUMERIC_SCALES,
  type ClassSubject,
  type CategoryWeight,
  type GradeScale,
  type SheetAssignment,
} from "@/lib/grading";
import { fetchTerms, levelOf, type SchoolTerm } from "@/lib/terms";
import {
  cloneAssignmentsToGroups,
  applyTemplateToGroups,
  getGradingTemplates,
  saveGradingTemplate,
  deleteGradingTemplate,
  type GradingTemplate,
} from "@/lib/grading-templates";
import { downloadCsv, parseCsv, readCsvFile } from "@/lib/export";
import { useRoster } from "@/lib/school-data";
import { useTeacherGroup } from "@/lib/teacher-scope";
import { cn } from "@/lib/cn";

const inputCls =
  "h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] text-[#16233a] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none";

/* ---------- หน้ากรอกคะแนนรายบุคคล (Grading Sheets) ---------- */
export default function GradingPage() {
  const { groups: rosterGroups, students: rosterStudents } = useRoster();
  const groupNames = useMemo(() => rosterGroups.map((g) => g.name), [rosterGroups]);
  const { selectedGroup, setSelectedGroup } = useTeacherGroup(groupNames);
  const activeGroup = selectedGroup || (groupNames[0] ?? "");
  const currentLevel = levelOf(activeGroup);
  const sameLevelRooms = useMemo(
    () => groupNames.filter((g) => levelOf(g) === currentLevel && g !== activeGroup),
    [groupNames, currentLevel, activeGroup],
  );
  const [subjects, setSubjects] = useState<ClassSubject[]>([]);
  const [subjectsScope, setSubjectsScope] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [terms, setTerms] = useState<SchoolTerm[]>([]);
  const [termId, setTermId] = useState("all");
  const [subjectLoadError, setSubjectLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const pagerBtn =
    "rounded-md px-2 py-1 text-[16px] font-bold text-[#5b6b82] hover:bg-[#eef3f9] disabled:opacity-30 disabled:hover:bg-transparent";

  const [assignments, setAssignments] = useState<SheetAssignment[]>([]);
  const totalMaxScore = useMemo(
    () => assignments.filter((a) => !a.retakeOf).reduce((sum, a) => sum + a.max, 0),
    [assignments],
  );
  const [savedScores, setSavedScores] = useState<Map<string, number | null>>(new Map());
  const [drafts, setDrafts] = useState<Map<string, string>>(new Map());
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [colModal, setColModal] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [subjectManagerOpen, setSubjectManagerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAttachment, setEditAttachment] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const cellRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [importModal, setImportModal] = useState(false);
  const [previewData, setPreviewData] = useState<{
    rows: Array<{ code: string; name: string; scores: Array<{ assignmentId: string; score: number | null }> }>;
    assignments: Array<{ id: string; title: string; max: number }>;
    problems: string[];
  } | null>(null);
  const [importMsg, setImportMsg] = useState("");
  const [moveOrderBusy, setMoveOrderBusy] = useState(false);
  // States สำหรับ Hybrid Template & Clone ข้ามห้อง
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [selectedCloneRooms, setSelectedCloneRooms] = useState<string[]>([]);
  const [cloneSkipDuplicates, setCloneSkipDuplicates] = useState(true);
  const [cloneCopyWeights, setCloneCopyWeights] = useState(true);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [cloneMsg, setCloneMsg] = useState("");

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateTab, setTemplateTab] = useState<"apply" | "save">("apply");
  const [savedTemplates, setSavedTemplates] = useState<GradingTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [applyTargetScope, setApplyTargetScope] = useState<"current" | "level">("current");
  const [applyDueDate, setApplyDueDate] = useState<string>("");
  const [applySkipDuplicates, setApplySkipDuplicates] = useState(true);
  const [applyCopyWeights, setApplyCopyWeights] = useState(true);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyMsg, setApplyMsg] = useState("");

  const [tplName, setTplName] = useState("");
  const [tplSaveWeights, setTplSaveWeights] = useState(true);
  const [saveTplSuccess, setSaveTplSuccess] = useState(false);
  const [modalMsg, setModalMsg] = useState("");
  const [colForm, setColForm] = useState({ subject: "", title: "", max: "10", due: "", category: "ใบงาน/การบ้าน" });
  const [categoryWeights, setCategoryWeights] = useState<CategoryWeight[]>([]);
  const [gradeScales, setGradeScales] = useState<GradeScale[] | null>(null);

  const activeSubjectScope = `${activeGroup}|${termId}`;
  const activeSubjectItem = subjectsScope === activeSubjectScope
    ? subjects.find((item) => item.id === subjectId) ?? null
    : null;
  const activeSubject = activeSubjectItem?.name ?? "";
  const canEditActiveSubject = !!activeSubjectItem?.isActive && activeSubjectItem.isAssigned;
  const activeTerm = terms.find((t) => t.id === termId) ?? null;
  const subjectTerm = activeSubjectItem?.termId
    ? terms.find((t) => t.id === activeSubjectItem.termId) ?? null
    : null;
  const sheetTerm = termId === "all" ? subjectTerm : activeTerm;
  const selectSubject = (value: string, groupName = activeGroup, termScope = termId) => {
    setSubjectId(value);
    if (typeof window === "undefined" || !groupName) return;
    const key = `lookmee-teacher-subject:${groupName}:${termScope}`;
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  };
  const reloadSheet = async (g = activeGroup, s = activeSubject, t = sheetTerm) => {
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

  // โหลดรายการเทอม
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ts = await fetchTerms();
      if (cancelled) return;
      if (ts) {
        setTerms(ts);
        const cur = ts.find((t) => t.isCurrent);
        if (cur) setTermId(cur.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // โหลดน้ำหนักหมวด + เกณฑ์เกรดของห้อง (ถ้ามี)
  useEffect(() => {
    if (!activeGroup) return;
    let cancelled = false;
    (async () => {
      const weights = await fetchCategoryWeights(activeGroup);
      if (!cancelled) setCategoryWeights(weights ?? []);
      const roomScales = await fetchRoomGradeScales(activeGroup);
      if (cancelled) return;
      if (roomScales && roomScales.length > 0) {
        setGradeScales(roomScales);
      } else {
        const level = levelOf(activeGroup);
        const levelScales = await fetchGradeScales(level);
        if (!cancelled) setGradeScales(levelScales ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeGroup]);

  // โหลดวิชาตามห้องและภาคเรียนที่เลือก
  useEffect(() => {
    if (!activeGroup) return;
    let cancelled = false;
    const scope = `${activeGroup}|${termId}`;
    fetchSubjects(activeGroup, termId).then((rows) => {
      if (cancelled) return;
      setSubjectsScope(scope);
      setSubjectLoadError(rows === null);
      const available = rows ?? [];
      setSubjects(available);
      let savedId = "";
      try {
        savedId = window.localStorage.getItem(`lookmee-teacher-subject:${activeGroup}:${termId}`) ?? "";
      } catch {
        /* ใช้วิชาแรกแทนเมื่อ storage ใช้ไม่ได้ */
      }
      setSubjectId(available.some((item) => item.id === savedId) ? savedId : (available[0]?.id ?? ""));
    });
    return () => {
      cancelled = true;
    };
  }, [activeGroup, termId]);

  // โหลดชีทเมื่อตัวกรองเปลี่ยน
  useEffect(() => {
    if (!activeGroup || !activeSubject) return;
    let cancelled = false;
    (async () => {
      const sheet = await fetchSheet(
        activeGroup,
        activeSubject,
        sheetTerm ? { startsOn: sheetTerm.startsOn, endsOn: sheetTerm.endsOn } : null,
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
  }, [activeGroup, activeSubject, activeSubjectItem?.termId, activeTerm?.id, sheetTerm?.startsOn, sheetTerm?.endsOn]);

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

  const rowTotal = (code: string) => {
    const retakeMap = new Map<string, string>();
    for (const a of assignments) {
      if (a.retakeOf) retakeMap.set(a.retakeOf, a.id);
    }
    return assignments.reduce((sum, a) => {
      if (a.retakeOf) return sum; // ไม่นับซ้ำคอลัมน์สอบซ่อม
      const retakeId = retakeMap.get(a.id);
      let v: number | null = null;
      if (retakeId) {
        const retakeDraft = drafts.get(cellKey(retakeId, code));
        const retakeSaved = savedScores.get(cellKey(retakeId, code));
        if (retakeDraft !== undefined && retakeDraft.trim() !== "") {
          v = Number(retakeDraft);
        } else if (retakeSaved !== null && retakeSaved !== undefined) {
          v = retakeSaved;
        }
      }
      if (v === null) {
        const d = drafts.get(cellKey(a.id, code));
        v = d !== undefined ? (d === "" ? 0 : Number(d)) : (savedScores.get(cellKey(a.id, code)) ?? 0);
      }
      return sum + (Number.isFinite(v) ? (v ?? 0) : 0);
    }, 0);
  };

  const rowSaved = (code: string) =>
    assignments.length > 0 &&
    assignments.every((a) => {
      const d = drafts.get(cellKey(a.id, code));
      if (d !== undefined) return d !== "";
      const s = savedScores.get(cellKey(a.id, code));
      return s !== null && s !== undefined;
    });

  const mergedScores = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const [key, v] of savedScores) map.set(key, v);
    for (const [key, d] of drafts) {
      map.set(key, d.trim() === "" ? null : Number(d));
    }
    return map;
  }, [savedScores, drafts]);

  const rowWeighted = (code: string): number | null =>
    computeWeightedScore(assignments, mergedScores, code, categoryWeights);

  const rowGrade = (code: string): string | null => {
    const w = rowWeighted(code);
    const score = w !== null ? w : rowTotal(code);
    if (score === null || score === undefined || !Number.isFinite(score)) return null;
    const activeScales = gradeScales && gradeScales.length > 0 ? gradeScales : STANDARD_NUMERIC_SCALES;
    return gradeOf(activeScales, score);
  };

  const addRetake = async (a: SheetAssignment) => {
    if (a.retakeOf) return;
    if (assignments.some((x) => x.retakeOf === a.id)) {
      setNotice("มีคอลัมน์สอบซ่อมของงานนี้แล้ว");
      return;
    }
    if (termId === "all" || !activeTerm) {
      setNotice("เลือกภาคเรียนก่อนเพิ่มสอบซ่อม");
      return;
    }
    const ok = await addAssignment({
      groupName: activeGroup,
      subject: activeSubject,
      title: `สอบซ่อม ${a.title}`,
      max: a.max,
      due: a.due,
      category: a.category,
      retakeOf: a.id,
    });
    if (!ok) {
      setNotice("เพิ่มคอลัมน์สอบซ่อมไม่สำเร็จ");
      return;
    }
    setNotice(`เพิ่มคอลัมน์สอบซ่อม “${a.title}” แล้ว`);
    await reloadSheet();
  };

  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.code.includes(q),
    );
  }, [students, query]);

  useEffect(() => {
    cellRefs.current = new Array(filteredStudents.length * assignments.length).fill(null);
  }, [filteredStudents, assignments]);

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
    const rows = filteredStudents.map((s, i) => {
      const total = rowTotal(s.code);
      const cells = assignments.map((a) => {
        const d = drafts.get(cellKey(a.id, s.code));
        const v = d !== undefined ? d : (savedScores.get(cellKey(a.id, s.code)) ?? "");
        return v === null ? "" : String(v);
      });
      return [i + 1, s.code, s.name, ...cells, total];
    });
    downloadCsv(`grades-${activeGroup}-${activeSubject}.csv`, header, rows);
  };

  const importScores = async (file: File) => {
    setImportMsg("");
    const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
    if (isXlsx) {
      setImportMsg("ไฟล์ Excel (.xlsx) อ่านไม่ได้ — กรุณาเปิดใน Excel แล้วเซฟเป็นไฟล์ CSV (.csv) ก่อนนำเข้า");
      return;
    }
    const text = await readCsvFile(file);
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setImportMsg("ไฟล์ว่าง");
      return;
    }
    const header = (rows[0] ?? []).map((c) => c.trim());
    // หาตำแหน่งคอลัมน์รหัสประจำตัวตามชื่อ (export มี "ลำดับ" นำหน้า)
    const codeCol = header.findIndex((h) => h === "รหัสประจำตัว" || h === "เลขประจำตัว");
    if (codeCol === -1) {
      setImportMsg("ไม่พบคอลัมน์รหัสประจำตัว/เลขประจำตัว — ใช้ไฟล์ส่งออกจากหน้านี้");
      return;
    }
    // จับคู่คอลัมน์งานตาม index ใน header
    const colAssign: Array<{ id: string; title: string; max: number } | null> = header.map((t) => {
      let a = assignments.find((x) => x.title === t);
      if (a) return { id: a.id, title: a.title, max: a.max };
      const stripped = t.replace(/\(\s*\d+\s*\)$/, "").trim();
      a = assignments.find((x) => x.title === stripped);
      if (a) return { id: a.id, title: a.title, max: a.max };
      return null;
    });
    if (!colAssign.some((c) => c !== null)) {
      setImportMsg("ไม่พบคอลัมน์งานที่ตรงกับตาราง — โหลดเทมเพลตมากรอกใหม่");
      return;
    }
    const out: Array<{ code: string; name: string; scores: Array<{ assignmentId: string; score: number | null }> }> = [];
    const problems: string[] = [];
    const codeSet = new Set(students.map((s) => s.code));
    const nameMap = new Map(students.map((s) => [s.code, s.name]));
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i]?.map((c) => c.trim()) ?? [];
      const code = cols[codeCol] ?? "";
      if (!codeSet.has(code)) {
        problems.push(`แถวที่ ${i + 1}: ไม่มีรหัส ${code} ในห้องนี้`);
        continue;
      }
      const scores: Array<{ assignmentId: string; score: number | null }> = [];
      cols.forEach((cell, j) => {
        const a = colAssign[j];
        if (!a) return;
        if (cell === "") {
          scores.push({ assignmentId: a.id, score: null });
          return;
        }
        const n = Number(cell);
        if (!Number.isFinite(n) || n < 0 || n > a.max) {
          problems.push(`แถวที่ ${i + 1} (${a.title}): ต้อง 0–${a.max}`);
          return;
        }
        scores.push({ assignmentId: a.id, score: n });
      });
      out.push({ code, name: nameMap.get(code) ?? code, scores });
    }
    if (out.length === 0) {
      setImportMsg("ไม่มีแถวที่ใช้ได้" + (problems[0] ? ` — ${problems[0]}` : ""));
      return;
    }
    const validAssignments = colAssign.filter((c): c is { id: string; title: string; max: number } => c !== null);
    setPreviewData({ rows: out, assignments: validAssignments, problems });
  };

  const confirmImport = async () => {
    if (!previewData) return;
    setMoveOrderBusy(true);
    const flatRows = previewData.rows.flatMap((r) =>
      r.scores.map((s) => ({ assignmentId: s.assignmentId, studentCode: r.code, score: s.score })),
    );
    const { ok, failed } = await saveScores(flatRows.map((r) => ({ ...r, groupName: activeGroup })));
    setMoveOrderBusy(false);
    setPreviewData(null);
    setImportModal(false);
    setNotice(
      `นำเข้าคะแนน ${ok} ช่อง${failed ? ` (พลาด ${failed})` : ""}` +
        (previewData.problems.length ? ` · ข้าม: ${previewData.problems.slice(0, 2).join("; ")}${previewData.problems.length > 2 ? ` และอีก ${previewData.problems.length - 2}` : ""}` : ""),
    );
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

  // เปิด Modal คัดลอกไปห้องอื่น
  const openCloneModal = () => {
    setSelectedCloneRooms(sameLevelRooms);
    setCloneSkipDuplicates(true);
    setCloneCopyWeights(true);
    setCloneMsg("");
    setCloneModalOpen(true);
  };

  const handleExecuteClone = async () => {
    if (selectedCloneRooms.length === 0) {
      setCloneMsg("กรุณาเลือกห้องปลายทางอย่างน้อย 1 ห้อง");
      return;
    }
    setCloneBusy(true);
    setCloneMsg("");
    const res = await cloneAssignmentsToGroups({
      sourceGroupName: activeGroup,
      targetGroupNames: selectedCloneRooms,
      subject: activeSubject,
      skipDuplicates: cloneSkipDuplicates,
      copyWeights: cloneCopyWeights,
    });
    setCloneBusy(false);
    if (res.success) {
      setNotice(
        `คัดลอกโครงสร้างคอลัมน์ไปยัง ${res.targetRoomsCount} ห้องสำเร็จ (สร้างใหม่ ${res.createdAssignmentsCount} คอลัมน์${res.skippedAssignmentsCount > 0 ? `, ข้ามที่ซ้ำ ${res.skippedAssignmentsCount} คอลัมน์` : ""})`,
      );
      setCloneModalOpen(false);
    } else {
      setCloneMsg(res.errors.join("\n") || "เกิดข้อผิดพลาดในการคัดลอก");
    }
  };

  // เปิด Modal แม่แบบคะแนน
  const openTemplateModal = () => {
    const tpls = getGradingTemplates();
    setSavedTemplates(tpls);
    setSelectedTemplateId(tpls[0]?.id ?? "");
    setApplyTargetScope("current");
    setApplyDueDate(new Date().toISOString().slice(0, 10));
    setApplySkipDuplicates(true);
    setApplyCopyWeights(true);
    setApplyMsg("");
    setTplName(`แม่แบบ ${activeGroup} (${activeSubject || "รวม 100"})`);
    setTplSaveWeights(true);
    setSaveTplSuccess(false);
    setTemplateTab("apply");
    setTemplateModalOpen(true);
  };

  const handleApplyTemplate = async () => {
    const tpl = savedTemplates.find((t) => t.id === selectedTemplateId);
    if (!tpl) {
      setApplyMsg("กรุณาเลือกแม่แบบ");
      return;
    }
    if (!applyDueDate) {
      setApplyMsg("กรุณาเลือกวันกำหนดส่ง");
      return;
    }
    if (termId === "all" || !activeTerm) {
      setApplyMsg("เลือกภาคเรียนก่อนสร้างคอลัมน์");
      return;
    }
    if (applyDueDate < activeTerm.startsOn || applyDueDate > activeTerm.endsOn) {
      setApplyMsg("วันกำหนดส่งต้องอยู่ในภาคเรียนที่เลือก");
      return;
    }

    const targetRooms =
      applyTargetScope === "level"
        ? groupNames.filter((g) => levelOf(g) === currentLevel)
        : [activeGroup];

    setApplyBusy(true);
    setApplyMsg("");
    const res = await applyTemplateToGroups({
      template: tpl,
      targetGroupNames: targetRooms,
      subject: activeSubject,
      dueDate: applyDueDate,
      skipDuplicates: applySkipDuplicates,
      copyWeights: applyCopyWeights,
    });
    setApplyBusy(false);
    if (res.success) {
      setNotice(
        `ใช้แม่แบบ "${tpl.name}" กับ ${res.targetRoomsCount} ห้องสำเร็จ (สร้างใหม่ ${res.createdAssignmentsCount} คอลัมน์)`,
      );
      setTemplateModalOpen(false);
      await reloadSheet(activeGroup, activeSubject, activeTerm);
    } else {
      setApplyMsg(res.errors.join("\n") || "เกิดข้อผิดพลาดในการใช้แม่แบบ");
    }
  };

  const handleSaveAsTemplate = () => {
    if (!tplName.trim()) {
      setApplyMsg("กรุณาระบุชื่อแม่แบบ");
      return;
    }
    const regularItems = assignments.filter((a) => !a.retakeOf);
    if (regularItems.length === 0) {
      setApplyMsg("ห้องนี้ยังไม่มีคอลัมน์งานที่จะบันทึกเป็นแม่แบบ");
      return;
    }

    const items = regularItems.map((a) => ({
      title: a.title,
      max: a.max,
      category: a.category || "ใบงาน/การบ้าน",
    }));

    const weightsToSave = tplSaveWeights && categoryWeights.length > 0 ? categoryWeights : undefined;

    const newTpl = saveGradingTemplate({
      name: tplName.trim(),
      level: currentLevel,
      subject: activeSubject,
      items,
      weights: weightsToSave,
    });

    const updated = getGradingTemplates();
    setSavedTemplates(updated);
    setSelectedTemplateId(newTpl.id);
    setSaveTplSuccess(true);
    setNotice(`บันทึกแม่แบบ "${newTpl.name}" (${items.length} คอลัมน์) เรียบร้อยแล้ว`);
    setTimeout(() => {
      setSaveTplSuccess(false);
      setTemplateTab("apply");
    }, 900);
  };

  const handleDeleteTemplate = (id: string, name: string) => {
    if (!window.confirm(`ต้องการลบแม่แบบ "${name}" หรือไม่?`)) return;
    deleteGradingTemplate(id);
    const updated = getGradingTemplates();
    setSavedTemplates(updated);
    if (selectedTemplateId === id) {
      setSelectedTemplateId(updated[0]?.id ?? "");
    }
  };

  const toggleVisible = async (a: (typeof assignments)[number]) => {
    const ok = await toggleAssignmentVisible(a.id, !a.visible);
    if (!ok) {
      setNotice("บันทึกไม่สำเร็จ");
      return;
    }
    await reloadSheet();
  };

  const handleColumnDrop = async (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const draggedIndex = assignments.findIndex((a) => a.id === draggedId);
    const targetIndex = assignments.findIndex((a) => a.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;
    const newOrder = [...assignments];
    const [moved] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, moved);
    const ok = await reorderAssignments(activeGroup, activeSubject, newOrder.map((a) => a.id));
    setDraggedId(null);
    if (ok) {
      await reloadSheet();
    } else {
      setNotice("ย้ายลำดับไม่สำเร็จ — ลองอีกครั้ง");
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const cols = assignments.length;
    const rows = filteredStudents.length;
    const row = Math.floor(index / cols);
    const col = index % cols;
    let next = index;
    if (e.key === "ArrowRight" && col < cols - 1) next = index + 1;
    else if (e.key === "ArrowLeft" && col > 0) next = index - 1;
    else if (e.key === "ArrowDown" && row < rows - 1) next = index + cols;
    else if (e.key === "ArrowUp" && row > 0) next = index - cols;
    cellRefs.current[next]?.focus();
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
    const subject = activeSubject;
    if (!subject) {
      setModalMsg("เลือกวิชาที่เปิดสอนในห้องนี้ก่อน");
      return;
    }
    if (!canEditActiveSubject) {
      setModalMsg("วิชานี้ไม่ได้เปิดสอนในห้อง/เทอมที่เลือก");
      return;
    }
    if (termId === "all" || !activeTerm) {
      setModalMsg("เลือกภาคเรียนก่อนเพิ่มหรือแก้ไขงาน");
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
    if (colForm.due < activeTerm.startsOn || colForm.due > activeTerm.endsOn) {
      setModalMsg("กำหนดส่งต้องอยู่ในภาคเรียนที่เลือก");
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
      await reloadSheet(activeGroup, subject, activeTerm);
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
    await reloadSheet(activeGroup, subject, activeTerm);
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

  const refreshSubjects = async () => {
    const rows = await fetchSubjects(activeGroup, termId);
    if (!rows) {
      setSubjectLoadError(true);
      return;
    }
    setSubjectLoadError(false);
    setSubjects(rows);
    setSubjectsScope(`${activeGroup}|${termId}`);
    if (!rows.some((row) => row.id === subjectId)) selectSubject(rows[0]?.id ?? "");
  };

  return (
    <AppShell active="grading" title="งานและคะแนน">
      <div className="-mt-3 mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13.5px] text-[#5b6b82]">จัดการงานที่มอบหมาย คะแนน และการเผยแพร่ให้นักเรียน</p>
        <UIButton variant="blue" href="/settings#grade-scales" className="h-9 px-3 text-[13px]">
          ตั้งเกณฑ์ตัดเกรด
        </UIButton>
      </div>

      {/* ฟิลเตอร์ */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[160px_180px_1fr_auto] sm:items-end">
          <label className="order-1 block text-[13.5px] font-medium text-[#16233a]">
            เลือกกลุ่มเรียน
            <span className="relative mt-1 block">
              <select
                value={activeGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-9 text-[14px] focus:border-[#2474c6] focus:outline-none"
              >
                {groupNames.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
            </span>
          </label>
          <label className="order-3 block text-[13.5px] font-medium text-[#16233a]">
            <span className="flex items-center justify-between">
              เลือกวิชา
              <button
                type="button"
                onClick={() => setSubjectManagerOpen(true)}
                disabled={termId === "all"}
                title={termId === "all" ? "เลือกภาคเรียนก่อนจัดการวิชา" : "จัดการทะเบียนและกำหนดวิชาให้ชั้น/ห้อง"}
                className="min-h-8 rounded px-2 text-[12.5px] font-semibold text-[#2474c6] hover:bg-[#e8f1fb] disabled:cursor-not-allowed disabled:opacity-40"
              >
                จัดการวิชา
              </button>
            </span>
            <span className="relative mt-1 block">
              <select
                value={activeSubjectItem?.id ?? ""}
                onChange={(e) => selectSubject(e.target.value)}
                className="h-10 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-9 text-[14px] focus:border-[#2474c6] focus:outline-none"
              >
                {subjects.length === 0 ? (
                  <option value="">{subjectLoadError ? "โหลดวิชาไม่สำเร็จ" : "ยังไม่มีวิชาในเทอมนี้"}</option>
                ) : subjects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}{termId === "all" ? ` · ${item.termName ?? "ไม่ระบุเทอม"}` : ""}{!item.isActive ? " (เก็บคลัง)" : !item.isAssigned ? " (ประวัติ)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
            </span>
          </label>
          <label className="order-2 block text-[13.5px] font-medium text-[#16233a]">
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
          <div className="order-4 flex gap-2">
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
          <UIButton variant="green" onClick={openAddColumn} disabled={!canEditActiveSubject || termId === "all"} className="h-9 px-3 text-[13px] disabled:opacity-40">
            + เพิ่มคอลัมน์งาน
          </UIButton>
          <UIButton
            variant="blue"
            onClick={openCloneModal}
            disabled={!canEditActiveSubject || termId === "all" || assignments.length === 0 || sameLevelRooms.length === 0}
            title={sameLevelRooms.length === 0 ? "ไม่มีห้องอื่นในระดับเดียวกัน" : `คัดลอก ${assignments.length} คอลัมน์ไปยังห้องอื่นในระดับ ${currentLevel}`}
            className="h-9 bg-[#2474c6] px-3 text-[13px] hover:bg-[#1d5ea2] focus-visible:ring-[#2474c6]/40 disabled:opacity-40"
          >
            <CopyIcon className="mr-1 h-3.5 w-3.5" /> คัดลอกไปห้องอื่น
          </UIButton>
          <UIButton
            variant="green"
            onClick={openTemplateModal}
            disabled={!canEditActiveSubject || termId === "all"}
            className="h-9 bg-[#166c2e] px-3 text-[13px] hover:bg-[#145c27] focus-visible:ring-[#1e8e3e]/40 disabled:opacity-40"
          >
            แม่แบบคะแนน
          </UIButton>
          <UIButton variant="blue" onClick={() => void publishFirstFive()} disabled={!canEditActiveSubject || termId === "all"} className="h-9 bg-[#00897b] px-3 text-[13px] hover:brightness-110 focus-visible:ring-[#00897b]/40 disabled:opacity-40">
            เผยแพร่ 5 งานแรก
          </UIButton>
          <UIButton variant="blue" onClick={() => void saveAll()} disabled={saving || dirtyCount === 0} className="h-9 px-3 text-[13px] disabled:opacity-40">
            บันทึกคะแนน
          </UIButton>
          <UIButton variant="blue" onClick={exportCsv} className="h-9 bg-[#5b6b82] px-3 text-[13px] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40">
            ส่งออก (Excel)
          </UIButton>
        </div>
        {subjectsScope !== activeSubjectScope ? (
          <p className="py-8 text-center text-[14px] text-[#5b6b82]">กำลังโหลดวิชาและคะแนนของห้องนี้...</p>
        ) : subjectLoadError ? (
          <p className="py-8 text-center text-[14px] text-[#c62828]">โหลดรายการวิชาไม่สำเร็จ — ตรวจการเชื่อมต่อแล้วลองใหม่</p>
        ) : !activeSubjectItem ? (
          <div className="py-8 text-center">
            <p className="text-[14px] font-semibold text-[#16233a]">ห้องนี้ยังไม่มีวิชาในภาคเรียนที่เลือก</p>
            <p className="mt-1 text-[13px] text-[#5b6b82]">เพิ่มวิชาก่อน แล้วจึงเพิ่มงานและกรอกคะแนนได้</p>
            <UIButton variant="green" onClick={() => setSubjectManagerOpen(true)} disabled={termId === "all"} className="mt-3 h-10 disabled:opacity-40">
              จัดการทะเบียนวิชา
            </UIButton>
          </div>
        ) : assignments.length === 0 ? (
          <p className="py-8 text-center text-[14px] text-[#5b6b82]">
            ยังไม่มีคอลัมน์งานในวิชานี้ — กด “+ เพิ่มคอลัมน์งาน” เพื่อเริ่ม
          </p>
        ) : (
          <div className="slim-scroll -mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left">
              <thead>
                <tr className="text-[12.5px] font-bold text-[#16233a]">
                  {/* ตรึงคอลัมน์ ลำดับ */}
                  <th className="sticky left-0 z-30 w-12 min-w-12 max-w-12 border-b border-[#eef2f7] bg-[#f8fafc] py-2.5 pl-3 pr-2 shadow-sm">
                    ลำดับ
                  </th>
                  {/* ตรึงคอลัมน์ รหัสประจำตัว */}
                  <th className="sticky left-12 z-30 w-[105px] min-w-[105px] max-w-[105px] whitespace-nowrap border-b border-[#eef2f7] bg-[#f8fafc] py-2.5 pr-3 shadow-sm">
                    รหัสประจำตัว
                  </th>
                  {/* ตรึงคอลัมน์ ชื่อ-นามสกุล พร้อมเส้นขอบขวาและเงาแยกส่วน */}
                  <th className="sticky left-[153px] z-30 min-w-[180px] max-w-[220px] whitespace-nowrap border-b border-r-2 border-[#eef2f7] border-r-[#d8e0ec] bg-[#f8fafc] py-2.5 pr-3 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.06)]">
                    ชื่อ-นามสกุล
                  </th>
                  {assignments.map((a) => (
                    <th
                      key={a.id}
                      className={cn(
                        "w-[110px] max-w-[110px] border-b border-[#eef2f7] px-1.5 py-2 text-center",
                        draggedId === a.id ? "opacity-50 ring-2 ring-[#2474c6]" : "",
                      )}
                      title={`${a.title} · ส่ง ${a.due}`}
                      draggable={true}
                      onDragStart={(e) => {
                        setDraggedId(a.id);
                        e.dataTransfer.setData("text/plain", a.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedId && draggedId !== a.id) {
                          void handleColumnDrop(a.id);
                        }
                      }}
                      >
                      <div className="flex flex-col items-start gap-1.5">
                        <div className="flex-1 min-w-0">
                          <span className="block break-words leading-tight line-clamp-2">
                            {a.title}
                            {a.retakeOf ? <span className="ml-1 align-middle text-[9px] font-bold text-[#b45309]">ซ่อม</span> : null}
                          </span>
                          <span className="block font-medium text-[#5b6b82]">({a.max})</span>
                          {!a.visible ? (
                            <span className="mt-0.5 block text-[10px] font-bold text-[#8a97ab]">ซ่อนอยู่</span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1 text-[#8a97ab]">
                          <span className="text-[10px] cursor-grab active:cursor-grabbing">⋮⋮</span>
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
                          {!a.retakeOf && !assignments.some((x) => x.retakeOf === a.id) ? (
                            <button
                              type="button"
                              title={`เพิ่มคอลัมน์สอบซ่อมของ ${a.title}`}
                              onClick={() => void addRetake(a)}
                              className="rounded px-1 text-[9px] font-bold text-[#b45309] hover:bg-[#fef6ec]"
                            >
                              +ซ่อม
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </th>
                  ))}
                  <th className="whitespace-nowrap border-b border-[#eef2f7] px-2 py-2 text-center">คะแนนรวม (100)</th>
                  <th className="whitespace-nowrap border-b border-[#eef2f7] px-2 py-2 text-center">เกรด</th>
                  <th className="whitespace-nowrap border-b border-[#eef2f7] py-2 text-right">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s, ri) => {
                  const saved = rowSaved(s.code);
                  return (
                    <tr key={s.code} className="group align-middle hover:bg-[#fafbfd]">
                      {/* ตรึงคอลัมน์ ลำดับ */}
                      <td className="sticky left-0 z-10 w-12 min-w-12 max-w-12 border-b border-[#eef2f7] bg-white group-hover:bg-[#fafbfd] py-2 pl-3 pr-2 text-[13.5px] text-[#5b6b82]">
                        {(safePage - 1) * PAGE_SIZE + ri + 1}
                      </td>
                      {/* ตรึงคอลัมน์ รหัสประจำตัว */}
                      <td className="sticky left-12 z-10 w-[105px] min-w-[105px] max-w-[105px] whitespace-nowrap border-b border-[#eef2f7] bg-white group-hover:bg-[#fafbfd] py-2 pr-3 text-[13.5px] text-[#16233a]">
                        {s.code}
                      </td>
                      {/* ตรึงคอลัมน์ ชื่อ-นามสกุล พร้อมเส้นขอบขวาและเงาแยกส่วน */}
                      <td className="sticky left-[153px] z-10 min-w-[180px] max-w-[220px] whitespace-nowrap border-b border-r-2 border-[#eef2f7] border-r-[#d8e0ec] bg-white group-hover:bg-[#fafbfd] py-2 pr-3 text-[13.5px] font-medium text-[#16233a] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.06)]">
                        {s.name}
                      </td>
                      {assignments.map((a, ai) => {
                        const cellIndex = ri * assignments.length + ai;
                        return (
                          <td key={a.id} className="border-b border-[#eef2f7] px-1.5 py-1.5 text-center">
                            <ScoreCell
                              ref={el => { cellRefs.current[cellIndex] = el; }}
                              value={cellValue(a.id, s.code)}
                              max={a.max}
                              dirty={drafts.has(cellKey(a.id, s.code))}
                              onChange={(v) => setDraft(a.id, s.code, v)}
                              label={`${s.name} ${a.title} เต็ม ${a.max}`}
                              onKeyDown={(e) => handleCellKeyDown(e, cellIndex)}
                            />
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap border-b border-[#eef2f7] px-2 py-1.5 text-center text-[14px] font-bold text-[#16233a]">
                        {(() => {
                          const w = rowWeighted(s.code);
                          return w !== null ? w.toFixed(1) : rowTotal(s.code);
                        })()}
                      </td>
                      <td className="whitespace-nowrap border-b border-[#eef2f7] px-2 py-1.5 text-center text-[14px] font-bold">
                        {(() => {
                          const g = rowGrade(s.code);
                          if (!g) return <span className="text-[#8a97ab]">-</span>;
                          const isZero = g === "0" || g === "F";
                          return <span className={isZero ? "text-[#c62828]" : "text-[#1e8e3e]"}>{g}</span>;
                        })()}
                      </td>
                      <td className="whitespace-nowrap border-b border-[#eef2f7] py-1.5 text-right">
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
                    <td colSpan={6 + assignments.length} className="py-8 text-center text-[14px] text-[#5b6b82]">
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

      {subjectManagerOpen && activeTerm ? (
        <SubjectManager
          groupName={activeGroup}
          groupNames={groupNames}
          termId={activeTerm.id}
          termName={activeTerm.name}
          onClose={() => setSubjectManagerOpen(false)}
          onSaved={() => void refreshSubjects()}
        />
      ) : null}

      {/* modal เพิ่ม/แก้ไขคอลัมน์ */}
      {colModal ? (
        <Modal title={editingId ? "แก้ไขคอลัมน์งาน" : "เพิ่มคอลัมน์งาน"} onClose={() => { setColModal(false); setEditingId(null); }}>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              วิชา
              <input value={activeSubject} readOnly className={cn(inputCls, "mt-1 bg-[#f8fafc]")} />
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
                    <button
                      type="button"
                      onClick={() => setPreviewUrl(editAttachment)}
                      className="font-semibold text-[#2474c6] hover:underline"
                    >
                      ดูไฟล์ปัจจุบัน
                    </button>
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

      {/* modal คัดลอกโครงสร้างคอลัมน์ไปห้องอื่น */}
      {cloneModalOpen ? (
        <Modal title={`คัดลอกโครงสร้างคอลัมน์ไปห้องอื่น (ระดับ ${currentLevel})`} onClose={() => setCloneModalOpen(false)}>
          <div className="space-y-3">
            <div className="rounded-lg border border-[#eef2f7] bg-[#f8fafc] p-3 text-[13px]">
              <p className="font-semibold text-[#16233a]">
                ห้องต้นแบบ: <span className="text-[#2474c6]">{activeGroup}</span> · วิชา: <span className="text-[#2474c6]">{activeSubject}</span>
              </p>
              <p className="mt-1 text-[#5b6b82]">
                จำนวนงานที่จะคัดลอก: <span className="font-bold text-[#16233a]">{assignments.filter((a) => !a.retakeOf).length} คอลัมน์</span> (คะแนนเต็มรวม <span className="font-bold text-[#16233a]">{totalMaxScore}</span> คะแนน)
              </p>
              <p className="mt-0.5 text-[11.5px] text-[#8a97ab]">* คัดลอกเฉพาะหัวตารางและคะแนนเต็ม ไม่คัดลอกคะแนนของนักเรียน</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[13.5px] font-bold text-[#16233a]">
                  เลือกห้องปลายทาง (ระดับ {currentLevel}):
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedCloneRooms(
                      selectedCloneRooms.length === sameLevelRooms.length ? [] : [...sameLevelRooms],
                    )
                  }
                  className="text-[12px] font-semibold text-[#2474c6] hover:underline"
                >
                  {selectedCloneRooms.length === sameLevelRooms.length ? "ล้างการเลือก" : `เลือกทุกห้องใน ${currentLevel}`}
                </button>
              </div>

              {sameLevelRooms.length === 0 ? (
                <p className="rounded-lg bg-[#f8fafc] p-3 text-center text-[13px] text-[#5b6b82]">
                  ไม่พบห้องอื่นในระดับ {currentLevel}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 max-h-48 overflow-y-auto rounded-lg border border-[#eef2f7] p-2.5">
                  {sameLevelRooms.map((room) => {
                    const isSelected = selectedCloneRooms.includes(room);
                    return (
                      <label
                        key={room}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                          isSelected
                            ? "border-[#2474c6] bg-[#e8f1fb] text-[#1a5da3]"
                            : "border-[#eef2f7] bg-white text-[#16233a] hover:bg-[#f8fafc]",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCloneRooms((prev) => [...prev, room]);
                            } else {
                              setSelectedCloneRooms((prev) => prev.filter((r) => r !== room));
                            }
                          }}
                          className="rounded text-[#2474c6] focus:ring-[#2474c6]"
                        />
                        <span>{room}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1.5 rounded-lg border border-[#eef2f7] bg-[#f8fafc] p-2.5 text-[12.5px] text-[#16233a]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cloneSkipDuplicates}
                  onChange={(e) => setCloneSkipDuplicates(e.target.checked)}
                  className="rounded text-[#2474c6]"
                />
                <span>ข้ามคอลัมน์ที่มีชื่อซ้ำในห้องปลายทาง (ป้องกันสร้างงานซ้ำ)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cloneCopyWeights}
                  onChange={(e) => setCloneCopyWeights(e.target.checked)}
                  className="rounded text-[#2474c6]"
                />
                <span>คัดลอกสัดส่วนน้ำหนักคะแนนรายห้องไปด้วย (ถ้ามี)</span>
              </label>
            </div>

            {cloneMsg ? (
              <p role="alert" className="whitespace-pre-line rounded-lg bg-[#fdecec] px-3 py-2 text-[13px] font-semibold text-[#c62828]">
                {cloneMsg}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2 border-t border-[#eef2f7] pt-2">
              <UIButton
                variant="blue"
                onClick={() => setCloneModalOpen(false)}
                disabled={cloneBusy}
                className="h-10 bg-[#5b6b82] text-[13.5px] hover:bg-[#465364]"
              >
                ยกเลิก
              </UIButton>
              <UIButton
                variant="green"
                onClick={() => void handleExecuteClone()}
                disabled={cloneBusy || selectedCloneRooms.length === 0}
                className="h-10 px-5 text-[13.5px] disabled:opacity-40"
              >
                {cloneBusy ? "กำลังคัดลอก..." : `ยืนยันคัดลอกไปยัง ${selectedCloneRooms.length} ห้อง`}
              </UIButton>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* modal แม่แบบคะแนน (Hybrid: ใช้แม่แบบ + บันทึกแม่แบบ) */}
      {templateModalOpen ? (
        <Modal title="แม่แบบคะแนน (Grading Templates)" onClose={() => setTemplateModalOpen(false)}>
          <div className="space-y-3">
            {/* แท็บสลับหน้า */}
            <div className="flex border-b border-[#eef2f7] text-[13.5px] font-bold">
              <button
                type="button"
                onClick={() => { setTemplateTab("apply"); setApplyMsg(""); }}
                className={cn(
                  "flex-1 pb-2 text-center transition-colors border-b-2",
                  templateTab === "apply"
                    ? "border-[#2474c6] text-[#2474c6]"
                    : "border-transparent text-[#5b6b82] hover:text-[#16233a]",
                )}
              >
                เรียกใช้แม่แบบ
              </button>
              <button
                type="button"
                onClick={() => { setTemplateTab("save"); setApplyMsg(""); }}
                className={cn(
                  "flex-1 pb-2 text-center transition-colors border-b-2",
                  templateTab === "save"
                    ? "border-[#2474c6] text-[#2474c6]"
                    : "border-transparent text-[#5b6b82] hover:text-[#16233a]",
                )}
              >
                บันทึกคอลัมน์เป็นแม่แบบใหม่
              </button>
            </div>

            {templateTab === "apply" ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-[13.5px] font-medium text-[#16233a]">
                    เลือกแม่แบบ
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className={cn(inputCls, "mt-1")}
                    >
                      {savedTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.items.length} คอลัมน์)
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* รายละเอียดแม่แบบที่เลือก */}
                {(() => {
                  const currentTpl = savedTemplates.find((t) => t.id === selectedTemplateId);
                  if (!currentTpl) return null;
                  const tplTotal = currentTpl.items.reduce((s, it) => s + it.max, 0);
                  const isSystem = currentTpl.id.startsWith("system_");
                  return (
                    <div className="rounded-lg border border-[#eef2f7] bg-[#f8fafc] p-3 text-[13px]">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#16233a]">
                          {currentTpl.name} {isSystem ? <span className="ml-1 text-[11px] font-normal text-[#8a97ab]">(แม่แบบระบบ)</span> : null}
                        </span>
                        {!isSystem ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(currentTpl.id, currentTpl.name)}
                            title="ลบแม่แบบนี้"
                            className="rounded p-1 text-[#c62828] hover:bg-[#fdecec]"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[#5b6b82]">
                        รวม {currentTpl.items.length} คอลัมน์ · คะแนนเต็มรวม: <span className="font-bold text-[#16233a]">{tplTotal}</span> คะแนน
                      </p>
                      <div className="mt-2 max-h-36 overflow-y-auto rounded border border-[#eef2f7] bg-white text-[12px]">
                        <ul className="divide-y divide-[#eef2f7]">
                          {currentTpl.items.map((it, idx) => (
                            <li key={idx} className="flex justify-between px-2.5 py-1.5">
                              <span className="font-medium text-[#16233a]">{it.title} <span className="text-[#8a97ab]">({it.category})</span></span>
                              <span className="font-bold text-[#1a5da3]">{it.max} คะแนน</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })()}

                {/* เลือกห้องที่จะนำไปใช้ */}
                <div>
                  <label className="block text-[13.5px] font-medium text-[#16233a] mb-1">
                    นำไปใช้กับห้องไหน:
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-[13px]">
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 transition-colors",
                        applyTargetScope === "current"
                          ? "border-[#2474c6] bg-[#e8f1fb] text-[#1a5da3] font-semibold"
                          : "border-[#eef2f7] text-[#16233a]",
                      )}
                    >
                      <input
                        type="radio"
                        name="applyScope"
                        value="current"
                        checked={applyTargetScope === "current"}
                        onChange={() => setApplyTargetScope("current")}
                        className="text-[#2474c6]"
                      />
                      <span>เฉพาะห้อง {activeGroup}</span>
                    </label>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 transition-colors",
                        applyTargetScope === "level"
                          ? "border-[#2474c6] bg-[#e8f1fb] text-[#1a5da3] font-semibold"
                          : "border-[#eef2f7] text-[#16233a]",
                      )}
                    >
                      <input
                        type="radio"
                        name="applyScope"
                        value="level"
                        checked={applyTargetScope === "level"}
                        onChange={() => setApplyTargetScope("level")}
                        className="text-[#2474c6]"
                      />
                      <span>ทุกห้องในระดับ {currentLevel} ({groupNames.filter((g) => levelOf(g) === currentLevel).length} ห้อง)</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="col-span-1 block text-[13.5px] font-medium text-[#16233a]">
                    วิชา
                    <input value={activeSubject} readOnly className={cn(inputCls, "mt-1 bg-[#f8fafc]")} />
                  </label>
                  <label className="col-span-1 block text-[13.5px] font-medium text-[#16233a]">
                    วันกำหนดส่ง (ทุกงาน)
                    <input
                      type="date"
                      value={applyDueDate}
                      onChange={(e) => setApplyDueDate(e.target.value)}
                      className={cn(inputCls, "mt-1")}
                    />
                  </label>
                </div>

                <div className="space-y-1 rounded-lg border border-[#eef2f7] bg-[#f8fafc] p-2.5 text-[12.5px] text-[#16233a]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applySkipDuplicates}
                      onChange={(e) => setApplySkipDuplicates(e.target.checked)}
                      className="rounded text-[#2474c6]"
                    />
                    <span>ข้ามคอลัมน์ที่มีชื่อซ้ำในห้องปลายทาง</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyCopyWeights}
                      onChange={(e) => setApplyCopyWeights(e.target.checked)}
                      className="rounded text-[#2474c6]"
                    />
                    <span>นำสัดส่วนน้ำหนักคะแนนตามแม่แบบไปใช้ด้วย (ถ้ามี)</span>
                  </label>
                </div>

                {applyMsg ? (
                  <p role="alert" className="whitespace-pre-line rounded-lg bg-[#fdecec] px-3 py-2 text-[13px] font-semibold text-[#c62828]">
                    {applyMsg}
                  </p>
                ) : null}

                <div className="mt-4 flex justify-end gap-2 border-t border-[#eef2f7] pt-2">
                  <UIButton
                    variant="blue"
                    onClick={() => setTemplateModalOpen(false)}
                    disabled={applyBusy}
                    className="h-10 bg-[#5b6b82] text-[13.5px] hover:bg-[#465364]"
                  >
                    ยกเลิก
                  </UIButton>
                  <UIButton
                    variant="green"
                    onClick={() => void handleApplyTemplate()}
                    disabled={applyBusy}
                    className="h-10 px-5 text-[13.5px] disabled:opacity-40"
                  >
                    {applyBusy ? "กำลังสร้างคอลัมน์..." : "สร้างคอลัมน์ตามแม่แบบ"}
                  </UIButton>
                </div>
              </div>
            ) : (
              /* แท็บบันทึกเป็นแม่แบบใหม่ */
              <div className="space-y-3">
                <div className="rounded-lg border border-[#eef2f7] bg-[#f8fafc] p-3 text-[13px]">
                  <p className="font-semibold text-[#16233a]">
                    บันทึกคอลัมน์จากห้อง: <span className="text-[#2474c6]">{activeGroup}</span> (วิชา: {activeSubject})
                  </p>
                  <p className="mt-1 text-[#5b6b82]">
                    จำนวนงานทั้งหมด: <span className="font-bold text-[#16233a]">{assignments.filter((a) => !a.retakeOf).length} คอลัมน์</span> (คะแนนเต็มรวม <span className="font-bold text-[#16233a]">{totalMaxScore}</span> คะแนน)
                  </p>
                </div>

                <div>
                  <label className="block text-[13.5px] font-medium text-[#16233a]">
                    ชื่อแม่แบบ
                    <input
                      value={tplName}
                      onChange={(e) => setTplName(e.target.value)}
                      placeholder="เช่น แม่แบบ ม.3 ภาษาอังกฤษ (100 คะแนน)"
                      className={cn(inputCls, "mt-1")}
                    />
                  </label>
                </div>

                <div className="rounded-lg border border-[#eef2f7] bg-[#f8fafc] p-2.5 text-[12.5px] text-[#16233a]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tplSaveWeights}
                      onChange={(e) => setTplSaveWeights(e.target.checked)}
                      className="rounded text-[#2474c6]"
                    />
                    <span>
                      บันทึกสัดส่วนน้ำหนักคะแนนรายห้องในแม่แบบด้วย{" "}
                      {categoryWeights.length > 0 ? (
                        <span className="font-bold text-[#166c2e]">({categoryWeights.length} หมวด)</span>
                      ) : (
                        <span className="text-[#8a97ab]">(ยังไม่ได้ตั้งสัดส่วน)</span>
                      )}
                    </span>
                  </label>
                </div>

                <div className="max-h-40 overflow-y-auto rounded-lg border border-[#eef2f7]">
                  <table className="w-full text-left text-[12px]">
                    <thead className="sticky top-0 bg-[#f8fafc] text-[#5b6b82]">
                      <tr>
                        <th className="px-3 py-1.5">ชื่องาน</th>
                        <th className="px-3 py-1.5">หมวด</th>
                        <th className="px-3 py-1.5 text-right">คะแนนเต็ม</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef2f7]">
                      {assignments
                        .filter((a) => !a.retakeOf)
                        .map((a) => (
                          <tr key={a.id}>
                            <td className="px-3 py-1.5 font-medium text-[#16233a]">{a.title}</td>
                            <td className="px-3 py-1.5 text-[#5b6b82]">{a.category || "ใบงาน/การบ้าน"}</td>
                            <td className="px-3 py-1.5 text-right font-bold text-[#1a5da3]">{a.max}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {saveTplSuccess ? (
                  <p role="status" className="rounded-lg bg-[#e6f4ea] px-3 py-2 text-[13px] font-semibold text-[#166c2e]">
                    ✓ บันทึกแม่แบบเรียบร้อยแล้ว!
                  </p>
                ) : null}

                {applyMsg ? (
                  <p role="alert" className="whitespace-pre-line rounded-lg bg-[#fdecec] px-3 py-2 text-[13px] font-semibold text-[#c62828]">
                    {applyMsg}
                  </p>
                ) : null}

                <div className="mt-4 flex justify-end gap-2 border-t border-[#eef2f7] pt-2">
                  <UIButton
                    variant="blue"
                    onClick={() => setTemplateModalOpen(false)}
                    className="h-10 bg-[#5b6b82] text-[13.5px] hover:bg-[#465364]"
                  >
                    ยกเลิก
                  </UIButton>
                  <UIButton
                    variant="green"
                    onClick={handleSaveAsTemplate}
                    disabled={assignments.length === 0}
                    className="h-10 px-6 text-[13.5px] disabled:opacity-40"
                  >
                    บันทึกเป็นแม่แบบ
                  </UIButton>
                </div>
              </div>
            )}
          </div>
        </Modal>
      ) : null}

      {/* modal นำเข้า */}
      {importModal ? (
        <Modal title="นำเข้าคะแนน (CSV)" onClose={() => { setImportModal(false); setPreviewData(null); setImportMsg(""); }}>
          {!previewData ? (
            <>
              <p className="text-[13.5px] text-[#16233a]">
                1. กด <b>ส่งออก (Excel)</b> ในหน้านี้ → เปิดไฟล์ใน Excel → แก้คะแนน → เซฟเป็น <b>CSV (.csv)</b> → เลือกไฟล์ด้านล่างนำเข้า
              </p>
              <div className="mt-2 flex gap-2">
                <label className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-md bg-[#1e8e3e] px-4 text-[15px] font-semibold text-white">
                  เลือกไฟล์
                  <input
                    type="file"
                    accept=".csv,text/csv,.xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void importScores(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {importMsg ? (
                <p role="alert" className="mt-2 rounded-lg bg-[#fdecec] px-3 py-2 text-[13px] font-semibold text-[#c62828]">{importMsg}</p>
              ) : null}
              <p className="mt-2 text-[12.5px] text-[#5b6b82]">ค่าว่าง = ล้างคะแนนช่องนั้น · เกินคะแนนเต็มจะถูกข้ามพร้อมแจ้ง · เปิดไฟล์ใน Excel แล้วเซฟเป็น CSV (.csv) ก่อนนำเข้าเสมอ</p>
            </>
          ) : (
            <>
              <p className="text-[13.5px] text-[#16233a]">ตัวอย่างข้อมูลที่จะนำเข้า ({previewData.rows.length} คน, {previewData.assignments.length} งาน)</p>
              {previewData.problems.length > 0 ? (
                <p className="mt-1 text-[12.5px] text-[#c62828]">ข้าม: {previewData.problems.slice(0, 3).join("; ")}{previewData.problems.length > 3 ? ` และอีก ${previewData.problems.length - 3}` : ""}</p>
              ) : null}
              <div className="mt-2 overflow-x-auto max-h-[400px] overflow-y-auto rounded-lg border border-[#e4eaf3]">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead className="bg-[#f8fafc] text-[11px] font-bold text-[#16233a]">
                    <tr>
                      <th className="px-2 py-1.5">รหัส</th>
                      <th className="px-2 py-1.5">ชื่อ-นามสกุล</th>
                      {previewData.assignments.map((a) => (
                        <th key={a.id} className="px-2 py-1.5 text-center">{a.title}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((r) => (
                      <tr key={r.code} className="border-t border-[#eef2f7]">
                        <td className="px-2 py-1 font-medium text-[#16233a]">{r.code}</td>
                        <td className="px-2 py-1">{r.name}</td>
                        {r.scores.map((s) => (
                          <td key={s.assignmentId} className="px-2 py-1 text-center text-[11px]">
                            {s.score === null ? "-" : s.score}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewData(null)}
                  className="rounded-md bg-[#f1f5fa] px-3 py-1.5 text-[12.5px] font-semibold text-[#5b6b82] hover:bg-[#e4eaf3]"
                >
                  เลือกไฟล์ใหม่
                </button>
                <UIButton
                  variant="green"
                  onClick={() => void confirmImport()}
                  disabled={moveOrderBusy}
                  className="h-10 disabled:opacity-40"
                >
                  {moveOrderBusy ? "กำลังนำเข้า..." : "ยืนยันนำเข้า"}
                </UIButton>
              </div>
            </>
          )}
        </Modal>
      ) : null}
      {previewUrl ? (
        <FilePreviewModal url={previewUrl} title="ตัวอย่างงาน" onClose={() => setPreviewUrl(null)} />
      ) : null}
    </AppShell>
  );
}
