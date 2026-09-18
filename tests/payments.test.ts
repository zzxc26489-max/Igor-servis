import assert from "node:assert/strict";
import test from "node:test";
import { paymentInRange, paymentMethodLabel, paymentsInRange, receivedInRange, recordedForOrder } from "../src/lib/payments.ts";

const from = new Date("2026-09-18T00:00:00");
const to = new Date("2026-09-18T23:59:59.999");
const payments = [
  { orderId: "a", at: "2026-09-18T10:00:00", amount: 1_000 },
  { orderId: "a", at: "2026-09-18T18:00:00", amount: 500 },
  { orderId: "b", at: "2026-09-17T18:00:00", amount: 700 },
];

test("payment range uses actual payment date", () => {
  assert.equal(paymentInRange(payments[0], from, to), true);
  assert.equal(paymentInRange(payments[2], from, to), false);
  assert.equal(paymentsInRange(payments, from, to).length, 2);
});

test("received sum counts only selected period", () => {
  assert.equal(receivedInRange(payments, from, to), 1_500);
});

test("recorded total is per order", () => {
  assert.equal(recordedForOrder(payments, "a"), 1_500);
  assert.equal(recordedForOrder(payments, "b"), 700);
});


test("payment method labels are explicit", () => {
  assert.equal(paymentMethodLabel("cash"), "Наличные");
  assert.equal(paymentMethodLabel("terminal"), "Терминал / карта");
  assert.equal(paymentMethodLabel("transfer"), "Перевод / СБП");
  assert.equal(paymentMethodLabel(undefined), "Способ не указан");
});
