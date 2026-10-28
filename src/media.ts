// Photo shrinking + HEIC conversion, voice recording, and uploads.
import { api } from "./api";

const FULL_MAX = 2000;
const THUMB_MAX = 480;

export interface ProcessedPhoto {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  previewUrl: string;
}

const isHeic = (f: File) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

async function decode(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
}

function toJpeg(bitmap: ImageBitmap, max: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve({ blob: b, w, h }) : reject(new Error("Couldn't process that photo."))), "image/jpeg", quality)
  );
}

// Every photo becomes a ≤2000px JPEG plus a ≤480px thumbnail, so it shows on every device
// (Windows browsers can't show HEIC) and uploads fast.
export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decode(file);
  } catch {
    if (!isHeic(file)) throw new Error(`Couldn't read ${file.name}. Try a JPEG or PNG.`);
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    bitmap = await decode(Array.isArray(converted) ? converted[0] : converted);
  }
  const full = await toJpeg(bitmap, FULL_MAX, 0.85);
  const thumb = await toJpeg(bitmap, THUMB_MAX, 0.8);
  bitmap.close();
  return { full: full.blob, thumb: thumb.blob, width: full.w, height: full.h, previewUrl: URL.createObjectURL(thumb.blob) };
}

export function uploadPhoto(memoryId: string, p: ProcessedPhoto) {
  const form = new FormData();
  form.set("kind", "photo");
  form.set("file", new File([p.full], "photo.jpg", { type: "image/jpeg" }));
  form.set("thumb", new File([p.thumb], "thumb.jpg", { type: "image/jpeg" }));
  form.set("width", String(p.width));
  form.set("height", String(p.height));
  return api.addMedia(memoryId, form);
}

export interface Recording {
  blob: Blob;
  type: string;
  duration: number;
  url: string;
}

export function uploadVoice(memoryId: string, r: Recording) {
  const form = new FormData();
  form.set("kind", "voice");
  const ext = r.type.includes("mp4") ? "m4a" : r.type.includes("webm") ? "webm" : "ogg";
  form.set("file", new File([r.blob], `voice.${ext}`, { type: r.type.split(";")[0] }));
  form.set("duration", String(Math.round(r.duration)));
  return api.addMedia(memoryId, form);
}

// iPhones record AAC in MP4, which every browser plays. Prefer it everywhere it's supported.
export function pickAudioType() {
  const options = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
  if (typeof MediaRecorder === "undefined") return null;
  return options.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export const formatDuration = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
