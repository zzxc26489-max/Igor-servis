import type { Lift, Order } from "../types";
import { shiftISODate, toISODate, todayISO } from "./date";

export const WORK_DAY_START = "08:00";
export const WORK_DAY_END = "20:00";
/** Стандартная длительность записи — столько же ставит форма новой записи. */
export const SLOT_MINUTES = 60;
/** Время предлагаем кратным четверти часа: «записать с 15:31» неудобно. */
const STEP_MINUTES = 15;

export function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

export function fromMinutes(minutes: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/** Дата визита: плановая, иначе день создания заказа. */
export function orderDay(order: Order) {
  return order.plannedAt ?? order.createdAt.slice(0, 10);
}

/** Записи подъёмника за день, по времени начала. */
export function liftOrders(orders: Order[], liftId: number, day: string) {
  return orders
    .filter((order) => order.liftId === liftId && order.status !== "выдан" && orderDay(order) === day)
    .sort((a, b) => (a.scheduledStart ?? "99:99").localeCompare(b.scheduledStart ?? "99:99"));
}

export interface FreeSlot {
  from: string;
  /** Конец окна; null — до конца рабочего дня. */
  to: string | null;
  minutes: number;
}

export interface LiftState {
  orders: Order[];
  /** Выбранный день — сегодняшний. Только для него имеет смысл «занят сейчас». */
  isToday: boolean;
  /** Машина на подъёмнике прямо сейчас. */
  current: Order | null;
  /** Ближайшая запись после текущего момента (или после начала дня). */
  next: Order | null;
  busyNow: boolean;
  /** Окна, куда целиком помещается стандартная запись. */
  freeSlots: FreeSlot[];
  /** Начало первого подходящего окна; null — свободного места на день нет. */
  suggestedStart: string | null;
}

/**
 * Состояние подъёмника на выбранный день: занятость, ближайшая запись и
 * свободные окна. Одна функция на расписание, главную и отчёты — иначе
 * десктоп и телефон предлагают разное время.
 */
export function liftState(orders: Order[], lift: Lift, day: string, now = new Date()): LiftState {
  const dayOrders = liftOrders(orders, lift.id, day);
  const isToday = day === toISODate(now);
  const dayStart = toMinutes(WORK_DAY_START);
  const dayEnd = toMinutes(WORK_DAY_END);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const booked = dayOrders
    .filter((order) => order.scheduledStart)
    .map((order) => {
      const start = toMinutes(order.scheduledStart!);
      const end = toMinutes(order.scheduledEnd ?? "") || start + SLOT_MINUTES;
      return { order, start, end: Math.max(end, start + 15) };
    })
    .sort((a, b) => a.start - b.start);

  const current = isToday
    ? booked.find((slot) => nowMinutes >= slot.start && nowMinutes < slot.end)?.order ?? null
    : null;
  const from = isToday ? Math.max(dayStart, nowMinutes) : dayStart;
  const next = booked.find((slot) => slot.start > from)?.order ?? null;

  // Собираем промежутки между записями и оставляем те, куда влезает час.
  const freeSlots: FreeSlot[] = [];
  let cursor = Math.ceil(from / STEP_MINUTES) * STEP_MINUTES;
  for (const slot of booked) {
    if (slot.end <= cursor) continue;
    const gap = slot.start - cursor;
    if (gap >= SLOT_MINUTES) {
      freeSlots.push({ from: fromMinutes(cursor), to: fromMinutes(slot.start), minutes: gap });
    }
    cursor = Math.max(cursor, Math.ceil(slot.end / STEP_MINUTES) * STEP_MINUTES);
  }
  if (dayEnd - cursor >= SLOT_MINUTES) {
    freeSlots.push({ from: fromMinutes(cursor), to: null, minutes: dayEnd - cursor });
  }

  return {
    orders: dayOrders,
    isToday,
    current,
    next,
    busyNow: Boolean(current),
    freeSlots,
    suggestedStart: freeSlots[0]?.from ?? null,
  };
}

/**
 * Подпись состояния. «Занят сейчас» имеет смысл только для сегодняшнего дня;
 * для будущих показываем количество записей и время первой.
 */
export function liftLabel(state: LiftState) {
  if (!state.isToday) {
    if (state.orders.length === 0) return "Записей нет";
    const first = state.orders[0]?.scheduledStart;
    const word = state.orders.length === 1 ? "запись" : state.orders.length < 5 ? "записи" : "записей";
    return first ? `${state.orders.length} ${word} · первая в ${first}` : `${state.orders.length} ${word}`;
  }
  if (state.busyNow) return "Занят сейчас";
  if (state.next?.scheduledStart) return `Свободен до ${state.next.scheduledStart}`;
  // Машин на подъёмнике нет: это «свободен», даже если рабочий день уже к концу.
  return "Свободен";
}

/**
 * Куда и с какой подписью ведёт кнопка записи. Если на сегодня часа уже не
 * осталось, предлагаем ближайший день, а не тупик «нет окна».
 */
export function bookingTarget(liftId: number, day: string, state: LiftState) {
  if (state.suggestedStart) {
    return {
      to: bookingLink(liftId, day, state.suggestedStart),
      label: state.orders.length === 0 ? "+ Записать" : `+ Записать с ${state.suggestedStart}`,
    };
  }
  return { to: bookingLink(liftId, shiftISODate(day, 1)), label: "Записать на завтра" };
}

/** Ссылка на новую запись с уже выбранным подъёмником, датой и временем. */
export function bookingLink(liftId: number | undefined, day: string, time?: string | null) {
  const params = new URLSearchParams();
  if (liftId) params.set("lift", String(liftId));
  params.set("date", day);
  if (time) params.set("time", time);
  return `/orders/new?${params.toString()}`;
}

/** Свободен ли подъёмник в конкретном интервале — проверка перед сохранением. */
export function isSlotFree(orders: Order[], liftId: number, day: string, start: string, end: string, skipOrderId?: string) {
  return !liftOrders(orders, liftId, day).some((order) => {
    if (order.id === skipOrderId || !order.scheduledStart) return false;
    const orderStart = toMinutes(order.scheduledStart);
    const orderEnd = toMinutes(order.scheduledEnd ?? "") || orderStart + SLOT_MINUTES;
    return toMinutes(start) < orderEnd && orderStart < toMinutes(end);
  });
}

export { todayISO };
