import assert from "node:assert/strict";
import test from "node:test";
import { orders, payments } from "../src/data/seed.ts";
import { recordedForOrder } from "../src/lib/payments.ts";

test("demo payments match paid amount on every order", () => {
  for (const order of orders) {
    const paid = Math.max(0, order.paid ?? 0);
    assert.equal(recordedForOrder(payments, order.id), paid, order.number);
  }
});

test("demo payments show real methods and employees", () => {
  assert.ok(payments.length > 0);
  assert.ok(payments.some((payment) => payment.method === "cash"));
  assert.ok(payments.some((payment) => payment.method === "terminal"));
  assert.ok(payments.some((payment) => payment.method === "transfer"));
  assert.ok(payments.every((payment) => Boolean(payment.employee)));
  assert.ok(orders.some((order) => payments.filter((payment) => payment.orderId === order.id).length > 1));
});
