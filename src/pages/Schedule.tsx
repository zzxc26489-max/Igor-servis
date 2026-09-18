import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Card, ListCard, Page, StatusBadge, TopBar } from "../components/ui";
import LiftTimeline from "../components/LiftTimeline";
import { bookingLink, liftLabel, liftState, orderDay } from "../lib/lift";
import { plural } from "../lib/format";

const WORK_HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

function shiftDay(day: string, delta: number) {
  const date = new Date(day);
  date.setDate(date.getDate() + delta);
  return date.toISOString().slice(0, 10);
}

export default function Schedule() {
  const { lifts, orders, clients, vehicles } = useAppStore();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState(today);

  // Записи выбранного дня, а не все активные заказы подряд.
  const dayOrders = useMemo(
    () =>
      orders
        .filter((order) => order.status !== "выдан" && orderDay(order) === day)
        .sort((a, b) => (a.scheduledStart ?? "99:99").localeCompare(b.scheduledStart ?? "99:99")),
    [day, orders],
  );

  const states = useMemo(() => lifts.map((lift) => ({ lift, state: liftState(orders, lift, day) })), [day, lifts, orders]);
  const busy = states.filter(({ state }) => state.busyNow).length;
  const unassigned = dayOrders.filter((order) => !order.liftId);

  const dayLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date(day));

  return (
    <>
      <TopBar
        title="Расписание"
        subtitle={`${busy} из ${lifts.length} подъёмников занято сейчас · ${dayOrders.length} ${plural(dayOrders.length, "запись", "записи", "записей")} на день`}
      />
      <Page>
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4" style={{ borderColor: "var(--border)" }}>
            <div>
              <h2 className="panel-title">Подъёмники</h2>
              <p className="muted mt-1 text-sm capitalize">{dayLabel}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setDay(shiftDay(day, -1))} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-gray-100" aria-label="Предыдущий день">
                <IconChevronLeft size={18} />
              </button>
              <input
                type="date"
                value={day}
                onChange={(event) => event.target.value && setDay(event.target.value)}
                className="rounded-lg border px-2.5 py-1.5 text-sm font-semibold"
                style={{ borderColor: "var(--border)" }}
                aria-label="Дата расписания"
              />
              <button onClick={() => setDay(shiftDay(day, 1))} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-gray-100" aria-label="Следующий день">
                <IconChevronRight size={18} />
              </button>
              {day !== today && (
                <button onClick={() => setDay(today)} className="ml-2 text-sm font-semibold text-[var(--accent)]">Сегодня</button>
              )}
            </div>
          </div>

          <div className="hidden lg:block">
            <LiftTimeline hours={WORK_HOURS} date={day} />
          </div>

          <div className="space-y-3 p-3 lg:hidden">
            {states.map(({ lift, state }) => {
              const liftOrders = state.orders;
              return (
                <div key={lift.id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <b className="text-sm">{lift.name}</b>
                    <span className="flex items-center gap-1.5 text-xs muted">
                      <i className="h-2 w-2 rounded-full" style={{ background: state.busyNow ? "var(--accent)" : liftOrders.length ? "var(--warning)" : "var(--border)" }} />
                      {liftLabel(state)}
                    </span>
                  </div>
                  {liftOrders.length === 0 ? (
                    <button onClick={() => navigate(bookingLink(lift.id, day, state.freeFrom))} className="mt-2 w-full rounded-lg border border-dashed py-2 text-sm muted" style={{ borderColor: "var(--border)" }}>
                      {state.busyNow ? `+ Записать с ${state.freeFrom}` : "+ Записать"}
                    </button>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {liftOrders.map((order) => {
                        const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                        const client = clients.find((item) => item.id === order.clientId);
                        return (
                          <ListCard
                            key={order.id}
                            onClick={() => navigate(`/orders/${order.id}`)}
                            title={vehicle ? `${vehicle.make} ${vehicle.model}` : order.number}
                            amount={order.scheduledStart ? `${order.scheduledStart}–${order.scheduledEnd ?? ""}` : "Без времени"}
                            lines={[client?.name, order.works[0]?.name ?? "Осмотр"]}
                            badge={<StatusBadge status={order.status} />}
                          />
                        );
                      })}
                      <button
                        onClick={() => navigate(bookingLink(lift.id, day, state.freeFrom))}
                        className="w-full rounded-lg border border-dashed py-2 text-sm font-semibold text-[var(--accent)]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        {state.busyNow ? `+ Записать с ${state.freeFrom}` : "+ Записать"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {unassigned.length > 0 && (
          <Card className="mt-4 overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 p-4">
              <h2 className="panel-title">Без подъёмника</h2>
              <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>
                {unassigned.length}
              </span>
            </div>
            <div className="space-y-2 p-3 pt-0 lg:hidden">
              {unassigned.map((order) => {
                const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                const client = clients.find((item) => item.id === order.clientId);
                return (
                  <ListCard
                    key={order.id}
                    onClick={() => navigate(`/orders/${order.id}`)}
                    title={vehicle ? `${vehicle.make} ${vehicle.model}` : order.number}
                    lines={[client?.name, order.works[0]?.name ?? order.notes ?? "Причина не указана"]}
                    badge={<StatusBadge status={order.status} />}
                  />
                );
              })}
            </div>
            <div className="hidden lg:block">
              <table className="app-table">
                <thead>
                  <tr><th>Заказ</th><th>Автомобиль</th><th>Клиент</th><th>Причина визита</th><th>Статус</th></tr>
                </thead>
                <tbody>
                  {unassigned.map((order) => {
                    const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                    const client = clients.find((item) => item.id === order.clientId);
                    return (
                      <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)} className="cursor-pointer">
                        <td className="font-medium">{order.number}</td>
                        <td>{vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}</td>
                        <td>{client?.name ?? "—"}</td>
                        <td className="muted">{order.works[0]?.name ?? order.notes ?? "—"}</td>
                        <td><StatusBadge status={order.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Page>
    </>
  );
}
