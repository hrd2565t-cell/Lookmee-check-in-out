"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  PencilIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/icons";
import { Avatar, Card, CardTitle, Modal, UIButton } from "@/components/ui";
import { StudentDetail } from "@/components/student-detail";
import { FaceEnrollModal } from "@/components/face-enroll";
import {
  allGroups as initialGroups,
  students as initialStudents,
  type Student,
} from "@/data/students";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { compareGroupNames } from "@/lib/school-data";
import { cn } from "@/lib/cn";

const PALETTE = [
  "bg-[#dbe7f5] text-[#1a5da3]",
  "bg-[#e3f2e6] text-[#166c2e]",
  "bg-[#f3e8f5] text-[#7b1fa2]",
  "bg-[#fff3e0] text-[#e65100]",
  "bg-[#e0f2f1] text-[#00695c]",
  "bg-[#fce4ec] text-[#ad1457]",
];
const PREFIXES = ["เด็กชาย", "เด็กหญิง", "นาย", "นางสาว"];

const colorFor = (seed: string) =>
  PALETTE[
    [...seed].reduce((a, c) => (a * 31 + (c.codePointAt(0) ?? 0)) >>> 0, 7) %
      PALETTE.length
  ] ?? PALETTE[0];

const initialsFor = (name: string) => {
  const parts = name.split(" ").filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
  return (first.charAt(0) + (last ? last.charAt(0) : first.charAt(1))).trim();
};

const inputCls =
  "h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] text-[#16233a] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none";

/* ---------- group row with edit/delete/view ---------- */
function GroupRow({
  name,
  count,
  onEdit,
  onDelete,
  onView,
}: {
  name: string;
  count: number;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
}) {
  return (
    <li className="flex items-center gap-2 border-b border-[#eef2f7] py-2 last:border-0">
      <p className="min-w-0 flex-1 truncate text-[14.5px] text-[#16233a]">
        <span className="font-bold">{name}</span>
        <span className="font-medium text-[#16233a]">
          {"  "}- {count} Students
        </span>
      </p>
      <button
        type="button"
        aria-label={`แก้ไข ${name}`}
        title="แก้ไขชื่อกลุ่ม"
        onClick={onEdit}
        className="rounded p-1.5 text-[#2474c6] hover:bg-[#e8f1fb]"
      >
        <PencilIcon />
      </button>
      <button
        type="button"
        aria-label={`ลบ ${name}`}
        title="ลบกลุ่ม"
        onClick={onDelete}
        className="rounded p-1.5 text-[#c62828] hover:bg-[#fdecec]"
      >
        <TrashIcon />
      </button>
      <button
        type="button"
        onClick={onView}
        className="px-1 text-[14.5px] font-medium text-[#2474c6] hover:underline"
      >
        View
      </button>
    </li>
  );
}

/* ---------- face-scan status badge ---------- */
function FaceStatus({ registered }: { registered: boolean }) {
  if (registered) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#1e8e3e]">
        <CheckCircleIcon className="h-5 w-5" />
        ลงทะเบียนแล้ว
      </span>
    );
  }
  return (
    <span className="inline-flex items-start gap-1.5 text-[14px] font-semibold leading-tight text-[#e65100]">
      <AlertCircleIcon className="mt-0.5 h-5 w-5 shrink-0" />
      <span>
        ยังไม่ได้ลงทะเบียน
        <span className="block text-[12px] font-medium">(Not Registered)</span>
      </span>
    </span>
  );
}

/* ---------- filter dropdown ---------- */
function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-9 text-[14px] text-[#5b6b82] focus:border-[#2474c6] focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
    </label>
  );
}

