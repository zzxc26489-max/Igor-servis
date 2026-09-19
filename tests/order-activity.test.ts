import assert from "node:assert/strict";
import test from "node:test";
import { orderActivity } from "../src/lib/orderActivity.ts";
import type { Order, Payment } from "../src/types.ts";

const order: Order = {
  id: "o1",
  number: "№АИ-0001",
  clientId: "c1",
  vehicleId: "v1",
  status: "в работе",
  createdAt: "2026-09-19T08:00:00Z",
  advisor: "Игорь",
  works: [{
    id: "w1",
    name: "Диагностика",
    qty: 1,
    price: 1000,
    executor: "Алексей",
    workStatus: "paused",
    workSessions: [{ startedAt: "2026-09-19T09:00:00Z", endedAt: "2026-09-19T09:30:00Z" }],
  }],
  parts: [],
  paid: 1000,
  timeline: [
    { status: "запись", at: "2026-09-19T08:00:00Z", actor: "Игорь" },
    { status: "в работе", at: "2026-09-19T09:00:00Z", actor: "Алексей" },
  ],
};

const payments: Payment[] = [{
  id: "p1",
  orderId: "o1",
  at: "2026-09-19T10:00:00Z",
  amount: 1000,
  kind: "payment",
  method: "cash",
  employee: "Игорь",
}];

test("order activity combines status, work and payment into one chronology", () => {
  const rows = orderActivity(order, payments);
  assert.equal(rows[0].title, "Принята оплата");
  assert.ok(rows.some((row) => row.title === "Начата работа: Диагностика" && row.actor === "Алексей"));
  assert.ok(rows.some((row) => row.title === "Статус: в работе" && row.actor === "Алексей"));
  assert.ok(rows.some((row) => row.title === "Заказ-наряд создан" && row.actor === "Игорь"));
});
