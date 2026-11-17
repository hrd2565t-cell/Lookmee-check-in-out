"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Student } from "@/data/students";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { inspectImageFaceQuality, type FaceQualityInspection } from "@/lib/face";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  EyeIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/icons";
import { Card, CardTitle, Modal, UIButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { isCombinedM1, M1_SUBGROUPS } from "@/lib/attendance";

export type RiskCategory =
  | "all_risk"
  | "photobomb"
  | "help_requests"
  | "twin"
  | "low_confidence"
  | "pending"
  | "missing_photo"
  | "all";

export type FaceAuditProps = {
  students: Student[];
  groupList: string[];
  selectedGroup: string;
  onSelectGroup: (group: string) => void;
  onOpenEnroll: (code: string) => void;
  onOpenDetail: (code: string) => void;
  onUpdateStudent: (updated: Partial<Student> & { studentId: string }) => void;
  dbLive: boolean;
};

type HelpRequestStat = {
  count: number;
  lastAt?: string;
};

type ConfidenceStat = {
  avgConfidence: number;
  lowCount: number;
  totalCount: number;
};

export function FaceAuditView({
  students,
  groupList,
  selectedGroup,
  onSelectGroup,
  onOpenEnroll,
  onOpenDetail,
  onUpdateStudent,
  dbLive,
}: FaceAuditProps) {
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskCategory>("all_risk");
  const [m1SubgroupFilter, setM1SubgroupFilter] = useState("all");
  const [previewPhoto, setPreviewPhoto] = useState<{
    url: string;
    title: string;
    student: Student;
    riskReasons: string[];
  } | null>(null);

  // สถิติการขอความช่วยเหลือ SOS
  const [helpStats, setHelpStats] = useState<Record<string, HelpRequestStat>>({});
  // สถิติความมั่นใจจากการเช็กชื่อ
  const [confStats, setConfStats] = useState<Record<string, ConfidenceStat>>({});
  // ผลการสแกนรูปด้วย AI ในเครื่อง
  const [aiAudits, setAiAudits] = useState<Record<string, FaceQualityInspection>>({});
  const [aiScanning, setAiScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const stopScanRef = useRef(false);

  const [confirmReset, setConfirmReset] = useState<Student | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastNotice(msg);
    setTimeout(() => {
      setToastNotice((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // ดึงข้อมูล SOS Help Requests และประวัติความมั่นใจจาก DB
  useEffect(() => {
    if (!isSupabaseConfigured || !dbLive) return;
    let cancelled = false;

    (async () => {
      try {
        // 1. ดึงคำขอความช่วยเหลือ SOS
        const { data: helpData } = await supabase
          .from("checkin_help_requests")
          .select("student_code,created_at");

        if (helpData && !cancelled) {
          const stats: Record<string, HelpRequestStat> = {};
          helpData.forEach((row: { student_code: string; created_at: string }) => {
            const code = row.student_code;
            if (!stats[code]) {
              stats[code] = { count: 0, lastAt: row.created_at };
            }
            stats[code].count += 1;
            if (row.created_at > (stats[code].lastAt ?? "")) {
              stats[code].lastAt = row.created_at;
            }
          });
          setHelpStats(stats);
        }

        // 2. ดึงประวัติความมั่นใจในการสแกนย้อนหลัง
        const { data: recData } = await supabase
          .from("attendance_records")
          .select("student_id,confidence,method")
          .eq("method", "face")
          .not("confidence", "is", null);

        if (recData && !cancelled) {
          const cMap: Record<string, { sum: number; total: number; low: number }> = {};
          recData.forEach((r: { student_id: string; confidence: number }) => {
            const sid = r.student_id;
            if (!cMap[sid]) cMap[sid] = { sum: 0, total: 0, low: 0 };
            cMap[sid].sum += r.confidence;
            cMap[sid].total += 1;
            if (r.confidence < 75) cMap[sid].low += 1;
          });

          const finalConf: Record<string, ConfidenceStat> = {};
          // จับคู่ด้วย dbId หรือ student_code
          students.forEach((s) => {
            const targetId = s.dbId ?? s.id;
            const stat = cMap[targetId];
            if (stat && stat.total > 0) {
              finalConf[s.studentId] = {
                avgConfidence: Math.round(stat.sum / stat.total),
                lowCount: stat.low,
                totalCount: stat.total,
              };
            }
          });
          setConfStats(finalConf);
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dbLive, students]);

  // ฟังก์ชันคำนวณความเสี่ยงของแต่ละคน
  const getStudentRisks = (s: Student): string[] => {
    const risks: string[] = [];

    // 1. AI Detection
    const ai = aiAudits[s.studentId];
    if (ai) {
      if (ai.status === "multiple") {
        risks.push(`มีคนอื่นติดในภาพ (ตรวจพบ ${ai.faceCount} ใบหน้า)`);
      } else if (ai.status === "no_face") {
        risks.push("AI ไม่พบใบหน้า (ภาพมืด/เบลอ)");
      }
    }

    // 2. Twin Flag
    if (s.twinFlag) {
      risks.push("ปักธงแฝด/หน้าเหมือนเพื่อน");
    }

    // 3. SOS / Help Requests
    const help = helpStats[s.studentId];
    if (help && help.count > 0) {
      risks.push(`ขอครูช่วยเช็คชื่อ ${help.count} ครั้ง`);
    }

    // 4. Low Confidence
    const conf = confStats[s.studentId];
    if (conf && conf.totalCount >= 2 && conf.avgConfidence < 75) {
      risks.push(`ความมั่นใจเฉลี่ยต่ำ (${conf.avgConfidence}%)`);
    }

    // 5. Pending Status
    if (s.faceStatus === "pending") {
      risks.push("รอครูอนุมัติใบหน้าใหม่");
    }

    // 6. Registered but no photo stored
    if (s.registered && !s.photoUrl && !s.pendingPhotoUrl) {
      risks.push("ลงทะเบียนแล้ว แต่ไม่มีรูปต้นฉบับ");
    }

    return risks;
  };

  // ตรวจสอบรูปภาพของนักเรียน 1 คนด้วย AI
  const auditSingleImage = async (s: Student): Promise<FaceQualityInspection | null> => {
    const photo = s.photoUrl || s.pendingPhotoUrl;
    if (!photo) return null;

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = async () => {
        try {
          const res = await inspectImageFaceQuality(img);
          resolve(res);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        resolve({
          faceCount: 0,
          score: 0,
          status: "error",
          message: "โหลดรูปไม่สำเร็จ",
        });
      };
      img.src = photo;
    });
  };

  // เริ่มสแกนรูปทั้งหมดด้วย AI ในเครื่อง
  const handleStartAiScan = async () => {
    if (aiScanning) {
      stopScanRef.current = true;
      return;
    }

    // เลือกรวมเฉพาะคนที่มีรูปภาพ
    const targetStudents = students.filter((s) => Boolean(s.photoUrl || s.pendingPhotoUrl));
    if (targetStudents.length === 0) {
      showToast("ไม่พบรูปภาพนักเรียนที่จะตรวจสอบ");
      return;
    }

    setAiScanning(true);
    stopScanRef.current = false;
    let checkedCount = 0;

    for (const s of targetStudents) {
      if (stopScanRef.current) break;

      setScanProgress({
        current: checkedCount + 1,
        total: targetStudents.length,
        name: s.thaiName,
      });

      // ถ้าเคยตรวจแล้วและผ่าน อาจข้าม หรือตรวจใหม่
      const inspection = await auditSingleImage(s);
      if (inspection) {
        setAiAudits((prev) => ({
          ...prev,
          [s.studentId]: inspection,
        }));
      }

      checkedCount += 1;
      // พักเล็กน้อยเพื่อให้ UI ไม่ freeze
      await new Promise((r) => setTimeout(r, 40));
    }

    setAiScanning(false);
    setScanProgress(null);
    showToast(`ตรวจคุณภาพรูปด้วย AI ครบ ${checkedCount} คนแล้ว`);
  };

  // ปักธงแฝด/ปลดธง
  const toggleTwinFlag = async (s: Student) => {
    const next = !s.twinFlag;
    onUpdateStudent({ studentId: s.studentId, twinFlag: next });

    if (isSupabaseConfigured && dbLive) {
      const { error } = await supabase
        .from("students")
        .update({ twin_flag: next })
        .eq("student_code", s.studentId);
      if (error) {
        showToast("เปลี่ยนธงแฝดไม่สำเร็จ: " + error.message);
        onUpdateStudent({ studentId: s.studentId, twinFlag: !next });
        return;
      }
    }
    showToast(`${s.thaiName}: ${next ? "ปักธงแฝดแล้ว" : "ปลดธงแฝดแล้ว"}`);
  };

  // ล้างใบหน้าเดิมเพื่อให้นักเรียนลงทะเบียนใหม่
  const handleResetFace = async (s: Student) => {
    setIsResetting(true);
    try {
      if (isSupabaseConfigured && dbLive) {
        await supabase.storage.from("face-photos").remove([`${s.studentId}.jpg`]);
        const { error } = await supabase
          .from("students")
          .update({
            face_data: null,
            photo_url: null,
            pending_photo_url: null,
            face_status: "unregistered",
          })
          .eq("student_code", s.studentId);

        if (error) {
          showToast("ล้างใบหน้าไม่สำเร็จ: " + error.message);
          setIsResetting(false);
          setConfirmReset(null);
          return;
        }
      }

      onUpdateStudent({
        studentId: s.studentId,
        registered: false,
        faceStatus: "unregistered",
        photoUrl: null,
        pendingPhotoUrl: null,
      });

      setAiAudits((prev) => {
        const next = { ...prev };
        delete next[s.studentId];
        return next;
      });

      showToast(`ล้างใบหน้าของ ${s.thaiName} แล้ว (ระบบจะให้นักเรียนลงทะเบียนใหม่)`);
    } catch {
      showToast("เกิดข้อผิดพลาดในการล้างข้อมูล");
    } finally {
      setIsResetting(false);
      setConfirmReset(null);
    }
  };

  // คัดลอกรายชื่อส่ง LINE
  const copyAtRiskList = () => {
    const atRisk = filteredStudents.filter((s) => getStudentRisks(s).length > 0);
    if (atRisk.length === 0) {
      showToast("ไม่มีรายชื่อกลุ่มเสี่ยงในเงื่อนไขที่เลือก");
      return;
    }

    const lines = [
      `📢 แจ้งเตือนนักเรียนที่ต้องถ่ายรูปสแกนหน้าใหม่ (${atRisk.length} คน):`,
      ...atRisk.map((s, idx) => {
        const reasons = getStudentRisks(s).join(", ");
        return `${idx + 1}. [${s.group}] ${s.thaiName} (เลขที่ ${s.number || "-"} รหัส ${s.studentId}): ${reasons}`;
      }),
      "",
      "📌 กรุณาติดต่อคุณครูเพื่อถ่ายภาพลงทะเบียนใบหน้าใหม่ ขอบคุณครับ",
    ];

    navigator.clipboard.writeText(lines.join("\n"));
    showToast(`คัดลอกรายชื่อกลุ่มเสี่ยง ${atRisk.length} คน สำหรับส่ง LINE แล้ว`);
  };

  // รวมและกรองข้อมูล
  const filteredStudents = useMemo(() => {
    const q = query.trim().toLowerCase();

    return students.filter((s) => {
      // 1. กรองห้อง
      if (selectedGroup && selectedGroup !== "all") {
        if (isCombinedM1(selectedGroup)) {
          if (m1SubgroupFilter === "all") {
            if (!s.group.startsWith("ม.1/")) return false;
          } else {
            if (s.group !== m1SubgroupFilter) return false;
          }
        } else if (s.group !== selectedGroup) {
          return false;
        }
      }

      // 2. กรองคำค้นหา
      if (q) {
        const matchName = s.thaiName.toLowerCase().includes(q);
        const matchCode = s.studentId.includes(q);
        const matchNo = Boolean(s.number && s.number.includes(q));
        if (!matchName && !matchCode && !matchNo) return false;
      }

      // 3. กรองประเภทความเสี่ยง
      const risks = getStudentRisks(s);
      const isAtRisk = risks.length > 0;

      if (riskFilter === "all_risk") return isAtRisk;
      if (riskFilter === "photobomb") {
        const ai = aiAudits[s.studentId];
        return ai && (ai.status === "multiple" || ai.status === "no_face");
      }
      if (riskFilter === "help_requests") {
        return (helpStats[s.studentId]?.count ?? 0) > 0;
      }
      if (riskFilter === "twin") return Boolean(s.twinFlag);
      if (riskFilter === "low_confidence") {
        const c = confStats[s.studentId];
        return Boolean(c && c.totalCount >= 2 && c.avgConfidence < 75);
      }
      if (riskFilter === "pending") return s.faceStatus === "pending";
      if (riskFilter === "missing_photo") {
        return s.registered && !s.photoUrl && !s.pendingPhotoUrl;
      }
      return true; // "all"
    });
  }, [
    students,
    selectedGroup,
    m1SubgroupFilter,
    query,
    riskFilter,
    aiAudits,
    helpStats,
    confStats,
  ]);

  // สรุปยอดรวมตัวเลขสถิติ
  const summaryStats = useMemo(() => {
    let totalAtRisk = 0;
    let photobombCount = 0;
    let helpCount = 0;
    let twinCount = 0;
    let pendingCount = 0;
    let missingPhotoCount = 0;

    students.forEach((s) => {
      const risks = getStudentRisks(s);
      if (risks.length > 0) totalAtRisk += 1;

      const ai = aiAudits[s.studentId];
      if (ai && (ai.status === "multiple" || ai.status === "no_face")) photobombCount += 1;
      if ((helpStats[s.studentId]?.count ?? 0) > 0) helpCount += 1;
      if (s.twinFlag) twinCount += 1;
      if (s.faceStatus === "pending") pendingCount += 1;
      if (s.registered && !s.photoUrl && !s.pendingPhotoUrl) missingPhotoCount += 1;
    });

    return {
      totalAtRisk,
      photobombCount,
      helpCount,
      twinCount,
      pendingCount,
      missingPhotoCount,
    };
  }, [students, aiAudits, helpStats, confStats]);

  return (
    <div id="face-audit-panel" role="tabpanel" aria-label="ตรวจสอบใบหน้าเสี่ยง" className="space-y-4">
      {/* Toast Notification */}
      {toastNotice && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-[#2474c6]/30 bg-[#16233a] px-4 py-3 text-[14px] font-medium text-white shadow-xl animate-fade-in"
        >
          <CheckCircleIcon className="h-5 w-5 text-[#34d399]" />
          <span>{toastNotice}</span>
        </div>
      )}

      {/* Header Summary Card */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fee2e2] text-lg">
                ⚠️
              </span>
              <CardTitle className="text-[18px]">ตรวจสอบคุณภาพใบหน้านักเรียน (Face Audit)</CardTitle>
            </div>
            <p className="mt-1 text-[13.5px] text-[#5b6b82]">
              ค้นหานักเรียนที่มีแนวโน้มสแกนไม่ติด (เช่น รูปมีคนอื่นติดในเฟรม, ปักธงแฝด, ขอครูช่วยบ่อย) เพื่อให้มาลงทะเบียนใหม่ล่วงหน้า
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <UIButton
              variant="blue"
              onClick={handleStartAiScan}
              className={cn(
                "h-9 px-3.5 text-[13px] font-bold shadow-xs",
                aiScanning ? "bg-[#b91c1c] hover:bg-[#991b1b]" : "bg-[#2474c6] hover:bg-[#1a5da3]",
              )}
            >
              <RefreshIcon className={cn("mr-1.5 h-4 w-4", aiScanning && "animate-spin")} />
              {aiScanning ? "หยุดการสแกน AI" : "🤖 ให้ AI ตรวจรูปทั้งหมด"}
            </UIButton>

            <UIButton
              variant="blue"
              onClick={copyAtRiskList}
              className="h-9 bg-[#10b981] px-3.5 text-[13px] font-bold shadow-xs hover:bg-[#059669] focus-visible:ring-[#10b981]/40"
            >
              📋 คัดลอกรายชื่อส่ง LINE
            </UIButton>
          </div>
        </div>

        {/* Progress bar เมื่อกำลังสแกน AI */}
        {scanProgress && (
          <div className="mt-3 rounded-lg border border-[#fed7aa] bg-[#fffbeb] p-3 text-[13px] text-[#b45309]">
            <div className="flex items-center justify-between font-semibold">
              <span>กำลังตรวจรูปภาพด้วย AI... ({scanProgress.name})</span>
              <span>
                {scanProgress.current} / {scanProgress.total} คน ({Math.round((scanProgress.current / scanProgress.total) * 100)}%)
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#fde68a]">
              <div
                className="h-full bg-[#d97706] transition-all duration-200"
                style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Metric Badges Strip */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <button
            type="button"
            onClick={() => setRiskFilter("all_risk")}
            className={cn(
              "flex flex-col items-start rounded-xl border p-2.5 text-left transition-all",
              riskFilter === "all_risk"
                ? "border-[#ef4444] bg-[#fef2f2] shadow-xs"
                : "border-[#e5e7eb] bg-white hover:bg-[#f9fafb]",
            )}
          >
            <span className="text-[12px] font-medium text-[#6b7280]">เสี่ยง/มีปัญหาทั้งหมด</span>
            <span className="mt-0.5 text-[20px] font-extrabold text-[#dc2626]">
              {summaryStats.totalAtRisk} <span className="text-[13px] font-normal text-[#6b7280]">คน</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRiskFilter("photobomb")}
            className={cn(
              "flex flex-col items-start rounded-xl border p-2.5 text-left transition-all",
              riskFilter === "photobomb"
                ? "border-[#f97316] bg-[#fff7ed] shadow-xs"
                : "border-[#e5e7eb] bg-white hover:bg-[#f9fafb]",
            )}
          >
            <span className="text-[12px] font-medium text-[#6b7280]">👥 คนอื่นติดในรูป/ไม่ชัด</span>
            <span className="mt-0.5 text-[20px] font-extrabold text-[#ea580c]">
              {summaryStats.photobombCount} <span className="text-[13px] font-normal text-[#6b7280]">คน</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRiskFilter("help_requests")}
            className={cn(
              "flex flex-col items-start rounded-xl border p-2.5 text-left transition-all",
              riskFilter === "help_requests"
                ? "border-[#eab308] bg-[#fefce8] shadow-xs"
                : "border-[#e5e7eb] bg-white hover:bg-[#f9fafb]",
            )}
          >
            <span className="text-[12px] font-medium text-[#6b7280]">🆘 ขอครูช่วยบ่อย</span>
            <span className="mt-0.5 text-[20px] font-extrabold text-[#ca8a04]">
              {summaryStats.helpCount} <span className="text-[13px] font-normal text-[#6b7280]">คน</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRiskFilter("twin")}
            className={cn(
              "flex flex-col items-start rounded-xl border p-2.5 text-left transition-all",
              riskFilter === "twin"
                ? "border-[#a855f7] bg-[#faf5ff] shadow-xs"
                : "border-[#e5e7eb] bg-white hover:bg-[#f9fafb]",
            )}
          >
            <span className="text-[12px] font-medium text-[#6b7280]">👯 ปักธงหน้าเหมือน</span>
            <span className="mt-0.5 text-[20px] font-extrabold text-[#9333ea]">
              {summaryStats.twinCount} <span className="text-[13px] font-normal text-[#6b7280]">คน</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRiskFilter("pending")}
            className={cn(
              "flex flex-col items-start rounded-xl border p-2.5 text-left transition-all",
              riskFilter === "pending"
                ? "border-[#3b82f6] bg-[#eff6ff] shadow-xs"
                : "border-[#e5e7eb] bg-white hover:bg-[#f9fafb]",
            )}
          >
            <span className="text-[12px] font-medium text-[#6b7280]">⏳ รออนุมัติภาพ</span>
            <span className="mt-0.5 text-[20px] font-extrabold text-[#2563eb]">
              {summaryStats.pendingCount} <span className="text-[13px] font-normal text-[#6b7280]">คน</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRiskFilter("missing_photo")}
            className={cn(
              "flex flex-col items-start rounded-xl border p-2.5 text-left transition-all",
              riskFilter === "missing_photo"
                ? "border-[#6b7280] bg-[#f3f4f6] shadow-xs"
                : "border-[#e5e7eb] bg-white hover:bg-[#f9fafb]",
            )}
          >
            <span className="text-[12px] font-medium text-[#6b7280]">📷 ไม่มีรูปต้นฉบับ</span>
            <span className="mt-0.5 text-[20px] font-extrabold text-[#4b5563]">
              {summaryStats.missingPhotoCount} <span className="text-[13px] font-normal text-[#6b7280]">คน</span>
            </span>
          </button>
        </div>
      </Card>

      {/* Filter and Search Bar */}
      <Card className="p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_200px_220px]">
          <div className="relative">
            <span className="sr-only">ค้นหาในกลุ่มเสี่ยง</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อ, รหัสนักเรียน, เลขที่..."
              className="h-10 w-full rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-10 text-[14px] text-[#16233a] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
            />
            <SearchIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
          </div>

          <label className="relative block">
            <span className="sr-only">เลือกกลุ่มเรียน</span>
            <select
              value={selectedGroup || "all"}
              onChange={(e) => onSelectGroup(e.target.value === "all" ? "" : e.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-9 text-[14px] text-[#5b6b82] focus:border-[#2474c6] focus:outline-none"
            >
              <option value="all">ทุกห้องเรียน</option>
              {groupList.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
          </label>

          <label className="relative block">
            <span className="sr-only">กรองกลุ่มเสี่ยง</span>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as RiskCategory)}
              className="h-10 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-3 pr-9 text-[14px] text-[#5b6b82] focus:border-[#2474c6] focus:outline-none"
            >
              <option value="all_risk">⚠️ เฉพาะที่พบปัญหา ({summaryStats.totalAtRisk})</option>
              <option value="photobomb">👥 มีคนอื่นติดในภาพ/ไม่ชัด ({summaryStats.photobombCount})</option>
              <option value="help_requests">🆘 ขอครูช่วยเช็คชื่อ ({summaryStats.helpCount})</option>
              <option value="twin">👯 ปักธงหน้าเหมือน ({summaryStats.twinCount})</option>
              <option value="pending">⏳ รออนุมัติภาพ ({summaryStats.pendingCount})</option>
              <option value="missing_photo">📷 ไม่มีรูปต้นฉบับ ({summaryStats.missingPhotoCount})</option>
              <option value="all">แสดงนักเรียนทั้งหมด ({students.length})</option>
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
          </label>
        </div>

        {/* ม.1 Subgroup Filter */}
        {isCombinedM1(selectedGroup) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-[#f8fafc] p-2">
            <span className="mr-1 text-[12px] font-bold text-[#16233a]">ห้อง ม.1:</span>
            <button
              type="button"
              onClick={() => setM1SubgroupFilter("all")}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] font-bold transition-colors",
                m1SubgroupFilter === "all"
                  ? "bg-[#16233a] text-white"
                  : "border border-[#d8e0ec] bg-white text-[#5b6b82] hover:bg-[#eef2f7]",
              )}
            >
              ทั้งหมด
            </button>
            {M1_SUBGROUPS.map((rm) => (
              <button
                key={rm}
                type="button"
                onClick={() => setM1SubgroupFilter(rm)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12px] font-bold transition-colors",
                  m1SubgroupFilter === rm
                    ? "bg-[#2474c6] text-white"
                    : "border border-[#d8e0ec] bg-white text-[#5b6b82] hover:bg-[#eef2f7]",
                )}
              >
                {rm}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Results Header */}
      <div className="flex items-center justify-between px-1">
        <p className="text-[13.5px] font-medium text-[#5b6b82]">
          แสดง <span className="font-bold text-[#16233a]">{filteredStudents.length}</span> คน ในเงื่อนไขที่เลือก
        </p>
      </div>

      {/* Visual Student Cards Grid */}
      {filteredStudents.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircleIcon className="h-12 w-12 text-[#10b981]" />
          <h3 className="mt-3 text-[16px] font-bold text-[#16233a]">ไม่พบนักเรียนที่มีความเสี่ยงในเงื่อนไขนี้</h3>
          <p className="mt-1 text-[13.5px] text-[#5b6b82]">
            รูปถ่ายและประวัติการสแกนของนักเรียนในกลุ่มนี้ทำงานได้ตามปกติ
          </p>
          <UIButton
            variant="blue"
            onClick={() => {
              setRiskFilter("all");
              setQuery("");
            }}
            className="mt-4 h-9 px-4 text-[13px]"
          >
            ดูนักเรียนทั้งหมด ({students.length} คน)
          </UIButton>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
          {filteredStudents.map((s) => {
            const risks = getStudentRisks(s);
            const photo = s.photoUrl || s.pendingPhotoUrl;
            const ai = aiAudits[s.studentId];
            const help = helpStats[s.studentId];
            const conf = confStats[s.studentId];

            return (
              <div
                key={s.studentId}
                className={cn(
                  "flex flex-col justify-between overflow-hidden rounded-xl border bg-white shadow-2xs transition-all hover:shadow-md",
                  risks.length > 0 ? "border-[#fed7aa] hover:border-[#f97316]" : "border-[#e5e7eb]",
                )}
              >
                <div>
                  {/* Photo Preview Container */}
                  <div className="group relative aspect-4/3 w-full overflow-hidden bg-[#f1f5f9]">
                    {photo ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo}
                          alt={s.thaiName}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewPhoto({
                              url: photo,
                              title: `รูปใบหน้าของ ${s.thaiName}`,
                              student: s,
                              riskReasons: risks,
                            })
                          }
                          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 backdrop-blur-[1px] transition-opacity group-hover:opacity-100"
                          title="คลิกเพื่อดูรูปขนาดเต็ม"
                        >
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[12.5px] font-bold text-[#16233a] shadow-md">
                            <EyeIcon className="h-4 w-4 text-[#2474c6]" />
                            <span>ดูรูปเต็ม</span>
                          </span>
                        </button>
                      </>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[#94a3b8]">
                        <span className="text-3xl">👤</span>
                        <span className="text-[12px] font-semibold">ไม่มีรูปถ่ายในระบบ</span>
                      </div>
                    )}

                    {/* AI Detection Pill Overlay */}
                    {ai && (
                      <div className="absolute left-2 top-2">
                        {ai.status === "multiple" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#ef4444] px-2 py-0.5 text-[11px] font-extrabold text-white shadow-sm">
                            🚨 พบ {ai.faceCount} ใบหน้า!
                          </span>
                        )}
                        {ai.status === "no_face" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#f97316] px-2 py-0.5 text-[11px] font-extrabold text-white shadow-sm">
                            ⚠️ ไม่พบหน้า
                          </span>
                        )}
                        {ai.status === "ok" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#10b981] px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
                            ✓ หน้าเดี่ยวปกติ
                          </span>
                        )}
                      </div>
                    )}

                    {/* Pending Flag Overlay */}
                    {s.faceStatus === "pending" && (
                      <div className="absolute right-2 top-2">
                        <span className="rounded-full bg-[#fef3c7] px-2 py-0.5 text-[11px] font-extrabold text-[#b45309] shadow-sm">
                          ⏳ รออนุมัติ
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Info */}
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <button
                          type="button"
                          onClick={() => onOpenDetail(s.studentId)}
                          className="text-left text-[14.5px] font-bold text-[#16233a] hover:text-[#2474c6] hover:underline"
                        >
                          {s.thaiName}
                        </button>
                        <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-[#5b6b82]">
                          <span>รหัส {s.studentId}</span>
                          <span>•</span>
                          <span>{s.group}</span>
                          {s.number && (
                            <>
                              <span>•</span>
                              <span className="font-bold text-[#2474c6]">เลขที่ {s.number}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Risk Tags List */}
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {risks.length === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#ecfdf5] px-2 py-0.5 text-[11.5px] font-semibold text-[#065f46]">
                          ✓ รูปและประวัติการสแกนปกติ
                        </span>
                      ) : (
                        risks.map((r) => (
                          <span
                            key={r}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold leading-tight",
                              r.includes("มีคนอื่น") || r.includes("ไม่พบใบหน้า")
                                ? "bg-[#fee2e2] text-[#991b1b]"
                                : r.includes("ช่วยเช็คชื่อ")
                                ? "bg-[#fef3c7] text-[#92400e]"
                                : r.includes("ปักธงแฝด")
                                ? "bg-[#f3e8ff] text-[#6b21a8]"
                                : "bg-[#fed7aa] text-[#9a3412]",
                            )}
                          >
                            ⚠️ {r}
                          </span>
                        ))
                      )}
                    </div>

                    {/* Extra Statistics Details if available */}
                    {(help || conf) && (
                      <div className="mt-2 border-t border-[#f1f5f9] pt-2 text-[11.5px] text-[#64748b]">
                        {help && help.count > 0 && (
                          <p>
                            • คำขอ SOS: <strong className="text-[#b45309]">{help.count} ครั้ง</strong>
                          </p>
                        )}
                        {conf && conf.totalCount > 0 && (
                          <p>
                            • สแกนหน้าติด: <strong>{conf.avgConfidence}%</strong> ({conf.totalCount} ครั้ง)
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="border-t border-[#f1f5f9] bg-[#fafafa] p-2.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenEnroll(s.studentId)}
                      className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#2474c6] py-1.5 text-[12px] font-bold text-white shadow-2xs hover:bg-[#1a5da3]"
                    >
                      <span>📸 ถ่ายใหม่</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void toggleTwinFlag(s)}
                      className={cn(
                        "inline-flex items-center justify-center gap-1 rounded-lg border py-1.5 text-[12px] font-bold transition-colors",
                        s.twinFlag
                          ? "border-[#9333ea] bg-[#faf5ff] text-[#7e22ce]"
                          : "border-[#d8e0ec] bg-white text-[#5b6b82] hover:bg-[#f1f5f9]",
                      )}
                      title={s.twinFlag ? "ปลดธงแฝด" : "ปักธงแฝด (บังคับครูยืนยันมือ)"}
                    >
                      <span>{s.twinFlag ? "★ ปักแฝดอยู่" : "☆ ปักธงแฝด"}</span>
                    </button>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(s.studentId)}
                      className="text-[12px] font-semibold text-[#2474c6] hover:underline"
                    >
                      ดูข้อมูลรายคน
                    </button>

                    {s.registered && (
                      <button
                        type="button"
                        onClick={() => setConfirmReset(s)}
                        className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#dc2626] hover:underline"
                        title="ล้างข้อมูลใบหน้าเพื่อให้นักเรียนลงทะเบียนใหม่"
                      >
                        <TrashIcon className="h-3 w-3" />
                        <span>รีเซ็ตใบหน้า</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal พรีวิวรูปเต็ม */}
      {previewPhoto && (
        <Modal
          title={previewPhoto.title}
          onClose={() => setPreviewPhoto(null)}
          maxWidth="max-w-lg"
        >
          <div className="space-y-3">
            <div className="relative flex max-h-[70vh] items-center justify-center overflow-hidden rounded-xl bg-black/95 p-2 shadow-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewPhoto.url}
                alt={previewPhoto.title}
                className="max-h-[60vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
              />
            </div>

            {/* ข้อความแจ้งเตือนข้อผิดพลาดในรูป */}
            {previewPhoto.riskReasons.length > 0 && (
              <div className="rounded-lg border border-[#fed7aa] bg-[#fffbeb] p-3 text-[13px] text-[#b45309]">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircleIcon className="h-4 w-4 shrink-0 text-[#ea580c]" />
                  <span>ประเด็นความเสี่ยงที่พบ:</span>
                </div>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-[12.5px]">
                  {previewPhoto.riskReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[13px]">
              <span className="text-[#64748b]">
                ห้อง {previewPhoto.student.group} (รหัส {previewPhoto.student.studentId})
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const code = previewPhoto.student.studentId;
                    setPreviewPhoto(null);
                    onOpenEnroll(code);
                  }}
                  className="rounded-lg bg-[#2474c6] px-3.5 py-1.5 text-[12.5px] font-bold text-white shadow-xs hover:bg-[#1a5da3]"
                >
                  📸 ลงทะเบียนใหม่ทันที
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewPhoto(null)}
                  className="rounded-lg border border-[#d8e0ec] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#16233a] hover:bg-[#f8fafc]"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal สำหรับการล้างใบหน้า */}
      {confirmReset && (
        <Modal
          title={`ยืนยันล้างข้อมูลใบหน้าของ ${confirmReset.thaiName}?`}
          onClose={() => setConfirmReset(null)}
          maxWidth="max-w-md"
        >
          <div className="space-y-3">
            <p className="text-[13.5px] text-[#5b6b82]">
              เมื่อล้างข้อมูลแล้ว ระบบจะเปลี่ยนสถานะเป็น{" "}
              <strong className="text-[#ea580c]">ยังไม่ได้ลงทะเบียน</strong>{" "}
              และลบรูปภาพเดิมออกจากระบบ เพื่อให้นักเรียนลงทะเบียนใหม่ด้วยตนเองหรือให้คุณครูถ่ายใหม่
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isResetting}
                onClick={() => setConfirmReset(null)}
                className="rounded-lg border border-[#d8e0ec] bg-white px-3.5 py-2 text-[13px] font-medium text-[#16233a] hover:bg-[#f1f5fa]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isResetting}
                onClick={() => void handleResetFace(confirmReset)}
                className="rounded-lg bg-[#dc2626] px-3.5 py-2 text-[13px] font-bold text-white shadow-xs hover:bg-[#b91c1c] disabled:opacity-50"
              >
                {isResetting ? "กำลังล้างข้อมูล..." : "ยืนยันล้างใบหน้า"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
