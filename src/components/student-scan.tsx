"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StudentSummaryShell } from "@/components/student-summary";
import { Card, CardTitle, UIButton } from "@/components/ui";
import { CameraSwitchIcon, RefreshIcon } from "@/components/icons";
import {
  closeCamera,
  descriptorFromVideo,
  ensureFaceModels,
  getCameraErrorMessage,
  openCamera,
  type CameraFacingMode,
} from "@/lib/face";
import {
  getStudentCode,
  lookupStudent,
  studentCheckin,
  verifyPin,
  type StudentIdentity,
} from "@/lib/student";
import { InAppBrowserNotice } from "@/lib/in-app-browser";
import { playSuccessChime } from "@/lib/sound";
import { StudentSelfEnroll } from "@/components/student-self-enroll";

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
  const [facingMode, setFacingMode] = useState<CameraFacingMode>("user");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const identityRef = useRef<StudentIdentity | null>(null);
  const cooldownRef = useRef(0);

  const toggleCamera = async () => {
    const nextMode: CameraFacingMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);
    setCamStatus(`กำลังสลับเป็น${nextMode === "user" ? "กล้องหน้า" : "กล้องหลัง"}...`);
    const video = videoRef.current;
    if (!video) return;
    try {
      await openCamera(video, nextMode);
      setCamOn(true);
      setCamStatus(`กำลังส่องด้วย${nextMode === "user" ? "กล้องหน้า" : "กล้องหลัง"}...`);
    } catch (err) {
      setCamOn(false);
      setCamStatus(getCameraErrorMessage(err));
    }
  };

  const retryCamera = async () => {
    setCamStatus("กำลังลองเปิดกล้องใหม่...");
    const video = videoRef.current;
    if (!video) return;
    try {
      await openCamera(video, facingMode);
      setCamOn(true);
      setCamStatus(`ส่องหน้าด้วย${facingMode === "user" ? "กล้องหน้า" : "กล้องหลัง"}เพื่อเช็กชื่อ`);
    } catch (err) {
      setCamOn(false);
      setCamStatus(getCameraErrorMessage(err));
    }
  };

  const doCheckin = useCallback(async () => {
    const code = identityRef.current?.code;
    if (!code) return;
    setIsCheckingIn(true);
    setNotice("กำลังบันทึก...");
    try {
      const res = await studentCheckin(code, pinRef.current || undefined);
      if (res === "saved") {
        playSuccessChime();
        setNotice(`✓ เช็กชื่อสำเร็จ — ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`);
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
    } finally {
      setIsCheckingIn(false);
    }
  }, []);

  // ขั้น 1: ยืนยันตัวตน + เก็บ PIN (รองรับ ?pin=... จากการสแกน QR Code)
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

      // ตรวจสอบ query string เผื่อสแกน QR Code เข้ามา
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const qPin = params.get("pin");
        if (qPin && qPin.trim().length === 4) {
          setPin(qPin.trim());
          const v = await verifyPin(id.code, qPin.trim());
          if (!cancelled && v.ok) {
            pinRef.current = qPin.trim();
            setPinOk(true);
          }
        }
      }
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
        await openCamera(video, facingMode);
        if (cancelled) return;
        setCamOn(true);
        setCamStatus(`ส่องหน้าด้วย${facingMode === "user" ? "กล้องหน้า" : "กล้องหลัง"} ระบบจะเช็กชื่อให้อัตโนมัติ`);
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
      } catch (err) {
        if (!cancelled) {
          setCamOn(false);
          setCamStatus(getCameraErrorMessage(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      closeCamera(video);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // หากยังไม่เคยลงทะเบียนใบหน้า ให้เปิดหน้าลงทะเบียนใบหน้าด้วยตนเอง
  if (!identity.hasFace || !identity.descriptor) {
    return (
      <StudentSummaryShell identity={identity} active="scan">
        <InAppBrowserNotice />
        <StudentSelfEnroll
          studentCode={identity.code}
          studentName={identity.name}
          onEnrolled={(desc) => {
            setIdentity({
              ...identity,
              hasFace: true,
              descriptor: desc,
            });
            if (identityRef.current) {
              identityRef.current.hasFace = true;
              identityRef.current.descriptor = desc;
            }
          }}
        />
      </StudentSummaryShell>
    );
  }

  return (
    <StudentSummaryShell identity={identity} active="scan">
      <InAppBrowserNotice />
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
            className={camOn ? `aspect-[4/3] w-full object-cover ${facingMode === "user" ? "-scale-x-100" : ""}` : "hidden"}
          />
          {/* Oval Face Guide */}
          {camOn && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-[210px] w-[160px] rounded-[50%] border-2 border-dashed border-[#3ecf6f]/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
            </div>
          )}
          {/* ปุ่มสลับกล้องแบบลอยบนมุมขวา */}
          <button
            type="button"
            onClick={() => void toggleCamera()}
            className="absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[12px] font-semibold text-white shadow-md backdrop-blur-xs transition hover:bg-black/90 active:scale-95"
            title={`คลิกเพื่อสลับเป็น${facingMode === "user" ? "กล้องหลัง" : "กล้องหน้า"}`}
          >
            <CameraSwitchIcon className="h-3.5 w-3.5 text-emerald-400" />
            <span>{facingMode === "user" ? "กล้องหน้า" : "กล้องหลัง"}</span>
            <span className="rounded bg-white/25 px-1.5 py-0.5 text-[10.5px]">สลับ</span>
          </button>
          {!camOn ? (
            <div className="flex aspect-[4/3] flex-col items-center justify-center p-6 text-center">
              <span className="text-3xl">📷</span>
              <p className="mt-2 text-[14px] font-semibold text-rose-300">{camStatus}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void retryCamera()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#2474c6] px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-[#1d5ea2]"
                >
                  <RefreshIcon className="h-3.5 w-3.5" />
                  ลองใหม่
                </button>
                <button
                  type="button"
                  onClick={() => void toggleCamera()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white/20 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-white/30"
                >
                  <CameraSwitchIcon className="h-3.5 w-3.5" />
                  สลับกล้อง ({facingMode === "user" ? "ลองกล้องหลัง" : "ลองกล้องหน้า"})
                </button>
              </div>
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
          <div className="mt-3">
            {done ? (
              <div className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[15px] font-bold text-white shadow-sm">
                <span>✓</span>
                <span>เช็กชื่อเรียบร้อยแล้ว</span>
              </div>
            ) : isCheckingIn ? (
              <div className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2474c6] text-[15px] font-bold text-white shadow-sm">
                <RefreshIcon className="h-4 w-4 animate-spin" />
                <span>ตรวจพบใบหน้าตรงกัน — กำลังบันทึก...</span>
              </div>
            ) : camOn ? (
              <div className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#16233a] text-[14px] font-semibold text-white">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <span>กำลังสแกนใบหน้า... กรุณามองตรงที่กล้อง</span>
              </div>
            ) : (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-[13px] text-rose-800">
                <p className="font-bold">⚠️ กล้องไม่พร้อมใช้งาน</p>
                <p className="mt-0.5 text-[12px] text-rose-600">
                  เพื่อป้องกันการเช็กชื่อแทนกัน ระบบต้องสแกนใบหน้าเท่านั้น — หากกล้องมีปัญหา โปรดแจ้งให้ครูผู้สอนกดเช็กชื่อให้ที่หน้าจอครู
                </p>
              </div>
            )}
          </div>
          <p className="mt-2 text-center text-[12px] text-[#8a97ab]">
            เมื่อใบหน้าตรงกับที่ลงทะเบียน ระบบจะบันทึกให้อัตโนมัติทันที
          </p>
        </div>
      </Card>
      )}
    </StudentSummaryShell>
  );
}
