import type { Client, Expense, Order, Payment, StockItem, Vehicle } from "../types";
import { orderTotals } from "./order";
import { paymentInRange, paymentMethodLabel, receivedInRange, signedPaymentAmount } from "./payments";

export type PeriodKey = "today" | "week" | "month" | "year" | "all";

export interface Range {
  from: Date;
  to: Date;
  title: string;
  label: string;
  key: PeriodKey;
}

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function formatDay(date: Date) {
  return `${date.getDate()} ${MONTHS_GEN[date.getMonth()]}`;
}

export function getRange(period: PeriodKey, offset: number, now = new Date()): Range {
  if (period === "today") {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    return {
      from: startOfDay(day),
      to: endOfDay(day),
      title: offset === 0 ? "Сегодня" : offset === -1 ? "Вчера" : formatDay(day),
      label: formatDay(day),
      key: period,
    };
  }
  if (period === "week") {
    const day = new Date(now);
    day.setDate(day.getDate() + offset * 7);
    const weekday = (day.getDay() + 6) % 7;
    const from = startOfDay(new Date(day));
    from.setDate(from.getDate() - weekday);
    const to = endOfDay(new Date(from));
    to.setDate(to.getDate() + 6);
    return { from, to, title: offset === 0 ? "Эта неделя" : "Неделя", label: `${formatDay(from)} — ${formatDay(to)}`, key: period };
  }
  if (period === "month") {
    const day = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const from = startOfDay(day);
    const to = endOfDay(new Date(day.getFullYear(), day.getMonth() + 1, 0));
    const title = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(day);
    return { from, to, title: title.charAt(0).toUpperCase() + title.slice(1), label: `${formatDay(from)} — ${formatDay(to)}`, key: period };
  }
  if (period === "year") {
    const year = now.getFullYear() + offset;
    return {
      from: startOfDay(new Date(year, 0, 1)),
      to: endOfDay(new Date(year, 11, 31)),
      title: `${year} год`,
      label: `январь — декабрь ${year}`,
      key: period,
    };
  }
  return {
    from: new Date(2000, 0, 1),
    to: endOfDay(now),
    title: "За всё время",
    label: "все записи",
    key: period,
  };
}

export function previousRange(range: Range): Range | null {
  if (range.key === "all") return null;
  return getRange(range.key, -1, range.from);
}

function inRange(iso: string | undefined, range: Range) {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return time >= range.from.getTime() && time <= range.to.getTime();
}

/** Заказы, попавшие в период: одна точка правды для метрик и зарплат. */
export function ordersInRange(range: Range, orders: Order[]) {
  return orders.filter((order) => order.status !== "запись" && inRange(orderDate(order), range));
}

/** День, к которому относится заказ: когда закрыт, иначе плановый день визита. */
export function orderDate(order: Order) {
  if (order.status === "выдан") return order.issuedAt ?? order.completedAt ?? order.plannedAt ?? order.createdAt;
  return order.completedAt ?? order.plannedAt ?? order.createdAt;
}

export interface Metrics {
  orders: Order[];
  closed: Order[];
  revenue: number;
  worksRevenue: number;
  partsRevenue: number;
  received: number;
  debt: number;
  stockPurchases: number;
  otherExpenses: number;
  /** Возвраты поставщикам, деньги по которым уже пришли. */
  refunds: number;
  expenses: number;
  salaries: number;
  /** Выплачено сдельной зарплаты за период — движение денег, не расход. */
  payouts: number;
  profit: number;
  averageCheck: number;
}

/**
 * Расход, который участвует в себестоимости периода.
 * Выплата сдельной зарплаты не в счёт: она уже учтена в начислении (salaries),
 * иначе одна и та же сумма вычиталась бы дважды.
 * Возврат поставщику — тоже нет: он уменьшает расходы отдельной строкой.
 */
export function isCostExpense(expense: Expense) {
  return expense.source !== "payroll" && expense.source !== "supplier_refund";
}

