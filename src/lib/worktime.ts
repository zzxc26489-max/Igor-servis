import type { Order, OrderStatus, StatusEvent } from "../types";
import { shiftISOTime, toISODate } from "./date";
import { SLOT_MINUTES, toMinutes } from "./lift";
import { workDay, workDayMinutes } from "./workday";

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

function makeInterval(from: Date, to: Date): Interval | null {
  const minutes = (to.getTime() - from.getTime()) / 60000;
  return minutes > 0 ? { from, to, minutes } : null;
}

/**
 * Обрезаем отрезок рабочим днём и по календарным дням: машину могли оставить
 * на ночь, но мастер в это время не работал, и в темп это писать нельзя.
 */
function clampToWorkday(interval: Interval): Interval[] {
  const result: Interval[] = [];
  const hours = workDay();
  const dayStart = toMinutes(hours.start);
  const dayEnd = toMinutes(hours.end);

  const cursor = new Date(interval.from);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= interval.to) {
    const open = new Date(cursor);
    open.setHours(Math.floor(dayStart / 60), dayStart % 60, 0, 0);
    const close = new Date(cursor);
    close.setHours(Math.floor(dayEnd / 60), dayEnd % 60, 0, 0);

    const from = interval.from > open ? interval.from : open;
    const to = interval.to < close ? interval.to : close;
    const slice = makeInterval(from, to);
    if (slice) result.push(slice);

    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

/**
 * Промежутки, когда машина стояла на подъёмнике. Считаем по истории статусов:
 * заказ могли вернуть в работу, и тогда набегает несколько отрезков.
 * Заказ без назначенного подъёмника не считается: показатель называется
 * «время на подъёмнике», и приписывать ему чужое время нечестно.
 */
export function liftIntervals(order: Order, now = new Date()): Interval[] {
  if (!order.liftId) return [];
  const timeline = order.timeline ?? [];
  if (timeline.length === 0) return [];

  const raw: Interval[] = [];
  let openedAt: Date | null = null;

  for (const event of [...timeline].sort((a, b) => a.at.localeCompare(b.at))) {
    const at = new Date(event.at);
    if (Number.isNaN(at.getTime())) continue;
    if (isOnLift(event.status)) {
      if (!openedAt) openedAt = at;
    } else if (openedAt) {
      const slice = makeInterval(openedAt, at);
      if (slice) raw.push(slice);
      openedAt = null;
    }
  }
  // Машина всё ещё на подъёмнике — считаем до текущего момента.
  if (openedAt) {
    const slice = makeInterval(openedAt, now);
    if (slice) raw.push(slice);
  }

  return raw.flatMap(clampToWorkday);
}

/** Минуты отрезков, попавшие внутрь периода. Заказ может идти через границу дня. */
export function minutesInRange(intervals: Interval[], from?: Date, to?: Date) {
  return intervals.reduce((sum, interval) => {
    const start = from && interval.from < from ? from : interval.from;
    const end = to && interval.to > to ? to : interval.to;
    const minutes = (end.getTime() - start.getTime()) / 60000;
    return sum + Math.max(0, minutes);
  }, 0);
}

export interface Period {
  from: Date;
  to: Date;
}

/**
 * Время восстановлено по плановому окну, а не замерено. Такие заказы заведены
 * до появления истории статусов: сравнивать их с нормативом нечестно, поэтому
 * в отчётах они помечены и по умолчанию в анализ не попадают.
 */
export function isEstimatedTiming(order: Order) {
  return (order.timeline ?? []).some((event) => event.estimated);
}

/**
 * Время замерено по-настоящему, а не взято из плана. В аналитику пускаем
 * только такие заказы: плановое окно сравнивать с нормативом бессмысленно.
 */
export function hasMeasuredTime(order: Order, now = new Date()) {
  return liftIntervals(order, now).length > 0;
}

/** Замер закончен: машина уже сошла с подъёмника. */
export function isTimingComplete(order: Order, now = new Date()) {
  return hasMeasuredTime(order, now) && !isOnLift(order.status);
}

/** Фактическое время на подъёмнике, минут. С периодом — только его часть. */
export function actualMinutes(order: Order, period?: Period, now = new Date()) {
  return Math.round(minutesInRange(liftIntervals(order, now), period?.from, period?.to));
}

/** Норматив по заказу: сумма нормативов работ с учётом количества. */
export function normMinutes(order: Order) {
  return order.works.reduce((sum, work) => sum + (work.normMinutes ?? 0) * work.qty, 0);
}

/**
 * Доля норматива, приходящаяся на попавшую в период часть работы. Если из
 * трёх часов заказа в период попал час, то и норматива берём треть.
 */
function normShareInPeriod(order: Order, period: Period | undefined, now: Date) {
  const intervals = liftIntervals(order, now);
  const total = minutesInRange(intervals);
  if (total <= 0) return 0;
  if (!period) return 1;
  return minutesInRange(intervals, period.from, period.to) / total;
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

/** Заказы, чьё время хотя бы частично попало в период. */
export function ordersWithTimeIn(orders: Order[], period?: Period, now = new Date(), includeEstimated = false) {
  return orders.filter((order) => {
    if (!isTimingComplete(order, now)) return false;
    if (!includeEstimated && isEstimatedTiming(order)) return false;
    return actualMinutes(order, period, now) > 0;
  });
}

/** Сколько заказов периода посчитаны по восстановленному, а не замеренному времени. */
export function estimatedOrdersIn(orders: Order[], period?: Period, now = new Date()) {
  return orders.filter(
    (order) => isEstimatedTiming(order) && isTimingComplete(order, now) && actualMinutes(order, period, now) > 0,
  ).length;
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
export function timingByService(orders: Order[], period?: Period, now = new Date(), includeEstimated = false): ServiceTiming[] {
  const map = new Map<string, ServiceTiming>();

  for (const order of ordersWithTimeIn(orders, period, now, includeEstimated)) {
    const norm = normMinutes(order);
    if (norm <= 0) continue;
    const actual = actualMinutes(order, period, now);
    const share = normShareInPeriod(order, period, now);

    for (const work of order.works) {
      const workNorm = (work.normMinutes ?? 0) * work.qty;
      if (workNorm <= 0) continue;
      const entry = map.get(work.name) ?? { name: work.name, count: 0, normMinutes: 0, actualMinutes: 0, deviation: null };
      entry.count += work.qty;
      entry.normMinutes += workNorm * share;
      entry.actualMinutes += (actual * workNorm) / norm;
      map.set(work.name, entry);
    }
  }

  return [...map.values()]
    .map((entry) => ({
      ...entry,
      normMinutes: Math.round(entry.normMinutes),
      actualMinutes: Math.round(entry.actualMinutes),
      deviation: deviationPercent(Math.round(entry.normMinutes), Math.round(entry.actualMinutes)),
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
export function timingByExecutor(orders: Order[], period?: Period, now = new Date(), includeEstimated = false): ExecutorTiming[] {
  const map = new Map<string, ExecutorTiming & { orderIds: Set<string> }>();

  for (const order of ordersWithTimeIn(orders, period, now, includeEstimated)) {
    const norm = normMinutes(order);
    if (norm <= 0) continue;
    const actual = actualMinutes(order, period, now);
    const share = normShareInPeriod(order, period, now);

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
      entry.normMinutes += workNorm * share;
      entry.actualMinutes += (actual * workNorm) / norm;
      entry.revenue += work.price * work.qty * share;
      map.set(name, entry);
    }
  }

  return [...map.values()]
    .map(({ orderIds, ...entry }) => {
      const actual = Math.round(entry.actualMinutes);
      const norm = Math.round(entry.normMinutes);
      return {
        ...entry,
        orders: orderIds.size,
        normMinutes: norm,
        actualMinutes: actual,
        revenue: Math.round(entry.revenue),
        deviation: deviationPercent(norm, actual),
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

/** Загрузка подъёмников за период: часы занятости от доступного времени. */
export function loadByLift(orders: Order[], liftIds: number[], period: Period, now = new Date()): LiftLoad[] {
  const dayCapacity = workDayMinutes();
  const days = new Set<string>();
  const minutes = new Map<number, number>();
  const counts = new Map<number, Set<string>>();

  for (const order of orders) {
    if (!order.liftId) continue;
    for (const interval of liftIntervals(order, now)) {
      const span = minutesInRange([interval], period.from, period.to);
      if (span <= 0) continue;
      minutes.set(order.liftId, (minutes.get(order.liftId) ?? 0) + span);
      const set = counts.get(order.liftId) ?? new Set<string>();
      set.add(order.id);
      counts.set(order.liftId, set);
      days.add(toISODate(interval.from));
    }
  }

  // Считаем только дни, в которые сервис вообще работал.
  const capacity = Math.max(1, days.size) * dayCapacity;

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
export function biggestDeviations(orders: Order[], period?: Period, limit = 6, now = new Date(), includeEstimated = false) {
  return ordersWithTimeIn(orders, period, now, includeEstimated)
    .map((order) => {
      const share = normShareInPeriod(order, period, now);
      const norm = Math.round(normMinutes(order) * share);
      const actual = actualMinutes(order, period, now);
      return { order, norm, actual, deviation: deviationPercent(norm, actual) };
    })
    .filter((entry) => entry.norm > 0 && entry.deviation !== null)
    .sort((a, b) => Math.abs(b.deviation!) - Math.abs(a.deviation!))
    .slice(0, limit);
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
      const minutes = actualMinutes(order, undefined, now);
      const norm = normMinutes(order);
      return { order, minutes, norm, deviation: deviationPercent(norm, minutes) };
    })
    .sort((a, b) => (b.deviation ?? -Infinity) - (a.deviation ?? -Infinity));
}

/** Сводка по периоду: нормо-часы, фактические часы и темп работы. */
export function timingSummary(orders: Order[], period?: Period, now = new Date(), includeEstimated = false) {
  let norm = 0;
  let actual = 0;
  let counted = 0;
  for (const order of ordersWithTimeIn(orders, period, now, includeEstimated)) {
    const orderNorm = normMinutes(order) * normShareInPeriod(order, period, now);
    const orderActual = actualMinutes(order, period, now);
    if (orderNorm <= 0 || orderActual <= 0) continue;
    norm += orderNorm;
    actual += orderActual;
    counted += 1;
  }
  norm = Math.round(norm);
  return {
    orders: counted,
    estimatedOrders: estimatedOrdersIn(orders, period, now),
    normMinutes: norm,
    actualMinutes: actual,
    deviation: deviationPercent(norm, actual),
    /** Больше 1 — делают быстрее норматива. */
    pace: actual > 0 ? norm / actual : 0,
  };
}

/**
 * История статусов для заказов, заведённых до её появления. Без этого
 * у старого заказа после нажатия «Готово» фактическое время было бы нулевым.
 *
 * Все восстановленные отметки помечаются `estimated`: это оценка по плановому
 * окну и нормативу, а не замер. В отчётах такие заказы отделены от точных.
 */
export function backfillTimeline(order: Order): StatusEvent[] {
  if (order.timeline && order.timeline.length > 0) return order.timeline;

  const guess = (status: OrderStatus, at: string): StatusEvent => ({ status, at, estimated: true });
  const events: StatusEvent[] = [guess("запись", order.createdAt)];
  if (order.status === "запись") return events;

  const day = order.plannedAt ?? order.createdAt.slice(0, 10);
  const planStart = order.scheduledStart ? `${day}T${order.scheduledStart}:00` : null;
  const startedAt = planStart && planStart > order.createdAt ? planStart : order.createdAt;
  events.push(guess("в работе", startedAt));

  // Конец работ: фактическая отметка, иначе плановое окно, иначе норматив
  // работ. Без этого у старого «ожидает запчасти» начало и конец совпадали
  // и отрезок получался нулевым — время на подъёмнике выходило нулём.
  const planEnd = order.scheduledEnd ? `${day}T${order.scheduledEnd}:00` : null;
  const norm = normMinutes(order);
  const fallback = shiftISOTime(startedAt, norm > 0 ? norm : SLOT_MINUTES);
  const candidate = order.completedAt ?? (planEnd && planEnd > startedAt ? planEnd : fallback);
  const endedAt = candidate > startedAt ? candidate : fallback;

  if (order.status === "готово" || order.status === "выдан") {
    events.push(guess("готово", endedAt));
    if (order.status === "выдан") events.push(guess("выдан", endedAt));
  } else if (!isOnLift(order.status)) {
    // «Ожидает запчасти»: машина сошла с подъёмника, время остановилось.
    events.push(guess(order.status, endedAt));
  }

  return events;
}
