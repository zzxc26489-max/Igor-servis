import type { Order, StockItem } from "../types";
import { reservedByItem } from "./stock";

/**
 * Позиции, которые пора докупить: свободный остаток (за вычетом резерва)
 * опустился до минимума. Считаем одинаково во всех местах, чтобы счётчики
 * в меню, на складе и в закупках не расходились.
 */
export function lowStockItems(stock: StockItem[], orders: Order[]) {
  const reserved = reservedByItem(orders, stock);
  return stock.filter((item) => item.qty - (reserved.get(item.id) ?? 0) <= item.minQty);
}

/** Сколько докупить, чтобы выйти на двойной минимум с учётом резерва. */
export function toBuyQty(item: StockItem, reserved: number) {
  return Math.max(1, item.minQty * 2 - (item.qty - reserved));
}
