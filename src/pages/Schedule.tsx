import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  IconAlertTriangle,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconPlus,
  IconTool,
} from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Button, Card, Page, StatusBadge, TopBar } from "../components/ui";
import LiftTimeline from "../components/LiftTimeline";
import { bookingTarget, liftLabel, liftState, orderDay, toMinutes } from "../lib/lift";
import { plural } from "../lib/format";
import { toISODate, todayISO } from "../lib/date";
import type { Order } from "../types";

function shiftDay(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return toISODate(date);
}

function orderEndMinutes(order: Order) {
  const start = order.scheduledStart ? toMinutes(order.scheduledStart) : null;
  if (start === null) return null;
  const end = order.scheduledEnd ? toMinutes(order.scheduledEnd) : 0;
  return end > start ? end : start + 60;
}

function conflictingOrderIds(orders: Order[]) {
  const result = new Set<string>();
  const timed = orders
    .filter((order) => order.scheduledStart)
    .sort((a, b) => (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? ""));

  for (let index = 0; index < timed.length; index += 1) {
    const current = timed[index];
    const currentEnd = orderEndMinutes(current);
    if (currentEnd === null) continue;

    for (let nextIndex = index + 1; nextIndex < timed.length; nextIndex += 1) {
      const next = timed[nextIndex];
      const nextStart = toMinutes(next.scheduledStart!);
      if (nextStart >= currentEnd) break;
      result.add(current.id);
      result.add(next.id);
    }
  }

  return result;
}

