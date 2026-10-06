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

/** เปิดกล้อง (กล้องหลังก่อน, ไม่ได้ค่อยกล้องหน้า) */
export async function openCamera(video: HTMLVideoElement): Promise<void> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
  video.srcObject = stream;
  await video.play();
}

export function closeCamera(video: HTMLVideoElement | null) {
  const stream = video?.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  if (video) video.srcObject = null;
}
