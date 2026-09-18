import type { Order, StockItem } from "../types";

/** Заказы, которые ещё держат запчасти в резерве: выданные уже списаны. */
function openOrders(orders: Order[]) {
  return orders.filter((order) => order.status !== "выдан");
}

/**
 * Сколько единиц каждой позиции занято под незакрытые заказ-наряды.
 * Ключ — id позиции склада, связь идёт по артикулу.
 */
export function reservedByItem(orders: Order[], stock: StockItem[]) {
  const bySku = new Map(stock.map((item) => [item.sku, item.id]));
  const result = new Map<string, number>();
  for (const order of openOrders(orders)) {
    for (const part of order.parts) {
      const itemId = part.sku ? bySku.get(part.sku) : undefined;
      if (!itemId) continue;
      result.set(itemId, (result.get(itemId) ?? 0) + part.qty);
    }
  }
  return result;
}

/** Заказ-наряды, под которые зарезервирована конкретная позиция. */
export function reservingOrders(orders: Order[], item: StockItem) {
  return openOrders(orders).filter((order) => order.parts.some((part) => part.sku === item.sku));
}

/** Остаток за вычетом резерва — сколько реально можно взять под новый заказ. */
export function availableQty(item: StockItem, reserved: number) {
  return item.qty - reserved;
}
