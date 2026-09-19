const PHOTO_MAX_WIDTH = 800;
const PHOTO_QUALITY = 0.7;

let cachedOutputType: "image/webp" | "image/jpeg" | null = null;

function outputType() {
  if (cachedOutputType) return cachedOutputType;
  try {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    cachedOutputType = probe.toDataURL("image/webp", 0.8).startsWith("data:image/webp")
      ? "image/webp"
      : "image/jpeg";
  } catch {
    cachedOutputType = "image/jpeg";
  }
  return cachedOutputType;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось открыть фото для сжатия"));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Не удалось сжать фото")),
      type,
      quality,
    );
  });
}

export function compressedPhotoName(name: string, mimeType: string) {
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return `${base}.${mimeType === "image/webp" ? "webp" : "jpg"}`;
}

/**
 * Повторяет принцип из MyappforBT: фото уменьшается до 800 px по ширине
 * и сохраняется в WebP quality 0.7. Если браузер не умеет WebP — JPEG.
 */
export async function compressOrderPhoto(file: File) {
  if (!file.type.startsWith("image/")) return file;

  const image = await loadImage(file);
  const width = Math.max(1, Math.round(Math.min(image.naturalWidth, PHOTO_MAX_WIDTH)));
  const scale = width / Math.max(1, image.naturalWidth);
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Не удалось подготовить фото");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);

  const mimeType = outputType();
  const blob = await canvasBlob(canvas, mimeType, PHOTO_QUALITY);
  return new File(
    [blob],
    compressedPhotoName(file.name, mimeType),
    { type: mimeType, lastModified: Date.now() },
  );
}

export function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать фото"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}


/** Сжимает произвольное изображение для хранения как data URL в настройках. */
export async function compressImageToDataUrl(
  file: File,
  options: { maxSide?: number; quality?: number } = {},
) {
  if (!file.type.startsWith("image/")) throw new Error("Файл не является изображением");
  const image = await loadImage(file);
  const maxSide = Math.max(64, options.maxSide ?? 420);
  const quality = Math.min(0.95, Math.max(0.4, options.quality ?? 0.82));
  const scale = Math.min(1, maxSide / Math.max(1, image.naturalWidth, image.naturalHeight));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Не удалось подготовить изображение");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const mimeType = outputType();
  const blob = await canvasBlob(canvas, mimeType, quality);
  return fileToDataUrl(blob);
}