/* ---------- page ---------- */
export default function StudentsPage() {
  const [groupList, setGroupList] = useState<string[]>(initialGroups);
  const [studentList, setStudentList] = useState<Student[]>(initialStudents);
  const [groupIds, setGroupIds] = useState<Record<string, string>>({});
  const [dbLive, setDbLive] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [status, setStatus] = useState("all");
  const [groupModal, setGroupModal] = useState<{ mode: "add" } | { mode: "edit"; old: string } | null>(null);
  const [groupName, setGroupName] = useState("");
  const [studentModal, setStudentModal] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [enrollCode, setEnrollCode] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", prefix: PREFIXES[0], first: "", last: "", group: "", number: "" });
  const [notice, setNotice] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // โหลดทะเบียนจริงจาก Supabase (ล้มเหลว = ใช้ mock ต่อ)
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: gData, error: gErr } = await supabase
          .from("class_groups")
          .select("id,name")
          .eq("is_active", true)
          .order("name");
        if (gErr || !gData) return;
        const { data: sData, error: sErr } = await supabase
          .from("students")
          .select("student_code,prefix,first_name,last_name,class_no,face_status,group_id")
          .eq("status", "active");
        if (sErr || !sData) return;
        const idToName = new Map<string, string>(
          (gData as Array<{ id: string; name: string }>).map((g) => [g.id, g.name]),
        );
        const names = [...idToName.values()].sort(compareGroupNames);
        const order = new Map(names.map((n, i) => [n, i]));
        const mapped: Student[] = (
          sData as Array<{
            student_code: string | null;
            prefix: string;
            first_name: string;
            last_name: string | null;
            class_no: string;
            face_status: string;
            group_id: string;
          }>
        )
          .filter((r) => r.student_code && idToName.has(r.group_id))
          .map((r) => {
            const last = r.last_name ?? "";
            const thaiName = `${r.prefix}${r.first_name}${last ? ` ${last}` : ""}`;
            return {
              id: r.student_code as string,
              thaiName,
              studentId: r.student_code as string,
              group: idToName.get(r.group_id) as string,
              registered: r.face_status === "registered",
              initials: initialsFor(thaiName),
              color: colorFor(r.student_code as string),
            };
          })
          .sort(
            (a, b) =>
              (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99) ||
              a.studentId.localeCompare(b.studentId),
          );
        if (!cancelled) {
          setGroupIds(Object.fromEntries(idToName.entries()));
          setGroupList(names);
          setStudentList(mapped);
          setDbLive(true);
        }
      } catch {
        /* fallback mock */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    studentList.forEach((s) => m.set(s.group, (m.get(s.group) ?? 0) + 1));
    return m;
  }, [studentList]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return studentList.filter((s) => {
      if (group !== "all" && s.group !== group) return false;
      if (status === "registered" && !s.registered) return false;
      if (status === "unregistered" && s.registered) return false;
      if (!q) return true;
      return (
        s.thaiName.toLowerCase().includes(q) ||
        (s.engName ?? "").toLowerCase().includes(q) ||
        s.studentId.includes(q)
      );
    });
  }, [studentList, query, group, status]);

  const half = Math.ceil(groupList.length / 2);

  const viewGroup = (name: string) => {
    setGroup(name);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // หา/สร้าง group_id ใน DB (คืน null ถ้าต่อ DB ไม่ได้)
  const ensureGroupId = async (name: string): Promise<string | null> => {
    if (groupIds[name]) return groupIds[name] as string;
    if (!dbLive) return null;
    const parts = name.split("/");
    const { data, error } = await supabase
      .from("class_groups")
      .insert({ name, level: parts[0] ?? name, room: parts[1] ?? "" })
      .select("id")
      .single();
    if (error || !data) return null;
    setGroupIds((m) => ({ ...m, [name]: (data as { id: string }).id }));
    return (data as { id: string }).id;
  };

  const deleteGroup = async (name: string) => {
    const n = counts.get(name) ?? 0;
    if (!window.confirm(`ลบกลุ่ม ${name} และนักเรียน ${n} คนในกลุ่ม?`)) return;
    if (dbLive && groupIds[name]) {
      const gid = groupIds[name] as string;
      const { error: e1 } = await supabase.from("students").delete().eq("group_id", gid);
      const { error: e2 } = e1
        ? { error: e1 }
        : await supabase.from("class_groups").delete().eq("id", gid);
      if (e2) {
        setNotice("ลบใน DB ไม่สำเร็จ — ตรวจสอบ RLS/policies");
        return;
      }
      setGroupIds((m) => {
        const next = { ...m };
        delete next[name];
        return next;
      });
    }
    setGroupList((g) => g.filter((x) => x !== name));
    setStudentList((s) => s.filter((x) => x.group !== name));
    if (group === name) setGroup("all");
  };

  const openAddGroup = () => {
    setGroupName("");
    setGroupModal({ mode: "add" });
  };
  const openEditGroup = (old: string) => {
    setGroupName(old);
    setGroupModal({ mode: "edit", old });
  };
  const saveGroup = async () => {
    const name = groupName.trim();
    if (!name) {
      setNotice("กรุณากรอกชื่อกลุ่ม");
      return;
    }
    if (groupModal?.mode === "add") {
      if (groupList.includes(name)) {
        setNotice(`มีกลุ่ม ${name} อยู่แล้ว`);
        return;
      }
      if (dbLive) {
        const gid = await ensureGroupId(name);
        if (!gid) {
          setNotice("เพิ่มใน DB ไม่สำเร็จ — ตรวจสอบ RLS/policies");
          return;
        }
      }
      setGroupList((g) => [...g, name].sort(compareGroupNames));
    } else if (groupModal?.mode === "edit") {
      const old = groupModal.old;
      if (name !== old && groupList.includes(name)) {
        setNotice(`มีกลุ่ม ${name} อยู่แล้ว`);
        return;
      }
      if (dbLive && groupIds[old]) {
        const { error } = await supabase
          .from("class_groups")
          .update({ name })
          .eq("id", groupIds[old] as string);
        if (error) {
          setNotice("แก้ไขใน DB ไม่สำเร็จ — ตรวจสอบ RLS/policies");
          return;
        }
        const gid = groupIds[old] as string;
        setGroupIds((m) => {
          const next = { ...m };
          delete next[old];
          next[name] = gid;
          return next;
        });
      }
      setGroupList((g) => g.map((x) => (x === old ? name : x)).sort(compareGroupNames));
      setStudentList((s) => s.map((x) => (x.group === old ? { ...x, group: name } : x)));
      if (group === old) setGroup(name);
    }
    setGroupModal(null);
    setNotice("");
  };

  const openAddStudent = () => {
    setForm({ code: "", prefix: PREFIXES[0], first: "", last: "", group: groupList[0] ?? "", number: "" });
    setStudentModal(true);
  };
  const saveStudent = async () => {
    const code = form.code.trim();
    if (!/^\d+$/.test(code)) {
      setNotice("เลขประจำตัวต้องเป็นตัวเลข");
      return;
    }
    if (studentList.some((s) => s.studentId === code)) {
      setNotice(`เลขประจำตัว ${code} ซ้ำ`);
      return;
    }
    if (!form.first.trim() || !form.group || !form.number.trim()) {
      setNotice("กรุณากรอกชื่อ กลุ่ม และเลขที่");
      return;
    }
    if (dbLive) {
      const gid = await ensureGroupId(form.group);
      if (!gid) {
        setNotice("เพิ่มใน DB ไม่สำเร็จ — ตรวจสอบ RLS/policies");
        return;
      }
      const { error } = await supabase.from("students").insert({
        student_code: code,
        prefix: form.prefix,
        first_name: form.first.trim(),
        last_name: form.last.trim() || null,
        class_no: form.number.trim(),
        group_id: gid,
        status: "active",
        face_status: "unregistered",
      });
      if (error) {
        setNotice(`เพิ่มใน DB ไม่สำเร็จ: ${error.message}`);
        return;
      }
    }
    const thaiName = `${form.prefix}${form.first.trim()}${form.last.trim() ? ` ${form.last.trim()}` : ""}`;
    setStudentList((s) => [
      ...s,
      {
        id: code,
        thaiName,
        studentId: code,
        group: form.group,
        registered: false,
        initials: initialsFor(`${form.first.trim()} ${form.last.trim()}`.trim()),
        color: colorFor(code),
      },
    ]);
    setStudentModal(false);
    setNotice("");
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const start = /^\D/.test(lines[0] ?? "") ? 1 : 0; // ข้าม header ถ้ามี
    let added = 0;
    let skipped = 0;
    const seen = new Set(studentList.map((s) => s.studentId));
    const newcomers: Student[] = [];
    const newcomersRaw: Array<{ code: string; prefix: string; first: string; last: string; group: string }> = [];
    const missingGroups = new Set<string>();
    for (const line of lines.slice(start)) {
      const cols = line.split(",").map((c) => c.trim());
      if (cols.length < 5) {
        skipped++;
        continue;
      }
      const code = cols[0];
      const prefix = PREFIXES.includes(cols[1]) ? cols[1] : PREFIXES[0];
      const grp = cols[cols.length - 2];
      const mid = cols.slice(2, cols.length - 2);
      const first = mid[0] ?? "";
      const last = mid.slice(1).join(",");
      if (!/^\d+$/.test(code) || !first || !groupList.includes(grp) || seen.has(code)) {
        if (!groupList.includes(grp)) missingGroups.add(grp);
        skipped++;
        continue;
      }
      seen.add(code);
      const thaiName = `${prefix}${first}${last ? ` ${last}` : ""}`;
      newcomersRaw.push({ code, prefix, first, last, group: grp });
      newcomers.push({
        id: code,
        thaiName,
        studentId: code,
        group: grp,
        registered: false,
        initials: initialsFor(`${first} ${last}`.trim()),
        color: colorFor(code),
      });
      added++;
    }
    if (dbLive && newcomersRaw.length > 0) {
      const rows = [];
      for (const r of newcomersRaw) {
        const gid = await ensureGroupId(r.group);
        if (!gid) continue;
        rows.push({
          student_code: r.code,
          prefix: r.prefix,
          first_name: r.first,
          last_name: r.last || null,
          class_no: "",
          group_id: gid,
          status: "active",
          face_status: "unregistered",
        });
      }
      const { error } = await supabase.from("students").insert(rows);
      if (error) {
        setNotice(`นำเข้า DB ไม่สำเร็จ: ${error.message} — แสดงเฉพาะในหน้านี้`);
      }
    }
    setStudentList((s) => [...s, ...newcomers]);
    setNotice(
      `นำเข้า ${added} คน${skipped ? `, ข้าม ${skipped} แถว` : ""}` +
        (missingGroups.size ? ` (กลุ่มที่ไม่มีในระบบ: ${[...missingGroups].join(", ")})` : ""),
    );
  };

  const groupRowProps = (name: string) => ({
    name,
    count: counts.get(name) ?? 0,
    onEdit: () => openEditGroup(name),
    onDelete: () => deleteGroup(name),
    onView: () => viewGroup(name),
  });

  return (
    <AppShell active="students" title="สวัสดี ครูลูกหมี / Flow A">
      {/* group cards */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <CardTitle className="mb-1">จัดการกลุ่มเรียน</CardTitle>
          <ul>
            <li className="flex items-center gap-2 border-b border-[#eef2f7] py-1.5 text-[13.5px] font-bold text-[#16233a]">
              <span className="flex-1">กลุ่ม ชื่อ</span>
              <span className="flex-1">จำนวนนักเรียน</span>
              <span className="w-[86px]" />
            </li>
            {groupList.slice(0, half).map((g) => (
              <GroupRow key={g} {...groupRowProps(g)} />
            ))}
          </ul>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <CardTitle>กลุ่มเรียน</CardTitle>
            <UIButton variant="green" onClick={openAddGroup} className="h-9 px-3.5 text-[13.5px]">
              เพิ่มกลุ่มเรียนใหม่
            </UIButton>
          </div>
          <ul>
            <li className="flex items-center gap-2 border-b border-[#eef2f7] py-1.5 text-[13.5px] font-bold text-[#16233a]">
              <span className="flex-1">กลุ่มเรียน</span>
              <span className="w-[86px] text-right">Actions</span>
            </li>
            {groupList.slice(half).map((g) => (
              <GroupRow key={g} {...groupRowProps(g)} />
            ))}
          </ul>
        </Card>
      </div>

      {/* student table card */}
      <div ref={tableRef} className="scroll-mt-4">
        <Card className="mt-3 p-4 sm:mt-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="mr-auto">จัดการนักเรียน</CardTitle>
            <span
              title={dbLive ? "อ่าน/เขียน Supabase โดยตรง" : "ข้อมูลในเครื่อง — รัน SQL ใน Supabase เพื่อเชื่อมต่อ"}
              className={
                dbLive
                  ? "rounded-full bg-[#e6f4ea] px-2.5 py-1 text-[12px] font-bold text-[#166c2e]"
                  : "rounded-full bg-[#f1f5fa] px-2.5 py-1 text-[12px] font-bold text-[#5b6b82]"
              }
            >
              {dbLive ? "● Supabase" : "● Local"}
            </span>
            <UIButton variant="blue" onClick={openAddStudent} className="h-9 px-3.5 text-[13.5px]">
              เพิ่มนักเรียนใหม่
            </UIButton>
            <UIButton variant="green" onClick={openAddGroup} className="h-9 px-3.5 text-[13.5px]">
              เพิ่มกลุ่มเรียนใหม่
            </UIButton>
            <UIButton variant="green" onClick={() => fileRef.current?.click()} className="h-9 px-3.5 text-[13.5px]">
              นำเข้าจากไฟล์ใหม่
            </UIButton>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              aria-label="นำเข้าไฟล์ CSV"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importCsv(f);
                e.target.value = "";
              }}
            />
          </div>
          {notice ? (
            <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-[13.5px] font-medium text-[#1a5da3]">
              {notice}
            </p>
          ) : null}

          {/* search + filters */}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_140px]">
            <label className="relative block">
              <span className="sr-only">ค้นหานักเรียน</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="h-10 w-full rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-10 text-[14px] text-[#16233a] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
              />
              <SearchIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
            </label>
            <FilterSelect
              label="กรองตามกลุ่ม"
              value={group}
              onChange={setGroup}
              options={[
                { value: "all", label: "Filters" },
                ...groupList.map((g) => ({ value: g, label: g })),
              ]}
            />
            <FilterSelect
              label="กรองตามสถานะ"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All" },
                { value: "registered", label: "ลงทะเบียนแล้ว" },
                { value: "unregistered", label: "ยังไม่ลงทะเบียน" },
              ]}
            />
          </div>

          {/* table */}
          <div className="slim-scroll -mx-4 mt-2 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="text-[13.5px] font-bold text-[#16233a]">
                  <th className="py-2 pr-3 font-bold">Photo</th>
                  <th className="py-2 pr-3 font-bold">ชื่อ</th>
                  <th className="py-2 pr-3 font-bold">Student ID</th>
                  <th className="py-2 pr-3 font-bold">Group</th>
                  <th className="py-2 pr-3 font-bold">Face Scan Status</th>
                  <th className="py-2 font-bold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-t border-[#eef2f7] align-middle">
                    <td className="py-2 pr-3">
                      <Avatar initials={s.initials} color={s.color} size="sm" />
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-[14px] font-medium text-[#16233a]">
                      <button
                        type="button"
                        title="ดูประวัติรายคน"
                        onClick={() => setDetailId(s.id)}
                        className="hover:text-[#2474c6] hover:underline"
                      >
                        {s.thaiName}
                        {s.engName ? ` (${s.engName})` : ""}
                      </button>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-[14px] text-[#16233a]">
                      {s.studentId}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-[14px] text-[#16233a]">
                      {s.group}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      <FaceStatus registered={s.registered} />
                    </td>
                    <td className="whitespace-nowrap py-2 text-right">
                      {s.registered ? (
                        <UIButton variant="blue" onClick={() => setEnrollCode(s.studentId)} className="h-9 px-3.5 text-[13.5px]">
                          แก้ไขสแกนหน้า
                        </UIButton>
                      ) : (
                        <UIButton
                          variant="green"
                          onClick={() => setEnrollCode(s.studentId)}
                          className="h-9 bg-[#ef8c1a] px-3.5 text-[13.5px] hover:bg-[#d67a10] focus-visible:ring-[#ef8c1a]/40 active:bg-[#b8660c]"
                        >
                          เริ่มสแกนหน้า
                        </UIButton>
                      )}
                    </td>
                  </tr>
                ))}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-8 text-center text-[14px] text-[#5b6b82]">
                ไม่พบนักเรียนที่ตรงกับเงื่อนไข
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>

          {/* bottom action bar */}
          <div className="mt-3 flex flex-wrap justify-center gap-2 border-t border-[#eef2f7] pt-3">
            <UIButton variant="blue" onClick={openAddStudent} className="h-10 px-5">
              เพิ่มนักเรียนใหม่
            </UIButton>
            <UIButton variant="green" onClick={openAddGroup} className="h-10 px-5">
              เพิ่มกลุ่มเรียนใหม่
            </UIButton>
            <UIButton
              variant="blue"
              onClick={() => fileRef.current?.click()}
              className="h-10 bg-[#5b6b82] px-5 hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40 active:bg-[#3a4552]"
            >
              นำเข้าจากไฟล์ (Excel)
            </UIButton>
          </div>
        </Card>
      </div>

      {/* add/edit group modal */}
      {groupModal ? (
        <Modal
          title={groupModal.mode === "add" ? "เพิ่มกลุ่มเรียนใหม่" : `แก้ไขกลุ่ม ${groupModal.old}`}
          onClose={() => {
            setGroupModal(null);
            setNotice("");
          }}
        >
          <label className="block text-[14px] font-medium text-[#16233a]">
            ชื่อกลุ่ม (เช่น ม.1/12)
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveGroup();
              }}
              placeholder="ม.1/12"
              className={cn(inputCls, "mt-1")}
            />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <UIButton
              variant="blue"
              onClick={() => {
                setGroupModal(null);
                setNotice("");
              }}
              className="h-10 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40"
            >
              ยกเลิก
            </UIButton>
            <UIButton variant="green" onClick={saveGroup} className="h-10">
              บันทึก
            </UIButton>
          </div>
        </Modal>
      ) : null}

      {/* add student modal */}
      {studentModal ? (
        <Modal title="เพิ่มนักเรียนใหม่" onClose={() => { setStudentModal(false); setNotice(""); }}>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              เลขประจำตัว
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="47xxx" className={cn(inputCls, "mt-1")} />
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              เลขที่
              <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="1" className={cn(inputCls, "mt-1")} />
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              คำนำหน้า
              <select value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} className={cn(inputCls, "mt-1")}>
                {PREFIXES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              กลุ่ม
              <select value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} className={cn(inputCls, "mt-1")}>
                {groupList.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              ชื่อ
              <input value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} placeholder="ชื่อจริง" className={cn(inputCls, "mt-1")} />
            </label>
            <label className="col-span-1 block text-[14px] font-medium text-[#16233a]">
              นามสกุล
              <input value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} placeholder="(ว่างได้)" className={cn(inputCls, "mt-1")} />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <UIButton
              variant="blue"
              onClick={() => { setStudentModal(false); setNotice(""); }}
              className="h-10 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40"
            >
              ยกเลิก
            </UIButton>
            <UIButton variant="green" onClick={saveStudent} className="h-10">
              บันทึก
            </UIButton>
          </div>
        </Modal>
      ) : null}

      {/* ประวัติรายคน */}
      {(() => {
        const st = studentList.find((s) => s.id === detailId);
        return st ? (
          <StudentDetail
            code={st.studentId}
            name={st.thaiName}
            group={st.group}
            onClose={() => setDetailId(null)}
          />
        ) : null;
      })()}

      {/* ลงทะเบียนใบหน้า */}
      {enrollCode ? (
        <FaceEnrollModal
          initialCode={enrollCode}
          students={studentList}
          onSaved={(code) =>
            setStudentList((s) =>
              s.map((x) => (x.studentId === code ? { ...x, registered: true } : x)),
            )
          }
          onClose={() => setEnrollCode(null)}
        />
      ) : null}
    </AppShell>
  );
}
