"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StudentSummaryShell } from "@/components/student-summary";
import { Card, CardTitle, UIButton } from "@/components/ui";
import {
  closeCamera,
  descriptorFromVideo,
  ensureFaceModels,
  openCamera,
} from "@/lib/face";
import {
  getStudentCode,
  lookupStudent,
  studentCheckin,
  verifyPin,
  type StudentIdentity,
} from "@/lib/student";

const THRESHOLD = 0.55;

export default function StudentScanPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<StudentIdentity | null>(null);
  const [pin, setPin] = useState("");
  const [pinOk, setPinOk] = useState(false);
  const [pinMsg, setPinMsg] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const pinRef = useRef("");
  const [camStatus, setCamStatus] = useState("กำลังเตรียมกล้อง...");
  const [camOn, setCamOn] = useState(false);
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const identityRef = useRef<StudentIdentity | null>(null);
  const cooldownRef = useRef(0);

  const doCheckin = useCallback(async () => {
    const code = identityRef.current?.code;
    if (!code) return;
    setNotice("กำลังบันทึก...");
    const res = await studentCheckin(code, pinRef.current || undefined);
    if (res === "saved") {
      setNotice(`เช็กชื่อสำเร็จ — ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`);
      setDone(true);
    } else if (res === "duplicate") {
      setNotice("เช็กชื่อวันนี้ไปแล้ว");
      setDone(true);
    } else if (res === "no_session") {
      setNotice("ครูยังไม่เปิดรอบวันนี้ — รอครูเปิดรอบก่อน");
    } else if (res === "bad_pin") {
      setNotice("รหัสประจำรอบไม่ถูกต้อง — ขอใหม่จากครู");
      setPinOk(false);
    } else {
      setNotice("บันทึกไม่ได้ — ลองอีกครั้ง");
    }
  }, []);

  // ขั้น 1: ยืนยันตัวตน + เก็บ PIN
  useEffect(() => {
    const code = getStudentCode();
    if (!code) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      const id = await lookupStudent(code);
      if (cancelled) return;
      if (!id) {
        router.replace("/login");
        return;
      }
      identityRef.current = id;
      setIdentity(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // ขั้น 2: ตรวจ PIN แล้วค่อยเปิดกล้อง
  const verifyAndStart = async () => {
    const code = identityRef.current?.code;
    if (!code || pinBusy) return;
    if (pin.trim().length < 4) {
      setPinMsg("กรอกรหัส 4 หลักจากครู");
      return;
    }
    setPinBusy(true);
    const v = await verifyPin(code, pin.trim());
    setPinBusy(false);
    if (!v.ok) {
      setPinMsg("รหัสไม่ถูกต้อง — ขอรหัสประจำรอบจากครู");
      return;
    }
    pinRef.current = pin.trim();
    setPinMsg(v.legacy ? "รอบนี้ยังไม่มีรหัส (รอบเก่า) — สแกนได้เลย" : "");
    setPinOk(true);
  };

  useEffect(() => {
    if (!pinOk) return;
    const id = identityRef.current;
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const video = videoRef.current;
    (async () => {
      if (!id.descriptor) {
        setCamStatus("ยังไม่ลงทะเบียนใบหน้า — ติดต่อครูประจำชั้น");
        return;
      }
      try {
        if (!window.isSecureContext) {
          setCamStatus("ต้องเปิดผ่าน HTTPS กล้องถึงจะทำงาน");
          return;
        }
        setCamStatus("กำลังโหลดโมเดลใบหน้า...");
        await ensureFaceModels();
        if (cancelled || !video) return;
        await openCamera(video);
        if (cancelled) return;
        setCamOn(true);
        setCamStatus("ส่องหน้าแล้วระบบจะเช็กชื่อให้อัตโนมัติ");
        timer = setInterval(() => {
          void (async () => {
            if (cancelled || !id.descriptor) return;
            const desc = await descriptorFromVideo(video);
            if (!desc) return;
            let sum = 0;
            for (let i = 0; i < desc.length; i++) {
              const diff = (desc[i] ?? 0) - (id.descriptor?.[i] ?? 0);
              sum += diff * diff;
            }
            const dist = Math.sqrt(sum);
            if (dist > THRESHOLD) return;
            if (Date.now() - cooldownRef.current < 30_000) return;
            cooldownRef.current = Date.now();
            await doCheckin();
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
  }, [doCheckin, router, pinOk]);

  if (!identity) {
    return (
      <StudentSummaryShell
        identity={{ code: "", name: "...", group: "...", hasFace: false, descriptor: null, photo: null }}
        active="scan"
      >
        <p className="py-10 text-center text-[14px] text-[#5b6b82]">กำลังโหลด...</p>
      </StudentSummaryShell>
    );
  }

  return (
    <StudentSummaryShell identity={identity} active="scan">
      {!pinOk ? (
        <Card className="p-5">
          <CardTitle className="mb-1">รหัสประจำรอบจากครู</CardTitle>
          <p className="mb-3 text-[13.5px] text-[#5b6b82]">
            ขอรหัส 4 หลักที่ครูเปิดไว้หน้าห้อง แล้วกรอกเพื่อเริ่มสแกน
          </p>
          <div className="flex gap-2">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void verifyAndStart();
              }}
              placeholder="••••"
              inputMode="numeric"
              className="h-12 min-w-0 flex-1 rounded-lg border border-[#d8e0ec] bg-white px-3 text-center text-[20px] font-bold tracking-[0.4em] focus:border-[#2474c6] focus:outline-none"
            />
            <UIButton
              variant="green"
              onClick={() => void verifyAndStart()}
              disabled={pinBusy}
              className="h-12 shrink-0 disabled:opacity-40"
            >
              {pinBusy ? "..." : "เริ่มสแกน"}
            </UIButton>
          </div>
          {pinMsg ? (
            <p role="status" className="mt-2 rounded-lg bg-[#fef6ec] px-3 py-2 text-center text-[13.5px] font-semibold text-[#e65100]">
              {pinMsg}
            </p>
          ) : null}
        </Card>
      ) : (
      <Card className="overflow-hidden p-0">
        <div className="relative bg-[#3a4148]">
          <video
            ref={videoRef}
            muted
            playsInline
            className={camOn ? "aspect-[4/3] w-full object-cover" : "hidden"}
          />
          {!camOn ? (
            <div className="flex aspect-[4/3] flex-col items-center justify-center px-6 text-center">
              <p className="text-[14px] text-white/90">{camStatus}</p>
            </div>
          ) : null}
          <div className="absolute inset-x-0 bottom-0 bg-black/55 px-4 py-2.5 text-center">
            <p className="text-[15px] font-semibold text-white">
              {identity ? identity.name : "กำลังโหลด..."}
            </p>
          </div>
        </div>
        <div className="p-4">
          <p role="status" className="text-center text-[13.5px] text-[#5b6b82]">
            {camOn ? camStatus : ""}
          </p>
          {notice ? (
            <p role="status" className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-center text-[14px] font-medium text-[#1a5da3]">
              {notice}
            </p>
          ) : null}
          <UIButton
            variant="green"
            onClick={() => void doCheckin()}
            disabled={!identity || done}
            className="mt-3 h-11 w-full disabled:opacity-40"
          >
            {done ? "เช็กชื่อวันนี้แล้ว" : "ยืนยันตัวฉัน — เช็กชื่อ"}
          </UIButton>
          <p className="mt-2 text-center text-[12px] text-[#8a97ab]">
            ใบหน้าตรงกับที่ลงทะเบียน ระบบจะบันทึกให้อัตโนมัติ
          </p>
        </div>
      </Card>
      )}
    </StudentSummaryShell>
  );
}
