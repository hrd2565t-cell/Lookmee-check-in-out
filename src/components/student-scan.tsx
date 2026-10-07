"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StudentShell } from "@/components/student-shell";
import { Card, UIButton } from "@/components/ui";
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
  type StudentIdentity,
} from "@/lib/student";

const THRESHOLD = 0.55;

export default function StudentScanPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<StudentIdentity | null>(null);
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
    const res = await studentCheckin(code);
    if (res === "saved") {
      setNotice(`เช็กชื่อสำเร็จ — ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`);
      setDone(true);
    } else if (res === "duplicate") {
      setNotice("เช็กชื่อวันนี้ไปแล้ว");
      setDone(true);
    } else {
      setNotice("บันทึกไม่ได้ — ลองอีกครั้ง");
    }
  }, []);

  useEffect(() => {
    const code = getStudentCode();
    if (!code) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const video = videoRef.current;
    (async () => {
      const id = await lookupStudent(code);
      if (cancelled) return;
      if (!id) {
        router.replace("/login");
        return;
      }
      identityRef.current = id;
      setIdentity(id);
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
  }, [doCheckin, router]);

  return (
    <StudentShell
      name={identity?.name ?? "..."}
      group={identity ? `${identity.code} · ${identity.group}` : "..."}
      active="scan"
    >
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
    </StudentShell>
  );
}
