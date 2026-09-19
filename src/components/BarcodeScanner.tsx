import { useEffect, useRef, useState, type FormEvent } from "react";
import { IconCamera, IconKeyboard, IconScan } from "@tabler/icons-react";
import { Button, Modal } from "./ui";

type BarcodeResult = { rawValue: string };
type BarcodeDetectorInstance = { detect(source: unknown): Promise<BarcodeResult[]> };
type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

function barcodeDetectorCtor() {
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
}

export default function BarcodeScanner({
  onDetected,
  onClose,
  title = "Сканировать штрихкод",
}: {
  onDetected: (value: string) => void;
  onClose: () => void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const detectedRef = useRef(onDetected);
  const closeRef = useRef(onClose);
  const [manual, setManual] = useState("");

  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    detectedRef.current = onDetected;
    closeRef.current = onClose;
  }, [onDetected, onClose]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    let busy = false;

    async function start() {
      const Detector = barcodeDetectorCtor();
      if (!Detector) {
        setError("Этот браузер не умеет распознавать штрихкод камерой. Введите код вручную.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Камера недоступна в этом браузере. Введите код вручную.");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);

        const wanted = ["ean_13", "ean_8", "code_128", "code_39", "codabar", "upc_a", "upc_e", "itf", "qr_code", "data_matrix", "pdf417"];
        const supported = Detector.getSupportedFormats ? await Detector.getSupportedFormats() : wanted;
        const formats = wanted.filter((format) => supported.includes(format));
        const detector = new Detector(formats.length ? { formats } : undefined);

        timer = window.setInterval(async () => {
          if (busy || stopped || !videoRef.current || videoRef.current.readyState < 2) return;
          busy = true;
          try {
            const found = await detector.detect(videoRef.current);
            const value = found[0]?.rawValue?.trim();
            if (value) {
              stopped = true;
              detectedRef.current(value);
              closeRef.current();
            }
          } catch {
            // Кадр мог смениться во время распознавания — следующий проход попробует снова.
          } finally {
            busy = false;
          }
        }, 350);
      } catch {
        setError("Не удалось открыть камеру. Разрешите доступ к камере или введите код вручную.");
      }
    }

    void start();
    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function submitManual(event: FormEvent) {
    event.preventDefault();
    const value = manual.trim();
    if (!value) return;
    onDetected(value);
    onClose();
  }

  return (
    <Modal title={title} subtitle="Наведите камеру на штрихкод или QR-код" onClose={onClose}>
      <div className="space-y-3 p-4">
        <div className="overflow-hidden rounded-xl border bg-black" style={{ borderColor: "var(--border)" }}>
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
          {!ready && !error && (
            <div className="flex items-center justify-center gap-2 bg-white px-3 py-3 text-sm">
              <IconCamera size={18} /> Открываем камеру…
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#efc9c9", color: "var(--danger)" }}>
            {error}
          </div>
        )}

        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <IconKeyboard size={17} /> Ввести код вручную
          </div>
          <form className="flex gap-2" onSubmit={submitManual}>
            <input
              autoComplete="off"
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              placeholder="Штрихкод, SKU или содержимое QR"
              className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            />
            <Button type="submit" disabled={!manual.trim()}>
              <IconScan size={18} /> Найти
            </Button>
          </form>
        </div>
      </div>
    </Modal>
  );
}
