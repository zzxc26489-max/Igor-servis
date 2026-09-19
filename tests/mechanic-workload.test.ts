import assert from "node:assert/strict";
import test from "node:test";
import { isMechanicEmployee, mechanicCandidates, mechanicWorkload, mechanicWorkloadLabel } from "../src/lib/mechanicWorkload.ts";
import type { Employee, Order } from "../src/types.ts";

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


const employee = (id: string, name: string, role: string): Employee => ({
  id,
  name,
  role,
  payType: "percent",
  payValue: 30,
  accrued: 0,
  paid: 0,
});

test("only mechanic roles are assignable to repair work", () => {
  assert.equal(isMechanicEmployee(employee("1", "Иван", "Механик")), true);
  assert.equal(isMechanicEmployee(employee("2", "Пётр", "Автомеханик-диагност")), true);
  assert.equal(isMechanicEmployee(employee("3", "Игорь", "Владелец, мастер-приёмщик")), false);
  assert.equal(isMechanicEmployee(employee("4", "Елена", "Учёт, документы")), false);
});

test("mechanic candidates exclude office roles and sort by workload", () => {
  const employees = [
    employee("1", "Алексей", "Механик"),
    employee("2", "Сергей", "Механик"),
    employee("3", "Елена", "Бухгалтер"),
  ];
  const candidates = mechanicCandidates(employees, orders);
  assert.deepEqual(candidates.map((item) => item.employee.name), ["Сергей", "Алексей"]);
});

test("current legacy assignee stays selectable even when role is no longer mechanic", () => {
  const employees = [
    employee("1", "Игорь", "Владелец, мастер-приёмщик"),
    employee("2", "Алексей", "Механик"),
  ];
  const candidates = mechanicCandidates(employees, orders, "Игорь");
  assert.equal(candidates.some((item) => item.employee.name === "Игорь"), true);
});
