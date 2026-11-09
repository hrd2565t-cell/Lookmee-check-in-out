"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Modal, UIButton } from "@/components/ui";

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

  // สร้าง URL ที่มี ?openExternalBrowser=1 และ &pin=XXXX เพื่อให้นักเรียนไม่ต้องพิมพ์รหัสเอง และส่งตรงเข้าหน้าสแกน
  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/student/scan?openExternalBrowser=1${pin ? `&pin=${encodeURIComponent(pin)}` : ""}`
    : "";

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

        {/* QR Code Canvas / Image */}
        <div className="relative mt-4 flex items-center justify-center rounded-2xl border-4 border-[#16233a] bg-white p-3 shadow-lg">
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
            {copied ? "✓ คัดลอกลิงก์ส่ง LINE เรียบร้อย!" : "📋 คัดลอกลิงก์ส่งใน LINE (เปิด Chrome ทันที)"}
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
