"use client";

import { useSyncExternalStore } from "react";

export function detectInAppBrowser(): {
  isInApp: boolean;
  isLine: boolean;
  isFacebook: boolean;
  isInstagram: boolean;
  isAndroid: boolean;
  isIOS: boolean;
} {
  if (typeof window === "undefined" || !window.navigator) {
    return {
      isInApp: false,
      isLine: false,
      isFacebook: false,
      isInstagram: false,
      isAndroid: false,
      isIOS: false,
    };
  }

  const ua = window.navigator.userAgent || "";
  const isLine = /Line\//i.test(ua) || /Line/i.test(ua);
  const isFacebook = /FBAN|FBAV|Messenger/i.test(ua);
  const isInstagram = /Instagram/i.test(ua);
  const isInApp = isLine || isFacebook || isInstagram || /MicroMessenger|Twitter|Snapchat/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  return { isInApp, isLine, isFacebook, isInstagram, isAndroid, isIOS };
}

/** คืน URL ที่ต่อท้าย ?openExternalBrowser=1 สำหรับ LINE */
export function getLineExternalUrl(currentUrl?: string): string {
  if (typeof window === "undefined") return currentUrl || "";
  const base = currentUrl || window.location.href;
  try {
    const url = new URL(base);
    url.searchParams.set("openExternalBrowser", "1");
    return url.toString();
  } catch {
    return base.includes("?")
      ? `${base}&openExternalBrowser=1`
      : `${base}?openExternalBrowser=1`;
  }
}

/** คืนค่า href สำหรับเปิดเบราว์เซอร์ภายนอก (Intent บน Android หรือ URL พร้อม openExternalBrowser=1 บน iOS) */
export function getExternalBrowserHref(currentUrl?: string): string {
  if (typeof window === "undefined") return currentUrl || "#";
  const targetUrl = getLineExternalUrl(currentUrl);
  const { isAndroid } = detectInAppBrowser();

  if (isAndroid) {
    const cleanUrl = targetUrl.replace(/^https?:\/\//, "");
    return `intent://${cleanUrl}#Intent;scheme=https;package=com.android.chrome;end`;
  }
  return targetUrl;
}

/** เปิดในเบราว์เซอร์จริงภายนอก (Chrome บน Android หรือ Safari บน iOS) */
export function openInExternalBrowser(): void {
  if (typeof window === "undefined") return;
  const targetUrl = getLineExternalUrl();
  const { isAndroid } = detectInAppBrowser();

  if (isAndroid) {
    // บน Android สามารถเรียกผ่าน intent เพื่อเปิด Google Chrome โดยตรง
    try {
      const cleanUrl = targetUrl.replace(/^https?:\/\//, "");
      const chromeIntent = `intent://${cleanUrl}#Intent;scheme=https;package=com.android.chrome;end`;
      const a = document.createElement("a");
      a.href = chromeIntent;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        // Fallback: ถ้าไม่มี Chrome ให้เปิดเบราว์เซอร์มาตรฐานของเครื่อง
        const genericIntent = `intent://${cleanUrl}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
        const aGen = document.createElement("a");
        aGen.href = genericIntent;
        document.body.appendChild(aGen);
        aGen.click();
        document.body.removeChild(aGen);
      }, 600);
      return;
    } catch {
      window.location.href = targetUrl;
    }
  } else {
    // บน iOS / LINE เมื่อเปิด URL ที่มี openExternalBrowser=1 LINE จะส่งต่อให้ Safari อัตโนมัติ
    window.location.href = targetUrl;
  }
}

const emptySubscribe = () => () => {};

/** แบนเนอร์แจ้งเตือนและปุ่มเปิดเบราว์เซอร์ภายนอก */
export function InAppBrowserNotice() {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!isClient) return null;
  const info = detectInAppBrowser();
  if (!info.isInApp) return null;

  const directHref = getExternalBrowserHref();

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-3.5 text-[#7c2d12] shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="text-2xl leading-none">⚠️</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold text-[#9a3412]">
            {info.isLine
              ? "ตรวจพบว่ากำลังเปิดผ่านแอป LINE (กล้องอาจถูกบล็อก)"
              : "ตรวจพบว่าเปิดผ่านเบราว์เซอร์ในแอป (In-App Browser)"}
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[#7c2d12]">
            ระบบ Webview ของแอปมักไม่อนุญาตให้ใช้กล้องสแกนใบหน้า เพื่อให้เปิดกล้องได้ปกติ 100% โปรดแตะปุ่มด้านล่างเพื่อเปิดใน <strong>Google Chrome</strong> หรือ <strong>Safari</strong>
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <a
              href={directHref}
              onClick={() => {
                // สำหรับกรณีที่คลิก intent ตรงๆ บนบางเวอร์ชัน
                if (info.isAndroid) {
                  openInExternalBrowser();
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#16a34a] px-3.5 py-1.5 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-[#15803d] active:scale-95"
            >
              <span>🚀 เปิดใน Chrome / Safari ทันที</span>
            </a>
            <span className="text-[11.5px] text-[#9a3412]">
              {info.isLine
                ? "(หรือแตะปุ่ม ⋮ ด้านล่างขวา แล้วเลือก “เปิดในเบราว์เซอร์เริ่มต้น”)"
                : "(หรือแตะปุ่มแชร์แล้วเลือกเปิดในเบราว์เซอร์ภายนอก)"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
