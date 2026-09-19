import type { Order } from "../types.ts";

export type PromiseUrgency = "overdue" | "soon";

export interface PromiseAlert {
  orderId: string;
  urgency: PromiseUrgency;
  minutesLeft: number;
}

export function promisedOrderAlert(order: Order, now = new Date()): PromiseAlert | null {
  if (!order.promisedAt || order.status === "готово" || order.status === "выдан") return null;
  const due = new Date(order.promisedAt);
  if (Number.isNaN(due.getTime())) return null;
  const minutesLeft = Math.round((due.getTime() - now.getTime()) / 60_000);
  if (minutesLeft < 0) return { orderId: order.id, urgency: "overdue", minutesLeft };
  if (minutesLeft <= 180) return { orderId: order.id, urgency: "soon", minutesLeft };
  return null;
}

export function promisedOrderAlerts(orders: Order[], now = new Date()) {
  return orders
    .map((order) => promisedOrderAlert(order, now))
    .filter((item): item is PromiseAlert => Boolean(item))
    .sort((a, b) => a.minutesLeft - b.minutesLeft);
}

export function promiseLabel(minutesLeft: number) {
  if (minutesLeft < 0) {
    const late = Math.abs(minutesLeft);
    if (late < 60) return `Просрочено на ${late} мин.`;
    const hours = Math.floor(late / 60);
    const minutes = late % 60;
    return `Просрочено на ${hours} ч.${minutes ? ` ${minutes} мин.` : ""}`;
  }
  if (minutesLeft < 60) return `Осталось ${minutesLeft} мин.`;
  const hours = Math.floor(minutesLeft / 60);
  const minutes = minutesLeft % 60;
  return `Осталось ${hours} ч.${minutes ? ` ${minutes} мин.` : ""}`;
}
