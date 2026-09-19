import assert from "node:assert/strict";
import test from "node:test";
import { promiseLabel, promisedOrderAlert, promisedOrderAlerts } from "../src/lib/promisedDeadline.ts";
import type { Order } from "../src/types.ts";

function order(overrides: Partial<Order>): Order {
  return {
    id: "o1",
    number: "№АИ-0001",
    clientId: "c1",
    vehicleId: "v1",
    status: "в работе",
    createdAt: "2026-09-19T08:00:00Z",
    works: [],
    parts: [],
    paid: 0,
    ...overrides,
  };
}

test("promised deadline becomes overdue after promised time", () => {
  const alert = promisedOrderAlert(
    order({ promisedAt: "2026-09-19T10:00:00Z" }),
    new Date("2026-09-19T11:30:00Z"),
  );
  assert.equal(alert?.urgency, "overdue");
  assert.equal(alert?.minutesLeft, -90);
  assert.equal(promiseLabel(-90), "Просрочено на 1 ч. 30 мин.");
});

test("promised deadline appears within three hours", () => {
  const alert = promisedOrderAlert(
    order({ promisedAt: "2026-09-19T13:00:00Z" }),
    new Date("2026-09-19T11:00:00Z"),
  );
  assert.equal(alert?.urgency, "soon");
  assert.equal(alert?.minutesLeft, 120);
});

test("ready and issued orders no longer trigger promise alerts", () => {
  const now = new Date("2026-09-19T11:00:00Z");
  assert.equal(promisedOrderAlert(order({ status: "готово", promisedAt: "2026-09-19T10:00:00Z" }), now), null);
  assert.equal(promisedOrderAlert(order({ status: "выдан", promisedAt: "2026-09-19T10:00:00Z" }), now), null);
});

test("alerts sort most overdue first", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  const rows = promisedOrderAlerts([
    order({ id: "soon", promisedAt: "2026-09-19T13:00:00Z" }),
    order({ id: "late", promisedAt: "2026-09-19T10:00:00Z" }),
  ], now);
  assert.deepEqual(rows.map((item) => item.orderId), ["late", "soon"]);
});
