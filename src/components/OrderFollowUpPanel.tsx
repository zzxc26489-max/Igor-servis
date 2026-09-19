import { useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleX,
  IconClock,
  IconPlus,
  IconTool,
} from "@tabler/icons-react";
import { Button, Card } from "./ui";
import { useAppStore } from "../store/AppStore";
import { useToast } from "./Toast";
import { createId } from "../lib/id";
import type {
  DeferredRecommendation,
  InspectionItem,
  InspectionStatus,
  Order,
  OrderPartProgress,
  WorkApproval,
} from "../types";

const DEFAULT_INSPECTION = [
  "Масло ДВС",
  "Охлаждающая жидкость",
  "Тормозная жидкость",
  "Передние тормоза",
  "Задние тормоза",
  "Подвеска",
  "Рулевое управление",
  "Шины",
  "Освещение",
  "АКБ",
];

const INSPECTION_LABELS: Record<InspectionStatus, string> = {
  ok: "Норма",
  watch: "Наблюдать",
  urgent: "Срочно",
};

const PART_PROGRESS_LABELS: Record<OrderPartProgress, string> = {
  ordered: "Заказана",
  in_transit: "В пути",
  arrived: "Пришла",
  installed: "Установлена",
};

export default function OrderFollowUpPanel({ order, compact = false }: { order: Order; compact?: boolean }) {
  const { updateOrder, cloud } = useAppStore();
  const { showToast } = useToast();
  const [recommendationTitle, setRecommendationTitle] = useState("");
  const [recommendationDate, setRecommendationDate] = useState("");
  const [approvalTitle, setApprovalTitle] = useState("");
  const [approvalAmount, setApprovalAmount] = useState("");

  const inspection = useMemo(() => {
    const existing = order.inspection ?? [];
    const byLabel = new Map(existing.map((item) => [item.label, item]));
    return DEFAULT_INSPECTION.map((label) => byLabel.get(label) ?? { id: createId("inspect"), label });
  }, [order.inspection]);

  function saveInspection(item: InspectionItem, status: InspectionStatus) {
    const next = inspection.map((entry) =>
      entry.label === item.label
        ? {
            ...entry,
            status,
            checkedAt: new Date().toISOString(),
            checkedBy: cloud.displayName,
          }
        : entry,
    );
    updateOrder(order.id, { inspection: next });
    showToast(`${item.label}: ${INSPECTION_LABELS[status]}`);
  }

  function updateInspectionNote(item: InspectionItem, note: string) {
    const next = inspection.map((entry) =>
      entry.label === item.label ? { ...entry, note: note.trim() || undefined } : entry,
    );
    updateOrder(order.id, { inspection: next });
  }

  function addRecommendation() {
    const title = recommendationTitle.trim();
    if (!title) {
      showToast("Укажите рекомендацию", "error");
      return;
    }
    const item: DeferredRecommendation = {
      id: createId("deferred"),
      title,
      createdAt: new Date().toISOString(),
      dueDate: recommendationDate || undefined,
      status: "open",
    };
    updateOrder(order.id, {
      deferredRecommendations: [...(order.deferredRecommendations ?? []), item],
    });
    setRecommendationTitle("");
    setRecommendationDate("");
    showToast("Рекомендация сохранена для follow-up");
  }

  function closeRecommendation(id: string, status: "done" | "dismissed") {
    updateOrder(order.id, {
      deferredRecommendations: (order.deferredRecommendations ?? []).map((item) =>
        item.id === id ? { ...item, status, closedAt: new Date().toISOString() } : item,
      ),
    });
  }

  function addApproval() {
    const title = approvalTitle.trim();
    if (!title) {
      showToast("Укажите дополнительную работу", "error");
      return;
    }
    const amount = Number(approvalAmount.replace(/\D/g, ""));
    const item: WorkApproval = {
      id: createId("approval"),
      title,
      amount: amount > 0 ? amount : undefined,
      requestedAt: new Date().toISOString(),
      status: "pending",
    };
    updateOrder(order.id, { approvals: [...(order.approvals ?? []), item] });
    setApprovalTitle("");
    setApprovalAmount("");
    showToast("Запрос на согласование добавлен");
  }

  function setApprovalStatus(id: string, status: "approved" | "declined") {
    updateOrder(order.id, {
      approvals: (order.approvals ?? []).map((item) =>
        item.id === id ? { ...item, status, respondedAt: new Date().toISOString() } : item,
      ),
    });
  }

  function setPartProgress(partId: string, progressStatus: OrderPartProgress) {
    updateOrder(order.id, {
      parts: order.parts.map((part) => part.id === partId ? { ...part, progressStatus } : part),
    });
    showToast(`Статус детали: ${PART_PROGRESS_LABELS[progressStatus]}`);
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <Card>
        <div className="mb-3">
          <h2 className="panel-title flex items-center gap-2"><IconTool size={18} /> Цифровой осмотр</h2>
          <p className="muted mt-0.5 text-xs">Норма / наблюдать / срочно. Фото можно приложить ниже в медиа заказа.</p>
        </div>
        <div className="space-y-2">
          {inspection.map((item) => (
            <div key={item.label} className="rounded-xl border p-2.5 sm:p-3" style={{ borderColor: "var(--border)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{item.label}</div>
                  {item.checkedBy && <div className="muted text-[11px]">Проверил: {item.checkedBy}</div>}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => saveInspection(item, "ok")}
                    className="grid h-9 w-9 place-items-center rounded-lg border"
                    style={{ borderColor: item.status === "ok" ? "var(--accent)" : "var(--border)", color: "var(--accent)", background: item.status === "ok" ? "var(--accent-soft)" : "white" }}
                    aria-label="Норма"
                  >
                    <IconCircleCheck size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => saveInspection(item, "watch")}
                    className="grid h-9 w-9 place-items-center rounded-lg border"
                    style={{ borderColor: item.status === "watch" ? "var(--warning)" : "var(--border)", color: "var(--warning)", background: item.status === "watch" ? "#fdf3e0" : "white" }}
                    aria-label="Наблюдать"
                  >
                    <IconAlertTriangle size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => saveInspection(item, "urgent")}
                    className="grid h-9 w-9 place-items-center rounded-lg border"
                    style={{ borderColor: item.status === "urgent" ? "var(--danger)" : "var(--border)", color: "var(--danger)", background: item.status === "urgent" ? "#fbe9e9" : "white" }}
                    aria-label="Срочно"
                  >
                    <IconCircleX size={18} />
                  </button>
                </div>
              </div>
              {(item.status === "watch" || item.status === "urgent" || item.note) && (
                <div className="field-control mt-2">
                  <input
                    defaultValue={item.note ?? ""}
                    onBlur={(event) => updateInspectionNote(item, event.target.value)}
                    placeholder="Что нашли / что проверить позже"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {!compact && (
        <>
          <Card>
            <h2 className="panel-title flex items-center gap-2"><IconClock size={18} /> Отложенные рекомендации</h2>
            <p className="muted mt-0.5 text-xs">То, что клиент решил не делать сейчас, но нужно вернуть в работу позже.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
              <div className="field-control"><input value={recommendationTitle} onChange={(e) => setRecommendationTitle(e.target.value)} placeholder="Например: заменить задние колодки" /></div>
              <div className="field-control"><input type="date" value={recommendationDate} onChange={(e) => setRecommendationDate(e.target.value)} /></div>
              <Button onClick={addRecommendation}><IconPlus size={17} /> Добавить</Button>
            </div>
            <div className="mt-3 space-y-2">
              {(order.deferredRecommendations ?? []).map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <div>
                    <div className={item.status === "open" ? "font-semibold" : "muted line-through"}>{item.title}</div>
                    <div className="muted text-xs">{item.dueDate ? `Вернуться к вопросу: ${item.dueDate}` : "Без даты"} · {item.status === "open" ? "активно" : item.status === "done" ? "сделано" : "закрыто"}</div>
                  </div>
                  {item.status === "open" && (
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => closeRecommendation(item.id, "done")}><IconCheck size={16} /> Сделано</Button>
                      <Button size="sm" variant="secondary" onClick={() => closeRecommendation(item.id, "dismissed")}>Закрыть</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="panel-title flex items-center gap-2"><IconCircleDashed size={18} /> Согласование дополнительных работ</h2>
            <p className="muted mt-0.5 text-xs">Фиксируем, что предложили клиенту и какое решение получили.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
              <div className="field-control"><input value={approvalTitle} onChange={(e) => setApprovalTitle(e.target.value)} placeholder="Дополнительная работа" /></div>
              <div className="field-control"><input inputMode="numeric" value={approvalAmount} onChange={(e) => setApprovalAmount(e.target.value.replace(/\D/g, ""))} placeholder="Сумма" /></div>
              <Button onClick={addApproval}><IconPlus size={17} /> Запрос</Button>
            </div>
            <div className="mt-3 space-y-2">
              {(order.approvals ?? []).map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <div>
                    <div className="font-semibold">{item.title}</div>
                    <div className="muted text-xs">{item.amount ? `${item.amount.toLocaleString("ru-RU")} ₽ · ` : ""}{item.status === "pending" ? "ждём решения" : item.status === "approved" ? "согласовано" : "отказ"}</div>
                  </div>
                  {item.status === "pending" && (
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => setApprovalStatus(item.id, "approved")}><IconCheck size={16} /> Согласовано</Button>
                      <Button size="sm" variant="secondary" onClick={() => setApprovalStatus(item.id, "declined")}>Отказ</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="panel-title">Статусы запчастей по заказу</h2>
            <div className="mt-3 space-y-2">
              {order.parts.map((part) => (
                <div key={part.id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold">{part.name}</div>
                      <div className="muted text-xs">{part.sku || "Без артикула"}</div>
                    </div>
                    <div className="field-control min-w-[145px]">
                      <select value={part.progressStatus ?? (part.availability === "ordered" ? "ordered" : "arrived")} onChange={(e) => setPartProgress(part.id, e.target.value as OrderPartProgress)}>
                        {Object.entries(PART_PROGRESS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              {order.parts.length === 0 && <p className="muted text-sm">Запчастей в заказе пока нет.</p>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
