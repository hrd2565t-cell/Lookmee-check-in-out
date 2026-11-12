"use client";

import { useEffect, useState, useMemo } from "react";
import QRCode from "qrcode";
import { Modal, UIButton } from "@/components/ui";
import {
  fetchSchoolSecuritySettings,
  computeRollingToken,
  getCurrentTimeStep,
  type SchoolSecuritySettings,
} from "@/lib/school-security";

export function SessionQrModal({
  open,
  onClose,
  groupName,
  pin,
}: {
  open: boolean;
  onClose: () => void;
  groupName: string;
  pin: string | null;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [securitySettings, setSecuritySettings] = useState<SchoolSecuritySettings | null>(null);
  const [nowSec, setNowSec] = useState<number>(() => Math.floor(Date.now() / 1000));

  // โหลดการตั้งค่าความปลอดภัย
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const s = await fetchSchoolSecuritySettings();
      if (!cancelled) setSecuritySettings(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // ตัวนับเวลาถอยหลัง 1 วินาที เพื่อหมุนเวียน QR Code สด
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [open]);

  const dynamicEnabled = securitySettings?.dynamic_qr_enabled ?? true;
  const intervalSec = securitySettings?.dynamic_qr_interval_sec || 30;
  const remainingSec = intervalSec - (nowSec % intervalSec);
  const currentStep = Math.floor(nowSec / intervalSec);

  // คำนวณ shareUrl แบบ Dynamic หรือ Static
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const base = `${window.location.origin}/student/scan?openExternalBrowser=1`;
    if (!pin) return base;

    if (dynamicEnabled) {
      const token = computeRollingToken(pin, currentStep);
      return `${base}&pin=${encodeURIComponent(pin)}&token=${encodeURIComponent(token)}&ts=${currentStep}`;
    }
    return `${base}&pin=${encodeURIComponent(pin)}`;
  }, [dynamicEnabled, pin, currentStep]);

  useEffect(() => {
    if (!open || !shareUrl) return;
    QRCode.toDataURL(shareUrl, {
      width: 480,
      margin: 2,
      color: {
        dark: "#16233a",
        light: "#ffffff",
      },
      errorCorrectionLevel: "M",
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => {});
  }, [open, shareUrl]);

  const copyLineLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // fallback
    }
  };

  if (!open) return null;

  const progressPercent = Math.round((remainingSec / intervalSec) * 100);

  return (
    <Modal
      title={`QR Code เช็กชื่อ — ${groupName}`}
      onClose={onClose}
    >
      <div className="flex flex-col items-center p-1 sm:p-2 text-center">
        <p className="text-[14px] text-[#5b6b82]">
          ฉายขึ้นจอโปรเจกเตอร์หรือสมาร์ททีวีหน้าห้อง ให้นักเรียนสแกนเพื่อเข้าห้องทันที
        </p>

        {/* PIN Badge ขนาดใหญ่พิเศษ */}
        {pin ? (
          <div className="mt-3 flex flex-col items-center rounded-xl bg-[#16233a] px-6 py-2.5 text-white shadow-md">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-white/80">
              รหัสประจำรอบ (PIN)
            </span>
            <span className="mt-0.5 text-[34px] font-black tracking-[0.35em] text-[#3ecf6f]">
              {pin}
            </span>
          </div>
        ) : null}

        {/* Dynamic Rolling Notice & Countdown */}
        {dynamicEnabled && pin ? (
          <div className="mt-3 w-full max-w-sm rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-center shadow-2xs">
            <div className="flex items-center justify-between text-[12px] font-bold text-emerald-800">
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600"></span>
                </span>
                <span>QR Code สด ป้องกันการแคปจอ</span>
              </span>
              <span className="font-mono text-[13px] text-emerald-900">
                เปลี่ยนใน {remainingSec} วินาที
              </span>
            </div>
            {/* Progress Bar */}
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-emerald-200/60">
              <div
                className="h-full bg-emerald-500 transition-all duration-1000 ease-linear"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        ) : null}

        {/* QR Code Canvas / Image */}
        <div className="relative mt-3 flex items-center justify-center rounded-2xl border-4 border-[#16233a] bg-white p-3 shadow-lg">
          {qrDataUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={qrDataUrl}
              alt={`QR Code สำหรับเช็กชื่อกลุ่ม ${groupName}`}
              className="h-64 w-64 object-contain sm:h-80 sm:w-80"
            />
          ) : (
            <div className="flex h-64 w-64 items-center justify-center sm:h-80 sm:w-80">
              <span className="text-[14px] text-[#5b6b82]">กำลังสร้าง QR Code...</span>
            </div>
          )}
        </div>

        <div className="mt-3.5 max-w-sm rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-center shadow-2xs">
          <p className="flex items-center justify-center gap-1.5 text-[13px] font-bold text-amber-900">
            <span>📸</span>
            <span>แนะนำ: ใช้แอปกล้องถ่ายรูปปกติของมือถือสแกน</span>
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-amber-800">
            หลีกเลี่ยงการสแกนด้วยแอป LINE เพราะ LINE จะบล็อกกล้อง — หากเปิดใน LINE ให้แตะจุด 3 จุด (⋮) ด้านล่างขวา แล้วเลือก &ldquo;เปิดในเบราว์เซอร์อื่น&rdquo;
          </p>
        </div>

        {/* ปุ่มลัดคัดลอกลิงก์ส่ง LINE */}
        <div className="mt-4 flex w-full flex-wrap justify-center gap-2">
          <UIButton
            variant="green"
            onClick={() => void copyLineLink()}
            className="h-11 px-5 text-[14px] font-bold shadow-sm"
          >
            {copied ? "✓ คัดลอกลิงก์เรียบร้อย!" : "📋 คัดลอกลิงก์ส่งให้นักเรียน"}
          </UIButton>
          <UIButton
            variant="blue"
            onClick={onClose}
            className="h-11 px-5 text-[14px] font-medium"
          >
            ปิดหน้าต่าง
          </UIButton>
        </div>
      </div>
    </Modal>
  );
}
