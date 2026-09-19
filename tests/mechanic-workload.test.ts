import assert from "node:assert/strict";
import test from "node:test";
import { mechanicWorkload, mechanicWorkloadLabel } from "../src/lib/mechanicWorkload.ts";
import type { Order } from "../src/types.ts";

const orders: Order[] = [
  {
    id: "o1",
    number: "1",
    clientId: "c",
    vehicleId: "v",
    status: "в работе",
    createdAt: "2026-09-19T09:00:00Z",
    works: [
      { id: "w1", name: "A", qty: 1, price: 1000, executor: "Алексей", normMinutes: 60, workStatus: "in_progress" },
      { id: "w2", name: "B", qty: 2, price: 1000, executor: "Алексей", normMinutes: 30, workStatus: "paused" },
      { id: "w3", name: "C", qty: 1, price: 1000, executor: "Сергей", normMinutes: 90, workStatus: "planned" },
    ],
    parts: [],
  },
  {
    id: "o2",
    number: "2",
    clientId: "c",
    vehicleId: "v",
    status: "готово",
    createdAt: "2026-09-19T08:00:00Z",
    works: [
      { id: "w4", name: "D", qty: 1, price: 1000, executor: "Алексей", normMinutes: 120, workStatus: "done" },
    ],
    parts: [],
  },
];

test("mechanic workload counts only unfinished works in active orders", () => {
  assert.deepEqual(mechanicWorkload(orders, "Алексей"), {
    activeWorks: 2,
    runningWorks: 1,
    remainingNormMinutes: 120,
  });
});

test("mechanic workload label is concise", () => {
  assert.equal(mechanicWorkloadLabel(mechanicWorkload(orders, "Алексей")), "2 активн. · 1 сейчас");
  assert.equal(mechanicWorkloadLabel(mechanicWorkload(orders, "Никто")), "свободен");
});
