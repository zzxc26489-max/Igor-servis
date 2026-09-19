import assert from "node:assert/strict";
import test from "node:test";
import { autoLiftEnd, autoLiftSchedulePatch, worksLiftMinutes } from "../src/lib/lift.ts";
import type { Order } from "../src/types.ts";

function order(partial: Partial<Order> = {}): Order {
  return {
    id: "o1",
    number: "№АИ-1",
    clientId: "c1",
    vehicleId: "v1",
    liftId: 1,
    status: "в работе",
    createdAt: "2026-09-19T10:00:00Z",
    plannedAt: "2026-09-19",
    scheduledStart: "10:00",
    scheduledEnd: "11:00",
    works: [],
    parts: [],
    paid: 0,
    ...partial,
  };
}

test("lift occupancy follows total work norms with one-hour minimum", () => {
  const works = [
    { id: "w1", name: "A", qty: 1, price: 1000, normMinutes: 30 },
    { id: "w2", name: "B", qty: 2, price: 1000, normMinutes: 30 },
  ];
  assert.equal(worksLiftMinutes(works), 90);
  assert.equal(autoLiftEnd(order({ works }), works), "11:30");
});

test("adding a longer job extends automatic lift occupancy", () => {
  const current = order({
    works: [{ id: "w1", name: "A", qty: 1, price: 1000, normMinutes: 60 }],
  });
  const nextWorks = [
    ...current.works,
    { id: "w2", name: "B", qty: 1, price: 1000, normMinutes: 90 },
  ];
  assert.deepEqual(autoLiftSchedulePatch(current, nextWorks), { scheduledEnd: "12:30" });
});

test("manual lift occupancy is never overwritten by work norms", () => {
  const current = order({
    scheduledEnd: "16:00",
    liftScheduleManual: true,
    works: [{ id: "w1", name: "A", qty: 1, price: 1000, normMinutes: 60 }],
  });
  const nextWorks = [
    ...current.works,
    { id: "w2", name: "B", qty: 1, price: 1000, normMinutes: 180 },
  ];
  assert.deepEqual(autoLiftSchedulePatch(current, nextWorks), {});
});
