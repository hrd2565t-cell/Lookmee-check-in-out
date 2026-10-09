"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, UIButton } from "@/components/ui";
import { BrandMark } from "@/components/logo";
import { EyeIcon, EyeOffIcon } from "@/components/icons";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import {
  lookupStudent,
  setStudentCode,
  type StudentIdentity,
} from "@/lib/student";
import {
  closeCamera,
  descriptorFromVideo,
  ensureFaceModels,
  openCamera,
} from "@/lib/face";

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

function StudentForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [found, setFound] = useState<StudentIdentity | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [faceMsg, setFaceMsg] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const foundRef = useRef<StudentIdentity | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFound(null);
    foundRef.current = null;
    setVerifying(false);
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
    foundRef.current = st;
    setFound(st);
    // มีใบหน้าลงทะเบียน → ขั้นสแกนยืนยันว่าเป็นเจ้าของรหัสจริง
    if (st.descriptor) setVerifying(true);
  };

  const enter = () => {
    const st = foundRef.current ?? found;
    if (!st) return;
    setStudentCode(st.code);
    router.push("/student");
    router.refresh();
  };

  // สแกนเทียบใบหน้า 1:1 กับรหัสที่กรอก
  useEffect(() => {
    if (!verifying) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const video = videoRef.current;
    (async () => {
      try {
        if (!window.isSecureContext) {
          setFaceMsg("ต้องเปิดผ่าน HTTPS กล้องถึงจะทำงาน");
          return;
        }
        setFaceMsg("กำลังโหลดโมเดลใบหน้า...");
        await ensureFaceModels();
        if (cancelled || !video) return;
        await openCamera(video);
        if (cancelled) return;
        setFaceMsg("ส่องหน้าเพื่อยืนยันว่าเป็นเจ้าของรหัส");
        timer = setInterval(() => {
          void (async () => {
            const target = foundRef.current?.descriptor;
            if (cancelled || !target) return;
            const desc = await descriptorFromVideo(video);
            if (!desc) return;
            let sum = 0;
            for (let i = 0; i < desc.length; i++) {
              const diff = (desc[i] ?? 0) - (target[i] ?? 0);
              sum += diff * diff;
            }
            if (Math.sqrt(sum) > 0.55) return;
            if (timer) clearInterval(timer);
            enter();
          })();
        }, 1000);
      } catch {
        if (!cancelled) setFaceMsg("เปิดกล้องไม่ได้ — กดเข้าสู่ระบบได้เลยถ้าเป็นเจ้าของรหัส");
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      closeCamera(video);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifying]);

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
        <div className="rounded-lg bg-[#e8f1fb] px-4 py-3 text-center">
          <p className="text-[16px] font-bold text-[#16233a]">{found.name}</p>
          <p className="text-[13px] text-[#5b6b82]">
            {found.code} · {found.group}
          </p>
          {verifying ? (
            <div className="mt-2">
              <div className="relative overflow-hidden rounded-lg bg-[#3a4148]">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>
              <p role="status" className="mt-2 text-[13px] text-[#5b6b82]">{faceMsg}</p>
              <div className="mt-2 flex gap-2">
                <UIButton
                  variant="blue"
                  onClick={() => {
                    setVerifying(false);
                    setFound(null);
                    foundRef.current = null;
                  }}
                  className="h-10 flex-1 bg-[#5b6b82] hover:bg-[#465364] focus-visible:ring-[#5b6b82]/40"
                >
                  ยกเลิก
                </UIButton>
                <UIButton onClick={enter} className="h-10 flex-1">
                  ข้าม (เป็นเจ้าของรหัส)
                </UIButton>
              </div>
            </div>
          ) : (
            <UIButton onClick={enter} className="mt-2 h-11 w-full">
              เข้าสู่ระบบ
            </UIButton>
          )}
        </div>
      ) : null}
      <p className="text-center text-[12px] text-[#8a97ab]">
        ไม่ต้องใช้รหัสผ่าน — เห็นเฉพาะประวัติของตัวเองเท่านั้น
      </p>
    </div>
  );
}

export function LoginForm() {
  const [tab, setTab] = useState<"teacher" | "student">("teacher");

  if (!isSupabaseConfigured) {
    return (
      <p className="rounded-lg bg-[#fef6ec] px-4 py-3 text-center text-[14px] font-semibold text-[#e65100]">
        ยังไม่เชื่อมต่อ Supabase — ใช้งานโหมด Local ไม่ต้องล็อกอิน
      </p>
    );
  }

  return (
    <div>
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
