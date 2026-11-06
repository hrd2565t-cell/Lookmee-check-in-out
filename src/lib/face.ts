// ใบหน้า on-device ด้วย @vladmandic/face-api (โมเดลใน public/models)
// dynamic import เท่านั้น — ห้าม import ตรง (tfjs หนัก + ใช้ได้แค่ browser)

type FaceApi = typeof import("@vladmandic/face-api");

let faceapi: FaceApi | null = null;
let modelsReady = false;

async function getApi(): Promise<FaceApi> {
  if (!faceapi) faceapi = await import("@vladmandic/face-api");
  return faceapi;
}

/** โหลดโมเดลครั้งแรก (เรียกครั้งเดียว, cache ไว้) */
export async function ensureFaceModels(onProgress?: (msg: string) => void): Promise<void> {
  if (modelsReady) return;
  const api = await getApi();
  onProgress?.("กำลังโหลดโมเดลใบหน้า...");
  await api.nets.tinyFaceDetector.loadFromUri("/models");
  await api.nets.faceLandmark68TinyNet.loadFromUri("/models");
  await api.nets.faceRecognitionNet.loadFromUri("/models");
  modelsReady = true;
}

/** สกัด descriptor (128 มิติ) จากเฟรมวิดีโอ — ไม่เจอหน้าคืน null */
export async function descriptorFromVideo(
  video: HTMLVideoElement,
): Promise<Float32Array | null> {
  const api = await getApi();
  if (!modelsReady) return null;
  if (video.readyState < 2 || video.videoWidth === 0) return null;
  const det = await api
    .detectSingleFace(video, new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks(true)
    .withFaceDescriptor();
  return det?.descriptor ?? null;
}

/** เฉลี่ย descriptor หลายช็อต (ตอนลงทะเบียน) → number[] เก็บลง DB */
export function averageDescriptors(list: Float32Array[]): number[] {
  const n = list[0]?.length ?? 128;
  const out = new Array<number>(n).fill(0);
  for (const d of list) for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) + (d[i] ?? 0);
  return out.map((v) => v / list.length);
}

export type EnrolledFace = { code: string; descriptor: number[] };

/** เทียบใบหน้ากับทะเบียน — คืนรหัสที่ใกล้สุดถ้าใกล้กว่า threshold */
export function findBestMatch(
  desc: Float32Array | number[],
  enrolled: EnrolledFace[],
  threshold = 0.55,
): { code: string; distance: number } | null {
  const top = findTopMatches(desc, enrolled, threshold, 1);
  return top[0] ?? null;
}

/** คืนผู้ใกล้สุด N อันดับแรก (เรียงใกล้→ไกล) — ใช้จับเคสกำกวม */
export function findTopMatches(
  desc: Float32Array | number[],
  enrolled: EnrolledFace[],
  threshold = 0.55,
  limit = 2,
): Array<{ code: string; distance: number }> {
  const scored: Array<{ code: string; distance: number }> = [];
  for (const e of enrolled) {
    if (e.descriptor.length !== desc.length) continue;
    let sum = 0;
    for (let i = 0; i < desc.length; i++) {
      const diff = (desc[i] ?? 0) - (e.descriptor[i] ?? 0);
      sum += diff * diff;
    }
    const dist = Math.sqrt(sum);
    if (dist <= threshold) scored.push({ code: e.code, distance: dist });
  }
  return scored.sort((a, b) => a.distance - b.distance).slice(0, limit);
}

/** เกณฑ์กำกวม: อันดับ 1 กับ 2 ห่างกันน้อยกว่านี้ = ระบบไม่แน่ใจ */
export const AMBIGUITY_MARGIN = 0.05;

export function isAmbiguous(
  top: Array<{ code: string; distance: number }>,
  margin = AMBIGUITY_MARGIN,
): boolean {
  return top.length >= 2 && (top[1]?.distance ?? 99) - (top[0]?.distance ?? 0) < margin;
}

export type CameraFacingMode = "user" | "environment";

export type OpenCameraOptions = {
  facingMode?: CameraFacingMode;
  deviceId?: string;
};

