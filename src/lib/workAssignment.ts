import type { Order } from "../types.ts";

export function unassignedWorks(order: Order) {
  if (order.status === "готово" || order.status === "выдан") return [];
  return order.works.filter((work) => !work.executor);
}

export function ordersWithUnassignedWorks(orders: Order[]) {
  return orders
    .filter((order) => unassignedWorks(order).length > 0)
    .sort((a, b) => {
      const aDate = a.plannedAt ?? a.createdAt.slice(0, 10);
      const bDate = b.plannedAt ?? b.createdAt.slice(0, 10);
      return aDate.localeCompare(bDate) || (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? "");
    });
}
