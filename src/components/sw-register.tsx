"use client";

import { useEffect } from "react";

/** ลงทะเบียน service worker (แคชไฟล์คงที่ให้โหลดซ้ำไว) */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