function formatDayLabel(day: string) {
  const value = new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
  }).format(new Date(`${day}T12:00:00`));
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function Schedule() {
  const { lifts, orders, clients, vehicles } = useAppStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = todayISO();
  const focusLift = Number(params.get("lift")) || null;
  const [day, setDay] = useState(() => {
    const asked = params.get("date");
    return asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today;
  });

  const dayOrders = useMemo(
    () =>
      orders
        .filter((order) => order.status !== "выдан" && orderDay(order) === day)
        .sort((a, b) => (a.scheduledStart ?? "99:99").localeCompare(b.scheduledStart ?? "99:99")),
    [day, orders],
  );

  const states = useMemo(
    () => lifts.map((lift) => ({ lift, state: liftState(orders, lift, day) })),
    [day, lifts, orders],
  );
  const conflictIds = useMemo(
    () => new Set(states.flatMap(({ state }) => [...conflictingOrderIds(state.orders)])),
    [states],
  );

  const isToday = day === today;
  const busyNow = states.filter(({ state }) => state.busyNow).length;
  const withOrders = states.filter(({ state }) => state.orders.length > 0).length;
  const freeNow = states.filter(({ state }) => (isToday ? !state.busyNow : state.orders.length === 0)).length;
  const unassigned = dayOrders.filter((order) => !order.liftId);
  const dayLabel = formatDayLabel(day);

  return (
    <>
      <TopBar
        title="Расписание"
        subtitle={
          isToday
            ? `${busyNow} из ${lifts.length} занято сейчас · ${dayOrders.length} ${plural(dayOrders.length, "визит", "визита", "визитов")}`
            : `${withOrders} из ${lifts.length} с записями · ${dayOrders.length} ${plural(dayOrders.length, "визит", "визита", "визитов")}`
        }
      />

      <Page>
        <div className="space-y-4">
          <Card className="p-3 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <IconCalendar size={20} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold">{dayLabel}</h2>
                  <p className="muted text-sm">
                    {freeNow} из {lifts.length} {isToday ? "свободны сейчас" : "без записей"}
                    {unassigned.length > 0 ? ` · ${unassigned.length} без подъёмника` : ""}
                    {conflictIds.size > 0 ? ` · ${conflictIds.size} с пересечением времени` : ""}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="icon" variant="secondary" onClick={() => setDay(shiftDay(day, -1))} aria-label="Предыдущий день">
                  <IconChevronLeft size={18} />
                </Button>
                <input
                  type="date"
                  value={day}
                  onChange={(event) => event.target.value && setDay(event.target.value)}
                  className="min-h-11 rounded-lg border bg-white px-3 text-sm font-semibold sm:min-h-9"
                  style={{ borderColor: "var(--border)" }}
                  aria-label="Дата расписания"
                />
                <Button size="icon" variant="secondary" onClick={() => setDay(shiftDay(day, 1))} aria-label="Следующий день">
                  <IconChevronRight size={18} />
                </Button>
                {day !== today && (
                  <Button size="sm" variant="secondary" onClick={() => setDay(today)}>Сегодня</Button>
                )}
              </div>
            </div>
          </Card>

          {unassigned.length > 0 && (
            <Card className="overflow-hidden p-0">
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2">
                  <IconAlertTriangle size={18} style={{ color: "var(--warning)" }} />
                  <div>
                    <h2 className="panel-title">Нужно назначить подъёмник</h2>
                    <p className="muted text-xs">{unassigned.length} {plural(unassigned.length, "визит", "визита", "визитов")} без места</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-px md:grid-cols-2 xl:grid-cols-3" style={{ background: "var(--border)" }}>
                {unassigned.map((order) => {
                  const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                  const client = clients.find((item) => item.id === order.clientId);
                  return (
                    <button
                      key={order.id}
                      onClick={() => navigate(`/orders/${order.id}`)}
                      className="bg-white p-3 text-left transition hover:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <b className="block truncate text-sm">{vehicle ? `${vehicle.make} ${vehicle.model}` : order.number}</b>
                          <span className="muted block truncate text-xs">
                            {vehicle?.plate ?? client?.name ?? "Клиент не указан"}
                          </span>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {order.scheduledStart ?? "Без времени"}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="muted truncate text-xs">{order.works[0]?.name ?? order.complaint ?? order.notes ?? "Причина не указана"}</span>
                        <StatusBadge status={order.status} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h2 className="section-title">Пять подъёмников</h2>
                <p className="muted mt-0.5 text-sm">Вся загрузка дня без горизонтальной прокрутки.</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {states.map(({ lift, state }) => {
                const target = bookingTarget(lift.id, day, state, orders, lift);
                const liftConflicts = conflictingOrderIds(state.orders);
                const focused = focusLift === lift.id;

                return (
                  <Card
                    key={lift.id}
                    className={`flex min-h-[260px] flex-col p-0 ${focused ? "ring-2 ring-[var(--accent)] ring-offset-2" : ""}`}
                  >
                    <div className="border-b px-3 py-3" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <IconTool size={17} style={{ color: state.busyNow ? "var(--accent)" : "var(--text-muted)" }} />
                            <b className="truncate text-sm">{lift.name}</b>
                          </div>
                          <p className="muted mt-1 truncate text-xs">{liftLabel(state)}</p>
                        </div>
                        <span
                          className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: state.busyNow ? "var(--accent)" : state.orders.length ? "var(--warning)" : "#cbd4d0" }}
                          title={state.busyNow ? "Занят сейчас" : state.orders.length ? "Есть записи" : "Свободен"}
                        />
                      </div>
                      {liftConflicts.size > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold" style={{ color: "var(--danger)", background: "#fff3f3" }}>
                          <IconAlertTriangle size={14} />
                          Пересечение времени
                        </div>
                      )}
                    </div>

                    <div className="min-h-0 flex-1 divide-y" style={{ borderColor: "var(--border)" }}>
                      {state.orders.length === 0 ? (
                        <button
                          onClick={() => navigate(target.to)}
                          className="flex h-full min-h-[150px] w-full flex-col items-center justify-center gap-2 px-3 py-5 text-center transition hover:bg-gray-50"
                        >
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                            <IconPlus size={19} />
                          </span>
                          <span className="text-sm font-semibold text-[var(--accent)]">Записать машину</span>
                          <span className="muted text-xs">Подъёмник свободен</span>
                        </button>
                      ) : (
                        state.orders.map((order) => {
                          const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                          const client = clients.find((item) => item.id === order.clientId);
                          const current = state.current?.id === order.id;
                          const hasConflict = liftConflicts.has(order.id);

                          return (
                            <button
                              key={order.id}
                              onClick={() => navigate(`/orders/${order.id}`)}
                              className="w-full px-3 py-2.5 text-left transition hover:bg-gray-50"
                              style={{
                                background: current ? "var(--accent-soft)" : hasConflict ? "#fff8f8" : undefined,
                              }}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold">
                                    {vehicle ? `${vehicle.make} ${vehicle.model}` : order.number}
                                  </span>
                                  <span className="muted block truncate text-xs">
                                    {vehicle?.plate ?? client?.name ?? "—"}
                                  </span>
                                </span>
                                <span className="shrink-0 text-right">
                                  <span className="block text-xs font-bold tabular-nums">
                                    {order.scheduledStart ? `${order.scheduledStart}–${order.scheduledEnd ?? ""}` : "Без времени"}
                                  </span>
                                  {current && <span className="text-[10px] font-semibold text-[var(--accent)]">сейчас</span>}
                                  {!current && hasConflict && <span className="text-[10px] font-semibold text-[var(--danger)]">конфликт</span>}
                                </span>
                              </div>
                              <p className="muted mt-1 truncate text-xs">
                                {order.works[0]?.name ?? order.complaint ?? order.notes ?? "Осмотр"}
                              </p>
                              <div className="mt-2">
                                <StatusBadge status={order.status} />
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="border-t p-2" style={{ borderColor: "var(--border)" }}>
                      <button
                        onClick={() => navigate(target.to)}
                        className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition hover:bg-[var(--accent-soft)]"
                        style={{ color: state.suggestedStart ? "var(--accent)" : "var(--text-muted)" }}
                      >
                        <IconClock size={15} />
                        {target.label}
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          <details className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
              Подробная временная шкала
              <span className="muted ml-2 font-normal">для точного распределения по времени</span>
            </summary>
            <div className="border-t" style={{ borderColor: "var(--border)" }}>
              <LiftTimeline date={day} />
            </div>
          </details>
        </div>
      </Page>
    </>
  );
}
