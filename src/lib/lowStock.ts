import type { Order, StockItem } from "../types";
import { reservedByItem } from "./stock.ts";

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


/** Сколько ещё реально нужно заказать с учётом уже оформленной поставки. */
export function remainingPurchaseQty(item: StockItem, reserved: number) {
  return Math.max(0, toBuyQty(item, reserved) - (item.onOrderQty ?? 0));
}

/** Позиции, где дефицит ещё не закрыт оформленной поставкой. */
export function needsPurchaseItems(stock: StockItem[], orders: Order[]) {
  const reserved = reservedByItem(orders, stock);
  return lowStockItems(stock, orders).filter(
    (item) => remainingPurchaseQty(item, reserved.get(item.id) ?? 0) > 0,
  );
}

/** Позиции, которые уже заказаны и ещё не приняты полностью. */
export function incomingStockItems(stock: StockItem[]) {
  return stock.filter((item) => (item.onOrderQty ?? 0) > 0);
}
