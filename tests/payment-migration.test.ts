import assert from "node:assert/strict";
import test from "node:test";
import { ensureLegacyPayments, recordedForOrder } from "../src/lib/payments.ts";
import type { Order, Payment } from "../src/types.ts";

const baseOrder: Order = {
  id: "o1",
  number: "№1",
  clientId: "c1",
  vehicleId: "v1",
  status: "выдан",
  createdAt: "2026-09-01T10:00:00",
  issuedAt: "2026-09-02T10:00:00",
  works: [],
  parts: [],
  paid: 500,
};

test("migration respects payment refunds and does not create phantom top-up", () => {
  const existing: Payment[] = [
    { id: "pay", orderId: "o1", at: "2026-09-02T10:00:00", amount: 1_000, kind: "payment", method: "cash" },
    { id: "refund", orderId: "o1", at: "2026-09-03T10:00:00", amount: 500, kind: "refund", method: "cash" },
  ];
  const migrated = ensureLegacyPayments(existing, [baseOrder]);
  assert.equal(migrated.length, 2);
  assert.equal(recordedForOrder(migrated, "o1"), 500);
});

test("migration creates one estimated payment for legacy paid amount", () => {
  const migrated = ensureLegacyPayments([], [baseOrder]);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].amount, 500);
  assert.equal(migrated[0].estimated, true);
  assert.equal(migrated[0].kind, "payment");
});
