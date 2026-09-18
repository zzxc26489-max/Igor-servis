import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  IconArrowRight, IconCheck, IconChevronLeft, IconChevronRight,
  IconClipboardList, IconPackage, IconPhone, IconTool,
} from "@tabler/icons-react";
import { Card, ListCard, Page, StatusBadge, TopBar } from "../components/ui";
import LiftTimeline from "../components/LiftTimeline";
import { bookingTarget, liftLabel, liftState, orderDay } from "../lib/lift";
import { useAppStore } from "../store/AppStore";
import { formatMoney, plural } from "../lib/format";
import { orderTotals } from "../lib/order";
import { toISODate, todayISO } from "../lib/date";

function shiftDay(day: string, delta: number) {
  const date = new Date(day);
  date.setDate(date.getDate() + delta);
  return toISODate(date);
}

function formatDayLabel(day: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(day));
}

export default function Dashboard() {
  const { orders, clients, vehicles, lifts } = useAppStore();
  const navigate = useNavigate();
  const today = todayISO();
  const [day, setDay] = useState(today);

  const inWork = orders.filter((order) => order.status === "в работе" || order.status === "диагностика");
  const ready = orders.filter((order) => order.status === "готово");
  const waitingParts = orders.filter((order) => order.status === "ожидает запчасти");
  // «Свободен» = свободен прямо сейчас; запись на вечер подъёмник не занимает.
  const liftStates = useMemo(() => lifts.map((lift) => ({ lift, state: liftState(orders, lift, day) })), [day, lifts, orders]);
  // Сегодня считаем свободные в моменте, на другой день — те, где вообще нет записей.
  const isToday = day === today;
  const freeLifts = liftStates.filter(({ state }) => (isToday ? !state.busyNow : state.orders.length === 0)).length;

  const attention = useMemo(() => [...ready, ...waitingParts].slice(0, 6), [ready, waitingParts]);

  const visits = useMemo(
    () =>
      orders
        .filter((order) => order.status !== "выдан" && orderDay(order) === day && order.scheduledStart)
        .sort((a, b) => (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? "")),
    [day, orders],
  );

  const fullDate = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .format(new Date(today));

  return (
    <>
      <TopBar title="Сегодня" subtitle={fullDate.charAt(0).toUpperCase() + fullDate.slice(1)} />
      <Page>
        <div
          className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border shadow-[0_2px_8px_rgba(23,34,30,0.045)] lg:grid-cols-4"
          style={{ background: "var(--border)", borderColor: "var(--border)" }}
        >
          <Stat icon={<IconTool size={17} />} label="В работе" value={inWork.length} unit={plural(inWork.length, "автомобиль", "автомобиля", "автомобилей")} />
          <Stat icon={<IconCheck size={17} />} label="Готовы к выдаче" value={ready.length} unit={plural(ready.length, "заказ", "заказа", "заказов")} tone="accent" />
          <Stat icon={<IconPackage size={17} />} label="Ждут запчасти" value={waitingParts.length} unit={plural(waitingParts.length, "заказ", "заказа", "заказов")} tone="warning" />
          <Stat icon={<IconClipboardList size={17} />} label={isToday ? "Свободные подъёмники" : "Подъёмники без записей"} value={freeLifts} unit={`из ${lifts.length}`} />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <h2 className="panel-title">Подъёмники</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => setDay(shiftDay(day, -1))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-gray-100" aria-label="Предыдущий день">
                  <IconChevronLeft size={18} />
                </button>
                <span className="min-w-[120px] text-center text-sm font-semibold">{formatDayLabel(day)}</span>
                <button onClick={() => setDay(shiftDay(day, 1))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-gray-100" aria-label="Следующий день">
                  <IconChevronRight size={18} />
                </button>
                {day !== today && (
                  <button onClick={() => setDay(today)} className="ml-2 text-sm font-semibold text-[var(--accent)]">Сегодня</button>
                )}
              </div>
            </div>

            <div className="hidden lg:block">
              <LiftTimeline date={day} />
            </div>

            {/* На телефоне показываем сразу, какая машина на каком подъёмнике. */}
            <div className="space-y-2 p-3 pt-0 lg:hidden">
              {liftStates.map(({ lift, state }) => {
                if (state.orders.length === 0) {
                  return (
                    <button
                      key={lift.id}
                      onClick={() => navigate(bookingTarget(lift.id, day, state).to)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed px-3 py-3 text-left"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <IconTool size={17} className="muted" /> {lift.name}
                      </span>
                      <span className="text-sm font-semibold text-[var(--accent)]">+ Записать</span>
                    </button>
                  );
                }

                return (
                  <div key={lift.id} className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: "var(--border)" }}>
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <IconTool size={17} style={{ color: state.busyNow ? "var(--accent)" : "var(--text-muted)" }} /> {lift.name}
                      </span>
                      <span className="text-xs" style={{ color: state.busyNow ? "var(--accent)" : "var(--text-muted)" }}>
                        {liftLabel(state)}
                      </span>
                    </div>
                    <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                      {state.orders.map((item) => {
                        const vehicle = vehicles.find((entry) => entry.id === item.vehicleId);
                        const client = clients.find((entry) => entry.id === item.clientId);
                        const isNow = state.current?.id === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => navigate(`/orders/${item.id}`)}
                            className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left"
                            style={{ background: isNow ? "var(--accent-soft)" : undefined }}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">
                                {vehicle ? `${vehicle.make} ${vehicle.model}` : item.number}
                              </span>
                              <span className="muted block truncate text-xs">
                                {vehicle?.plate ?? client?.name} · {item.works[0]?.name ?? item.complaint ?? "Осмотр"}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block text-xs font-semibold tabular-nums">
                                {item.scheduledStart ? `${item.scheduledStart}–${item.scheduledEnd ?? ""}` : "—"}
                              </span>
                              <span className="mt-1 block"><StatusBadge status={item.status} /></span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => navigate(bookingTarget(lift.id, day, state).to)}
                      className="w-full border-t px-3 py-2 text-left text-sm font-semibold text-[var(--accent)]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {bookingTarget(lift.id, day, state).label}
                    </button>
                  </div>
                );
              })}
            </div>

          </Card>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 p-4">
              <h2 className="panel-title">Требуют внимания</h2>
              <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>
                {attention.length}
              </span>
            </div>
            {attention.length === 0 ? (
              <p className="muted px-4 pb-4 text-sm">Всё спокойно: машин к выдаче и ожиданий запчастей нет.</p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {attention.map((order) => {
                  const client = clients.find((item) => item.id === order.clientId);
                  const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                  const { due } = orderTotals(order);
                  const waiting = order.status === "ожидает запчасти";
                  return (
                    <div key={order.id} className="p-4">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                        style={{
                          background: waiting ? "#fdf3e0" : "var(--accent-soft)",
                          color: waiting ? "var(--warning)" : "var(--accent-strong)",
                        }}
                      >
                        <i className="h-1.5 w-1.5 rounded-full bg-current" />
                        {waiting ? "Ждём детали" : "К выдаче"}
                      </span>
                      <Link to={`/orders/${order.id}`} className="mt-2 block text-base font-bold hover:text-[var(--accent)]">
                        {vehicle ? `${vehicle.make} ${vehicle.model}` : order.number}
                      </Link>
                      <p className="muted text-sm">{vehicle?.plate ?? client?.name}</p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <b className="text-sm">{formatMoney(due)}</b>
                        {client && (
                          <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]">
                            <IconPhone size={16} /> Позвонить
                          </a>
                        )}
                      </div>
                      {waiting && order.notes && <p className="muted mt-2 text-sm">{order.notes}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <Card className="mt-4 overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 p-4">
            <h2 className="panel-title">Ближайшие визиты</h2>
            <Link to="/orders" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--accent)]">
              Все записи <IconArrowRight size={16} />
            </Link>
          </div>

          <div className="space-y-2 p-3 pt-0 lg:hidden">
            {visits.map((order) => {
              const client = clients.find((item) => item.id === order.clientId);
              const vehicle = vehicles.find((item) => item.id === order.vehicleId);
              return (
                <ListCard
                  key={order.id}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  title={vehicle ? `${vehicle.make} ${vehicle.model}` : order.number}
                  amount={order.scheduledStart}
                  lines={[client?.name, order.works[0]?.name ?? order.notes ?? "Причина не указана"]}
                  badge={<StatusBadge status={order.status} />}
                  meta={lifts.find((lift) => lift.id === order.liftId)?.name}
                />
              );
            })}
            {visits.length === 0 && <p className="muted p-3 text-sm">На этот день записей нет.</p>}
          </div>

          <div className="hidden lg:block">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Автомобиль</th>
                  <th>Клиент</th>
                  <th>Причина визита</th>
                  <th>Подъёмник</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visits.map((order) => {
                  const client = clients.find((item) => item.id === order.clientId);
                  const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                  return (
                    <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)} className="cursor-pointer">
                      <td className="font-medium">{order.scheduledStart}</td>
                      <td>{vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}</td>
                      <td>{client?.name ?? "—"}</td>
                      <td className="muted">{order.works[0]?.name ?? order.notes ?? "—"}</td>
                      <td className="muted">{lifts.find((lift) => lift.id === order.liftId)?.name ?? "Без подъёмника"}</td>
                      <td className="text-right"><IconChevronRight size={16} className="muted inline" /></td>
                    </tr>
                  );
                })}
                {visits.length === 0 && (
                  <tr><td colSpan={6} className="muted text-center">На этот день записей нет.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </Page>
    </>
  );
}

function Stat({ icon, label, value, unit, tone }: {
  icon: ReactNode; label: string; value: number; unit: string; tone?: "accent" | "warning";
}) {
  const color = tone === "accent" ? "var(--accent)" : tone === "warning" ? "var(--warning)" : "var(--text)";
  return (
    <div className="bg-white p-4">
      <div className="flex items-start gap-2 text-sm muted">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <span className="leading-tight">{label}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
        <span className="text-[28px] font-bold leading-none tabular-nums" style={{ color }}>{value}</span>
        <span className="muted text-sm">{unit}</span>
      </div>
    </div>
  );
}
