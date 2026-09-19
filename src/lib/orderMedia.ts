import type { OrderMediaKind } from "../types";

export const ORDER_MEDIA_LABELS: Record<OrderMediaKind, string> = {
  intake: "Приёмка",
  diagnostic: "Диагностика",
  repair: "В ремонте",
  result: "Результат",
};

export const MAX_ORDER_MEDIA_BYTES = 25 * 1024 * 1024;

const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export function validateOrderMediaFile(file: { size: number; type: string }) {
  if (!ALLOWED_MEDIA_TYPES.has(file.type)) {
    return "Поддерживаются фото JPG/PNG/WebP/HEIC и видео MP4/WebM/MOV";
  }
  if (file.size <= 0) return "Файл пустой";
  if (file.size > MAX_ORDER_MEDIA_BYTES) return "Файл больше 25 МБ";
  return null;
}

function safeSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120) || "item";
}

export function mediaExtension(fileName: string, mimeType: string) {
  const fromName = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName && fromName.length <= 5) return fromName;
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/heic") return "heic";
  if (mimeType === "image/heif") return "heif";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  return "mp4";
}

export function buildOrderMediaPath(
  workshopId: string,
  orderId: string,
  mediaId: string,
  fileName: string,
  mimeType: string,
) {
  return [
    safeSegment(workshopId),
    safeSegment(orderId),
    `${safeSegment(mediaId)}.${mediaExtension(fileName, mimeType)}`,
  ].join("/");
}
