import assert from "node:assert/strict";
import test from "node:test";
import { buildChart, computeMetrics, pendingPayments, type Range } from "../src/lib/analytics.ts";
import { computePayroll } from "../src/lib/payroll.ts";
import type { Employee, Expense, Order, Payment } from "../src/types.ts";

const range: Range = {
  from: new Date("2026-09-01T00:00:00"),
  to: new Date("2026-09-30T23:59:59.999"),
  title: "Сентябрь",
  label: "сентябрь",
  key: "month",
};

function order(id: string, status: Order["status"], issuedAt?: string): Order {
  return {
    id,
    number: `№${id}`,
    clientId: "c1",
    vehicleId: "v1",
    status,
    createdAt: "2026-09-01T10:00:00",
    issuedAt,
    works: [{ id: `w-${id}`, name: "Работа", qty: 1, price: 10_000, executor: "Мастер" }],
    parts: [],
    paid: status === "выдан" ? 10_000 : 0,
  };
}

test("chart expenses match metric expenses and ignore payroll payouts", () => {
  const orders = [order("1", "выдан", "2026-09-10T12:00:00")];
  const payments: Payment[] = [
    { id: "p1", orderId: "1", at: "2026-09-10T12:00:00", amount: 10_000, kind: "payment", method: "cash" },
  ];
  const expenses: Expense[] = [
    { id: "e1", date: "2026-09-10", category: "Аренда", description: "Аренда", amount: 3_000, counterparty: "Арендодатель", status: "Оплачено" },
    { id: "e2", date: "2026-09-10", category: "Зарплата", description: "Выплата", amount: 5_000, counterparty: "Мастер", status: "Оплачено", source: "payroll" },
    { id: "e3", date: "2026-09-10", category: "Возврат поставщику", description: "Возврат", amount: 500, counterparty: "Поставщик", status: "Возвращено", source: "supplier_refund" },
  ];
  const metrics = computeMetrics(range, orders, expenses, 1_000, payments);
  const chart = buildChart(range, payments, expenses);
  assert.equal(metrics.expenses, 2_500);
  assert.equal(chart.reduce((sum, point) => sum + point.expenses, 0), metrics.expenses);
  assert.equal(chart.reduce((sum, point) => sum + point.revenue, 0), metrics.received);
});

test("payroll uses only issued orders everywhere", () => {
  const employees: Employee[] = [{
    id: "emp",
    name: "Мастер",
    role: "Механик",
    payType: "percent",
    payValue: 10,
    paid: 0,
    accrued: 0,
  }];
  const result = computePayroll(employees, [
    order("issued", "выдан", "2026-09-10T12:00:00"),
    order("work", "в работе"),
    order("ready", "готово"),
  ]);
  assert.equal(result[0].accrued, 1_000);
});


test("confirmed supplier refund belongs to confirmation date", () => {
  const expenses: Expense[] = [{
    id: "refund-late",
    date: "2026-08-31",
    category: "Возврат поставщику",
    description: "Возврат",
    amount: 700,
    counterparty: "Поставщик",
    status: "Возвращено",
    source: "supplier_refund",
    refundConfirmedAt: "2026-09-05T12:00:00",
  }];
  const metrics = computeMetrics(range, [], expenses, 0, []);
  assert.equal(metrics.refunds, 700);
  assert.equal(metrics.expenses, -700);
  assert.equal(buildChart(range, [], expenses).reduce((sum, point) => sum + point.expenses, 0), -700);
});

test("future booking is not shown as waiting for payment", () => {
  const booking = order("future", "запись");
  booking.paid = 0;
  assert.equal(pendingPayments([booking], [], 10).length, 0);
});
