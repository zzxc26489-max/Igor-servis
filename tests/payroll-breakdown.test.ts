import assert from "node:assert/strict";
import test from "node:test";
import { payrollBreakdown } from "../src/lib/payroll.ts";
import type { Employee, Order } from "../src/types.ts";

const employee: Employee = {
  id: "e1",
  name: "Алексей",
  role: "Механик",
  payType: "percent",
  payValue: 40,
  accrued: 0,
  paid: 0,
};

const order: Order = {
  id: "o1",
  number: "№АИ-0001",
  clientId: "c1",
  vehicleId: "v1",
  status: "выдан",
  createdAt: "2026-09-19T08:00:00Z",
  issuedAt: "2026-09-19T12:00:00Z",
  works: [
    { id: "w1", name: "Замена колодок", qty: 1, price: 3000, executor: "Алексей" },
    { id: "w2", name: "Диагностика", qty: 1, price: 1000, executor: "Игорь" },
  ],
  parts: [],
  paid: 0,
};

test("payroll breakdown includes only employee works from issued orders", () => {
  const rows = payrollBreakdown(employee, [order]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].worksAmount, 3000);
  assert.equal(rows[0].accrued, 1200);
  assert.equal(rows[0].works.length, 1);
});
