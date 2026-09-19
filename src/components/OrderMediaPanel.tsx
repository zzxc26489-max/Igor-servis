import { useEffect, useRef, useState } from "react";
import { IconCamera, IconDownload, IconPhoto, IconTrash, IconVideo } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "./Toast";
import { useConfirm } from "./Confirm";
import { Button } from "./ui";
import { createId } from "../lib/id";
import { nowISO } from "../lib/date";
import { formatDateTime } from "../lib/format";
import { buildOrderMediaPath, ORDER_MEDIA_LABELS, validateOrderMediaFile } from "../lib/orderMedia";
import { compressOrderPhoto, fileToDataUrl } from "../lib/imageCompression";
import { createCloudOrderMediaSignedUrl, deleteCloudOrderMedia, uploadCloudOrderMedia } from "../lib/cloud";
import type { Order, OrderMedia, OrderMediaKind } from "../types";

const KINDS = Object.keys(ORDER_MEDIA_LABELS) as OrderMediaKind[];

function canUpload(role?: string) {
  return !role || role === "owner" || role === "partner" || role === "advisor" || role === "mechanic";
}

function MediaPreview({ media }: { media: OrderMedia }) {
  const { session } = useAuth();
  const [src, setSrc] = useState(media.localDataUrl ?? "");
  const [error, setError] = useState("");

  useEffect(() => {
    if (media.localDataUrl || !media.storagePath || !session) {
      setSrc(media.localDataUrl ?? "");
      return;
    }
    let disposed = false;
    setError("");
    void createCloudOrderMediaSignedUrl(session, media.storagePath)
      .then((url) => {
        if (disposed) return;
        setSrc(url);
      })
      .catch(() => {
        if (!disposed) setError("Не удалось открыть файл");
      });
    return () => {
      disposed = true;
    };
  }, [media.localDataUrl, media.storagePath, session]);

  if (error) {
    return <div className="flex aspect-video items-center justify-center rounded-lg bg-[var(--bg)] px-3 text-center text-xs muted">{error}</div>;
  }
  if (!src) {
    return <div className="flex aspect-video items-center justify-center rounded-lg bg-[var(--bg)] text-xs muted">Загрузка…</div>;
  }

  return media.mimeType.startsWith("video/") ? (
    <video src={src} className="aspect-video w-full rounded-lg bg-black object-cover" controls playsInline preload="metadata" />
  ) : (
    <img src={src} alt={media.note || media.name} className="aspect-video w-full rounded-lg object-cover" loading="lazy" />
  );
}

