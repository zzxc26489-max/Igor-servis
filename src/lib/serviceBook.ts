import type { Order } from "../types";
import { orderTotals } from "./order.ts";

export function vehicleOrders(orders: Order[], vehicleId: string) {
  return orders
    .filter((order) => order.vehicleId === vehicleId)
    .sort((a, b) => (b.issuedAt ?? b.completedAt ?? b.createdAt).localeCompare(a.issuedAt ?? a.completedAt ?? a.createdAt));
}

export function vehicleServiceStats(orders: Order[], vehicleId: string) {
  const history = vehicleOrders(orders, vehicleId);
  const issued = history.filter((order) => order.status === "выдан");
  const spent = issued.reduce((sum, order) => sum + orderTotals(order).due, 0);
  const works = issued.reduce((sum, order) => sum + order.works.reduce((acc, work) => acc + work.qty, 0), 0);
  const parts = issued.reduce((sum, order) => sum + order.parts.reduce((acc, part) => acc + part.qty, 0), 0);
  return {
    totalOrders: history.length,
    issuedOrders: issued.length,
    spent,
    works,
    parts,
    lastVisit: issued[0]?.issuedAt ?? issued[0]?.completedAt ?? issued[0]?.createdAt,
  };
}
