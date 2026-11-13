"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StudentSummaryShell } from "@/components/student-summary";
import { Card, CardTitle, Modal, UIButton } from "@/components/ui";
import { CameraSwitchIcon, RefreshIcon } from "@/components/icons";
import {
  closeCamera,
  descriptorFromVideo,
  ensureFaceModels,
  getCameraErrorMessage,
  openCamera,
  type CameraFacingMode,
} from "@/lib/face";
import {
  getMyFaceDescriptor,
  getStudentCode,
  getStudentToken,
  lookupStudent,
  studentCheckin,
  studentGetHelpStatus,
  studentRequestCheckinHelp,
  verifyPin,
  type StudentIdentity,
} from "@/lib/student";
import {
  InAppBrowserNotice,
  detectInAppBrowser,
  getExternalBrowserHref,
  openInExternalBrowser,
} from "@/lib/in-app-browser";
import { playSuccessChime } from "@/lib/sound";
import { StudentSelfEnroll } from "@/components/student-self-enroll";
import {
  fetchSchoolSecuritySettings,
  calculateDistanceMeters,
  verifyRollingToken,
  getUserCurrentCoordinates,
  type SchoolSecuritySettings,
} from "@/lib/school-security";

const THRESHOLD = 0.55;

export default function StudentScanPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<StudentIdentity | null>(null);
  const [pin, setPin] = useState("");
  const [pinOk, setPinOk] = useState(false);
  const [pinMsg, setPinMsg] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const pinRef = useRef("");
  const [camStatus, setCamStatus] = useState("กำลังเตรียมกล้อง...");
  const [camOn, setCamOn] = useState(false);
  const [facingMode, setFacingMode] = useState<CameraFacingMode>("user");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const isScanningRef = useRef(false);
  const autoScanPausedRef = useRef(false);
  const scanAttemptsRef = useRef(0);
  const [autoScanPaused, setAutoScanPaused] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [helpSending, setHelpSending] = useState(false);
  const [helpPending, setHelpPending] = useState(false);
  const [helpMsg, setHelpMsg] = useState("");
  const [securitySettings, setSecuritySettings] = useState<SchoolSecuritySettings | null>(null);
  const [geoChecking, setGeoChecking] = useState(false);
  const [geoVerified, setGeoVerified] = useState<boolean | null>(null);
  const [geoDistance, setGeoDistance] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [qrExpired, setQrExpired] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const identityRef = useRef<StudentIdentity | null>(null);
  const cooldownRef = useRef(0);
  const geoVerifiedRef = useRef<boolean | null>(null);
  const securitySettingsRef = useRef<SchoolSecuritySettings | null>(null);

  const checkGeofence = useCallback(async (): Promise<boolean> => {
    const s = securitySettingsRef.current;
    if (!s?.geofence_enabled || !s.school_lat || !s.school_lng) {
      geoVerifiedRef.current = true;
      setGeoVerified(true);
      return true;
    }
    setGeoChecking(true);
    setGeoError(null);
    try {
      const pos = await getUserCurrentCoordinates();
      const dist = calculateDistanceMeters(
        pos.lat,
        pos.lng,
        s.school_lat,
        s.school_lng
      );
      setGeoDistance(dist);
      const maxRadius = s.school_radius_meters || 250;
      if (dist > maxRadius) {
        geoVerifiedRef.current = false;
        setGeoVerified(false);
        setGeoError(
          `🚫 คุณอยู่นอกพื้นที่โรงเรียน (ระยะห่างประมาณ ${dist.toLocaleString()} ม. / กำหนดไม่เกิน ${maxRadius} ม.) ไม่สามารถเช็คชื่อได้`
        );
        return false;
      }
      geoVerifiedRef.current = true;
      setGeoVerified(true);
      setGeoError(null);
      return true;
    } catch (err: any) {
      geoVerifiedRef.current = false;
      setGeoVerified(false);
      setGeoError(err?.message || "ไม่สามารถระบุพิกัด GPS ได้ กรุณาเปิดตำแหน่ง (Location) บนโทรศัพท์");
      return false;
    } finally {
      setGeoChecking(false);
    }
  }, []);

  const toggleCamera = async () => {
    const nextMode: CameraFacingMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);
    setCamStatus(`กำลังสลับเป็น${nextMode === "user" ? "กล้องหน้า" : "กล้องหลัง"}...`);
    const video = videoRef.current;
    if (!video) return;
    try {
      await openCamera(video, nextMode);
      setCamOn(true);
      setCamStatus(`กำลังส่องด้วย${nextMode === "user" ? "กล้องหน้า" : "กล้องหลัง"}...`);
    } catch (err) {
      setCamOn(false);
      setCamStatus(getCameraErrorMessage(err));
    }
  };

  const retryCamera = async () => {
    setCamStatus("กำลังลองเปิดกล้องใหม่...");
    const video = videoRef.current;
    if (!video) return;
    try {
      await openCamera(video, facingMode);
      setCamOn(true);
      setCamStatus(`ส่องหน้าด้วย${facingMode === "user" ? "กล้องหน้า" : "กล้องหลัง"}เพื่อเช็กชื่อ`);
    } catch (err) {
      setCamOn(false);
      setCamStatus(getCameraErrorMessage(err));
    }
  };

  const doCheckin = useCallback(async () => {
    const code = identityRef.current?.code;
    if (!code) return;

    // ตรวจสอบ Geofence ก่อนเช็คชื่อจริง
    const s = securitySettingsRef.current;
    if (s?.geofence_enabled && s.school_lat && s.school_lng) {
      if (geoVerifiedRef.current !== true) {
        const ok = await checkGeofence();
        if (!ok) {
          setNotice("🚫 คุณอยู่นอกพื้นที่โรงเรียน ไม่สามารถเช็คชื่อได้");
          return;
        }
      }
    }

    setIsCheckingIn(true);
    setNotice("กำลังบันทึก...");
    try {
      const res = await studentCheckin(code, pinRef.current || undefined);
      if (res === "saved") {
        playSuccessChime();
        setNotice(`✓ เช็กชื่อสำเร็จ — ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`);
        setDone(true);
        if (videoRef.current) closeCamera(videoRef.current);
        setCamOn(false);
      } else if (res === "duplicate") {
        setNotice("เช็กชื่อวันนี้ไปแล้ว");
        setDone(true);
        if (videoRef.current) closeCamera(videoRef.current);
        setCamOn(false);
      } else if (res === "no_session") {
        setNotice("ครูยังไม่เปิดรอบวันนี้ — รอครูเปิดรอบก่อน");
      } else if (res === "bad_pin") {
        setNotice("รหัสประจำรอบไม่ถูกต้อง — ขอใหม่จากครู");
        setPinOk(false);
      } else {
        setNotice("บันทึกไม่ได้ — ลองอีกครั้ง");
      }
    } finally {
      setIsCheckingIn(false);
    }
  }, [checkGeofence]);

  // โหมดกดถ่ายภาพสแกนใบหน้า (Single Shot) — ทำงานครั้งเดียว ไม่กินแรม ไม่ค้าง
  const captureSingleScan = async () => {
    const id = identityRef.current;
    const video = videoRef.current;
    if (!video || !id?.descriptor || isScanning || isScanningRef.current || isCheckingIn || done) return;

    // ตรวจสอบ Geofence ก่อนสแกน
    const s = securitySettingsRef.current;
    if (s?.geofence_enabled && s.school_lat && s.school_lng) {
      if (geoVerifiedRef.current !== true) {
        const ok = await checkGeofence();
        if (!ok) {
          setCamStatus("🚫 คุณอยู่นอกพื้นที่โรงเรียน — ไม่สามารถเช็คชื่อได้");
          return;
        }
      }
    }

    setIsScanning(true);
    isScanningRef.current = true;
    // ปลด pause และรีเซ็ตตัวนับรอบ เพื่อให้สแกนได้ทันที
    autoScanPausedRef.current = false;
    setAutoScanPaused(false);
    scanAttemptsRef.current = 0;

    setCamStatus("กำลังตรวจจับและเทียบใบหน้า...");
    try {
      const desc = await descriptorFromVideo(video);
      if (!desc) {
        setCamStatus("ไม่พบใบหน้า — ขยับหน้าให้อยู่ในกรอบวงรีแล้วแตะสแกนใหม่");
        return;
      }
      let sum = 0;
      for (let i = 0; i < desc.length; i++) {
        const diff = (desc[i] ?? 0) - (id.descriptor?.[i] ?? 0);
        sum += diff * diff;
      }
      const dist = Math.sqrt(sum);
      if (dist <= THRESHOLD) {
        setCamStatus("✓ ยืนยันใบหน้าตรงกัน — กำลังบันทึก...");
        await doCheckin();
      } else {
        setCamStatus("ใบหน้ายังไม่ตรงกับที่ลงทะเบียน — จัดมุมหน้าและแสงให้สว่าง แล้วแตะสแกนใหม่");
      }
    } catch (err) {
      console.error("Single scan error:", err);
      setCamStatus("ตรวจจับใบหน้าไม่สำเร็จ — ลองแตะสแกนใหม่ หรือกดขอให้ครูช่วยเช็คชื่อ");
    } finally {
      setIsScanning(false);
      isScanningRef.current = false;
    }
  };

  // ส่งคำขอให้ครูช่วยเช็คชื่อกรณีโทรศัพท์ค้าง / กล้องมีปัญหา
  const requestHelp = async () => {
    const code = identityRef.current?.code;
    if (!code || helpSending) return;

    // ตรวจสอบ Geofence ก่อนส่งคำขอ SOS
    const s = securitySettingsRef.current;
    if (s?.geofence_enabled && s.school_lat && s.school_lng) {
      if (geoVerifiedRef.current !== true) {
        const ok = await checkGeofence();
        if (!ok) {
          setHelpMsg("คุณอยู่นอกพื้นที่โรงเรียน ไม่สามารถส่งคำขอให้ครูช่วยเช็คชื่อได้");
          return;
        }
      }
    }

    setHelpSending(true);
    setHelpMsg("");
    try {
      const res = await studentRequestCheckinHelp(code, pinRef.current || undefined);
      if (res.ok) {
        setHelpPending(true);
        setHelpModalOpen(false);
        setNotice("⏳ ส่งคำขอให้คุณครูแล้ว — กำลังรอคุณครูกดอนุมัติที่หน้าจอครู...");
      } else if (res.result === "already_checked") {
        setNotice("เช็คชื่อวันนี้ไปแล้ว");
        setDone(true);
        setHelpModalOpen(false);
      } else {
        setHelpMsg(res.message || "ส่งคำขอไม่สำเร็จ — ตรวจสอบรหัส PIN ประจำรอบ");
      }
    } finally {
      setHelpSending(false);
    }
  };

  // คอยตรวจสอบสถานะเมื่อส่งคำขอช่วยเช็คชื่อไปหาครู
  useEffect(() => {
    if (!helpPending || done) return;
    const code = identityRef.current?.code;
    if (!code) return;

    const timer = setInterval(() => {
      void (async () => {
        const res = await studentGetHelpStatus(code);
        if (res.status === "approved") {
          playSuccessChime();
          setNotice(`✓ คุณครูอนุมัติการเช็คชื่อให้แล้วเรียบร้อย — ${new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.`);
          setDone(true);
          setHelpPending(false);
          if (videoRef.current) closeCamera(videoRef.current);
          setCamOn(false);
        } else if (res.status === "rejected") {
          setNotice("คุณครูปฏิเสธคำขอ — โปรดติดต่อคุณครูผู้สอน");
          setHelpPending(false);
        }
      })();
    }, 3000);

    return () => clearInterval(timer);
  }, [helpPending, done]);

  // หากเปิดผ่าน LINE พยายามดีดตัวออกไป Chrome/Safari อัตโนมัติ 1 ครั้ง
  useEffect(() => {
    if (typeof window === "undefined") return;
    const { isLine } = detectInAppBrowser();
    if (isLine) {
      const key = "lookmee_line_escape_attempted";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        openInExternalBrowser();
      }
    }
  }, []);

  // ขั้น 1: ยืนยันตัวตน + เก็บ PIN (รองรับ ?pin=... จากการสแกน QR Code)
  useEffect(() => {
    const code = getStudentCode();
    const token = getStudentToken();
    if (!code || !token) {
      const current = typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/student/scan";
      router.replace(`/login?redirect=${encodeURIComponent(current)}`);
      return;
    }
    let cancelled = false;
    // โหลดโมเดลล่วงหน้าขณะรอตรวจ PIN ช่วยลดเวลารอเปิดกล้องได้ 5-10 วินาที
    void ensureFaceModels();
    (async () => {
      const [id, myDescriptor, secSettings] = await Promise.all([
        lookupStudent(code),
        getMyFaceDescriptor(),
        fetchSchoolSecuritySettings(),
      ]);
      if (cancelled) return;
      if (!id) {
        router.replace("/login");
        return;
      }
      if (myDescriptor) {
        id.descriptor = myDescriptor;
      }
      identityRef.current = id;
      setIdentity(id);
      setSecuritySettings(secSettings);
      securitySettingsRef.current = secSettings;

      // ตรวจสอบ query string เผื่อสแกน QR Code เข้ามา
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const qPin = params.get("pin");
        const qToken = params.get("token");
        const qTs = params.get("ts");

        if (qPin && qPin.trim().length === 4) {
          // ตรวจสอบ Dynamic Rolling QR Code หากเปิดใช้งาน
          if (secSettings.dynamic_qr_enabled && qToken && qTs) {
            const isValid = verifyRollingToken(
              qPin.trim(),
              qToken.trim(),
              Number(qTs),
              secSettings.dynamic_qr_interval_sec || 30,
              6 // ยอมรับความล่าช้า 3 นาที เพื่อรองรับเน็ตช้าและเวลาเครื่องไม่ตรง
            );

            if (!isValid) {
              setQrExpired(true);
              setPinMsg("⚠️ QR Code นี้หมดอายุแล้ว (เปลี่ยนใหม่ทุก 30 วินาที เพื่อป้องกันการแคปจอส่งต่อ) กรุณาสแกนใหม่จากหน้าจอคุณครู");
              return;
            }
          }

          setPin(qPin.trim());
          const v = await verifyPin(id.code, qPin.trim());
          if (!cancelled && v.ok) {
            pinRef.current = qPin.trim();
            setPinOk(true);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // ตรวจสอบพิกัดโรงเรียนอัตโนมัติเบื้องหลังเมื่อโหลดหน้าเสร็จ
  useEffect(() => {
    if (securitySettings?.geofence_enabled && securitySettings.school_lat && securitySettings.school_lng) {
      void checkGeofence();
    }
  }, [securitySettings, checkGeofence]);

  // ขั้น 2: ตรวจ PIN แล้วค่อยเปิดกล้อง
  const verifyAndStart = async () => {
    const code = identityRef.current?.code;
    if (!code || pinBusy) return;
    if (pin.trim().length < 4) {
      setPinMsg("กรอกรหัส 4 หลักจากครู");
      return;
    }
    setPinBusy(true);
    const v = await verifyPin(code, pin.trim());
    setPinBusy(false);
    if (!v.ok) {
      setPinMsg("รหัสไม่ถูกต้อง — ขอรหัสประจำรอบจากครู");
      return;
    }
    pinRef.current = pin.trim();
    setPinMsg(v.legacy ? "รอบนี้ยังไม่มีรหัส (รอบเก่า) — สแกนได้เลย" : "");
    setPinOk(true);
  };

  useEffect(() => {
    if (!pinOk || done) return;
    const id = identityRef.current;
    if (!id) return;
    let cancelled = false;
    let isBusy = false;
    let loopTimer: ReturnType<typeof setTimeout> | null = null;
    const video = videoRef.current;

    // ตรวจสอบว่าเพิ่งผ่านการยืนยันใบหน้าจากการล็อกอินมาไม่เกิน 90 วินาทีหรือไม่
    // หากเพิ่งสแกนหน้าล็อกอินมาหมาดๆ ไม่จำเป็นต้องเปิดกล้องสแกนซ้ำสอง ช่วยลดภาระมือถือและเน็ตในห้องเรียนทันที
    if (typeof window !== "undefined") {
      try {
        const verifiedAt = sessionStorage.getItem("lookmee_face_verified_at");
        const verifiedCode = sessionStorage.getItem("lookmee_face_verified_code");
        if (verifiedAt && verifiedCode === id.code) {
          const diff = Date.now() - Number(verifiedAt);
          if (diff >= 0 && diff < 90_000) {
            sessionStorage.removeItem("lookmee_face_verified_at");
            sessionStorage.removeItem("lookmee_face_verified_code");
            setNotice("✓ ยืนยันตัวตนด้วยใบหน้าจากการเข้าสู่ระบบเรียบร้อย — กำลังบันทึกการเช็กชื่อ...");
            void doCheckin();
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    const runScanLoop = async () => {
      if (
        cancelled ||
        !videoRef.current ||
        !id.descriptor ||
        isBusy ||
        isScanningRef.current ||
        autoScanPausedRef.current
      ) {
        return;
      }
      isBusy = true;
      try {
        const desc = await descriptorFromVideo(videoRef.current);
        if (desc && !cancelled) {
          scanAttemptsRef.current = 0; // รีเซ็ตตัวนับเมื่อพบใบหน้า
          let sum = 0;
          for (let i = 0; i < desc.length; i++) {
            const diff = (desc[i] ?? 0) - (id.descriptor?.[i] ?? 0);
            sum += diff * diff;
          }
          const dist = Math.sqrt(sum);
          if (dist <= THRESHOLD) {
            if (Date.now() - cooldownRef.current >= 30_000) {
              cooldownRef.current = Date.now();
              setCamStatus("✓ ยืนยันใบหน้าตรงกัน — กำลังบันทึก...");
              await doCheckin();
              return; // หยุดลูปเมื่อเช็คชื่อสำเร็จ
            }
          } else {
            setCamStatus("ตรวจพบใบหน้าแล้ว กรุณามองตรงและนิ่งสักครู่...");
          }
        } else if (!cancelled) {
          scanAttemptsRef.current += 1;
          if (scanAttemptsRef.current >= 6) {
            // หากลอง 6 ครั้ง (~8 วินาที) แล้วยังไม่เจอหน้า ให้พักลูปเพื่อป้องกัน CPU ร้อนและมือถือค้าง
            autoScanPausedRef.current = true;
            setAutoScanPaused(true);
            setCamStatus("💡 หากตรวจจับไม่ติด ให้แตะปุ่ม '📸 แตะเพื่อสแกนใบหน้า' เพื่อสแกนทันที");
            return;
          }
          setCamStatus(`ส่องหน้าด้วย${facingMode === "user" ? "กล้องหน้า" : "กล้องหลัง"} — ให้ใบหน้าอยู่ในกรอบ`);
        }
      } catch (err) {
        console.error("Face scan error:", err);
      } finally {
        isBusy = false;
        if (!cancelled && !autoScanPausedRef.current) {
          loopTimer = setTimeout(() => {
            void runScanLoop();
          }, 1200); // 1200ms เพื่อถนอม CPU/GPU มือถือ
        }
      }
    };

    (async () => {
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
        await ensureFaceModels((msg) => setCamStatus(msg));
        if (cancelled || !video) return;
        await openCamera(video, facingMode);
        if (cancelled) return;
        setCamOn(true);
        setCamStatus(`ส่องหน้าด้วย${facingMode === "user" ? "กล้องหน้า" : "กล้องหลัง"} ระบบจะเช็กชื่อให้อัตโนมัติ`);
        // เริ่มวนลูปทีละเฟรม ไม่ซ้อนทับกัน
        loopTimer = setTimeout(() => {
          void runScanLoop();
        }, 500);
      } catch (err) {
        if (!cancelled) {
          setCamOn(false);
          setCamStatus(getCameraErrorMessage(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (loopTimer) clearTimeout(loopTimer);
      closeCamera(video);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doCheckin, router, pinOk, done]);

  if (!identity) {
    return (
      <StudentSummaryShell
        identity={{
          code: "",
          name: "...",
          group: "...",
          faceStatus: "unregistered",
          hasFace: false,
          descriptor: null,
          photo: null,
          hasPin: false,
        }}
        active="scan"
      >
        <p className="py-10 text-center text-[14px] text-[#5b6b82]">กำลังโหลด...</p>
      </StudentSummaryShell>
    );
  }

  // หากข้อมูลใบหน้ากำลังรอครูอนุมัติ
  if (identity.faceStatus === "pending") {
    return (
      <StudentSummaryShell identity={identity} active="scan">
        <InAppBrowserNotice />
        <Card className="p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#fef3c7] text-[26px] text-[#b45309]">
            ⏳
          </div>
          <CardTitle className="text-[18px] text-[#16233a]">ข้อมูลใบหน้าอยู่ระหว่างรอครูอนุมัติ</CardTitle>
          <p className="mt-2 text-[14px] leading-relaxed text-[#5b6b82]">
            ระบบได้รับข้อมูลใบหน้าของคุณแล้ว<br />
            โปรดแจ้งคุณครูประจำวิชาหรือครูประจำชั้นเพื่อกดยืนยันอนุมัติในระบบ<br />
            เมื่อคุณครูอนุมัติแล้ว จะสามารถสแกนใบหน้าเพื่อเช็คชื่อได้ทันที
          </p>
        </Card>
      </StudentSummaryShell>
    );
  }

  // หากยังไม่เคยลงทะเบียนใบหน้า ให้เปิดหน้าลงทะเบียนใบหน้าด้วยตนเอง
  if (!identity.hasFace || !identity.descriptor) {
    return (
      <StudentSummaryShell identity={identity} active="scan">
        <InAppBrowserNotice />
        <StudentSelfEnroll
          studentCode={identity.code}
          studentName={identity.name}
          onSubmitted={() => {
            setIdentity({
              ...identity,
              faceStatus: "pending",
            });
            if (identityRef.current) {
              identityRef.current.faceStatus = "pending";
            }
          }}
          onEnrolled={(desc) => {
            setIdentity({
              ...identity,
              faceStatus: "pending",
              hasFace: false,
              descriptor: desc,
            });
            if (identityRef.current) {
              identityRef.current.faceStatus = "pending";
              identityRef.current.hasFace = false;
              identityRef.current.descriptor = desc;
            }
          }}
        />
      </StudentSummaryShell>
    );
  }

  return (
    <StudentSummaryShell identity={identity} active="scan">
      <InAppBrowserNotice />

      {/* Dynamic QR Expired Warning */}
      {qrExpired && (
        <div className="mb-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-center shadow-xs">
          <div className="flex items-center justify-center gap-1.5 text-[15px] font-bold text-rose-900">
            <span>⏱️</span>
            <span>QR Code นี้หมดอายุแล้ว</span>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-rose-800">
            เพื่อความปลอดภัยและป้องกันการแคปภาพหน้าจอส่งต่อ QR Code จะเปลี่ยนรหัสใหม่ทุก 30 วินาที<br />
            <strong>กรุณาสแกน QR Code จากหน้าจอของคุณครูใหม่อีกครั้ง</strong>
          </p>
        </div>
      )}

      {/* Geofence Alert / Status */}
      {securitySettings?.geofence_enabled && securitySettings.school_lat && securitySettings.school_lng && (
        <div className="mb-3">
          {geoVerified === true ? (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-[12px] font-medium text-emerald-900 shadow-2xs">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>📍 อยู่ในบริเวณโรงเรียน</span>
              </span>
              {geoDistance !== null && (
                <span className="text-[11px] text-emerald-700">ห่างศูนย์กลาง {geoDistance} ม.</span>
              )}
            </div>
          ) : geoError ? (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-center shadow-xs">
              <p className="text-[13.5px] font-bold text-rose-900 flex items-center justify-center gap-1">
                <span>🚫</span>
                <span>ไม่สามารถเช็คชื่อนอกโรงเรียนได้</span>
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-rose-800">
                {geoError}
              </p>
              <UIButton
                variant="blue"
                type="button"
                onClick={() => void checkGeofence()}
                disabled={geoChecking}
                className="mt-2.5 h-8 px-4 text-[12px] font-bold"
              >
                {geoChecking ? "⏳ กำลังดึงพิกัด..." : "🔄 ตรวจสอบตำแหน่ง GPS อีกครั้ง"}
              </UIButton>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-[12px] text-blue-900">
              <span className="flex items-center gap-1">
                <span>📍</span>
                <span>ระบบกำลังตรวจสอบพิกัดโรงเรียน...</span>
              </span>
              <button
                type="button"
                onClick={() => void checkGeofence()}
                disabled={geoChecking}
                className="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {geoChecking ? "กำลังตรวจ..." : "ยืนยันพิกัด GPS"}
              </button>
            </div>
          )}
        </div>
      )}

      {!pinOk ? (
        <Card className="p-5">
          <CardTitle className="mb-1">รหัสประจำรอบจากครู</CardTitle>
          <p className="mb-3 text-[13.5px] text-[#5b6b82]">
            ขอรหัส 4 หลักที่ครูเปิดไว้หน้าห้อง แล้วกรอกเพื่อเริ่มสแกน
          </p>
          <div className="flex gap-2">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === "Enter") void verifyAndStart();
              }}
              placeholder="••••"
              inputMode="numeric"
              className="h-12 min-w-0 flex-1 rounded-lg border border-[#d8e0ec] bg-white px-3 text-center text-[20px] font-bold tracking-[0.4em] focus:border-[#2474c6] focus:outline-none"
            />
            <UIButton
              variant="green"
              onClick={() => void verifyAndStart()}
              disabled={pinBusy}
              className="h-12 shrink-0 disabled:opacity-40"
            >
              {pinBusy ? "..." : "เริ่มสแกน"}
            </UIButton>
          </div>
          {pinMsg ? (
            <p role="status" className="mt-2 rounded-lg bg-[#fef6ec] px-3 py-2 text-center text-[13.5px] font-semibold text-[#e65100]">
              {pinMsg}
            </p>
          ) : null}
        </Card>
      ) : (
      <Card className="overflow-hidden p-0">
        <div className="relative bg-[#3a4148]">
          <video
            ref={videoRef}
            muted
            playsInline
            className={camOn ? `aspect-[4/3] w-full object-cover ${facingMode === "user" ? "-scale-x-100" : ""}` : "hidden"}
          />
          {/* Biometric Face Oval Guide */}
          {camOn && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className={`h-[210px] w-[160px] rounded-[50%] border-2 transition-all duration-300 ${
                  isScanning || isCheckingIn
                    ? "border-[#42a5f5] shadow-[0_0_20px_rgba(66,165,245,0.8),0_0_0_9999px_rgba(0,0,0,0.35)]"
                    : "border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.5),0_0_0_9999px_rgba(0,0,0,0.25)]"
                }`}
              />
            </div>
          )}
          {/* ปุ่มสลับกล้องแบบลอยบนมุมขวา (แสดงเฉพาะตอนกล้องเปิดทำงาน) */}
          {camOn && (
            <button
              type="button"
              onClick={() => void toggleCamera()}
              className="absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[12px] font-semibold text-white shadow-md backdrop-blur-xs transition hover:bg-black/90 active:scale-95"
              title={`คลิกเพื่อสลับเป็น${facingMode === "user" ? "กล้องหลัง" : "กล้องหน้า"}`}
            >
              <CameraSwitchIcon className="h-3.5 w-3.5 text-emerald-400" />
              <span>{facingMode === "user" ? "กล้องหน้า" : "กล้องหลัง"}</span>
              <span className="rounded bg-white/25 px-1.5 py-0.5 text-[10.5px]">สลับ</span>
            </button>
          )}

          {!camOn ? (
            (() => {
              const inAppInfo = detectInAppBrowser();
              const isLineOrInApp =
                camStatus.includes("LINE") ||
                camStatus.includes("แอปนี้บล็อก") ||
                inAppInfo.isInApp;

              if (isLineOrInApp) {
                return (
                  <div className="flex min-h-[340px] flex-col items-center justify-center p-5 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20 text-3xl">
                      🔒
                    </div>
                    <p className="mt-3 text-[16px] font-bold text-amber-200">
                      แอป LINE ไม่อนุญาตให้เปิดกล้อง
                    </p>
                    <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-amber-100/90">
                      ระบบความปลอดภัยของ LINE บล็อกสิทธิ์กล้อง เพื่อให้สแกนหน้าได้ 100% โปรดเปิดผ่าน Chrome หรือ Safari
                    </p>

                    {/* ปุ่มเด่นสุดสำหรับเปิด Chrome/Safari */}
                    <a
                      href={getExternalBrowserHref()}
                      onClick={() => openInExternalBrowser()}
                      className="mt-4 flex w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 px-5 py-3 text-[14.5px] font-extrabold text-white shadow-lg shadow-emerald-950/40 transition hover:from-emerald-500 hover:to-green-500 active:scale-95 animate-pulse"
                    >
                      <span className="text-lg">🚀</span>
                      <span>แตะเปิดใน Chrome / Safari ทันที</span>
                    </a>

                    {/* คำแนะนำชี้เป้าจุดสามจุด (⋮) */}
                    <div className="mt-3.5 max-w-xs rounded-lg border border-amber-400/30 bg-black/50 px-3.5 py-2 text-[12px] leading-relaxed text-amber-200">
                      <span>👇 หรือแตะปุ่มจุดสามจุด <strong>(⋮)</strong> ที่มุมล่างขวาของหน้าจอ LINE แล้วเลือก <strong>&ldquo;เปิดในเบราว์เซอร์อื่น&rdquo;</strong></span>
                    </div>

                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => void retryCamera()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/25"
                      >
                        <RefreshIcon className="h-3.5 w-3.5" />
                        ลองเปิดกล้องใหม่
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleCamera()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/25"
                      >
                        <CameraSwitchIcon className="h-3.5 w-3.5" />
                        สลับกล้อง ({facingMode === "user" ? "ลองกล้องหลัง" : "ลองกล้องหน้า"})
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div className="flex min-h-[280px] flex-col items-center justify-center p-6 text-center">
                  <span className="text-3xl">📷</span>
                  <p className="mt-2 text-[14px] font-semibold text-rose-300">{camStatus}</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => void retryCamera()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#2474c6] px-3.5 py-1.5 text-[12.5px] font-bold text-white hover:bg-[#1d5ea2]"
                    >
                      <RefreshIcon className="h-3.5 w-3.5" />
                      ลองใหม่
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleCamera()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-white/20 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-white/30"
                    >
                      <CameraSwitchIcon className="h-3.5 w-3.5" />
                      สลับกล้อง ({facingMode === "user" ? "ลองกล้องหลัง" : "ลองกล้องหน้า"})
                    </button>
                  </div>
                </div>
              );
            })()
          ) : null}

          {/* ป้ายชื่อนักเรียน (แสดงเฉพาะเมื่อกล้องเปิดทำงาน เพื่อไม่ให้ทับปุ่มตอนกล้องไม่ทำงาน) */}
          {camOn && (
            <div className="absolute inset-x-0 bottom-0 bg-black/55 px-4 py-2.5 text-center">
              <p className="text-[15px] font-semibold text-white">
                {identity ? identity.name : "กำลังโหลด..."}
              </p>
            </div>
          )}
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
          <div className="mt-3 space-y-2.5">
            {done ? (
              <div className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[15px] font-bold text-white shadow-sm">
                <span>✓</span>
                <span>เช็กชื่อเรียบร้อยแล้ว</span>
              </div>
            ) : (
              <>
                {camOn && autoScanPaused && !isScanning && !isCheckingIn && (
                  <p className="text-center text-[12px] font-medium text-amber-700 bg-amber-50 rounded-lg py-1 px-2 border border-amber-200">
                    ⚡ พักการสแกนอัตโนมัติเพื่อถนอมเครื่อง — แตะปุ่มด้านล่างเพื่อสแกนใบหน้าทันที
                  </p>
                )}
                {camOn && (
                  <UIButton
                    variant="green"
                    onClick={() => void captureSingleScan()}
                    disabled={isScanning || isCheckingIn}
                    className="h-12 w-full text-[15.5px] font-extrabold shadow-md transition active:scale-98"
                  >
                    {isScanning || isCheckingIn ? (
                      <span className="inline-flex items-center gap-2">
                        <RefreshIcon className="h-4 w-4 animate-spin" />
                        <span>กำลังสแกนและบันทึก...</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span>📸</span>
                        <span>แตะเพื่อสแกนใบหน้า</span>
                      </span>
                    )}
                  </UIButton>
                )}

                {!camOn && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-[13px] text-rose-800">
                    <p className="font-bold">⚠️ กล้องไม่พร้อมใช้งาน</p>
                    <p className="mt-0.5 text-[12px] text-rose-600">
                      หากกล้องเปิดไม่ได้หรือโทรศัพท์ค้าง สามารถแตะปุ่มขอให้ครูช่วยเช็คชื่อด้านล่างได้ทันที
                    </p>
                  </div>
                )}

                {/* ปุ่มขอความช่วยเหลือฉุกเฉินกรณีโทรศัพท์ค้าง */}
                <button
                  type="button"
                  onClick={() => setHelpModalOpen(true)}
                  disabled={helpPending || isCheckingIn}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 px-3 text-[13px] font-bold shadow-2xs transition active:scale-98 ${
                    helpPending
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 animate-pulse"
                      : "border-amber-300 bg-amber-50/90 text-amber-900 hover:bg-amber-100"
                  }`}
                >
                  <span>{helpPending ? "⏳" : "🚨"}</span>
                  <span>
                    {helpPending
                      ? "ส่งคำขอแล้ว — กำลังรอคุณครูกดอนุมัติที่หน้าจอ"
                      : "โทรศัพท์ค้าง / สแกนไม่ติด? ส่งคำขอให้ครูช่วยเช็คชื่อ"}
                  </span>
                </button>
              </>
            )}
          </div>
          <p className="mt-2 text-center text-[12px] text-[#8a97ab]">
            มองตรงที่กล้องให้อยู่ในกรอบ แล้วแตะปุ่มสแกน หรือรอระบบจับภาพอัตโนมัติ
          </p>
        </div>
      </Card>
      )}

      {/* Modal ยืนยันส่งคำขอให้ครูช่วยเช็คชื่อ */}
      {helpModalOpen && (
        <Modal title="🚨 ขอให้คุณครูช่วยเช็คชื่อ" onClose={() => setHelpModalOpen(false)}>
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="text-[15px] font-bold text-amber-900">{identity.name}</p>
              <p className="text-[12.5px] text-amber-800">
                รหัส <span className="font-mono font-semibold">{identity.code}</span> · {identity.group}
              </p>
              <p className="mt-1 text-[12px] text-amber-700">
                รหัสประจำรอบ: <span className="font-mono font-bold">{pinRef.current || pin}</span>
              </p>
            </div>

            <p className="text-[13px] leading-relaxed text-[#5b6b82]">
              สำหรับกรณีโทรศัพท์ค้าง หน้าจอไม่ตอบสนอง หรือกล้องเปิดไม่ได้ ระบบจะส่งชื่อของคุณไปยังหน้าจอของคุณครูทันที เพื่อให้คุณครูกดยืนยันให้ที่หน้าห้อง
            </p>

            {helpMsg && (
              <p className="rounded-lg bg-rose-50 p-2 text-center text-[12.5px] font-semibold text-rose-700">
                {helpMsg}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <UIButton
                variant="green"
                onClick={() => void requestHelp()}
                disabled={helpSending}
                className="h-11 flex-1 font-bold"
              >
                {helpSending ? "กำลังส่งคำขอ..." : "✓ ยืนยันส่งคำขอให้ครู"}
              </UIButton>
              <button
                type="button"
                onClick={() => setHelpModalOpen(false)}
                className="h-11 rounded-lg border border-[#d8e0ec] px-4 text-[13px] font-semibold text-[#5b6b82] hover:bg-[#f1f5fa]"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </Modal>
      )}
    </StudentSummaryShell>
  );
}