/** Возврат поставщику считается только после подтверждения прихода денег. */
export function isConfirmedRefund(expense: Expense) {
  return expense.source === "supplier_refund" && expense.status === "Возвращено";
}

export function computeMetrics(
  range: Range,
  orders: Order[],
  expenses: Expense[],
  salaries: number,
  payments: Payment[] = [],
): Metrics {
  // Выручка — только по реально выданным заказам. Активный заказ не должен
  // увеличивать прибыль до завершения сделки.
  const periodOrders = orders.filter((order) => order.status !== "запись" && inRange(orderDate(order), range));
  const closed = periodOrders.filter((order) => order.status === "выдан");

  let worksRevenue = 0;
  let partsRevenue = 0;
  let revenue = 0;
  let debt = 0;

  closed.forEach((order) => {
    const totals = orderTotals(order);
    worksRevenue += totals.works;
    partsRevenue += totals.parts;
    revenue += totals.due;
    debt += Math.max(0, totals.debt);
  });
  const received = receivedInRange(payments, range.from, range.to);

  const periodExpenses = expenses.filter((expense) => inRange(expense.date, range));
  const costs = periodExpenses.filter(isCostExpense);
  const stockPurchases = costs
    .filter((expense) => expense.source === "stock_purchase" || expense.category === "Закупка запчастей")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const gross = costs.reduce((sum, expense) => sum + expense.amount, 0);
  const refunds = periodExpenses.filter(isConfirmedRefund).reduce((sum, expense) => sum + expense.amount, 0);
  const payouts = periodExpenses
    .filter((expense) => expense.source === "payroll")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const total = gross - refunds;

  return {
    orders: periodOrders,
    closed,
    revenue,
    worksRevenue,
    partsRevenue,
    received,
    debt,
    stockPurchases,
    otherExpenses: gross - stockPurchases,
    refunds,
    expenses: total,
    salaries,
    payouts,
    profit: revenue - total - salaries,
    averageCheck: closed.length ? Math.round(revenue / closed.length) : 0,
  };
}

export interface ChartPoint {
  label: string;
  revenue: number;
  expenses: number;
}

