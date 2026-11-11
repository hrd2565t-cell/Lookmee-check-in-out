"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, UIButton } from "@/components/ui";
import { BrandMark } from "@/components/logo";
import { InAppBrowserNotice } from "@/lib/in-app-browser";
import { CameraSwitchIcon, EyeIcon, EyeOffIcon, RefreshIcon } from "@/components/icons";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import {
  lookupStudent,
  loginWithFace,
  loginWithPin,
  setStudentPersonalPin,
  setStudentSession,
  type StudentIdentity,
} from "@/lib/student";
import {
  openCamera,
  closeCamera,
  ensureFaceModels,
  descriptorFromVideo,
  getCameraErrorMessage,
  type CameraFacingMode,
} from "@/lib/face";
import { playSuccessChime } from "@/lib/sound";
import { StudentSelfEnroll } from "@/components/student-self-enroll";

function TeacherForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("กรุณากรอกอีเมลและรหัสผ่าน");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      setError("เข้าสู่ระบบไม่สำเร็จ — ตรวจอีเมล/รหัสผ่าน");
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <label className="block text-[14px] font-medium text-[#16233a]">
        อีเมล
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teacher@school.ac.th"
          className="mt-1 h-11 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[15px] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
        />
      </label>
      <label className="block text-[14px] font-medium text-[#16233a]">
        รหัสผ่าน
        <span className="relative mt-1 block">
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="h-11 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 pr-11 text-[15px] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
          />
          <button
            type="button"
            aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-[#5b6b82] hover:bg-[#f1f5fa]"
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </span>
      </label>
      {error ? (
        <p role="alert" className="rounded-lg bg-[#fdecec] px-3 py-2 text-[13.5px] font-semibold text-[#c62828]">
          {error}
        </p>
      ) : null}
      <UIButton type="submit" disabled={busy} className="h-11 w-full disabled:opacity-50">
        {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
      </UIButton>
    </form>
  );
}

