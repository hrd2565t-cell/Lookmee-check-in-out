"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardTitle, Modal, UIButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { compareGroupNames } from "@/lib/school-data";
import { levelOf } from "@/lib/terms";
import {
  createSubject,
  fetchSubjectScope,
  renameSubject,
  saveGroupSubjectSelection,
  saveLevelSubjectIds,
  setSubjectActive,
  type SubjectCatalogItem,
  type SubjectScopeState,
} from "@/lib/grading";

const inputCls = "h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] text-[#16233a] focus:border-[#2474c6] focus:outline-none";

export function SubjectManager({
  groupName,
  groupNames,
  termId,
  termName,
  onClose,
  onSaved,
}: {
  groupName: string;
  groupNames: string[];
  termId: string;
  termName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const levels = useMemo(
    () => [...new Set(groupNames.map(levelOf))].sort(compareGroupNames),
    [groupNames],
  );
  const [scope, setScope] = useState<"level" | "group">("level");
  const [level, setLevel] = useState(levelOf(groupName));
  const [group, setGroup] = useState(groupName);
  const scopeName = scope === "level" ? level : group;
  const scopeKey = `${scope}|${scopeName}|${termId}`;
  const [loadedScope, setLoadedScope] = useState("");
  const [catalog, setCatalog] = useState<SubjectCatalogItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [levelIds, setLevelIds] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, "include" | "exclude">>({});
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const isLoading = loadedScope !== scopeKey;
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const inherited = useMemo(() => new Set(levelIds), [levelIds]);
  const hasUnsavedChanges = useMemo(
    () => [...selectedIds].sort().join("|") !== [...savedIds].sort().join("|"),
    [selectedIds, savedIds],
  );

  useEffect(() => {
    let cancelled = false;
    fetchSubjectScope(scope, scopeName, termId).then((state) => {
      if (cancelled) return;
      setLoadError(state === null);
      if (state) {
        setCatalog(state.catalog);
        setSelectedIds(state.selectedIds);
        setSavedIds(state.selectedIds);
        setLevelIds(state.levelIds);
        setOverrides(state.overrideModes);
      } else {
        setSelectedIds([]);
        setSavedIds([]);
        setLevelIds([]);
        setOverrides({});
      }
      setLoadedScope(scopeKey);
    });
    return () => {
      cancelled = true;
    };
  }, [scope, scopeName, scopeKey, termId]);

  const refreshScope = async (): Promise<SubjectScopeState | null> => {
    const state = await fetchSubjectScope(scope, scopeName, termId);
    if (!state) {
      setLoadError(true);
      return null;
    }
    setCatalog(state.catalog);
    setSelectedIds(state.selectedIds);
    setSavedIds(state.selectedIds);
    setLevelIds(state.levelIds);
    setOverrides(state.overrideModes);
    setLoadError(false);
    setLoadedScope(scopeKey);
    return state;
  };

  const addSubject = async () => {
    const name = newName.trim();
    if (!name) {
      setNotice("กรุณากรอกชื่อวิชา");
      return;
    }
    const result = await createSubject(termId, name);
    if (!result.ok) {
      setNotice(result.reason === "duplicate" ? "มีวิชาชื่อนี้ในเทอมนี้แล้ว" : "เพิ่มวิชาไม่สำเร็จ — ตรวจการเชื่อมต่อ");
      return;
    }
    setNewName("");
    setNotice(`เพิ่ม “${name}” ในทะเบียนวิชาแล้ว — เลือกห้องหรือระดับชั้นด้านล่างเพื่อกำหนดผู้เรียน`);
    await refreshScope();
  };

  const saveRename = async (subject: SubjectCatalogItem) => {
    const name = editName.trim();
    if (!name) {
      setNotice("กรุณากรอกชื่อวิชา");
      return;
    }
    const result = await renameSubject(subject.id, name);
    if (result === "duplicate") {
      setNotice("มีวิชาชื่อนี้ในเทอมนี้แล้ว");
      return;
    }
    if (result !== "saved") {
      setNotice("แก้ชื่อวิชาไม่สำเร็จ — ลองอีกครั้ง");
      return;
    }
    setEditId(null);
    setNotice(`เปลี่ยนชื่อวิชาเป็น “${name}” แล้ว`);
    await refreshScope();
    onSaved();
  };

  const toggleArchive = async (subject: SubjectCatalogItem) => {
    const nextActive = !subject.isActive;
    if (!await setSubjectActive(subject.id, nextActive)) {
      setNotice("บันทึกสถานะวิชาไม่สำเร็จ — ลองอีกครั้ง");
      return;
    }
    setNotice(nextActive ? `คืนวิชา “${subject.name}” จากคลังแล้ว` : `เก็บวิชา “${subject.name}” เข้าคลังแล้ว (ประวัติเดิมยังอยู่)`);
    await refreshScope();
    onSaved();
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const confirmDiscard = () => !hasUnsavedChanges || window.confirm("ทิ้งการเปลี่ยนแปลงวิชาที่ยังไม่ได้บันทึกหรือไม่?");
  const changeScope = (next: "level" | "group") => {
    if (next !== scope && confirmDiscard()) setScope(next);
  };
  const changeScopeName = (value: string) => {
    if (!confirmDiscard()) return;
    if (scope === "level") setLevel(value);
    else setGroup(value);
  };
  const closeManager = () => {
    if (confirmDiscard()) onClose();
  };

  const saveAssignments = async () => {
    setSaving(true);
    const ok = scope === "level"
      ? await saveLevelSubjectIds(level, termId, selectedIds)
      : await saveGroupSubjectSelection(group, termId, levelIds, selectedIds);
    setSaving(false);
    if (!ok) {
      setNotice("บันทึกการกำหนดวิชาไม่สำเร็จ — ลองอีกครั้ง");
      return;
    }
    setNotice(scope === "level" ? `บันทึกวิชาพื้นฐานของ ${level} แล้ว` : `บันทึกวิชาของห้อง ${group} แล้ว`);
    await refreshScope();
    onSaved();
  };

  const scopeLabel = scope === "level" ? `ระดับชั้น ${level}` : `ห้อง ${group}`;

  return (
    <Modal title={`จัดการรายวิชา · ${termName}`} onClose={closeManager}>
      <div className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
        <Card className="p-3">
          <CardTitle className="mb-1">1. ทะเบียนวิชากลาง</CardTitle>
          <p className="mb-2 text-[12.5px] text-[#5b6b82]">เพิ่มวิชาในภาคเรียนนี้ก่อน แล้วจึงเลือกว่าระดับชั้นหรือห้องใดเรียนวิชานั้น</p>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void addSubject(); }}
              placeholder="ชื่อวิชาใหม่ เช่น ภาษาอังกฤษ"
              className={`${inputCls} min-w-0 flex-1`}
            />
            <UIButton variant="green" onClick={() => void addSubject()} className="h-10 shrink-0 px-3">เพิ่มวิชา</UIButton>
          </div>
          {catalog.length === 0 && !isLoading ? (
            <p className="py-3 text-center text-[13px] text-[#5b6b82]">ยังไม่มีวิชาในภาคเรียนนี้</p>
          ) : (
            <ul className="mt-2 max-h-44 divide-y divide-[#eef2f7] overflow-y-auto">
              {catalog.map((subject) => (
                <li key={subject.id} className="flex flex-wrap items-center gap-2 py-2">
                  {editId === subject.id ? (
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className={`${inputCls} min-w-[140px] flex-1`} />
                  ) : (
                    <span className={cn("min-w-0 flex-1 text-[13.5px] font-semibold", subject.isActive ? "text-[#16233a]" : "text-[#8a97ab]")}>
                      {subject.name}{!subject.isActive ? " (เก็บในคลัง)" : ""}
                    </span>
                  )}
                  {editId === subject.id ? (
                    <>
                      <button type="button" onClick={() => void saveRename(subject)} className="min-h-9 rounded px-2 text-[12.5px] font-bold text-[#1e8e3e] hover:bg-[#e6f4ea]">บันทึก</button>
                      <button type="button" onClick={() => setEditId(null)} className="min-h-9 rounded px-2 text-[12.5px] font-bold text-[#5b6b82] hover:bg-[#f1f5fa]">ยกเลิก</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => { setEditId(subject.id); setEditName(subject.name); }} className="min-h-9 rounded px-2 text-[12.5px] font-semibold text-[#2474c6] hover:bg-[#e8f1fb]">แก้ชื่อ</button>
                      <button type="button" onClick={() => void toggleArchive(subject)} className={cn("min-h-9 rounded px-2 text-[12.5px] font-semibold", subject.isActive ? "text-[#b45309] hover:bg-[#fef6ec]" : "text-[#1e8e3e] hover:bg-[#e6f4ea]")}>
                        {subject.isActive ? "เก็บเข้าคลัง" : "คืนจากคลัง"}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-3">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <CardTitle>2. กำหนดวิชาให้ชั้นและห้อง</CardTitle>
            <div className="flex gap-1.5">
              <button type="button" aria-pressed={scope === "level"} onClick={() => changeScope("level")} className={cn("min-h-9 rounded-lg px-3 text-[12.5px] font-semibold", scope === "level" ? "bg-[#e6f4ea] text-[#166c2e]" : "bg-[#f1f5fa] text-[#5b6b82]")}>ระดับชั้น</button>
              <button type="button" aria-pressed={scope === "group"} onClick={() => changeScope("group")} className={cn("min-h-9 rounded-lg px-3 text-[12.5px] font-semibold", scope === "group" ? "bg-[#e6f4ea] text-[#166c2e]" : "bg-[#f1f5fa] text-[#5b6b82]")}>รายห้อง</button>
            </div>
          </div>
          <p className="mb-2 text-[12.5px] text-[#5b6b82]">
            {scope === "level" ? "วิชาระดับชั้นเป็นค่าเริ่มต้นของทุกห้องในชั้นนั้น" : "ห้องสืบทอดจากระดับชั้นได้ และสามารถเพิ่มหรือยกเว้นวิชาเฉพาะห้อง"}
          </p>
          <label className="mb-2 block text-[13px] font-medium text-[#16233a]">
            {scope === "level" ? "เลือกชั้น" : "เลือกห้อง"}
            <select value={scope === "level" ? level : group} onChange={(e) => changeScopeName(e.target.value)} className={`${inputCls} mt-1`}>
              {(scope === "level" ? levels : [...groupNames].sort(compareGroupNames)).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          {isLoading ? (
            <p className="py-4 text-center text-[13px] text-[#5b6b82]">กำลังโหลดวิชา...</p>
          ) : loadError ? (
            <p className="py-4 text-center text-[13px] text-[#c62828]">โหลดข้อมูลวิชาไม่สำเร็จ</p>
          ) : catalog.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-[#5b6b82]">เพิ่มวิชาในทะเบียนก่อน จึงจะกำหนดให้ชั้นหรือห้องได้</p>
          ) : (
            <ul className="max-h-56 divide-y divide-[#eef2f7] overflow-y-auto">
              {catalog.map((subject) => {
                const checked = selected.has(subject.id);
                const override = overrides[subject.id];
                const stateLabel = scope === "group"
                  ? override === "include" ? "กำหนดเฉพาะห้อง" : override === "exclude" ? "ยกเว้นจากชั้น" : inherited.has(subject.id) ? "รับจากชั้น" : "ยังไม่กำหนด"
                  : checked ? "วิชาของชั้น" : "ไม่ใช้ในชั้นนี้";
                return (
                  <li key={subject.id} className="flex items-center gap-2 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!subject.isActive}
                      onChange={() => toggleSelected(subject.id)}
                      aria-label={`${checked ? "ยกเลิก" : "กำหนด"}วิชา ${subject.name} ให้ ${scopeLabel}`}
                      className="h-4 w-4 accent-[#1e8e3e]"
                    />
                    <span className={cn("min-w-0 flex-1 text-[13.5px] font-medium", subject.isActive ? "text-[#16233a]" : "text-[#8a97ab]")}>{subject.name}{!subject.isActive ? " (เก็บในคลัง)" : ""}</span>
                    <span className="shrink-0 text-[11.5px] text-[#5b6b82]">{stateLabel}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex justify-end">
            <UIButton variant="green" onClick={() => void saveAssignments()} disabled={isLoading || loadError || saving || !hasUnsavedChanges} className="h-10 disabled:opacity-40">
              {saving ? "กำลังบันทึก..." : `บันทึกวิชาให้${scopeLabel}`}
            </UIButton>
          </div>
        </Card>

        {notice ? <p role="status" className="rounded-lg bg-[#e8f1fb] px-3 py-2 text-[13px] font-medium text-[#1a5da3]">{notice}</p> : null}
      </div>
    </Modal>
  );
}
