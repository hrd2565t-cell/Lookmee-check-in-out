"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardTitle, UIButton } from "@/components/ui";
import { CameraSwitchIcon, RefreshIcon } from "@/components/icons";
import {
  averageDescriptors,
  closeCamera,
  descriptorFromVideo,
  ensureFaceModels,
  getCameraErrorMessage,
  openCamera,
  type CameraFacingMode,
} from "@/lib/face";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { playSuccessChime } from "@/lib/sound";

const POSES = [
  { label: "ท่าที่ 1: หน้าตรง", hint: "มองกล้องตรง ๆ ให้ใบหน้าอยู่ในกรอบ" },
  { label: "ท่าที่ 2: หันซ้ายเล็กน้อย", hint: "เอียงหน้าไปทางซ้ายของตัวเองช้า ๆ" },
  { label: "ท่าที่ 3: หันขวาเล็กน้อย", hint: "เอียงหน้าไปทางขวาของตัวเองช้า ๆ" },
] as const;

export function StudentSelfEnroll({
  studentCode,
  studentName,
  onEnrolled,
}: {
  studentCode: string;
  studentName: string;
  onEnrolled: (descriptor: number[]) => void;
}) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("กำลังเตรียมกล้อง...");
  const [shots, setShots] = useState<Float32Array[]>([]);
  const [saving, setSaving] = useState(false);
  const [facingMode, setFacingMode] = useState<CameraFacingMode>("user");
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoRef = useRef<Blob | null>(null);

  const toggleCamera = async () => {
    const nextMode: CameraFacingMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);
    setStatus(`กำลังสลับเป็น${nextMode === "user" ? "กล้องหน้า" : "กล้องหลัง"}...`);
    const video = videoRef.current;
    if (!video) return;
    try {
      await openCamera(video, nextMode);
      setReady(true);
      setStatus(`${POSES[shots.length]?.label ?? ""}: ${POSES[shots.length]?.hint ?? ""}`);
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
      setStatus(`${POSES[shots.length]?.label ?? ""}: ${POSES[shots.length]?.hint ?? ""}`);
    } catch (err) {
      setReady(false);
      setStatus(getCameraErrorMessage(err));
    }
  };

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    (async () => {
      try {
        if (!window.isSecureContext) {
          setStatus("ต้องเปิดผ่าน HTTPS หรือ localhost กล้องถึงจะทำงาน");
          return;
        }
        await ensureFaceModels((m) => {
          if (!cancelled) setStatus(m);
        });
        if (cancelled || !video) return;
        await openCamera(video, facingMode);
        if (!cancelled) {
          setReady(true);
          setStatus(`${POSES[0]?.label ?? ""}: ${POSES[0]?.hint ?? ""}`);
        }
      } catch (err) {
        if (!cancelled) {
          setReady(false);
          setStatus(getCameraErrorMessage(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      closeCamera(video);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshotFrontPhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          photoRef.current = blob;
        }
      },
      "image/jpeg",
      0.85,
    );
  };

  const captureShot = async () => {
    if (!videoRef.current || shots.length >= POSES.length) return;
    const pose = POSES[shots.length];
    setStatus(`กำลังตรวจจับใบหน้า${pose ? ` (${pose.label})` : ""}...`);
    const d = await descriptorFromVideo(videoRef.current);
    if (!d) {
      setStatus("ไม่พบใบหน้าชัดเจน — ขยับหน้าให้อยู่ในกรอบแล้วถ่ายใหม่");
      return;
    }
    const next = [...shots, d];
    if (shots.length === 0) snapshotFrontPhoto();
    setShots(next);
    if (next.length >= POSES.length) {
      setStatus("✓ ครบ 3 ท่าแล้ว — กดปุ่ม 'บันทึกใบหน้า' ด้านล่างได้เลย");
    } else {
      setStatus(`${POSES[next.length]?.label ?? ""}: ${POSES[next.length]?.hint ?? ""}`);
    }
  };

  const saveEnrollment = async () => {
    if (shots.length < POSES.length || saving) return;
    setSaving(true);
    setStatus("กำลังบันทึกและอัปโหลดใบหน้า...");
    const avg = averageDescriptors(shots);

    try {
      if (isSupabaseConfigured) {
        let photoUrl: string | null = null;
        if (photoRef.current) {
          const path = `${studentCode}.jpg`;
          const { error: upErr } = await supabase.storage
            .from("face-photos")
            .upload(path, photoRef.current, {
              upsert: true,
              contentType: "image/jpeg",
            });
          if (!upErr) {
            const { data } = supabase.storage.from("face-photos").getPublicUrl(path);
            photoUrl = data.publicUrl;
          }
        }
        const { error } = await supabase
          .from("students")
          .update({
            face_data: JSON.stringify(avg),
            face_status: "registered",
            ...(photoUrl ? { photo_url: photoUrl } : {}),
          })
          .eq("student_code", studentCode);

        if (error) {
          setStatus(`บันทึกไม่สำเร็จ: ${error.message}`);
          setSaving(false);
          return;
        }
      }

      playSuccessChime();
      setStatus("✓ ลงทะเบียนใบหน้าสำเร็จแล้ว!");
      onEnrolled(avg);
    } catch {
      setStatus("เกิดข้อผิดพลาดในการเชื่อมต่อ — ลองอีกครั้ง");
      setSaving(false);
    }
  };

  const resetShots = () => {
    setShots([]);
    photoRef.current = null;
    setStatus(`${POSES[0]?.label ?? ""}: ${POSES[0]?.hint ?? ""}`);
  };

  return (
    <Card className="p-4 sm:p-5">
      <CardTitle className="text-center text-[18px]">
        📸 ลงทะเบียนใบหน้าครั้งแรก
      </CardTitle>
      <p className="mt-1 text-center text-[13px] text-[#5b6b82]">
        สวัสดี {studentName} ({studentCode}) — ถ่ายรูป 3 ท่า เพื่อให้ระบบจดจำใบหน้าสำหรับเช็กชื่อ
      </p>

      {/* Progress dots */}
      <div className="mt-3 flex items-center justify-center gap-2">
        {POSES.map((p, idx) => (
          <div
            key={p.label}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold ${
              idx < shots.length
                ? "bg-[#1e8e3e] text-white"
                : idx === shots.length
                  ? "border-2 border-[#2474c6] bg-[#e8f1fb] text-[#1a5da3]"
                  : "bg-[#eef2f7] text-[#8a97ab]"
            }`}
          >
            <span>{idx < shots.length ? "✓" : idx + 1}</span>
            <span className="hidden sm:inline">{p.label.split(":")[1]}</span>
          </div>
        ))}
      </div>

      {/* Status Bar */}
      <p
        role="status"
        className="mt-3 rounded-lg bg-[#f0f4f9] px-3 py-2 text-center text-[13.5px] font-semibold text-[#16233a]"
      >
        {status}
      </p>

      {/* Camera Viewport with oval guide */}
      <div className="relative mx-auto mt-3 max-w-[360px] overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`h-[360px] w-full object-cover ${facingMode === "user" ? "-scale-x-100" : ""}`}
        />

        {/* Oval Face Guide */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[260px] w-[200px] rounded-[50%] border-2 border-dashed border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>

        {/* Camera toggle button */}
        <button
          type="button"
          onClick={() => void toggleCamera()}
          className="absolute right-2.5 top-2.5 rounded-full bg-black/60 p-2 text-white shadow-md hover:bg-black/80"
          title="สลับกล้องหน้า/หลัง"
        >
          <CameraSwitchIcon className="h-5 w-5" />
        </button>

        {!ready && (
          <button
            type="button"
            onClick={() => void retryCamera()}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-[#2474c6] px-3 py-1.5 text-[12.5px] font-bold text-white shadow-md"
          >
            <RefreshIcon className="mr-1 inline h-3.5 w-3.5" /> ลองเปิดกล้องใหม่
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-col gap-2">
        {shots.length < POSES.length ? (
          <UIButton
            variant="blue"
            onClick={() => void captureShot()}
            disabled={!ready}
            className="h-12 w-full text-[15px] font-bold"
          >
            📸 ถ่ายภาพ {POSES[shots.length]?.label} ({shots.length + 1}/3)
          </UIButton>
        ) : (
          <UIButton
            variant="green"
            onClick={() => void saveEnrollment()}
            disabled={saving}
            className="h-12 w-full text-[15px] font-bold shadow-md"
          >
            {saving ? "กำลังบันทึก..." : "✓ ยืนยันและบันทึกใบหน้า"}
          </UIButton>
        )}

        {shots.length > 0 && (
          <button
            type="button"
            onClick={resetShots}
            disabled={saving}
            className="text-[13px] text-[#5b6b82] hover:underline"
          >
            ถ่ายใหม่ทั้งหมด
          </button>
        )}
      </div>
    </Card>
  );
}
