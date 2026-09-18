import type { Lift, Order } from "../types";

export const WORK_DAY_START = "08:00";
export const WORK_DAY_END = "20:00";

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

export interface LiftState {
  orders: Order[];
  /** Машина на подъёмнике прямо сейчас (только для сегодняшнего дня). */
  current: Order | null;
  /** Ближайшая запись после текущего момента. */
  next: Order | null;
  /** Занят именно сейчас, а не «есть запись на вечер». */
  busyNow: boolean;
  /** С какого времени подъёмник свободен и до какого — ближайшее окно. */
  freeFrom: string;
  freeUntil: string | null;
}

/**
 * Состояние подъёмника на выбранный день.
 * Разделяем «занят сейчас» и «есть записи»: вечерняя запись не должна
 * помечать подъёмник занятым с утра.
 */
export function liftState(orders: Order[], lift: Lift, day: string, now = new Date()): LiftState {
  const dayOrders = liftOrders(orders, lift.id, day);
  const isToday = day === now.toISOString().slice(0, 10);
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : toMinutes(WORK_DAY_START);

  const withTime = dayOrders.filter((order) => order.scheduledStart);
  const current = isToday
    ? withTime.find((order) => {
        const start = toMinutes(order.scheduledStart!);
        const end = toMinutes(order.scheduledEnd ?? order.scheduledStart!) || start + 60;
        return nowMinutes >= start && nowMinutes < end;
      }) ?? null
    : null;

  const next = withTime.find((order) => toMinutes(order.scheduledStart!) > nowMinutes) ?? null;

  // Свободное окно: от конца текущей записи (или «сейчас») до начала следующей.
  // Время округляем вверх до четверти часа — записывать «с 15:31» неудобно.
  const rawFreeFrom = current
    ? toMinutes(current.scheduledEnd ?? current.scheduledStart!)
    : Math.max(nowMinutes, toMinutes(WORK_DAY_START));
  const freeFromMinutes = Math.ceil(rawFreeFrom / 15) * 15;
  const freeUntilMinutes = next ? toMinutes(next.scheduledStart!) : null;

  return {
    orders: dayOrders,
    current,
    next,
    busyNow: Boolean(current),
    freeFrom: fromMinutes(freeFromMinutes),
    freeUntil: freeUntilMinutes !== null ? fromMinutes(freeUntilMinutes) : null,
  };
}

/** Короткая подпись состояния: «Занят сейчас», «Свободен до 14:00» или «Свободен». */
export function liftLabel(state: LiftState) {
  if (state.busyNow) return "Занят сейчас";
  if (state.next?.scheduledStart) return `Свободен до ${state.next.scheduledStart}`;
  return "Свободен";
}

/** Ссылка на новую запись с уже выбранным подъёмником, датой и временем. */
export function bookingLink(liftId: number | undefined, day: string, time?: string) {
  const params = new URLSearchParams();
  if (liftId) params.set("lift", String(liftId));
  params.set("date", day);
  if (time) params.set("time", time);
  return `/orders/new?${params.toString()}`;
}
