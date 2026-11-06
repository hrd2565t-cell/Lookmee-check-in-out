"use client";

/**
 * เล่นเสียงสัญญาณความสำเร็จ (Web Audio API สังเคราะห์เสียงกระดิ่งใส ไม่ต้องโหลดไฟล์ mp3 ภายนอก)
 */
export function playSuccessChime(): void {
  if (typeof window === "undefined") return;

  try {
    // สั่นมือถือเบา ๆ (ถ้าเครื่องรองรับ)
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([100, 50, 120]);
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // โน้ตที่ 1: D5 (587.33 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // โน้ตที่ 2: A5 (880 Hz) ชัดใส
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.2, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.6);

    setTimeout(() => {
      void ctx.close();
    }, 700);
  } catch {
    // ป้องกัน error ในเบราว์เซอร์ที่ไม่รองรับ
  }
}
