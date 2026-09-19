import assert from "node:assert/strict";
import test from "node:test";
import { ordersWithUnassignedWorks, unassignedWorks } from "../src/lib/workAssignment.ts";
import type { Order } from "../src/types.ts";

function makeOrder(id: string, status: Order["status"], assigned = false): Order {
  return {
    id,
    number: `№${id}`,
    clientId: "c1",
    vehicleId: "v1",
    status,
    createdAt: "2026-09-19T08:00:00Z",
    works: [{ id: `w-${id}`, name: "Работа", qty: 1, price: 1000, executor: assigned ? "Алексей" : undefined }],
    parts: [],
    paid: 0,
  };
}

test("unassigned work is reported only for active orders", () => {
  assert.equal(unassignedWorks(makeOrder("1", "в работе")).length, 1);
  assert.equal(unassignedWorks(makeOrder("2", "в работе", true)).length, 0);
  assert.equal(unassignedWorks(makeOrder("3", "готово")).length, 0);
  assert.equal(unassignedWorks(makeOrder("4", "выдан")).length, 0);
});

test("orders with unassigned work excludes completed orders", () => {
  const rows = ordersWithUnassignedWorks([
    makeOrder("active", "диагностика"),
    makeOrder("assigned", "в работе", true),
    makeOrder("done", "готово"),
  ]);
  assert.deepEqual(rows.map((order) => order.id), ["active"]);
});
