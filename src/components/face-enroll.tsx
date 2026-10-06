"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, UIButton } from "@/components/ui";
import {
  averageDescriptors,
  closeCamera,
  descriptorFromVideo,
  ensureFaceModels,
  openCamera,
} from "@/lib/face";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import type { Student } from "@/data/students";

const inputCls =
  "h-10 w-full rounded-lg border border-[#d8e0ec] bg-white px-3 text-[14px] text-[#16233a] placeholder:text-[#8a97ab] focus:border-[#2474c6] focus:outline-none";

/* 3 ท่าบังคับ — เฉลี่ย descriptor หลายมุมให้จำแม่นตอนสแกนจริง */
const POSES = [
  { label: "ท่าที่ 1: หน้าตรง", hint: "มองกล้องตรง ๆ ไม่ก้มไม่เงย" },
  { label: "ท่าที่ 2: หันซ้าย", hint: "หันหน้าทางซ้ายของตัวเองช้า ๆ" },
  { label: "ท่าที่ 3: หันขวา", hint: "หันหน้าทางขวาของตัวเองช้า ๆ" },
] as const;

/* ---------- ลงทะเบียนใบหน้าด้วยรหัสนักเรียน (ถ่าย 3 ช็อต) ---------- */
export function FaceEnrollModal({
  initialCode,
  students,
  onSaved,
  onClose,
}: {
  initialCode: string;
  students: Student[];
  onSaved: (code: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("กำลังเตรียมกล้อง...");
  const [shots, setShots] = useState<Float32Array[]>([]);
  const [saving, setSaving] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const found = useMemo(
    () => students.find((s) => s.studentId === code.trim()),
    [students, code],
  );

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
        await openCamera(video);
        if (!cancelled) {
          setReady(true);
          setStatus(`${POSES[0]?.label ?? ""}: ${POSES[0]?.hint ?? ""}`);
        }
      } catch {
        if (!cancelled) setStatus("เปิดกล้องไม่ได้ — ตรวจสิทธิ์กล้องของเบราว์เซอร์");
      }
    })();
    return () => {
      cancelled = true;
      closeCamera(video);
    };
  }, []);

  const photoRef = useRef<Blob | null>(null);

  // เก็บรูปหน้าตรง (ท่าแรก) ไว้เทียบตัวตนตอนเช็กสำรอง
  const snapshotFrontPhoto = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const scale = 480 / video.videoWidth;
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) photoRef.current = blob;
      },
      "image/jpeg",
      0.85,
    );
  };

  const capture = async () => {
    if (!videoRef.current || shots.length >= POSES.length) return;
    const pose = POSES[shots.length];
    setStatus(`กำลังจับใบหน้า${pose ? ` (${pose.label})` : ""}...`);
    const d = await descriptorFromVideo(videoRef.current);
    if (!d) {
      setStatus("ไม่พบใบหน้า — ขยับให้หน้าชัดแล้วถ่ายใหม่");
      return;
    }
    const next = [...shots, d];
    if (shots.length === 0) snapshotFrontPhoto(); // ท่าหน้าตรง = รูปอ้างอิง
    setShots(next);
    setStatus(
      next.length >= POSES.length
        ? "ครบ 3 ท่า — กดบันทึกได้เลย"
        : `${POSES[next.length]?.label ?? ""}: ${POSES[next.length]?.hint ?? ""}`,
    );
  };

  const save = async () => {
    if (!found || shots.length < POSES.length || saving) return;
    setSaving(true);
    setStatus("กำลังอัปโหลดรูป + บันทึก...");
    const avg = averageDescriptors(shots);
    if (isSupabaseConfigured) {
      let photoUrl: string | null = null;
      if (photoRef.current) {
        const path = `${found.studentId}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("face-photos")
          .upload(path, photoRef.current, {
            upsert: true,
            contentType: "image/jpeg",
          });
        if (upErr) {
          setStatus(`อัปโหลดรูปไม่สำเร็จ: ${upErr.message}`);
          setSaving(false);
          return;
        }
        const { data } = supabase.storage.from("face-photos").getPublicUrl(path);
        photoUrl = data.publicUrl;
      }
      const { error } = await supabase
        .from("students")
        .update({
          face_data: JSON.stringify(avg),
          face_status: "registered",
          ...(photoUrl ? { photo_url: photoUrl } : {}),
        })
        .eq("student_code", found.studentId);
      if (error) {
        setStatus(`บันทึกไม่สำเร็จ: ${error.message}`);
        setSaving(false);
        return;
      }
    }
    onSaved(found.studentId);
    onClose();
  };

  return (
    <Modal title="ลงทะเบียนใบหน้า" onClose={onClose}>
      <label className="block text-[14px] font-medium text-[#16233a]">
        รหัสนักเรียน
        <span className="mt-1 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="เช่น 47591"
            inputMode="numeric"
            className={inputCls}
          />
        </span>
      </label>
      {code.trim() !== "" ? (
        found ? (
          <p className="mt-1.5 text-[13.5px] font-semibold text-[#1e8e3e]">
            {found.thaiName} · {found.group}
          </p>
        ) : (
          <p className="mt-1.5 text-[13.5px] font-semibold text-[#c62828]">
            ไม่พบรหัสนี้ในระบบ
          </p>
        )
      ) : null}

      <div className="relative mt-3 overflow-hidden rounded-lg bg-[#3a4148]">
        <video
          ref={videoRef}
          muted
          playsInline
          className="aspect-[4/3] w-full object-cover"
        />
        {!ready ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 px-6 text-center text-[13.5px] text-white">
            {status}
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden="true">
        {POSES.map((p, i) => (
          <span
            key={p.label}
            title={p.label}
            className={
              shots.length > i
                ? "h-2.5 w-2.5 rounded-full bg-[#1e8e3e]"
                : "h-2.5 w-2.5 rounded-full bg-[#c9d2de]"
            }
          />
        ))}
      </div>

      {/* คำสั่งท่าปัจจุบัน */}
      <div className="mt-2 rounded-lg bg-[#e8f1fb] px-3 py-2 text-center">
        {shots.length >= POSES.length ? (
          <p className="text-[14px] font-bold text-[#1e8e3e]">ครบ 3 ท่าแล้ว</p>
        ) : (
          <>
            <p className="text-[14px] font-bold text-[#1a5da3]">
              {POSES[shots.length]?.label}
            </p>
            <p className="text-[12.5px] text-[#5b6b82]">
              {POSES[shots.length]?.hint}
            </p>
          </>
        )}
        <p className="mt-1 text-[11.5px] text-[#8a97ab]">
          แสงพอ · ถอดแมสก์ · อย่าก้ม/เงย
        </p>
      </div>

      <p role="status" className="mt-2 text-center text-[13px] text-[#5b6b82]">
        {status}
      </p>

      <div className="mt-3 flex gap-2">
        <UIButton
          variant="blue"
          onClick={() => void capture()}
          disabled={!ready || !found || shots.length >= POSES.length}
          className="h-11 flex-1 disabled:opacity-40"
        >
          ถ่ายภาพ ({shots.length}/{POSES.length})
        </UIButton>
        <UIButton
          variant="green"
          onClick={() => void save()}
          disabled={!found || shots.length < POSES.length || saving}
          className="h-11 flex-1 disabled:opacity-40"
        >
          {saving ? "กำลังบันทึก..." : "บันทึกใบหน้า"}
        </UIButton>
      </div>
    </Modal>
  );
}
