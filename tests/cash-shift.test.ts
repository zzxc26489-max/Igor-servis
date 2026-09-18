import assert from "node:assert/strict";
import test from "node:test";
import { activeCashShift, cashShiftDifference, cashShiftSummary } from "../src/lib/cashShift.ts";
import type { CashShift, Expense, Payment } from "../src/types.ts";

const shift: CashShift = {
  id: "s1",
  openedAt: "2026-09-19T09:00:00",
  openedBy: "Игорь",
  openingCash: 5_000,
};

const payments: Payment[] = [
  { id: "p1", orderId: "o1", at: "2026-09-19T10:00:00", amount: 10_000, method: "cash", kind: "payment", shiftId: "s1" },
  { id: "p2", orderId: "o2", at: "2026-09-19T11:00:00", amount: 2_000, method: "cash", kind: "refund", shiftId: "s1" },
  { id: "p3", orderId: "o3", at: "2026-09-19T12:00:00", amount: 7_000, method: "terminal", kind: "payment", shiftId: "s1" },
  { id: "p4", orderId: "o4", at: "2026-09-19T13:00:00", amount: 4_000, method: "transfer", kind: "payment", shiftId: "s1" },
  { id: "p5", orderId: "o5", at: "2026-09-19T14:00:00", amount: 99_999, method: "cash", kind: "payment", shiftId: "other" },
];

const expenses: Expense[] = [
  {
    id: "e1", date: "2026-09-19", category: "Зарплата", description: "Выплата",
    amount: 3_000, counterparty: "Мастер", status: "Оплачено", source: "payroll",
    paymentMethod: "cash", shiftId: "s1",
  },
  {
    id: "e2", date: "2026-09-19", category: "Инструмент", description: "Ключ",
    amount: 1_000, counterparty: "Магазин", status: "Оплачено",
    paymentMethod: "cash", shiftId: "s1",
  },
  {
    id: "e3", date: "2026-09-19", category: "Возврат поставщику", description: "Возврат",
    amount: 500, counterparty: "Поставщик", status: "Возвращено", source: "supplier_refund",
    paymentMethod: "cash", shiftId: "s1",
  },
  {
    id: "e4", date: "2026-09-19", category: "Аренда", description: "Аренда",
    amount: 100_000, counterparty: "Арендодатель", status: "Оплачено",
    paymentMethod: "transfer", shiftId: "s1",
  },
];

test("cash shift expected cash uses only cash movements in this shift", () => {
  const summary = cashShiftSummary(shift, payments, expenses);
  assert.equal(summary.cashPayments, 10_000);
  assert.equal(summary.cashRefunds, 2_000);
  assert.equal(summary.cashExpenses, 4_000);
  assert.equal(summary.cashSupplierRefunds, 500);
  assert.equal(summary.expectedCash, 9_500);
  assert.equal(summary.terminal, 7_000);
  assert.equal(summary.transfer, 4_000);
});

test("cash shift difference compares counted cash with expected cash", () => {
  const summary = cashShiftSummary({ ...shift, countedCash: 9_300 }, payments, expenses);
  assert.equal(cashShiftDifference({ ...shift, countedCash: 9_300 }, summary), -200);
});

test("active cash shift returns newest unclosed shift", () => {
  const shifts: CashShift[] = [
    { ...shift, id: "old", openedAt: "2026-09-18T09:00:00", closedAt: "2026-09-18T20:00:00" },
    { ...shift, id: "a", openedAt: "2026-09-19T09:00:00" },
    { ...shift, id: "b", openedAt: "2026-09-19T10:00:00" },
  ];
  assert.equal(activeCashShift(shifts)?.id, "b");
});