function FaceUnlockCamera({
  student,
  onSuccess,
  onSwitchToPin,
  onChangeCode,
}: {
  student: StudentIdentity;
  onSuccess: (token: string, expiresAt?: string, hasPin?: boolean) => void;
  onSwitchToPin?: () => void;
  onChangeCode: () => void;
}) {
  const [facingMode, setFacingMode] = useState<CameraFacingMode>("user");
  const [status, setStatus] = useState("กำลังเตรียมกล้อง...");
  const [ready, setReady] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [checking, setChecking] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanLockRef = useRef(false);

  const toggleCamera = async () => {
    const nextMode: CameraFacingMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);
    setStatus(`กำลังสลับเป็น${nextMode === "user" ? "กล้องหน้า" : "กล้องหลัง"}...`);
    const video = videoRef.current;
    if (!video) return;
    try {
      await openCamera(video, nextMode);
      setReady(true);
      setStatus("มองกล้องตรง ๆ เพื่อสแกนใบหน้า");
    } catch (err) {
      setReady(false);
      setStatus(getCameraErrorMessage(err));
    }
  };

  const retryCamera = async () => {
    setStatus("กำลังลองเปิดกล้องใหม่...");
    const video = videoRef.current;
    if (!video) return;
    try {
      await openCamera(video, facingMode);
      setReady(true);
      setStatus("มองกล้องตรง ๆ เพื่อสแกนใบหน้า");
    } catch (err) {
      setReady(false);
      setStatus(getCameraErrorMessage(err));
    }
  };

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const video = videoRef.current;

    (async () => {
      try {
        if (!window.isSecureContext) {
          setStatus("ต้องเปิดผ่าน HTTPS กล้องถึงจะทำงาน");
          return;
        }
        setStatus("กำลังโหลดระบบตรวจจับใบหน้า...");
        await ensureFaceModels();
        if (cancelled || !video) return;
        setStatus("กำลังเปิดกล้อง...");
        await openCamera(video, facingMode);
        if (cancelled) return;
        setReady(true);
        setStatus("มองกล้องตรง ๆ เพื่อสแกนใบหน้า");

        timer = setInterval(() => {
          void (async () => {
            if (cancelled || scanLockRef.current || !videoRef.current) return;
            const desc = await descriptorFromVideo(videoRef.current);
            if (!desc || cancelled) return;

            scanLockRef.current = true;
            setChecking(true);
            setStatus("กำลังเทียบใบหน้ากับระบบ...");

            const res = await loginWithFace(student.code, Array.from(desc));
            if (cancelled) return;
            setChecking(false);

            if (res.ok && res.token) {
              setStatus("✓ ยืนยันใบหน้าสำเร็จ!");
              playSuccessChime();
              onSuccess(res.token, res.expires_at, res.has_pin);
              return;
            }

            if (res.error === "face_not_match") {
              setMatchError("ใบหน้าไม่ตรงกับที่ลงทะเบียนไว้");
              setStatus("ใบหน้าไม่ตรง — ลองจัดมุมกล้องให้อยู่ในกรอบ");
            } else if (res.error === "no_face") {
              setStatus("ยังไม่ได้ลงทะเบียนใบหน้า");
            } else {
              setStatus("สแกนไม่สำเร็จ — กำลังลองใหม่...");
            }

            // หน่วงเวลา 1.5 วินาทีก่อนเทียบภาพถัดไป
            setTimeout(() => {
              scanLockRef.current = false;
            }, 1500);
          })();
        }, 800);
      } catch (err) {
        if (!cancelled) {
          setReady(false);
          setStatus(getCameraErrorMessage(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      closeCamera(video);
    };
  }, [student.code, facingMode, onSuccess]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[#cbe2f8] bg-[#eef6fc] p-3 text-center">
        <p className="text-[16px] font-bold text-[#16233a]">{student.name}</p>
        <p className="text-[13px] text-[#5b6b82]">
          รหัส <span className="font-mono font-semibold text-[#16233a]">{student.code}</span> · ห้อง <span className="font-semibold text-[#16233a]">{student.group}</span>
        </p>
      </div>

      <div className="relative mx-auto overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`h-[280px] w-full object-cover ${facingMode === "user" ? "-scale-x-100" : ""}`}
        />

        {/* Biometric Face Oval HUD */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={`h-[210px] w-[160px] rounded-[50%] border-2 transition-all duration-300 ${
              checking
                ? "border-[#42a5f5] shadow-[0_0_20px_rgba(66,165,245,0.8)]"
                : ready
                  ? "border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5)]"
                  : "border-white/50"
            }`}
          />
        </div>

        {/* Camera switch button */}
        <button
          type="button"
          onClick={() => void toggleCamera()}
          className="absolute right-2.5 top-2.5 rounded-full bg-black/60 p-2 text-white shadow-md hover:bg-black/80"
          title="สลับกล้องหน้า/หลัง"
        >
          <CameraSwitchIcon className="h-4 w-4" />
        </button>

        {!ready && (
          <button
            type="button"
            onClick={() => void retryCamera()}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-[#2474c6] px-3 py-1.5 text-[12px] font-bold text-white shadow-md"
          >
            <RefreshIcon className="mr-1 inline h-3.5 w-3.5" /> ลองเปิดกล้องใหม่
          </button>
        )}
      </div>

      <div className="text-center">
        <p
          className={`text-[13.5px] font-semibold ${
            checking ? "text-[#1a5da3]" : matchError ? "text-[#c62828]" : "text-[#16233a]"
          }`}
        >
          {checking ? "🔍 กำลังตรวจสอบใบหน้า..." : status}
        </p>
      </div>

      {onSwitchToPin ? (
        <button
          type="button"
          onClick={onSwitchToPin}
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white py-2.5 text-[13.5px] font-semibold text-[#16233a] hover:bg-[#f8fafc]"
        >
          🔑 ปลดล็อกด้วย PIN แทน (เมื่อแสงมืด/กล้องมีปัญหา)
        </button>
      ) : null}

      <button
        type="button"
        onClick={onChangeCode}
        className="block w-full text-center text-[12.5px] text-[#5b6b82] hover:underline"
      >
        ← เปลี่ยนรหัสประจำตัว
      </button>
    </div>
  );
}

function PinUnlockView({
  student,
  onSuccess,
  onSwitchToFace,
  onChangeCode,
}: {
  student: StudentIdentity;
  onSuccess: (token: string, expiresAt?: string, hasPin?: boolean) => void;
  onSwitchToFace: () => void;
  onChangeCode: () => void;
}) {
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (pin.length < 4 || pin.length > 6) {
      setError("รหัส PIN ต้องมี 4-6 หลัก");
      return;
    }
    setBusy(true);
    const res = await loginWithPin(student.code, pin);
    setBusy(false);

    if (res.ok && res.token) {
      playSuccessChime();
      onSuccess(res.token, res.expires_at, true);
      return;
    }

    if (res.error === "locked") {
      setError(`ใส่ PIN ผิดเกินกำหนด — ระบบถูกระงับชั่วคราวอีก ${res.wait_minutes ?? 15} นาที (หรือให้ครูรีเซ็ต)`);
    } else if (res.error === "bad_pin") {
      setError(`รหัส PIN ไม่ถูกต้อง (เหลืออีก ${res.remaining ?? 0} ครั้ง)`);
    } else if (res.error === "no_pin_set") {
      setError("ยังไม่ได้ตั้งรหัส PIN ส่วนตัว — กรุณาสแกนใบหน้าเพื่อเข้าสู่ระบบ");
    } else {
      setError("เข้าสู่ระบบไม่สำเร็จ — ลองอีกครั้ง");
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <div className="rounded-xl border border-[#cbe2f8] bg-[#eef6fc] p-3 text-center">
        <p className="text-[16px] font-bold text-[#16233a]">{student.name}</p>
        <p className="text-[13px] text-[#5b6b82]">
          รหัส <span className="font-mono font-semibold text-[#16233a]">{student.code}</span> · ห้อง <span className="font-semibold text-[#16233a]">{student.group}</span>
        </p>
      </div>

      <label className="block text-[14px] font-medium text-[#16233a]">
        รหัส PIN ส่วนตัว (4-6 หลัก)
        <span className="relative mt-1 block">
          <input
            type={showPin ? "text" : "password"}
            inputMode="numeric"
            maxLength={6}
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••••"
            className="h-12 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 pr-11 text-center font-mono text-[20px] tracking-[0.3em] text-[#16233a] focus:border-[#2474c6] focus:outline-none"
          />
          <button
            type="button"
            aria-label={showPin ? "ซ่อนรหัส PIN" : "แสดงรหัส PIN"}
            onClick={() => setShowPin((v) => !v)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-[#5b6b82] hover:bg-[#f1f5fa]"
          >
            {showPin ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </span>
      </label>

      {error ? (
        <p role="alert" className="rounded-lg bg-[#fdecec] px-3 py-2 text-[13px] font-semibold text-[#c62828]">
          {error}
        </p>
      ) : null}

      <UIButton type="submit" disabled={busy || pin.length < 4} className="h-11 w-full disabled:opacity-50">
        {busy ? "กำลังตรวจสอบ..." : "✓ เข้าสู่ระบบด้วย PIN"}
      </UIButton>

      <button
        type="button"
        onClick={onSwitchToFace}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#d8e0ec] bg-white py-2.5 text-[13.5px] font-semibold text-[#16233a] hover:bg-[#f8fafc]"
      >
        📷 กลับไปสแกนใบหน้า (Face Unlock)
      </button>

      <button
        type="button"
        onClick={onChangeCode}
        className="block w-full text-center text-[12.5px] text-[#5b6b82] hover:underline"
      >
        ← เปลี่ยนรหัสประจำตัว
      </button>
    </form>
  );
}

function SetPersonalPinView({
  sessionToken,
  onComplete,
}: {
  sessionToken: string;
  onComplete: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (pin.length < 4 || pin.length > 6) {
      setError("รหัส PIN ต้องมี 4-6 หลัก");
      return;
    }
    if (pin !== confirmPin) {
      setError("รหัส PIN ทั้ง 2 ช่องไม่ตรงกัน");
      return;
    }
    setBusy(true);
    const res = await setStudentPersonalPin(pin, sessionToken);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "บันทึกรหัส PIN ไม่สำเร็จ");
      return;
    }
    onComplete();
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <div className="rounded-xl bg-[#e8f5e9] p-3 text-center">
        <p className="text-[15px] font-bold text-[#1b5e20]">🎉 สแกนใบหน้าสำเร็จ!</p>
        <p className="mt-0.5 text-[12.5px] text-[#2e7d32]">
          ตั้งรหัส PIN 4-6 หลัก สำหรับใช้เข้าสู่ระบบเมื่อแสงมืดหรือกล้องมีปัญหา
        </p>
      </div>

      <label className="block text-[13.5px] font-medium text-[#16233a]">
        ตั้งรหัส PIN ส่วนตัว (ตัวเลข 4-6 หลัก)
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="••••••"
          className="mt-1 h-11 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-center font-mono text-[18px] tracking-[0.3em] text-[#16233a] focus:border-[#2474c6] focus:outline-none"
        />
      </label>

      <label className="block text-[13.5px] font-medium text-[#16233a]">
        ยืนยันรหัส PIN อีกครั้ง
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
          placeholder="••••••"
          className="mt-1 h-11 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-center font-mono text-[18px] tracking-[0.3em] text-[#16233a] focus:border-[#2474c6] focus:outline-none"
        />
      </label>

      {error ? (
        <p role="alert" className="rounded-lg bg-[#fdecec] px-3 py-2 text-[13px] font-semibold text-[#c62828]">
          {error}
        </p>
      ) : null}

      <UIButton type="submit" disabled={busy || pin.length < 4 || confirmPin.length < 4} className="h-11 w-full">
        {busy ? "กำลังบันทึก..." : "✓ บันทึกรหัส PIN"}
      </UIButton>

      <button
        type="button"
        onClick={onComplete}
        className="block w-full text-center text-[12.5px] text-[#5b6b82] hover:underline"
      >
        ข้ามไปก่อน (เข้าสู่ระบบเลย)
      </button>
    </form>
  );
}

function StudentForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [found, setFound] = useState<StudentIdentity | null>(null);
  const [mode, setMode] = useState<"search" | "face_unlock" | "pin_unlock" | "self_enroll" | "set_pin">("search");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // โหลดโมเดลใบหน้าล่วงหน้าขณะที่นักเรียนพิมพ์รหัส เพื่อให้ปลดล็อกด้วยใบหน้าได้ทันทีไม่สะดุด
    if (typeof window !== "undefined") {
      void ensureFaceModels();
    }
  }, []);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFound(null);
    if (!code.trim()) {
      setError("กรุณากรอกรหัสประจำตัว");
      return;
    }
    setBusy(true);
    const st = await lookupStudent(code.trim());
    setBusy(false);
    if (!st) {
      setError("ไม่พบรหัสนี้ในระบบ — ตรวจอีกครั้งหรือติดต่อครู");
      return;
    }
    setFound(st);
    if (st.faceStatus === "registered") {
      setMode("face_unlock");
    } else {
      setMode("search");
    }
  };

  const navigateToStudentPortal = () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect");
      if (redirect && redirect.startsWith("/")) {
        router.push(redirect);
        router.refresh();
        return;
      }
    }
    router.push("/student");
    router.refresh();
  };

  const handleLoginSuccess = (token: string, expiresAt?: string, hasPin?: boolean) => {
    if (!found) return;
    setStudentSession(found.code, token, expiresAt);

    // หากนักเรียนยังไม่เคยตั้ง PIN ให้แนะนำตั้ง PIN สำรอง
    if (!hasPin) {
      setSessionToken(token);
      setMode("set_pin");
      return;
    }

    navigateToStudentPortal();
  };

  // 1. หน้าตั้งค่า PIN หลังจากสแกนหน้าสำเร็จครั้งแรก
  if (mode === "set_pin" && sessionToken) {
    return <SetPersonalPinView sessionToken={sessionToken} onComplete={navigateToStudentPortal} />;
  }

  // 2. หน้าถ่ายภาพลงทะเบียนใบหน้าด้วยตนเอง (รอครูอนุมัติ)
  if (mode === "self_enroll" && found) {
    return (
      <StudentSelfEnroll
        studentCode={found.code}
        studentName={found.name}
        onCancel={() => setMode("search")}
        onSubmitted={() => setMode("search")}
      />
    );
  }

  // 3. หน้า Face Unlock (สแกนใบหน้าปลดล็อก)
  if (mode === "face_unlock" && found) {
    return (
      <FaceUnlockCamera
        student={found}
        onSuccess={handleLoginSuccess}
        onSwitchToPin={found.hasPin ? () => setMode("pin_unlock") : undefined}
        onChangeCode={() => {
          setFound(null);
          setMode("search");
        }}
      />
    );
  }

  // 4. หน้าใส่รหัส PIN ส่วนตัว
  if (mode === "pin_unlock" && found) {
    return (
      <PinUnlockView
        student={found}
        onSuccess={handleLoginSuccess}
        onSwitchToFace={() => setMode("face_unlock")}
        onChangeCode={() => {
          setFound(null);
          setMode("search");
        }}
      />
    );
  }

  // 5. หน้าค้นหารหัสประจำตัว
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => void search(e)} className="flex gap-2">
        <label className="min-w-0 flex-1 text-[14px] font-medium text-[#16233a]">
          <span className="sr-only">รหัสประจำตัวนักเรียน</span>
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setFound(null);
            }}
            placeholder="รหัสประจำตัว เช่น 47591"
            inputMode="numeric"
            className="h-11 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[15px] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none"
          />
        </label>
        <UIButton type="submit" disabled={busy} className="h-11 shrink-0 disabled:opacity-50">
          {busy ? "..." : "ค้นหา"}
        </UIButton>
      </form>

      {error ? (
        <p role="alert" className="rounded-lg bg-[#fdecec] px-3 py-2 text-[13.5px] font-semibold text-[#c62828]">
          {error}
        </p>
      ) : null}

      {found ? (
        <div className="space-y-3">
          {/* กรณีรอครูอนุมัติ */}
          {found.faceStatus === "pending" ? (
            <div className="rounded-xl border border-[#ffe082] bg-[#fff8e1] p-4 text-center">
              <p className="text-[16px] font-bold text-[#16233a]">{found.name}</p>
              <p className="mt-1 text-[13px] text-[#5b6b82]">
                รหัส <span className="font-mono font-semibold text-[#16233a]">{found.code}</span> · ห้อง <span className="font-semibold text-[#16233a]">{found.group}</span>
              </p>
              <div className="mt-3 rounded-lg bg-white/80 p-3 text-[13px] text-[#8d6e63]">
                ⏳ <strong>ข้อมูลใบหน้าอยู่ระหว่างรอคุณครูอนุมัติ</strong>
                <p className="mt-1 text-[12px] text-[#5b6b82]">
                  ระบบได้รับข้อมูลแล้ว โปรดแจ้งครูประจำชั้นหรือครูผู้สอนเพื่อกดยืนยันอนุมัติ เมื่ออนุมัติแล้วจะสามารถสแกนหน้าได้ทันที
                </p>
              </div>
            </div>
          ) : found.faceStatus === "unregistered" ? (
            /* กรณียังไม่ลงทะเบียนใบหน้า */
            <div className="rounded-xl border border-[#cbe2f8] bg-[#eef6fc] p-4 text-center">
              <p className="text-[16px] font-bold text-[#16233a]">{found.name}</p>
              <p className="mt-1 text-[13px] text-[#5b6b82]">
                รหัส <span className="font-mono font-semibold text-[#16233a]">{found.code}</span> · ห้อง <span className="font-semibold text-[#16233a]">{found.group}</span>
              </p>
              <p className="mt-2 text-[12.5px] text-[#e65100]">
                ⚠️ ยังไม่ได้ลงทะเบียนใบหน้าในระบบ
              </p>
              <UIButton
                onClick={() => setMode("self_enroll")}
                className="mt-3 h-11 w-full text-[14.5px] font-bold"
              >
                📸 ถ่ายภาพลงทะเบียนใบหน้า (รอครูอนุมัติ)
              </UIButton>
            </div>
          ) : (
            /* กรณีลงทะเบียนแล้ว (กดเพื่อเริ่มสแกนหน้า) */
            <div className="rounded-xl border border-[#cbe2f8] bg-[#eef6fc] p-4 text-center">
              <p className="text-[16px] font-bold text-[#16233a]">{found.name}</p>
              <p className="mt-1 text-[13px] text-[#5b6b82]">
                รหัส <span className="font-mono font-semibold text-[#16233a]">{found.code}</span> · ห้อง <span className="font-semibold text-[#16233a]">{found.group}</span>
              </p>
              <UIButton
                onClick={() => setMode("face_unlock")}
                className="mt-3.5 h-11 w-full text-[15px] font-bold"
              >
                📷 สแกนใบหน้าปลดล็อก (Face Unlock)
              </UIButton>
              {found.hasPin ? (
                <button
                  type="button"
                  onClick={() => setMode("pin_unlock")}
                  className="mt-2 block w-full text-center text-[13px] font-medium text-[#2474c6] hover:underline"
                >
                  🔑 หรือเข้าสู่ระบบด้วยรหัส PIN
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <p className="text-center text-[12px] text-[#8a97ab]">
        ระบบความปลอดภัยสแกนใบหน้า (Face Unlock) ป้องกันการแอบดูข้อมูลเพื่อน
      </p>
    </div>
  );
}

export function LoginForm() {
  const [tab, setTab] = useState<"teacher" | "student">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect");
      if (redirect && redirect.includes("student")) return "student";
    }
    return "teacher";
  });

  if (!isSupabaseConfigured) {
    return (
      <p className="rounded-lg bg-[#fef6ec] px-4 py-3 text-center text-[14px] font-semibold text-[#e65100]">
        ยังไม่เชื่อมต่อ Supabase — ใช้งานโหมด Local ไม่ต้องล็อกอิน
      </p>
    );
  }

  return (
    <div>
      <InAppBrowserNotice />
      <div className="mb-4 flex flex-col items-center gap-2 text-center">
        <BrandMark size={64} />
        <p className="text-[20px] font-bold text-[#16233a]">LOOKMEE Check In-Out</p>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-[#eef3f9] p-1" role="tablist" aria-label="เลือกประเภทผู้ใช้">
        {(["teacher", "student"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? "h-10 rounded-md bg-white text-[14.5px] font-bold text-[#16233a] shadow-sm"
                : "h-10 rounded-md text-[14.5px] font-semibold text-[#5b6b82]"
            }
          >
            {t === "teacher" ? "ฝั่งครู" : "ฝั่งนักเรียน"}
          </button>
        ))}
      </div>
      {tab === "teacher" ? <TeacherForm /> : <StudentForm />}
    </div>
  );
}

export function LoginCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eaf1f8] p-4">
      <Card className="w-full max-w-sm p-6">{children}</Card>
    </div>
  );
}
