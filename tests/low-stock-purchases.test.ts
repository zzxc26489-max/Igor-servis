import assert from "node:assert/strict";
import test from "node:test";
import {
  incomingStockItems,
  needsPurchaseItems,
  remainingPurchaseQty,
} from "../src/lib/lowStock.ts";
import type { Order, StockItem } from "../src/types.ts";

const baseItem: StockItem = {
  id: "st-1",
  name: "Фильтр",
  sku: "ABC",
  category: "Фильтры",
  qty: 2,
  minQty: 5,
  purchasePrice: 1000,
  unit: "шт.",
};

const orders: Order[] = [];

test("low stock stays in purchase list until supplier order covers deficit", () => {
  assert.equal(needsPurchaseItems([baseItem], orders).length, 1);
  assert.equal(remainingPurchaseQty(baseItem, 0), 8);

  const ordered = { ...baseItem, onOrderQty: 8, supplyStatus: "ordered" as const };
  assert.equal(needsPurchaseItems([ordered], orders).length, 0);
  assert.equal(incomingStockItems([ordered]).length, 1);
});

test("partial supplier order leaves only remaining shortage to buy", () => {
  const ordered = { ...baseItem, onOrderQty: 3, supplyStatus: "ordered" as const };
  assert.equal(remainingPurchaseQty(ordered, 0), 5);
  assert.equal(needsPurchaseItems([ordered], orders).length, 1);
});
