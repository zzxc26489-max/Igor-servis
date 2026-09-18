import type { CashShift, Expense, Payment } from "../types";

export interface CashShiftSummary {
  cashPayments: number;
  cashRefunds: number;
  cashExpenses: number;
  cashSupplierRefunds: number;
  expectedCash: number;
  terminal: number;
  transfer: number;
  unknown: number;
}

export function activeCashShift(shifts: CashShift[]) {
  return [...shifts]
    .filter((shift) => !shift.closedAt)
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0] ?? null;
}

export function cashShiftSummary(
  shift: CashShift,
  payments: Payment[],
  expenses: Expense[],
): CashShiftSummary {
  let cashPayments = 0;
  let cashRefunds = 0;
  let cashExpenses = 0;
  let cashSupplierRefunds = 0;
  let terminal = 0;
  let transfer = 0;
  let unknown = 0;

  for (const payment of payments) {
    if (payment.shiftId !== shift.id) continue;
    const sign = payment.kind === "refund" ? -1 : 1;
    if (payment.method === "cash") {
      if (sign > 0) cashPayments += payment.amount;
      else cashRefunds += payment.amount;
    } else if (payment.method === "terminal") {
      terminal += sign * payment.amount;
    } else if (payment.method === "transfer") {
      transfer += sign * payment.amount;
    } else {
      unknown += sign * payment.amount;
    }
  }

  for (const expense of expenses) {
    if (expense.shiftId !== shift.id || expense.paymentMethod !== "cash") continue;
    if (expense.source === "supplier_refund") {
      if (expense.status === "Возвращено") cashSupplierRefunds += expense.amount;
      continue;
    }
    if (expense.status === "Оплачено") cashExpenses += expense.amount;
  }

  return {
    cashPayments,
    cashRefunds,
    cashExpenses,
    cashSupplierRefunds,
    expectedCash:
      shift.openingCash +
      cashPayments -
      cashRefunds -
      cashExpenses +
      cashSupplierRefunds,
    terminal,
    transfer,
    unknown,
  };
}

export function cashShiftDifference(shift: CashShift, summary: CashShiftSummary) {
  if (shift.countedCash === undefined) return null;
  return shift.countedCash - summary.expectedCash;
}
