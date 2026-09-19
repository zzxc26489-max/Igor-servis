import { needsPurchaseItems } from "./lowStock";
import { orderTotals } from "./order";
import { todayISO } from "./date";
import { ordersWithUnassignedWorks } from "./workAssignment";
import type { Client, Order, StockItem, Vehicle } from "../types";

export type AttentionPriority = "critical" | "high" | "normal";
export type AttentionKind =
  | "deadline"
  | "ready"
  | "review"
  | "approval"
  | "parts"
  | "assignment"
  | "appointment"
  | "service"
  | "deferred"
  | "debt"
  | "stock";

export interface AttentionItem {
  id: string;
  priority: AttentionPriority;
  kind: AttentionKind;
  title: string;
  detail: string;
  to: string;
  dueAt?: string;
}

const priorityRank: Record<AttentionPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

function tomorrowISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function buildAttentionItems(input: {
  orders: Order[];
  clients: Client[];
  vehicles: Vehicle[];
  stock: StockItem[];
  now?: Date;
}): AttentionItem[] {
  const { orders, clients, vehicles, stock } = input;
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const today = todayISO();
  const tomorrow = tomorrowISO();
  const items: AttentionItem[] = [];

  for (const order of orders) {
    if (order.status !== "выдан" && order.promisedAt && order.promisedAt < nowIso) {
      items.push({
        id: `deadline:${order.id}`,
        priority: "critical",
        kind: "deadline",
        title: `Просрочено обещанное время · ${order.number}`,
        detail: "Связаться с клиентом и обновить срок готовности.",
        to: `/orders/${order.id}`,
        dueAt: order.promisedAt,
      });
    }

    if (order.status === "готово") {
      items.push({
        id: `ready:${order.id}`,
        priority: "high",
        kind: "ready",
        title: `Автомобиль готов · ${order.number}`,
        detail: "Сообщить клиенту и согласовать выдачу.",
        to: `/orders/${order.id}`,
      });
    }

    if ((order.approvals ?? []).some((item) => item.status === "pending")) {
      items.push({
        id: `approval:${order.id}`,
        priority: "high",
        kind: "approval",
        title: `Ждём согласование · ${order.number}`,
        detail: "Есть дополнительные работы без решения клиента.",
        to: `/orders/${order.id}`,
      });
    }

    if (order.parts.some((part) => part.progressStatus === "arrived")) {
      items.push({
        id: `parts:${order.id}`,
        priority: "high",
        kind: "parts",
        title: `Запчасть пришла · ${order.number}`,
        detail: "Можно продолжать ремонт или назначить работу механику.",
        to: `/orders/${order.id}`,
      });
    }

    if (order.status === "выдан" && orderTotals(order).debt > 0) {
      items.push({
        id: `debt:${order.id}`,
        priority: "high",
        kind: "debt",
        title: `Остался долг · ${order.number}`,
        detail: `${Math.round(orderTotals(order).debt).toLocaleString("ru-RU")} ₽ после выдачи автомобиля.`,
        to: `/orders/${order.id}`,
      });
    }

    for (const deferred of order.deferredRecommendations ?? []) {
      if (deferred.status !== "open" || !deferred.dueDate || deferred.dueDate > today) continue;
      items.push({
        id: `deferred:${order.id}:${deferred.id}`,
        priority: "normal",
        kind: "deferred",
        title: deferred.title,
        detail: `Подошёл срок отложенной рекомендации по ${order.number}.`,
        to: `/orders/${order.id}`,
        dueAt: deferred.dueDate,
      });
    }

    if (order.status === "запись" && order.plannedAt === tomorrow) {
      const client = clients.find((item) => item.id === order.clientId);
      const reminded = client?.communications?.some(
        (entry) => entry.type === "appointment_reminder" && entry.orderId === order.id,
      );
      if (!reminded) {
        items.push({
          id: `appointment:${order.id}`,
          priority: "normal",
          kind: "appointment",
          title: `Завтра запись · ${order.number}`,
          detail: "Клиенту ещё не отмечено напоминание о визите.",
          to: "/reputation",
          dueAt: order.plannedAt,
        });
      }
    }
  }

  for (const order of ordersWithUnassignedWorks(orders)) {
    if (order.status === "выдан") continue;
    items.push({
      id: `assignment:${order.id}`,
      priority: "high",
      kind: "assignment",
      title: `Не назначен механик · ${order.number}`,
      detail: "В заказе есть работа без исполнителя.",
      to: `/orders/${order.id}`,
    });
  }

  for (const client of clients) {
    const badReviews = (client.reviews ?? []).filter(
      (review) => review.rating <= 3 && !["resolved", "updated"].includes(review.status),
    );
    if (badReviews.length) {
      items.push({
        id: `review:${client.id}`,
        priority: "critical",
        kind: "review",
        title: `Негативный отзыв · ${client.name}`,
        detail: `${badReviews.length} ${badReviews.length === 1 ? "отзыв требует" : "отзыва требуют"} реакции.`,
        to: "/reputation",
      });
    }
  }

  for (const vehicle of vehicles) {
    if (!vehicle.nextServiceDate || vehicle.nextServiceDate > today) continue;
    const client = clients.find((item) => item.id === vehicle.clientId);
    items.push({
      id: `service:${vehicle.id}`,
      priority: "normal",
      kind: "service",
      title: `Пора на обслуживание · ${vehicle.make} ${vehicle.model}`,
      detail: client ? `${client.name} · срок обслуживания наступил.` : "Срок обслуживания наступил.",
      to: client ? `/clients/${client.id}` : "/clients",
      dueAt: vehicle.nextServiceDate,
    });
  }

  for (const item of needsPurchaseItems(stock, orders).slice(0, 8)) {
    items.push({
      id: `stock:${item.id}`,
      priority: item.qty <= 0 ? "high" : "normal",
      kind: "stock",
      title: `Пополнить склад · ${item.name}`,
      detail: `Остаток ${item.qty} ${item.unit}, минимум ${item.minQty}.`,
      to: "/purchases",
    });
  }

  return items.sort((a, b) => {
    const priority = priorityRank[a.priority] - priorityRank[b.priority];
    if (priority !== 0) return priority;
    return (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
  });
}
