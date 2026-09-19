import type { Order, Payment } from "../types.ts";
import { paymentMethodLabel } from "./payments.ts";
import { formatMoney } from "./format.ts";

export type OrderActivityKind = "created" | "status" | "work" | "assignment" | "payment" | "media";

export interface OrderActivity {
  id: string;
  at: string;
  kind: OrderActivityKind;
  title: string;
  detail?: string;
  actor?: string;
  estimated?: boolean;
}

export function orderActivity(order: Order, payments: Payment[]): OrderActivity[] {
  const items: OrderActivity[] = [
    {
      id: `created-${order.id}`,
      at: order.createdAt,
      kind: "created",
      title: "Заказ-наряд создан",
      actor: order.advisor,
    },
  ];

  (order.timeline ?? []).forEach((event, index) => {
    items.push({
      id: `status-${order.id}-${index}-${event.at}`,
      at: event.at,
      kind: "status",
      title: `Статус: ${event.status}`,
      actor: event.actor,
      estimated: event.estimated,
    });
  });

  order.works.forEach((work) => {
    (work.assignmentHistory ?? []).forEach((event, index) => {
      items.push({
        id: `assignment-${work.id}-${index}-${event.at}`,
        at: event.at,
        kind: "assignment",
        title: event.to ? `Назначен механик: ${event.to}` : "Механик снят с работы",
        detail: [
          event.from ? `был ${event.from}` : undefined,
          event.reason,
        ].filter(Boolean).join(" · ") || undefined,
        actor: event.actor,
      });
    });

    const sessions = work.workSessions ?? [];
    sessions.forEach((session, index) => {
      items.push({
        id: `work-start-${work.id}-${index}`,
        at: session.startedAt,
        kind: "work",
        title: `Начата работа: ${work.name}`,
        actor: session.executor ?? work.executor,
      });
      if (session.endedAt) {
        const isLast = index === sessions.length - 1;
        const done = isLast && work.workStatus === "done";
        items.push({
          id: `work-end-${work.id}-${index}`,
          at: session.endedAt,
          kind: "work",
          title: done ? `Выполнена работа: ${work.name}` : `Пауза в работе: ${work.name}`,
          actor: session.executor ?? work.executor,
        });
      }
    });
  });

  payments
    .filter((payment) => payment.orderId === order.id)
    .forEach((payment) => {
      items.push({
        id: `payment-${payment.id}`,
        at: payment.at,
        kind: "payment",
        title: payment.kind === "refund" ? "Возврат клиенту" : "Принята оплата",
        detail: `${paymentMethodLabel(payment.method)} · ${payment.kind === "refund" ? "−" : "+"}${formatMoney(payment.amount)}`,
        actor: payment.employee,
        estimated: payment.estimated,
      });
    });

  (order.media ?? []).forEach((media) => {
    items.push({
      id: `media-${media.id}`,
      at: media.createdAt,
      kind: "media",
      title: `Добавлено ${media.mimeType.startsWith("video/") ? "видео" : "фото"}`,
      detail: media.note || media.name,
      actor: media.uploadedBy,
    });
  });

  return items
    .filter((item) => !Number.isNaN(new Date(item.at).getTime()))
    .sort((a, b) => b.at.localeCompare(a.at));
}