export function buildChart(range: Range, payments: Payment[], expenses: Expense[]): ChartPoint[] {
  const days = Math.ceil((range.to.getTime() - range.from.getTime()) / 86_400_000);
  const byMonth = days > 62;
  const buckets = new Map<string, ChartPoint>();

  const keyFor = (date: Date) =>
    byMonth ? `${date.getFullYear()}-${date.getMonth()}` : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  if (byMonth) {
    const cursor = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
    while (cursor <= range.to) {
      buckets.set(keyFor(cursor), {
        label: new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(cursor),
        revenue: 0,
        expenses: 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    const cursor = new Date(range.from);
    while (cursor <= range.to) {
      buckets.set(keyFor(cursor), { label: String(cursor.getDate()), revenue: 0, expenses: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  payments.filter((payment) => paymentInRange(payment, range.from, range.to)).forEach((payment) => {
    const bucket = buckets.get(keyFor(new Date(payment.at)));
    if (bucket) bucket.revenue += signedPaymentAmount(payment);
  });

  expenses.forEach((expense) => {
    const bucket = buckets.get(keyFor(new Date(expense.date)));
    if (!bucket) return;
    if (isCostExpense(expense)) {
      bucket.expenses += expense.amount;
      return;
    }
    if (isConfirmedRefund(expense)) {
      bucket.expenses -= expense.amount;
    }
  });

  return [...buckets.values()];
}

export function topServices(orders: Order[], limit = 6) {
  const map = new Map<string, { name: string; count: number; revenue: number }>();
  orders.forEach((order) =>
    order.works.forEach((work) => {
      const entry = map.get(work.name) ?? { name: work.name, count: 0, revenue: 0 };
      entry.count += work.qty;
      entry.revenue += work.price * work.qty;
      map.set(work.name, entry);
    }),
  );
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export function byVehicleMake(orders: Order[], vehicles: Vehicle[], limit = 6) {
  const map = new Map<string, { make: string; count: number; revenue: number }>();
  orders.forEach((order) => {
    const vehicle = vehicles.find((item) => item.id === order.vehicleId);
    const make = vehicle?.make ?? "Без марки";
    const entry = map.get(make) ?? { make, count: 0, revenue: 0 };
    entry.count += 1;
    entry.revenue += orderTotals(order).due;
    map.set(make, entry);
  });
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export function clientsBreakdown(range: Range, orders: Order[], allOrders: Order[]) {
  const ids = [...new Set(orders.map((order) => order.clientId))];
  const repeat = ids.filter((id) =>
    allOrders.some((order) => order.clientId === id && new Date(orderDate(order)) < range.from),
  ).length;
  return { total: ids.length, repeat, fresh: ids.length - repeat };
}

export function topDebtors(orders: Order[], clients: Client[], limit = 5) {
  const map = new Map<string, { name: string; debt: number }>();
  orders.forEach((order) => {
    const debt = Math.max(0, orderTotals(order).debt);
    if (debt <= 0) return;
    const name = clients.find((client) => client.id === order.clientId)?.name ?? "Клиент";
    const entry = map.get(order.clientId) ?? { name, debt: 0 };
    entry.debt += debt;
    map.set(order.clientId, entry);
  });
  return [...map.values()].sort((a, b) => b.debt - a.debt).slice(0, limit);
}

export function stockValue(stock: StockItem[]) {
  return stock.reduce((sum, item) => sum + item.qty * item.purchasePrice, 0);
}

/** Заказы с непогашенным долгом — «ожидаем оплату». */
export function pendingPayments(orders: Order[], clients: Client[], limit = 6) {
  return orders
    .filter((order) => order.status !== "запись")
    .map((order) => ({
      order,
      client: clients.find((client) => client.id === order.clientId),
      debt: Math.max(0, orderTotals(order).debt),
    }))
    .filter((entry) => entry.debt > 0)
    .sort((a, b) => b.debt - a.debt)
    .slice(0, limit);
}

export interface Operation {
  id: string;
  date: string;
  title: string;
  category: string;
  orderId?: string;
  orderNumber?: string;
  amount: number;
  /** Деньги ещё не пришли — операция показывается, но в суммы не идёт. */
  pending?: boolean;
}

/** Единая лента операций: поступления по заказам и расходы. */
export function buildOperations(range: Range, orders: Order[], expenses: Expense[], payments: Payment[]): Operation[] {
  const income: Operation[] = payments
    .filter((payment) => paymentInRange(payment, range.from, range.to))
    .map((payment) => {
      const order = orders.find((item) => item.id === payment.orderId);
      return {
        id: `in-${payment.id}`,
        date: payment.at,
        title: "Оплата по заказ-наряду",
        category: payment.estimated
          ? `Поступление · ${paymentMethodLabel(payment.method)} · дата восстановлена`
          : `Поступление · ${paymentMethodLabel(payment.method)}`,
        orderId: order?.id,
        orderNumber: order?.number,
        amount: signedPaymentAmount(payment),
      };
    });

  const outcome: Operation[] = expenses
    .filter((expense) => inRange(expense.date, range))
    .map((expense) => ({
      id: `out-${expense.id}`,
      date: expense.date,
      title: expense.description,
      category: expense.category,
      // Возврат поставщику — приход денег, но только когда он подтверждён.
      amount: expense.source === "supplier_refund"
        ? (expense.status === "Возвращено" ? expense.amount : 0)
        : -expense.amount,
      pending: expense.source === "supplier_refund" && expense.status !== "Возвращено",
    }));

  return [...income, ...outcome].sort((a, b) => b.date.localeCompare(a.date));
}
