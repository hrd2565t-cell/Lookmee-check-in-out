"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { flushQueue, pendingCount } from "@/lib/offline-queue";
import { RefreshIcon } from "@/components/icons";

export function DbStatusBadge() {
  const [online, setOnline] = useState<boolean>(() =>
    typeof window === "undefined" ? true : window.navigator.onLine,
  );
  const [connected, setConnected] = useState<boolean | null>(() =>
    !isSupabaseConfigured ? false : null,
  );
  const [pending, setPending] = useState<number>(() =>
    typeof window === "undefined" ? 0 : pendingCount(),
  );
  const [syncing, setSyncing] = useState<boolean>(false);

  const checkConnection = async () => {
    if (!isSupabaseConfigured) {
      setConnected(false);
      return;
    }
    if (typeof window !== "undefined" && !window.navigator.onLine) {
      setOnline(false);
      setConnected(false);
      return;
    }
    try {
      const { error } = await supabase.from("class_groups").select("id").limit(1);
      setConnected(!error);
    } catch {
      setConnected(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await flushQueue();
      setPending(res.remaining);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const { error } = await supabase.from("class_groups").select("id").limit(1);
        if (!cancelled) setConnected(!error);
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    void probe();

    const handleOnline = () => {
      setOnline(true);
      void checkConnection();
      void sync();
    };
    const handleOffline = () => {
      setOnline(false);
      setConnected(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = setInterval(() => {
      setPending(pendingCount());
    }, 15000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  if (pending > 0) {
    return (
      <button
        type="button"
        onClick={() => void sync()}
        disabled={syncing}
        title="มีข้อมูลสแกนค้างอยู่ในเครื่องนี้ คลิกเพื่อซิงก์ขึ้นเซิร์ฟเวอร์"
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11.5px] font-bold text-amber-900 transition hover:bg-amber-200 active:scale-95"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        </span>
        <span>{syncing ? "กำลังซิงก์..." : `ค้างซิงก์ ${pending}`}</span>
        <RefreshIcon className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
      </button>
    );
  }

  if (connected === false || !online) {
    return (
      <button
        type="button"
        onClick={() => void checkConnection()}
        title="ไม่สามารถเชื่อมต่อฐานข้อมูล Cloud ได้ คลิกเพื่อลองเชื่อมต่อใหม่"
        className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[11.5px] font-semibold text-rose-700 hover:bg-rose-100"
      >
        <span className="h-2 w-2 rounded-full bg-rose-500" />
        <span className="hidden sm:inline">ต่อฐานข้อมูลไม่ได้</span>
        <RefreshIcon className="h-3 w-3" />
      </button>
    );
  }

  return (
    <div
      title="เชื่อมต่อฐานข้อมูล Cloud (Supabase) เรียบร้อยแล้ว ข้อมูลซิงก์ตรงกันทุกเครื่อง"
      className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11.5px] font-medium text-emerald-800 md:inline-flex"
    >
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      <span>คลาวด์ออนไลน์</span>
    </div>
  );
}