export default function OrderMediaPanel({
  order,
  compact = false,
  defaultKind = "intake",
}: {
  order: Order;
  compact?: boolean;
  defaultKind?: OrderMediaKind;
}) {
  const { updateOrder, cloud } = useAppStore();
  const { configured, session } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [kind, setKind] = useState<OrderMediaKind>(defaultKind);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const media = [...(order.media ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const writable = canUpload(cloud.role);

  async function addFiles(files: FileList | null) {
    if (!files?.length || busy) return;
    if (!writable) {
      showToast("У вашей роли нет права добавлять медиа", "error");
      return;
    }

    setBusy(true);
    const added: OrderMedia[] = [];
    const errors: string[] = [];

    for (const file of Array.from(files).slice(0, 8)) {
      const id = createId("media");
      try {
        const prepared = file.type.startsWith("image/") ? await compressOrderPhoto(file) : file;
        const validation = validateOrderMediaFile(prepared);
        if (validation) throw new Error(validation);

        if (configured) {
          if (!session || !cloud.workshopId) throw new Error("Сервер ещё подключается — повторите через несколько секунд");
          const storagePath = buildOrderMediaPath(cloud.workshopId, order.id, id, prepared.name, prepared.type);
          await uploadCloudOrderMedia(session, storagePath, prepared);
          added.push({
            id,
            kind,
            name: prepared.name,
            mimeType: prepared.type,
            size: prepared.size,
            createdAt: nowISO(),
            uploadedBy: cloud.displayName || session.user.email || "Сотрудник",
            note: note.trim() || undefined,
            storagePath,
          });
        } else {
          if (!prepared.type.startsWith("image/")) throw new Error("Видео хранится только при подключённой серверной базе");
          const localDataUrl = await fileToDataUrl(prepared);
          added.push({
            id,
            kind,
            name: prepared.name,
            mimeType: prepared.type,
            size: prepared.size,
            createdAt: nowISO(),
            uploadedBy: cloud.displayName || "Локально",
            note: note.trim() || undefined,
            localDataUrl,
          });
        }
      } catch (cause) {
        errors.push(`${file.name}: ${cause instanceof Error ? cause.message : "ошибка загрузки"}`);
      }
    }

    if (added.length) {
      updateOrder(order.id, { media: [...(order.media ?? []), ...added] });
      setNote("");
      showToast(`Добавлено файлов: ${added.length}`);
    }
    if (errors.length) showToast(errors[0], "error");
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
    setBusy(false);
  }

  async function removeMedia(item: OrderMedia) {
    const ok = await confirm({
      title: "Удалить файл из истории",
      question: "Файл исчезнет из заказа. Для серверного файла удаление необратимо.",
      summary: [
        { label: "Файл", value: item.name },
        { label: "Раздел", value: ORDER_MEDIA_LABELS[item.kind] },
      ],
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;

    try {
      if (item.storagePath && session) await deleteCloudOrderMedia(session, item.storagePath);
      updateOrder(order.id, { media: (order.media ?? []).filter((entry) => entry.id !== item.id) });
      showToast("Файл удалён");
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Не удалось удалить файл", "error");
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={compact ? "text-sm font-semibold" : "panel-title"}>Фото и видео по заказу</h3>
          {!compact && <p className="muted mt-1 text-xs">Приёмка, диагностика, ход ремонта и результат остаются в истории автомобиля.</p>}
        </div>
        {media.length > 0 && <span className="muted text-xs">{media.length} файлов</span>}
      </div>

      {writable && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
          <div className="field-control">
            <select value={kind} onChange={(event) => setKind(event.target.value as OrderMediaKind)} aria-label="Этап медиа">
              {KINDS.map((value) => <option key={value} value={value}>{ORDER_MEDIA_LABELS[value]}</option>)}
            </select>
          </div>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={compact ? "Комментарий к фото" : "Комментарий: царапина слева, течь, результат ремонта…"}
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            style={{ borderColor: "var(--border)" }}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => cameraRef.current?.click()}>
              <IconCamera size={17} /> Камера
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
              <IconPhoto size={17} /> Файл
            </Button>
          </div>
          <input ref={cameraRef} className="hidden" type="file" accept="image/*,video/*" capture="environment" onChange={(event) => void addFiles(event.target.files)} />
          <input ref={fileRef} className="hidden" type="file" accept="image/*,video/*" multiple onChange={(event) => void addFiles(event.target.files)} />
        </div>
      )}

      {configured && !cloud.workshopId && writable && (
        <p className="muted mt-2 text-xs">Загрузка станет доступна после завершения синхронизации с сервером.</p>
      )}

      {media.length === 0 ? (
        <div className="muted mt-3 rounded-lg border border-dashed px-3 py-4 text-center text-xs" style={{ borderColor: "var(--border)" }}>
          Фото и видео пока не добавлены.
        </div>
      ) : (
        <div className={`mt-3 grid gap-3 ${compact ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
          {media.map((item) => (
            <div key={item.id} className="rounded-xl border bg-white p-2" style={{ borderColor: "var(--border)" }}>
              <MediaPreview media={item} />
              <div className="mt-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    {item.mimeType.startsWith("video/") ? <IconVideo size={14} /> : <IconPhoto size={14} />}
                    {ORDER_MEDIA_LABELS[item.kind]}
                  </div>
                  <p className="muted mt-0.5 truncate text-[11px]">{item.note || item.name}</p>
                  <p className="muted mt-0.5 text-[10px]">{formatDateTime(item.createdAt)} · {item.uploadedBy}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {(item.localDataUrl || item.storagePath) && (
                    <button
                      type="button"
                      className="rounded-md p-1.5 hover:bg-[var(--bg)]"
                      title="Открыть файл"
                      onClick={async () => {
                        try {
                          let url = item.localDataUrl ?? "";
                          if (!url && item.storagePath && session) {
                            url = await createCloudOrderMediaSignedUrl(session, item.storagePath);
                          }
                          if (url) window.open(url, "_blank", "noopener,noreferrer");
                        } catch {
                          showToast("Не удалось открыть файл", "error");
                        }
                      }}
                    >
                      <IconDownload size={15} />
                    </button>
                  )}
                  {writable && (
                    <button
                      type="button"
                      className="rounded-md p-1.5 hover:bg-[#fff4f4]"
                      style={{ color: "var(--danger)" }}
                      title="Удалить файл"
                      onClick={() => void removeMedia(item)}
                    >
                      <IconTrash size={15} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
