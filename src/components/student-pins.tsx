"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout";
import { Card, UIButton } from "@/components/ui";
import { EyeIcon, EyeOffIcon, RefreshIcon, SearchIcon } from "@/components/icons";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { compareGroupNames } from "@/lib/school-data";
import { teacherResetStudentPin, teacherSetStudentPin } from "@/lib/student";
import { COMBINED_M1_GROUP, isCombinedM1, M1_SUBGROUPS } from "@/lib/attendance";

type StudentPinRow = {
  id: string;
  studentCode: string;
  thaiName: string;
  group: string;
  classNo: string;
  faceStatus: "registered" | "unregistered" | "pending";
  pinCode: string | null;
  hasPin: boolean;
};

export default function StudentPinsPage() {
  const [students, setStudents] = useState<StudentPinRow[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "has_pin" | "no_pin">("all");
  const [showAllPins, setShowAllPins] = useState(true);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    try {
      const { data: gData } = await supabase
        .from("class_groups")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      const { data: sData } = await supabase
        .from("students")
        .select("id, student_code, prefix, first_name, last_name, class_no, face_status, group_id, pin_code, pin_hash")
        .eq("status", "active");

      const idToName = new Map<string, string>((gData ?? []).map((g) => [g.id, g.name]));
      const names = [...idToName.values()].sort(compareGroupNames);
      const order = new Map(names.map((n, i) => [n, i]));

      const mapped: StudentPinRow[] = ((sData ?? []) as Array<{
        id: string;
        student_code: string;
        prefix: string;
        first_name: string;
        last_name: string | null;
        class_no: string | null;
        face_status: string;
        group_id: string;
        pin_code: string | null;
        pin_hash: string | null;
      }>)
        .filter((r) => r.student_code && idToName.has(r.group_id))
        .map((r) => {
          const last = r.last_name ?? "";
          return {
            id: r.id,
            studentCode: r.student_code,
            thaiName: `${r.prefix}${r.first_name}${last ? ` ${last}` : ""}`,
            group: idToName.get(r.group_id) as string,
            classNo: r.class_no ?? "",
            faceStatus: (r.face_status as "registered" | "unregistered" | "pending") || "unregistered",
            pinCode: r.pin_code ?? null,
            hasPin: Boolean(r.pin_code || r.pin_hash),
          };
        })
        .sort(
          (a, b) =>
            (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99) ||
            (Number(a.classNo) || 999) - (Number(b.classNo) || 999) ||
            a.studentCode.localeCompare(b.studentCode, "th", { numeric: true }),
        );

      setGroups(names);
      setStudents(mapped);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyPin = async (id: string, pin: string) => {
    try {
      await navigator.clipboard.writeText(pin);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
    }
  };

  const handleSetPin = async (student: StudentPinRow) => {
    const input = window.prompt(`ตั้งรหัส PIN ใหม่ให้ ${student.thaiName} (ตัวเลข 4-6 หลัก):`, student.pinCode || "");
    if (!input || !input.trim()) return;
    const clean = input.trim();
    if (!/^[0-9]{4,6}$/.test(clean)) {
      alert("รหัส PIN ต้องเป็นตัวเลข 4-6 หลักเท่านั้น");
      return;
    }
    setActionBusy(true);
    const res = await teacherSetStudentPin(student.id, clean);
    setActionBusy(false);
    if (res.ok) {
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, pinCode: clean, hasPin: true } : s)),
      );
      alert(`✓ ตั้งรหัส PIN ของ ${student.thaiName} เป็น "${clean}" เรียบร้อยแล้ว`);
    } else {
      alert(`ตั้ง PIN ไม่สำเร็จ: ${res.error || "เกิดข้อผิดพลาด"}`);
    }
  };

  const handleResetPin = async (student: StudentPinRow) => {
    if (!window.confirm(`รีเซ็ตรหัส PIN ของ ${student.thaiName} หรือไม่? (นักเรียนจะต้องตั้ง PIN ใหม่อีกครั้ง)`)) return;
    setActionBusy(true);
    const res = await teacherResetStudentPin(student.id);
    setActionBusy(false);
    if (res.ok) {
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, pinCode: null, hasPin: false } : s)),
      );
      alert(`✓ รีเซ็ตรหัส PIN ของ ${student.thaiName} เรียบร้อยแล้ว`);
    } else {
      alert(`รีเซ็ต PIN ไม่สำเร็จ: ${res.error || "เกิดข้อผิดพลาด"}`);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      // กลุ่ม
      if (selectedGroup !== "all") {
        if (selectedGroup === COMBINED_M1_GROUP) {
          if (!s.group.startsWith("ม.1/")) return false;
        } else if (s.group !== selectedGroup) {
          return false;
        }
      }
      // สถานะ PIN
      if (statusFilter === "has_pin" && !s.hasPin) return false;
      if (statusFilter === "no_pin" && s.hasPin) return false;

      // คำค้นหา
      if (!q) return true;
      return (
        s.studentCode.includes(q) ||
        s.thaiName.toLowerCase().includes(q) ||
        s.group.toLowerCase().includes(q) ||
        (s.classNo && s.classNo.includes(q))
      );
    });
  }, [students, selectedGroup, statusFilter, search]);

  const totalCount = filtered.length;
  const hasPinCount = filtered.filter((s) => s.hasPin).length;
  const noPinCount = totalCount - hasPinCount;

  return (
    <AppShell active="students" title="สมุดรหัส PIN นักเรียน">
      <div className="mx-auto max-w-6xl space-y-4">
        {/* Header & Back button */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between print:hidden">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/students"
                className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-[#2474c6] hover:underline"
              >
                ← รายชื่อนักเรียน
              </Link>
            </div>
            <h1 className="mt-1 text-[22px] font-bold text-[#16233a] sm:text-[26px]">
              🔑 สมุดรหัส PIN นักเรียน (Student PIN Directory)
            </h1>
            <p className="text-[13.5px] text-[#5b6b82]">
              ดูและค้นหารหัส PIN ส่วนตัวของนักเรียน เมื่อนักเรียนลืมรหัสผ่านหรือจำไม่ได้
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAllPins((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-3 py-2 text-[13.5px] font-semibold text-[#16233a] shadow-sm hover:bg-[#f8fafc]"
            >
              {showAllPins ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              {showAllPins ? "ซ่อนรหัส PIN ทั้งหมด" : "แสดงรหัส PIN ทั้งหมด"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white px-3 py-2 text-[13.5px] font-semibold text-[#16233a] shadow-sm hover:bg-[#f8fafc]"
            >
              🖨️ พิมพ์สมุดรหัส PIN
            </button>
          </div>
        </div>

        {/* Print Header (Only visible on paper print) */}
        <div className="hidden print:block pb-4 border-b border-gray-300">
          <h1 className="text-[20px] font-bold text-black">LOOKMEE Check In-Out · สมุดรหัส PIN นักเรียน</h1>
          <p className="text-[13px] text-gray-600">
            ห้อง: {selectedGroup === "all" ? "ทั้งหมด" : selectedGroup} · ข้อมูล ณ วันที่{" "}
            {new Date().toLocaleDateString("th-TH", { dateStyle: "long" })}
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4 print:hidden">
          <Card className="p-3.5 text-center">
            <p className="text-[12.5px] font-medium text-[#5b6b82]">นักเรียนทั้งหมด</p>
            <p className="mt-0.5 text-[22px] font-bold text-[#16233a]">{totalCount}</p>
          </Card>
          <Card className="p-3.5 text-center border-l-4 border-l-[#16a34a]">
            <p className="text-[12.5px] font-medium text-[#16a34a]">ตั้งรหัส PIN แล้ว</p>
            <p className="mt-0.5 text-[22px] font-bold text-[#16a34a]">{hasPinCount}</p>
          </Card>
          <Card className="p-3.5 text-center border-l-4 border-l-[#e65100]">
            <p className="text-[12.5px] font-medium text-[#e65100]">ยังไม่ได้ตั้ง PIN</p>
            <p className="mt-0.5 text-[22px] font-bold text-[#e65100]">{noPinCount}</p>
          </Card>
        </div>

        {/* Filter Controls */}
        <Card className="p-3.5 sm:p-4 print:hidden">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Search */}
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#8a97ab]">
                <SearchIcon className="h-4 w-4" />
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="พิมพ์รหัส 5 หลัก หรือชื่อนักเรียน..."
                className="h-10 w-full rounded-lg border border-[#d8e0ec] bg-white pl-9 pr-3 text-[14px] text-[#16233a] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
              />
            </div>

            {/* Group Filter */}
            <div>
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] text-[#16233a] focus:border-[#2474c6] focus:outline-none"
              >
                <option value="all">ทุกห้องเรียน ({students.length} คน)</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {/* PIN Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | "has_pin" | "no_pin")}
                className="h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] text-[#16233a] focus:border-[#2474c6] focus:outline-none"
              >
                <option value="all">สถานะ PIN ทั้งหมด</option>
                <option value="has_pin">✓ ตั้งรหัส PIN แล้ว</option>
                <option value="no_pin">ยังไม่ได้ตั้ง PIN</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Table View */}
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead className="border-b border-[#e5e7eb] bg-[#f8fafc] text-[12.5px] font-semibold text-[#475569]">
                <tr>
                  <th className="py-2.5 pl-4 pr-2">เลขที่</th>
                  <th className="py-2.5 px-3">รหัสประจำตัว</th>
                  <th className="py-2.5 px-3">ชื่อ - นามสกุล</th>
                  <th className="py-2.5 px-3">ห้อง</th>
                  <th className="py-2.5 px-3 text-center">สถานะใบหน้า</th>
                  <th className="py-2.5 px-3">รหัส PIN</th>
                  <th className="py-2.5 pr-4 text-right print:hidden">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[14px] text-[#64748b]">
                      <RefreshIcon className="mx-auto mb-2 h-5 w-5 animate-spin text-[#2474c6]" />
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[14px] text-[#64748b]">
                      ไม่พบข้อมูลนักเรียนตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                ) : (
                  filtered.map((s) => {
                    const isVisible = showAllPins || revealedIds.has(s.id);
                    return (
                      <tr key={s.id} className="hover:bg-[#f8fafc] transition-colors">
                        <td className="py-2.5 pl-4 pr-2 font-mono text-[13px] text-[#64748b]">
                          {s.classNo || "-"}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-[#16233a]">
                          {s.studentCode}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-[#16233a]">
                          {s.thaiName}
                        </td>
                        <td className="py-2.5 px-3 text-[#475569]">
                          {s.group}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {s.faceStatus === "registered" ? (
                            <span className="inline-block rounded-full bg-[#dcfce7] px-2 py-0.5 text-[11.5px] font-semibold text-[#15803d]">
                              ✓ สแกนหน้าได้
                            </span>
                          ) : s.faceStatus === "pending" ? (
                            <span className="inline-block rounded-full bg-[#fef3c7] px-2 py-0.5 text-[11.5px] font-semibold text-[#b45309]">
                              ⏳ รออนุมัติ
                            </span>
                          ) : (
                            <span className="inline-block rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[11.5px] font-medium text-[#64748b]">
                              ยังไม่ลงทะเบียน
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {s.pinCode ? (
                            <div className="flex items-center gap-1.5">
                              {isVisible ? (
                                <span className="font-mono text-[16px] font-extrabold tracking-widest text-[#2563eb]">
                                  {s.pinCode}
                                </span>
                              ) : (
                                <span className="font-mono text-[15px] font-bold tracking-widest text-[#94a3b8]">
                                  ••••••
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleReveal(s.id)}
                                title={isVisible ? "ซ่อน" : "ดูรหัส PIN"}
                                className="rounded p-1 text-[#64748b] hover:bg-[#e2e8f0] print:hidden"
                              >
                                {isVisible ? <EyeOffIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => void copyPin(s.id, s.pinCode!)}
                                title="คัดลอก PIN"
                                className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#2563eb] hover:bg-[#dbeafe] print:hidden"
                              >
                                {copiedId === s.id ? "✓ คัดลอกแล้ว" : "คัดลอก"}
                              </button>
                            </div>
                          ) : s.hasPin ? (
                            <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[#16a34a]">
                              <span>ตั้งแล้ว (เข้ารหัส)</span>
                              <button
                                type="button"
                                onClick={() => void handleSetPin(s)}
                                className="text-[11.5px] text-[#2563eb] underline print:hidden"
                              >
                                ตั้งใหม่
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleSetPin(s)}
                              className="rounded-md border border-dashed border-[#94a3b8] px-2 py-0.5 text-[12px] font-semibold text-[#475569] hover:border-[#2563eb] hover:text-[#2563eb] print:hidden"
                            >
                              + ตั้ง PIN ให้
                            </button>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-right print:hidden">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleSetPin(s)}
                              disabled={actionBusy}
                              className="rounded px-2 py-1 text-[12px] font-semibold text-[#2563eb] hover:bg-[#eff6ff]"
                            >
                              {s.hasPin ? "เปลี่ยน PIN" : "ตั้ง PIN"}
                            </button>
                            {s.hasPin ? (
                              <button
                                type="button"
                                onClick={() => void handleResetPin(s)}
                                disabled={actionBusy}
                                className="rounded px-2 py-1 text-[12px] font-semibold text-[#dc2626] hover:bg-[#fef2f2]"
                              >
                                รีเซ็ต
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
