import type { Order, OrderStatus, StatusEvent } from "../types";
import { toISODate } from "./date";

/** Статусы, в которых машина реально занимает подъёмник. */
const ON_LIFT: OrderStatus[] = ["диагностика", "в работе"];

export function isOnLift(status: OrderStatus) {
  return ON_LIFT.includes(status);
}

export interface Interval {
  from: Date;
  to: Date;
  minutes: number;
}

/**
 * Промежутки, когда машина стояла на подъёмнике. Считаем по истории статусов:
 * заказ могли вернуть в работу, и тогда времени набегает больше одного отрезка.
 */
export function liftIntervals(order: Order, now = new Date()): Interval[] {
  const timeline = order.timeline ?? [];
  if (timeline.length === 0) return [];

  const result: Interval[] = [];
  let openedAt: Date | null = null;

  for (const event of [...timeline].sort((a, b) => a.at.localeCompare(b.at))) {
    const at = new Date(event.at);
    if (Number.isNaN(at.getTime())) continue;
    if (isOnLift(event.status)) {
      if (!openedAt) openedAt = at;
    } else if (openedAt) {
      if (at > openedAt) result.push({ from: openedAt, to: at, minutes: (at.getTime() - openedAt.getTime()) / 60000 });
      openedAt = null;
    }
  }
  // Машина всё ещё на подъёмнике — считаем до текущего момента.
  if (openedAt && now > openedAt) {
    result.push({ from: openedAt, to: now, minutes: (now.getTime() - openedAt.getTime()) / 60000 });
  }
  return result;
}

/**
 * Время замерено по-настоящему, а не взято из плана. В аналитику пускаем
 * только такие заказы: плановое окно сравнивать с нормативом бессмысленно.
 */
export function hasMeasuredTime(order: Order, now = new Date()) {
  return liftIntervals(order, now).length > 0;
}

/**
 * Замер закончен: машина уже сошла с подъёмника. Машины, которые стоят прямо
 * сейчас, в отклонения не берём — их время ещё растёт и исказило бы статистику.
 */
export function isTimingComplete(order: Order, now = new Date()) {
  return hasMeasuredTime(order, now) && !isOnLift(order.status);
}

export interface RunningOrder {
  order: Order;
  minutes: number;
  norm: number;
  deviation: number | null;
}

/** Машины, которые стоят на подъёмнике прямо сейчас, и сколько уже стоят. */
export function runningOrders(orders: Order[], now = new Date()): RunningOrder[] {
  return orders
    .filter((order) => isOnLift(order.status) && hasMeasuredTime(order, now))
    .map((order) => {
      const minutes = actualMinutes(order, now);
      const norm = normMinutes(order);
      return { order, minutes, norm, deviation: deviationPercent(norm, minutes) };
    })
    .sort((a, b) => (b.deviation ?? -Infinity) - (a.deviation ?? -Infinity));
}

/** Фактическое время на подъёмнике, минут. Ноль — если замера не было. */
export function actualMinutes(order: Order, now = new Date()) {
  const intervals = liftIntervals(order, now);
  if (intervals.length === 0) return 0;
  return Math.round(intervals.reduce((sum, item) => sum + item.minutes, 0));
}

/** Норматив по заказу: сумма нормативов работ с учётом количества. */
export function normMinutes(order: Order) {
  return order.works.reduce((sum, work) => sum + (work.normMinutes ?? 0) * work.qty, 0);
}

/** Плановое окно записи, минут. */
export function plannedMinutes(order: Order) {
  if (!order.scheduledStart || !order.scheduledEnd) return 0;
  const [sh, sm] = order.scheduledStart.split(":").map(Number);
  const [eh, em] = order.scheduledEnd.split(":").map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
}

