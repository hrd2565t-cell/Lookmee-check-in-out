"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout";
import { ChevronDownIcon, ScanIcon } from "@/components/icons";
import { Avatar, Card, UIButton } from "@/components/ui";
import {
  buildCurrentMatch,
  buildRecentByGroup,
  type CurrentMatch,
  type ScanEntry,
} from "@/data/scanner";
import {
  fetchRecordsByDate,
  nowTime,
  todayStr,
  type DayRecord,
} from "@/lib/attendance";
import {
  flushQueue,
  pendingCount,
  saveCheckin,
  type SaveResult,
} from "@/lib/offline-queue";
import {
  closeCamera,
  descriptorFromVideo,
  ensureFaceModels,
  findTopMatches,
  isAmbiguous,
  openCamera,
  type EnrolledFace,
} from "@/lib/face";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { useRoster } from "@/lib/school-data";

/* ---------- Group select (styled native select) ---------- */
function GroupSelect({
  groups,
  value,
  onChange,
}: {
  groups: string[];
  value: string;
  onChange: (g: string) => void;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">เลือกกลุ่มเรียน</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full appearance-none rounded-lg border border-[#d8e0ec] bg-white pl-4 pr-10 text-[15.5px] font-medium text-[#16233a] shadow-[0_1px_2px_rgba(16,24,40,0.05)] focus:border-[#2474c6] focus:outline-none"
      >
        {groups.map((g) => (
          <option key={g} value={g}>
            เลือกกลุ่มเรียน: {g}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97ab]" />
    </label>
  );
}

/* ---------- Face corner bracket ---------- */
function Corner({
  className,
}: {
  className: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`absolute h-9 w-9 border-[#3ecf6f] ${className}`}
    />
  );
}

/* ----------
 * Camera viewport — ภาพกล้องเป็น live feed จึงไม่ตัดเป็น asset;
 * สร้างด้วย CSS + SVG ล้วน (พื้นหลัง, กรอบมุม, badge, แถบชื่อ)
 * ---------- */
function ScannerViewport({
  match,
  videoRef,
  camOn,
}: {
  match: CurrentMatch;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  camOn: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-[#3a4148]">
      {/* live camera (ทับ placeholder เมื่อกล้องติด) */}
      <video
        ref={videoRef}
        muted
        playsInline
        className={
          camOn
            ? "absolute inset-0 h-full w-full object-cover"
            : "hidden"
        }
      />
      {/* simulated camera background (fallback ตอนกล้องไม่ติด) */}
      <div
        aria-hidden="true"
        className="flex aspect-[16/10] flex-col items-center justify-center bg-gradient-to-b from-[#9aa3ad] via-[#7d868f] to-[#5c646d]"
      >
        {/* subject silhouette placeholder */}
        <svg
          viewBox="0 0 120 120"
          className="h-40 w-40 text-white/85 sm:h-48 sm:w-48"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="60" cy="42" r="24" opacity="0.95" />
          <path
            d="M14 118c4-26 24-40 46-40s42 14 46 40z"
            opacity="0.95"
          />
        </svg>
        <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-black/35 px-3 py-1 text-[12.5px] font-medium text-white">
          <ScanIcon className="h-4 w-4" />
          กำลังสแกน…
        </span>
      </div>

      {/* face frame corners */}
      <Corner className="left-[30%] top-[12%] border-l-4 border-t-4" />
      <Corner className="right-[30%] top-[12%] border-r-4 border-t-4" />
      <Corner className="bottom-[30%] left-[30%] border-b-4 border-l-4" />
      <Corner className="bottom-[30%] right-[30%] border-b-4 border-r-4" />

      {/* confidence badge */}
      <div className="absolute left-1/2 top-[58%] -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2aa84a] px-3 py-1.5 text-center shadow-lg">
        <p className="text-[13px] font-semibold leading-tight text-white">
          ตรวจจับใบหน้า
        </p>
        <p className="text-[12.5px] font-bold leading-tight text-white">
          CONFIDENCE: {match.confidence}%
        </p>
      </div>

      {/* matched name bar */}
      <div className="absolute inset-x-0 bottom-0 bg-black/55 px-4 py-2.5 text-center">
        <p className="text-[16px] font-semibold text-white sm:text-[18px]">
          เทียบชื่อ: {match.thaiName}
        </p>
      </div>
    </div>
  );
}

/* ---------- Match result panel ---------- */
function MatchResult({ match }: { match: CurrentMatch }) {
  return (
    <div className="rounded-b-lg border border-t-0 border-[#e4eaf3] bg-white px-4 py-3 text-center">
      <p className="text-[19px] font-bold tracking-tight text-[#1e8e3e] sm:text-[22px]">
        MATCHED: {match.engName || match.thaiName}
      </p>
      <p className="mt-0.5 text-[14.5px] font-medium text-[#16233a]">
        Status: {match.status} | Time: {match.time}
      </p>
    </div>
  );
}

/* ---------- Recent check-ins side panel ---------- */
function RecentPanel({ group, entries }: { group: string; entries: ScanEntry[] }) {
  return (
    <Card className="flex flex-col p-4">
      <h2 className="text-[16px] font-bold uppercase leading-6 tracking-tight text-[#16233a]">
        Recent Check-ins
        <span className="block text-[14px] font-semibold normal-case text-[#16233a]">
          (Group: {group})
        </span>
      </h2>
      {entries.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-[#5b6b82]">
          ยังไม่มีการเช็กชื่อในกลุ่มนี้
        </p>
      ) : (
        <ul className="slim-scroll -mr-1 mt-1 max-h-[300px] space-y-0.5 overflow-y-auto pr-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2.5 border-b border-[#eef2f7] py-2 last:border-0"
            >
              <Avatar initials={e.initials} color={e.color} size="sm" />
              <div className="min-w-0 leading-snug">
                <p className="truncate text-[14px] font-medium text-[#16233a]">
                  {e.name} - {e.time}
                </p>
                <p className="text-[13px] text-[#5b6b82]">{e.group}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Page ---------- */
export default function ScannerPage() {
  const { groups: rosterGroups, students } = useRoster();
  const groups = useMemo(() => rosterGroups.map((g) => g.name), [rosterGroups]);
  const recentByGroup = useMemo(
    () => buildRecentByGroup(rosterGroups, students),
    [rosterGroups, students],
  );
  const matchFallback = useMemo(() => buildCurrentMatch(students), [students]);
  const [override, setOverride] = useState<CurrentMatch | null>(null);
  const match = override ?? matchFallback;
  const [groupSel, setGroupSel] = useState("");
  const activeGroup = groups.includes(groupSel) ? groupSel : (groups[0] ?? "");
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(
    typeof window === "undefined" ? true : window.navigator.onLine,
  );
  const [pending, setPending] = useState(() =>
    typeof window === "undefined" ? 0 : pendingCount(),
  );
  const [dayRecords, setDayRecords] = useState<DayRecord[]>([]);
  const [dayLive, setDayLive] = useState(false);

  const reloadDayRecords = async () => {
    const r = await fetchRecordsByDate(todayStr());
    if (r) {
      setDayRecords(r);
      setDayLive(true);
    }
  };

  const syncNow = async () => {
    const r = await flushQueue();
    setPending(r.remaining);
    if (r.synced > 0) {
      setNotice(`ซิงก์คิวขึ้น server แล้ว ${r.synced} แถว`);
      await reloadDayRecords();
    } else if (r.remaining > 0) {
      setNotice(`ยังค้าง ${r.remaining} แถว — ตรวจเน็ตแล้วกดซิงก์ใหม่`);
    } else {
      setNotice("ไม่มีคิวค้างซิงก์");
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetchRecordsByDate(todayStr());
      if (r && !cancelled) {
        setDayRecords(r);
        setDayLive(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ออนไลน์/ออฟไลน์ + ซิงก์อัตโนมัติ (เน็ตกลับ + ทุก 30 วิ)
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void (async () => {
        const r = await flushQueue();
        setPending(r.remaining);
        if (r.synced > 0) {
          setNotice(`เน็ตกลับแล้ว — ซิงก์ ${r.synced} แถว`);
          await reloadDayRecords();
        }
      })();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const timer = setInterval(() => {
      void (async () => {
        if (!window.navigator.onLine) return;
        const r = await flushQueue();
        setPending((prev) => (prev === r.remaining ? prev : r.remaining));
        if (r.synced > 0) await reloadDayRecords();
      })();
    }, 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(timer);
    };
  }, []);
  const [mode, setMode] = useState<"face" | "manual">("face");
  const [manualCode, setManualCode] = useState("");
  const [manualFound, setManualFound] = useState<{
    code: string;
    name: string;
    group: string;
    photo: string | null;
  } | null>(null);
  const [manualMsg, setManualMsg] = useState("");

  const lookupManual = async () => {
    const code = manualCode.trim();
    setManualFound(null);
    setManualMsg("");
    const st = studentsRef.current.find((s) => s.code === code);
    if (!st) {
      setManualMsg("ไม่พบรหัสนี้ในระบบ");
      return;
    }
    let photo: string | null = null;
    if (isSupabaseConfigured) {
      const { data } = await supabase
        .from("students")
        .select("photo_url")
        .eq("student_code", code)
        .single();
      photo = (data as { photo_url: string | null } | null)?.photo_url ?? null;
    }
    if (!photo) {
      setManualMsg(`${st.name} ยังไม่มีรูปลงทะเบียน — ใช้โหมดสำรองไม่ได้`);
      return;
    }
    setManualFound({ code: st.code, name: st.name, group: st.group, photo });
  };

  const confirmManual = async () => {
    if (!manualFound) return;
    setManualMsg("กำลังบันทึก...");
    const out = await saveCheckin({
      group: manualFound.group,
      code: manualFound.code,
      confidence: 0,
      method: "manual",
    });
    setPending(out.queued);
    if (out.result === "saved") {
      setManualMsg(
        `ครูยืนยันตัวตน ${manualFound.name} แล้ว${out.periodNo !== null ? ` (คาบที่ ${out.periodNo}${out.late ? " · สาย" : ""})` : ""}`,
      );
      await reloadDayRecords();
      setManualFound(null);
      setManualCode("");
    } else if (out.result === "duplicate") {
      setManualMsg(`${manualFound.name} เช็กชื่อวันนี้ไปแล้ว`);
    } else if (out.result === "queued") {
      setManualMsg(`เน็ตหลุด — เก็บ ${manualFound.name} เข้าคิวแล้ว (ค้าง ${out.queued})`);
      setManualFound(null);
      setManualCode("");
    } else {
      setManualMsg("บันทึกไม่ได้ — ลองอีกครั้ง");
    }
  };
  const [camStatus, setCamStatus] = useState("กำลังเตรียมกล้อง...");
  const confirmCandidate = async (code: string, label: string) => {
    const st = studentsRef.current.find((s) => s.code === code);
    if (!st) return;
    setNotice("กำลังบันทึก...");
    const out = await saveCheckin({
      group: st.group,
      code: st.code,
      confidence: 0,
      method: "manual",
    });
    setPending(out.queued);
    if (out.result === "saved") {
      setNotice(`ครูยืนยันมือ (${label}): ${st.name} แล้ว`);
      setCandidates(null);
      await reloadDayRecords();
    } else if (out.result === "duplicate") {
      setNotice(`${st.name} เช็กชื่อวันนี้ไปแล้ว`);
    } else if (out.result === "queued") {
      setNotice(`เน็ตหลุด — เก็บ ${st.name} เข้าคิวแล้ว`);
    } else {
      setNotice("บันทึกไม่ได้ — ลองอีกครั้ง");
    }
  };
  const [camOn, setCamOn] = useState(false);
  const [enrolledCount, setEnrolledCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const enrolledRef = useRef<EnrolledFace[]>([]);
  const twinRef = useRef(new Map<string, boolean>());
  const photoRef = useRef(new Map<string, string | null>());
  const cooldownRef = useRef(new Map<string, number>());
  const [candidates, setCandidates] = useState<{
    reason: "ambiguous" | "twin";
    list: Array<{
      code: string;
      name: string;
      group: string;
      photo: string | null;
      initials: string;
      color: string;
      distance: number;
    }>;
  } | null>(null);
  const studentsRef = useRef(students);
  useEffect(() => {
    studentsRef.current = students;
  });

  const saveMatch = async (m: CurrentMatch) => {
    if (!m.code) {
      setNotice("บันทึกไม่ได้ — ไม่พบรหัสนักเรียน");
      return;
    }
    const out = await saveCheckin({
      group: m.group,
      code: m.code,
      confidence: m.confidence,
      method: "face",
    });
    setPending(out.queued);
    const periodLabel =
      out.periodNo !== null ? ` (คาบที่ ${out.periodNo}${out.late ? " · สาย" : ""})` : "";
    const label: Record<SaveResult, string> = {
      saved: `บันทึกเช็กชื่อ ${m.thaiName} แล้ว${periodLabel}`,
      duplicate: `${m.thaiName} เช็กชื่อวันนี้ไปแล้ว`,
      queued: `เน็ตหลุด — เก็บ ${m.thaiName} เข้าคิวแล้ว (ค้าง ${out.queued})`,
      failed: "บันทึกไม่ได้ — ลองอีกครั้ง",
    };
    setNotice(label[out.result]);
    if (out.result === "saved" || out.result === "duplicate") {
      await reloadDayRecords();
    }
  };
  const saveMatchRef = useRef(saveMatch);
  useEffect(() => {
    saveMatchRef.current = saveMatch;
  });

  // โหลดทะเบียนใบหน้า + เปิดกล้อง + วนลูปแมตช์อัตโนมัติ
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const video = videoRef.current;
    (async () => {
      try {
        if (!window.isSecureContext) {
          setCamStatus("ต้องเปิดผ่าน HTTPS หรือ localhost กล้องถึงจะทำงาน");
          return;
        }
        // ทะเบียนใบหน้าจาก DB (+ธงแฝด + รูป)
        if (isSupabaseConfigured) {
          const { data } = await supabase
            .from("students")
            .select("student_code,face_data,photo_url,twin_flag")
            .eq("face_status", "registered");
          const list: EnrolledFace[] = [];
          const twins = new Map<string, boolean>();
          const photos = new Map<string, string | null>();
          for (const r of (data ?? []) as Array<{ student_code: string | null; face_data: string | null; photo_url: string | null; twin_flag: boolean | null }>) {
            if (!r.student_code || !r.face_data) continue;
            try {
              const d = JSON.parse(r.face_data) as number[];
              if (Array.isArray(d) && d.length === 128) list.push({ code: r.student_code, descriptor: d });
            } catch {
              /* ข้ามแถวเสีย */
            }
            twins.set(r.student_code, r.twin_flag === true);
            photos.set(r.student_code, r.photo_url);
          }
          enrolledRef.current = list;
          twinRef.current = twins;
          photoRef.current = photos;
          if (!cancelled) setEnrolledCount(list.length);
        }
        if (cancelled) return;
        setCamStatus("กำลังโหลดโมเดลใบหน้า...");
        await ensureFaceModels();
        if (cancelled || !video) return;
        await openCamera(video);
        if (cancelled) return;
        setCamOn(true);
        setCamStatus("กำลังสแกนใบหน้าอัตโนมัติ...");
        timer = setInterval(() => {
          void (async () => {
            if (cancelled || enrolledRef.current.length === 0) return;
            const desc = await descriptorFromVideo(video);
            if (!desc) return;
            const top = findTopMatches(desc, enrolledRef.current, 0.55, 2);
            if (top.length === 0) return;
            const hit = top[0] as { code: string; distance: number };

            const toCandidate = (code: string, distance: number) => {
              const st = studentsRef.current.find((s) => s.code === code);
              if (!st) return null;
              return {
                code: st.code,
                name: st.name,
                group: st.group,
                photo: photoRef.current.get(st.code) ?? null,
                initials: st.initials,
                color: st.color,
                distance,
              };
            };

            // ปักธงแฝด/หน้าเหมือน → บังคับยืนยันมือเสมอ
            if (twinRef.current.get(hit.code) === true) {
              const one = toCandidate(hit.code, hit.distance);
              if (!one) return;
              const lastTwin = cooldownRef.current.get(`twin:${hit.code}`) ?? 0;
              if (Date.now() - lastTwin < 30_000) return;
              cooldownRef.current.set(`twin:${hit.code}`, Date.now());
              setCandidates({ reason: "twin", list: [one] });
              setNotice(`${one.name} ถูกปักธงแฝด — ให้ครูเทียบรูปแล้วยืนยันมือ`);
              return;
            }
            // คะแนนอันดับ 1-2 ใกล้กัน → ระบบไม่แน่ใจ ส่งให้ครูตัดสิน
            if (isAmbiguous(top)) {
              const list = top
                .map((t) => toCandidate(t.code, t.distance))
                .filter((x): x is NonNullable<typeof x> => x !== null);
              if (list.length === 0) return;
              const key = `panel:${list.map((x) => x.code).join("+")}`;
              const lastPanel = cooldownRef.current.get(key) ?? 0;
              if (Date.now() - lastPanel < 30_000) return;
              cooldownRef.current.set(key, Date.now());
              setCandidates({ reason: "ambiguous", list });
              setNotice("ใบหน้าใกล้เคียงกันมากกว่า 1 คน — ให้ครูเทียบแล้วยืนยัน");
              return;
            }

            const last = cooldownRef.current.get(hit.code) ?? 0;
            if (Date.now() - last < 30_000) return;
            cooldownRef.current.set(hit.code, Date.now());
            const st = studentsRef.current.find((s) => s.code === hit.code);
            if (!st) return;
            const m: CurrentMatch = {
              code: st.code,
              group: st.group,
              thaiName: st.name,
              engName: "",
              status: "Present",
              time: nowTime(),
              confidence: Math.round((1 - hit.distance) * 100),
            };
            setOverride(m);
            setGroupSel(st.group);
            await saveMatchRef.current(m);
          })();
        }, 1200);
      } catch {
        if (!cancelled) setCamStatus("เปิดกล้องไม่ได้ — ตรวจสิทธิ์กล้องของเบราว์เซอร์");
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      closeCamera(video);
    };
  }, []);

  const onSave = () => {
    setNotice("กำลังบันทึก...");
    void saveMatchRef.current(match);
  };

  const panelEntries: ScanEntry[] = useMemo(() => {
    if (!dayLive) return recentByGroup[activeGroup] ?? [];
    const meta = new Map(students.map((s) => [s.code, s]));
    return dayRecords
      .filter((r) => r.group === activeGroup && r.checkInAt)
      .sort((a, b) => (b.checkInAt as string).localeCompare(a.checkInAt as string))
      .map((r) => {
        const st = meta.get(r.studentCode);
        return {
          id: r.id,
          name: r.name,
          time: r.time,
          group: r.group,
          initials: st?.initials ?? "?",
          color: st?.color ?? "bg-[#dbe7f5] text-[#1a5da3]",
        };
      });
  }, [dayLive, dayRecords, activeGroup, recentByGroup, students]);

  return (
    <AppShell active="scanner" title="Daily Scanner / Flow B">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        {/* left: selector + viewport + result */}
        <div className="min-w-0">
          <GroupSelect groups={groups} value={activeGroup} onChange={setGroupSel} />
          <div className="mt-2 flex gap-2" role="tablist" aria-label="โหมดสแกน">
            {(["face", "manual"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={
                  mode === m
                    ? "h-9 flex-1 rounded-md bg-[#16233a] text-[14px] font-bold text-white"
                    : "h-9 flex-1 rounded-md border border-[#d8e0ec] bg-white text-[14px] font-semibold text-[#5b6b82]"
                }
              >
                {m === "face" ? "สแกนใบหน้า" : "โหมดสำรอง (กรอกรหัส)"}
              </button>
            ))}
          </div>
          <p role="status" className="mt-2 flex items-center justify-between gap-2 text-[12.5px] text-[#5b6b82]">
            <span>
              <span className={camOn ? "font-bold text-[#1e8e3e]" : "font-bold text-[#e65100]"}>
                ●
              </span>{" "}
              {camStatus}
            </span>
            <span>ทะเบียนใบหน้า {enrolledCount} คน</span>
          </p>
          {!online || pending > 0 ? (
            <div
              role="status"
              className={
                !online
                  ? "mt-2 flex items-center justify-between gap-2 rounded-lg bg-[#fdecec] px-3 py-2 text-[13px] font-semibold text-[#c62828]"
                  : "mt-2 flex items-center justify-between gap-2 rounded-lg bg-[#fef6ec] px-3 py-2 text-[13px] font-semibold text-[#e65100]"
              }
            >
              <span>
                {!online
                  ? "ออฟไลน์ — ผลสแกนจะเก็บเข้าคิวอัตโนมัติ"
                  : `ค้างซิงก์ ${pending} แถว`}
              </span>
              {online && pending > 0 ? (
                <button
                  type="button"
                  onClick={() => void syncNow()}
                  className="shrink-0 rounded-md bg-[#e65100] px-3 py-1 text-[12.5px] font-bold text-white hover:brightness-110"
                >
                  ซิงก์ตอนนี้
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="mt-2 overflow-hidden rounded-lg">
            <ScannerViewport match={match} videoRef={videoRef} camOn={camOn} />
            <MatchResult match={match} />
          </div>
          {candidates ? (
            <Card className="mt-3 border-[#f0c020] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[14px] font-bold text-[#16233a]">
                  {candidates.reason === "twin"
                    ? "ปักธงแฝด — ต้องยืนยันมือ"
                    : "หน้าใกล้เคียงกัน — ให้ครูตัดสิน"}
                </p>
                <button
                  type="button"
                  onClick={() => setCandidates(null)}
                  className="text-[12.5px] font-semibold text-[#5b6b82] hover:underline"
                >
                  ปิด
                </button>
              </div>
              <ul className="mt-2 space-y-2">
                {candidates.list.map((c) => (
                  <li key={c.code} className="flex items-center gap-3 rounded-lg bg-[#f8fafc] p-2">
                    {c.photo ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={c.photo}
                        alt={`รูปลงทะเบียนของ ${c.name}`}
                        className="h-16 w-14 shrink-0 rounded-md border border-[#e4eaf3] object-cover"
                      />
                    ) : (
                      <Avatar initials={c.initials} color={c.color} size="sm" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-[#16233a]">{c.name}</p>
                      <p className="text-[12.5px] text-[#5b6b82]">
                        {c.code} · {c.group}
                      </p>
                    </div>
                    <UIButton
                      variant="green"
                      onClick={() =>
                        void confirmCandidate(
                          c.code,
                          candidates.reason === "twin" ? "ปักธงแฝด" : "หน้าใกล้เคียง",
                        )
                      }
                      className="h-9 shrink-0 px-3 text-[13px]"
                    >
                      ยืนยันคนนี้
                    </UIButton>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {mode === "manual" ? (
            <Card className="mt-3 p-4">
              <p className="text-[14px] font-bold text-[#16233a]">
                เช็กชื่อสำรอง — เทียบรูปแล้วให้ครูกดยืนยัน
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void lookupManual();
                  }}
                  placeholder="กรอกเลขประจำตัว เช่น 47591"
                  inputMode="numeric"
                  className="h-11 min-w-0 flex-1 rounded-lg border border-[#d8e0ec] bg-white px-3 text-[15px] focus:border-[#2474c6] focus:outline-none"
                />
                <UIButton variant="blue" onClick={() => void lookupManual()} className="h-11 shrink-0">
                  ค้นหา
                </UIButton>
              </div>
              {manualMsg ? (
                <p role="status" className="mt-2 text-[13.5px] font-medium text-[#1a5da3]">
                  {manualMsg}
                </p>
              ) : null}
              {manualFound?.photo ? (
                <div className="mt-3 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={manualFound.photo}
                    alt={`รูปลงทะเบียนของ ${manualFound.name}`}
                    className="h-28 w-24 shrink-0 rounded-lg border border-[#e4eaf3] object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-[#16233a]">{manualFound.name}</p>
                    <p className="text-[13px] text-[#5b6b82]">
                      {manualFound.code} · {manualFound.group}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-[#e65100]">
                      เทียบกับตัวจริงในกล้องแล้วกดยืนยัน
                    </p>
                  </div>
                </div>
              ) : null}
              {manualFound?.photo ? (
                <UIButton variant="green" onClick={() => void confirmManual()} className="mt-3 h-11 w-full">
                  ยืนยันตัวตน — เช็กชื่อ
                </UIButton>
              ) : null}
            </Card>
          ) : null}
          <UIButton variant="green" onClick={() => void onSave()} className="mt-3 h-11 w-full">
            บันทึกเช็กชื่อ
          </UIButton>
          {notice ? (
            <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-center text-[13.5px] font-medium text-[#1a5da3]">
              {notice}
            </p>
          ) : null}
        </div>

        {/* right: recent + actions */}
        <div className="flex min-w-0 flex-col gap-3">
          <RecentPanel group={activeGroup} entries={panelEntries} />
          <UIButton variant="blue" href="/reports" className="h-11 w-full">
            ดูรายงานวันนี้
          </UIButton>
          <UIButton variant="blue" href="/students" className="h-11 w-full">
            จัดการกลุ่มเรียน {activeGroup}
          </UIButton>
        </div>
      </div>
    </AppShell>
  );
}