/** แปลง Error จาก WebRTC / getUserMedia เป็นข้อความภาษาไทยที่ระบุสาเหตุชัดเจน */
export function getCameraErrorMessage(err: unknown): string {
  if (!err) return "เปิดกล้องไม่สำเร็จ";
  const name = (err as { name?: string })?.name || "";
  const msg = (err as { message?: string })?.message || String(err);

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    if (typeof window !== "undefined") {
      const ua = window.navigator?.userAgent || "";
      if (/Line/i.test(ua)) {
        return "แอป LINE บล็อกสิทธิ์เข้าถึงกล้อง — โปรดแตะปุ่มจุดสามจุด (⋮) ที่มุมล่างขวา แล้วเลือก 'เปิดในเบราว์เซอร์อื่น (Chrome/Safari)'";
      }
      if (/FBAN|FBAV|Messenger|Instagram/i.test(ua)) {
        return "แอปนี้บล็อกสิทธิ์เข้าถึงกล้อง — โปรดแตะเมนู ⋮ หรือแชร์ แล้วเลือก 'เปิดในเบราว์เซอร์ภายนอก (Chrome/Safari)'";
      }
    }
    return "เบราว์เซอร์ถูกปฏิเสธสิทธิ์เข้าถึงกล้อง — โปรดคลิกไอคอน 🔒 ที่แถบ URL ด้านบนเพื่ออนุญาตกล้อง";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "ไม่พบอุปกรณ์กล้องบนเครื่องนี้ — โปรดตรวจสอบว่าได้เชื่อมต่อกล้องเรียบร้อย";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "กล้องกำลังถูกใช้งานโดยแอปอื่น (เช่น Zoom, Meet, Line หรือแท็บอื่น) — โปรดปิดแอปอื่นแล้วลองใหม่";
  }
  if (name === "OverconstrainedError") {
    return "กล้องไม่รองรับความละเอียดหรือโหมดที่เลือก — กำลังลองเปิดด้วยโหมดมาตรฐาน";
  }
  if (name === "SecurityError") {
    return "ต้องเปิดผ่าน HTTPS หรือ localhost กล้องถึงจะทำงาน";
  }
  if (msg.includes("HTTPS") || msg.includes("isSecureContext")) {
    return "ต้องเปิดผ่าน HTTPS หรือ localhost กล้องถึงจะทำงาน";
  }
  return `เปิดกล้องไม่ได้ (${name || "Error"}): ${msg}`;
}

/** ตรวจหาอุปกรณ์กล้องทั้งหมดที่มี */
export async function listCameraDevices(): Promise<MediaDeviceInfo[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput");
  } catch {
    return [];
  }
}

/**
 * เปิดกล้อง (ค่าเริ่มต้นคือ 'user' กล้องหน้า ตามคำขอ พร้อมรองรับสลับเป็น 'environment' กล้องหลัง)
 */
export async function openCamera(
  video: HTMLVideoElement,
  options: OpenCameraOptions | CameraFacingMode = "user",
): Promise<{ facingMode: CameraFacingMode; stream: MediaStream }> {
  const opts: OpenCameraOptions =
    typeof options === "string" ? { facingMode: options } : options;
  const targetFacing: CameraFacingMode = opts.facingMode ?? "user";

  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      const err = new Error("ต้องเปิดผ่าน HTTPS หรือ localhost กล้องถึงจะทำงาน");
      err.name = "SecurityError";
      throw err;
    }
    const err = new Error("เบราว์เซอร์ไม่รองรับ Camera API");
    err.name = "NotSupportedError";
    throw err;
  }

  // ปิด stream เก่าก่อนเปิดอันใหม่เสมอ ป้องกันกล้องค้างหรือเกิด NotReadableError
  closeCamera(video);

  let stream: MediaStream | null = null;

  // 1. ลองเปิดตาม deviceId (ถ้ามีระบุ)
  if (opts.deviceId) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: opts.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch {
      // ข้ามไปลอง facingMode
    }
  }

  // 2. ลองเปิดตาม facingMode พร้อม resolution
  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: targetFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch {
      // 3. ลองเปิดตาม facingMode แบบไม่มี resolution constraints
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: targetFacing },
          audio: false,
        });
      } catch {
        // 4. ลองเปิดแบบ video: true (กล้องใดก็ได้ที่ใช้ได้)
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
    }
  }

  video.muted = true;
  video.setAttribute("playsinline", "true");
  video.srcObject = stream;

  try {
    await video.play();
  } catch (playErr) {
    console.warn("Video play warning:", playErr);
  }

  // ตรวจสอบ facingMode จริงจาก track
  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings();
  const actualFacing: CameraFacingMode =
    settings?.facingMode === "environment" ? "environment" : targetFacing;

  return { facingMode: actualFacing, stream };
}

export function closeCamera(video: HTMLVideoElement | null) {
  const stream = video?.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  if (video) video.srcObject = null;
}