export function formatDuration(minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} мин`;
  if (rest === 0) return `${hours} ч`;
  return `${hours} ч ${rest} мин`;
}

/** Отклонение факта от норматива в процентах: плюс — дольше норматива. */
export function deviationPercent(norm: number, actual: number) {
  if (norm <= 0) return null;
  return Math.round(((actual - norm) / norm) * 100);
}

export interface ServiceTiming {
  name: string;
  count: number;
  normMinutes: number;
  actualMinutes: number;
  deviation: number | null;
}

/**
 * Время по видам работ. Фактическое время заказа делим между работами
 * пропорционально нормативу — иначе одной длинной работе достался бы весь
 * простой всего заказа.
 */
export function timingByService(orders: Order[], now = new Date()): ServiceTiming[] {
  const map = new Map<string, ServiceTiming>();

  for (const order of orders.filter((item) => isTimingComplete(item, now))) {
    const norm = normMinutes(order);
    if (norm <= 0) continue;
    const actual = actualMinutes(order, now);
    if (actual <= 0) continue;

    for (const work of order.works) {
      const workNorm = (work.normMinutes ?? 0) * work.qty;
      if (workNorm <= 0) continue;
      const entry = map.get(work.name) ?? { name: work.name, count: 0, normMinutes: 0, actualMinutes: 0, deviation: null };
      entry.count += work.qty;
      entry.normMinutes += workNorm;
      entry.actualMinutes += (actual * workNorm) / norm;
      map.set(work.name, entry);
    }
  }

  return [...map.values()]
    .map((entry) => ({
      ...entry,
      actualMinutes: Math.round(entry.actualMinutes),
      deviation: deviationPercent(entry.normMinutes, entry.actualMinutes),
    }))
    .sort((a, b) => b.actualMinutes - a.actualMinutes);
}

export interface ExecutorTiming {
  name: string;
  orders: number;
  works: number;
  normMinutes: number;
  actualMinutes: number;
  deviation: number | null;
  revenue: number;
  /** Выручка по работам за час фактической занятости. */
  revenuePerHour: number;
}

/** Время и выработка по исполнителям. */
export function timingByExecutor(orders: Order[], now = new Date()): ExecutorTiming[] {
  const map = new Map<string, ExecutorTiming & { orderIds: Set<string> }>();

  for (const order of orders.filter((item) => isTimingComplete(item, now))) {
    const norm = normMinutes(order);
    if (norm <= 0) continue;
    const actual = actualMinutes(order, now);
    if (actual <= 0) continue;

    for (const work of order.works) {
      const workNorm = (work.normMinutes ?? 0) * work.qty;
      if (workNorm <= 0) continue;
      const name = work.executor || "Не указан";
      const entry = map.get(name) ?? {
        name, orders: 0, works: 0, normMinutes: 0, actualMinutes: 0,
        deviation: null, revenue: 0, revenuePerHour: 0, orderIds: new Set<string>(),
      };
      entry.orderIds.add(order.id);
      entry.works += work.qty;
      entry.normMinutes += workNorm;
      entry.actualMinutes += (actual * workNorm) / norm;
      entry.revenue += work.price * work.qty;
      map.set(name, entry);
    }
  }

  return [...map.values()]
    .map(({ orderIds, ...entry }) => {
      const actual = Math.round(entry.actualMinutes);
      return {
        ...entry,
        orders: orderIds.size,
        actualMinutes: actual,
        deviation: deviationPercent(entry.normMinutes, actual),
        revenuePerHour: actual > 0 ? Math.round((entry.revenue / actual) * 60) : 0,
      };
    })
    .sort((a, b) => b.actualMinutes - a.actualMinutes);
}

export interface LiftLoad {
  liftId: number;
  minutes: number;
  orders: number;
  /** Доля рабочего времени, занятая машинами, в процентах. */
  loadPercent: number;
}

/**
 * Загрузка подъёмников за период: сколько часов на них реально стояли машины
 * от доступного рабочего времени.
 */
export function loadByLift(
  orders: Order[],
  liftIds: number[],
  from: Date,
  to: Date,
  workDayMinutes = 12 * 60,
  now = new Date(),
): LiftLoad[] {
  const days = new Set<string>();
  const minutes = new Map<number, number>();
  const counts = new Map<number, Set<string>>();

  for (const order of orders) {
    if (!order.liftId) continue;
    for (const interval of liftIntervals(order, now)) {
      if (interval.to < from || interval.from > to) continue;
      const start = interval.from < from ? from : interval.from;
      const end = interval.to > to ? to : interval.to;
      const span = (end.getTime() - start.getTime()) / 60000;
      if (span <= 0) continue;
      minutes.set(order.liftId, (minutes.get(order.liftId) ?? 0) + span);
      const set = counts.get(order.liftId) ?? new Set<string>();
      set.add(order.id);
      counts.set(order.liftId, set);
      days.add(toISODate(start));
    }
  }

  // Считаем только рабочие дни, в которые вообще были машины.
  const workingDays = Math.max(1, days.size);
  const capacity = workingDays * workDayMinutes;

  return liftIds.map((liftId) => {
    const busy = Math.round(minutes.get(liftId) ?? 0);
    return {
      liftId,
      minutes: busy,
      orders: counts.get(liftId)?.size ?? 0,
      loadPercent: Math.min(100, Math.round((busy / capacity) * 100)),
    };
  });
}

/** Заказы, где факт сильнее всего разошёлся с нормативом. */
export function biggestDeviations(orders: Order[], limit = 6, now = new Date()) {
  return orders
    .filter((order) => isTimingComplete(order, now))
    .map((order) => {
      const norm = normMinutes(order);
      const actual = actualMinutes(order, now);
      return { order, norm, actual, deviation: deviationPercent(norm, actual) };
    })
    .filter((entry) => entry.norm > 0 && entry.actual > 0 && entry.deviation !== null)
    .sort((a, b) => Math.abs(b.deviation!) - Math.abs(a.deviation!))
    .slice(0, limit);
}

/** Сводка по периоду: нормо-часы, фактические часы и темп работы. */
export function timingSummary(orders: Order[], now = new Date()) {
  let norm = 0;
  let actual = 0;
  let counted = 0;
  for (const order of orders.filter((item) => isTimingComplete(item, now))) {
    const orderNorm = normMinutes(order);
    const orderActual = actualMinutes(order, now);
    if (orderNorm <= 0 || orderActual <= 0) continue;
    norm += orderNorm;
    actual += orderActual;
    counted += 1;
  }
  return {
    orders: counted,
    normMinutes: norm,
    actualMinutes: actual,
    deviation: deviationPercent(norm, actual),
    /** Больше 1 — делают быстрее норматива. */
    pace: actual > 0 ? norm / actual : 0,
  };
}

/** Пустая история для нового заказа. */
export function initialTimeline(status: OrderStatus, at: string): StatusEvent[] {
  return [{ status, at }];
}
