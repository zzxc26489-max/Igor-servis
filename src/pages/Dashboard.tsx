import { useMemo, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBell,
  IconCalendarEvent,
  IconCheck,
  IconClipboardList,
  IconClock,
  IconPackage,
  IconPhone,
  IconPlus,
  IconTool,
} from "@tabler/icons-react";
import { Card, ListCard, Page, StatusBadge, TopBar } from "../components/ui";
import { bookingTarget, liftLabel, liftState, orderDay } from "../lib/lift";
import { useAppStore } from "../store/AppStore";
import { formatMoney, plural } from "../lib/format";
import { orderTotals } from "../lib/order";
import { todayISO } from "../lib/date";
import { serviceReminders } from "../lib/serviceReminder";
import type { Order } from "../types";

export default function Dashboard() {
  const { orders, clients, vehicles, lifts } = useAppStore();
  const navigate = useNavigate();
  const today = todayISO();

  const inWork = orders.filter((order) => order.status === "в работе" || order.status === "диагностика");
  const ready = orders.filter((order) => order.status === "готово");
  const waitingParts = orders.filter((order) => order.status === "ожидает запчасти");
  const liftStates = useMemo(
    () => lifts.map((lift) => ({ lift, state: liftState(orders, lift, today) })),
    [lifts, orders, today],
  );
  const freeLifts = liftStates.filter(({ state }) => !state.busyNow).length;

  const visits = useMemo(
    () =>
      orders
        .filter((order) => order.status !== "выдан" && orderDay(order) === today && order.scheduledStart)
        .sort((a, b) => (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? "")),
    [orders, today],
  );
  const unassigned = visits.filter((order) => !order.liftId);
  const maintenanceReminders = useMemo(() => serviceReminders(vehicles).slice(0, 6), [vehicles]);

  const attention = useMemo(() => {
    const result: { order: Order; kind: "ready" | "parts" | "lift" }[] = [];
    ready.forEach((order) => result.push({ order, kind: "ready" }));
    waitingParts.forEach((order) => result.push({ order, kind: "parts" }));
    unassigned.forEach((order) => {
      if (!result.some((item) => item.order.id === order.id)) result.push({ order, kind: "lift" });
    });
    return result.slice(0, 6);
  }, [ready, unassigned, waitingParts]);

  const fullDate = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${today}T12:00:00`));

  return (
    <>
      <TopBar title="Сегодня" subtitle={fullDate.charAt(0).toUpperCase() + fullDate.slice(1)} />
      <Page>
        <div
          className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border shadow-[0_2px_8px_rgba(23,34,30,0.045)] lg:grid-cols-4"
          style={{ background: "var(--border)", borderColor: "var(--border)" }}
        >
          <Stat to="/orders?filter=active" icon={<IconTool size={17} />} label="В работе" value={inWork.length} unit={plural(inWork.length, "автомобиль", "автомобиля", "автомобилей")} />
          <Stat to="/orders?filter=готово" icon={<IconCheck size={17} />} label="Готовы к выдаче" value={ready.length} unit={plural(ready.length, "заказ", "заказа", "заказов")} tone="accent" />
          <Stat to="/orders?filter=ожидает%20запчасти" icon={<IconPackage size={17} />} label="Ждут запчасти" value={waitingParts.length} unit={plural(waitingParts.length, "заказ", "заказа", "заказов")} tone="warning" />
          <Stat to="/schedule" icon={<IconClipboardList size={17} />} label="Свободны сейчас" value={freeLifts} unit={`из ${lifts.length} подъёмников`} />
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Подъёмники сейчас</h2>
            <p className="muted mt-0.5 text-sm">Текущая машина и ближайшая запись по каждому месту.</p>
          </div>
          <Link to="/schedule" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]">
            Полное расписание <IconArrowRight size={16} />
          </Link>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {liftStates.map(({ lift, state }) => {
            const current = state.current;
            const next = state.next;
            const currentVehicle = current ? vehicles.find((vehicle) => vehicle.id === current.vehicleId) : null;
            const currentClient = current ? clients.find((client) => client.id === current.clientId) : null;
            const nextVehicle = next ? vehicles.find((vehicle) => vehicle.id === next.vehicleId) : null;
            const target = bookingTarget(lift.id, today, state, orders, lift);

            return (
              <Card key={lift.id} className="flex min-h-[190px] flex-col p-0">
                <div className="border-b px-3 py-3" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <IconTool size={17} style={{ color: state.busyNow ? "var(--accent)" : "var(--text-muted)" }} />
                      <b className="truncate text-sm">{lift.name}</b>
                    </span>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: state.busyNow ? "var(--accent)" : state.orders.length ? "var(--warning)" : "#cbd4d0" }} />
                  </div>
                  <p className="muted mt-1 truncate text-xs">{liftLabel(state)}</p>
                </div>

                {current ? (
                  <button onClick={() => navigate(`/orders/${current.id}`)} className="flex flex-1 flex-col justify-center px-3 py-3 text-left transition hover:bg-gray-50">
                    <span className="text-[10px] font-bold uppercase tracking-[.08em] text-[var(--accent)]">Сейчас</span>
                    <b className="mt-1 truncate text-sm">{currentVehicle ? `${currentVehicle.make} ${currentVehicle.model}` : current.number}</b>
                    <span className="muted mt-0.5 truncate text-xs">{currentVehicle?.plate ?? currentClient?.name ?? "—"}</span>
                    <span className="muted mt-1 truncate text-xs">{current.works[0]?.name ?? current.complaint ?? "Осмотр"}</span>
                    <span className="mt-2"><StatusBadge status={current.status} /></span>
                  </button>
                ) : (
                  <button onClick={() => navigate(target.to)} className="flex flex-1 flex-col items-center justify-center gap-2 px-3 py-4 text-center transition hover:bg-gray-50">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]"><IconPlus size={19} /></span>
                    <b className="text-sm text-[var(--accent)]">Свободен сейчас</b>
                    <span className="muted text-xs">{target.label}</span>
                  </button>
                )}

                {next && next.id !== current?.id && (
                  <button onClick={() => navigate(`/orders/${next.id}`)} className="border-t px-3 py-2 text-left transition hover:bg-gray-50" style={{ borderColor: "var(--border)" }}>
                    <span className="flex items-center justify-between gap-2 text-xs">
                      <span className="muted inline-flex min-w-0 items-center gap-1"><IconClock size={13} />Следом</span>
                      <b className="shrink-0 tabular-nums">{next.scheduledStart}</b>
                    </span>
                    <span className="mt-0.5 block truncate text-xs font-medium">{nextVehicle ? `${nextVehicle.make} ${nextVehicle.model}` : next.number}</span>
                  </button>
                )}
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden p-0 max-sm:-mx-3 max-sm:rounded-none max-sm:border-x-0 max-sm:shadow-none">
            <div className="flex items-center justify-between gap-3 p-4">
              <div>
                <h2 className="panel-title">Визиты сегодня</h2>
                <p className="muted mt-0.5 text-xs">{visits.length} {plural(visits.length, "запись", "записи", "записей")}</p>
              </div>
              <Link to="/orders?filter=active" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--accent)]">
                Все заказы <IconArrowRight size={16} />
              </Link>
            </div>

            <div className="space-y-2 p-2 pt-0 lg:hidden">
              {visits.map((order) => {
                const client = clients.find((item) => item.id === order.clientId);
                const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                return (
                  <ListCard
                    key={order.id}
                    onClick={() => navigate(`/orders/${order.id}`)}
                    title={vehicle ? `${vehicle.make} ${vehicle.model}` : order.number}
                    amount={order.scheduledStart}
                    lines={[client?.name, order.works[0]?.name ?? order.complaint ?? order.notes ?? "Причина не указана"]}
                    badge={<StatusBadge status={order.status} />}
                    meta={lifts.find((lift) => lift.id === order.liftId)?.name ?? "Без подъёмника"}
                  />
                );
              })}
              {visits.length === 0 && <p className="muted p-3 text-sm">На сегодня записей нет.</p>}
            </div>

            <div className="hidden lg:block">
              <table className="app-table">
                <thead><tr><th>Время</th><th>Автомобиль</th><th>Клиент</th><th>Причина визита</th><th>Подъёмник</th><th>Статус</th></tr></thead>
                <tbody>
                  {visits.map((order) => {
                    const client = clients.find((item) => item.id === order.clientId);
                    const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                    return (
                      <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)} className="cursor-pointer">
                        <td className="font-semibold tabular-nums">{order.scheduledStart}</td>
                        <td><b>{vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}</b>{vehicle?.plate && <div className="muted text-xs">{vehicle.plate}</div>}</td>
                        <td>{client?.name ?? "—"}</td>
                        <td className="muted">{order.works[0]?.name ?? order.complaint ?? order.notes ?? "—"}</td>
                        <td className="muted">{lifts.find((lift) => lift.id === order.liftId)?.name ?? "Без подъёмника"}</td>
                        <td><StatusBadge status={order.status} /></td>
                      </tr>
                    );
                  })}
                  {visits.length === 0 && <tr><td colSpan={6} className="muted text-center">На сегодня записей нет.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden p-0 max-sm:-mx-3 max-sm:rounded-none max-sm:border-x-0 max-sm:shadow-none">
            <div className="flex items-center justify-between gap-3 p-4">
              <div>
                <h2 className="panel-title">Требуют действия</h2>
                <p className="muted mt-0.5 text-xs">Выдача, детали и визиты без подъёмника</p>
              </div>
              <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>{attention.length}</span>
            </div>

            {attention.length === 0 ? (
              <p className="muted px-4 pb-4 text-sm">Срочных действий сейчас нет.</p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {attention.map(({ order, kind }) => {
                  const client = clients.find((item) => item.id === order.clientId);
                  const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                  const { due } = orderTotals(order);
                  const label = kind === "parts" ? "Ждём детали" : kind === "lift" ? "Без подъёмника" : "К выдаче";
                  const color = kind === "parts" ? "var(--warning)" : kind === "lift" ? "var(--danger)" : "var(--accent-strong)";
                  const bg = kind === "parts" ? "#fdf3e0" : kind === "lift" ? "#fff3f3" : "var(--accent-soft)";

                  return (
                    <div key={order.id} className="p-4">
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: bg, color }}>
                        {kind === "lift" && <IconAlertTriangle size={13} />}
                        {label}
                      </span>
                      <Link to={`/orders/${order.id}`} className="mt-2 block text-base font-bold hover:text-[var(--accent)]">{vehicle ? `${vehicle.make} ${vehicle.model}` : order.number}</Link>
                      <p className="muted text-sm">{vehicle?.plate ?? client?.name}</p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        {kind === "ready" ? <b className="text-sm">{formatMoney(due)}</b> : <span className="muted text-xs">{order.scheduledStart ?? order.number}</span>}
                        {client && <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]"><IconPhone size={16} /> Позвонить</a>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {maintenanceReminders.length > 0 && (
          <Card className="mt-4 overflow-hidden p-0 max-sm:-mx-3 max-sm:rounded-none max-sm:border-x-0 max-sm:shadow-none">
            <div className="flex items-center justify-between gap-3 border-b p-4" style={{ borderColor: "var(--border)" }}>
              <div>
                <h2 className="panel-title flex items-center gap-2"><IconBell size={18} /> ТО клиентов</h2>
                <p className="muted mt-0.5 text-xs">Просроченные и ближайшие напоминания по дате или пробегу</p>
              </div>
              <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>
                {maintenanceReminders.length}
              </span>
            </div>
            <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3" style={{ borderColor: "var(--border)" }}>
              {maintenanceReminders.map((reminder) => {
                const vehicle = vehicles.find((item) => item.id === reminder.vehicleId);
                const client = vehicle ? clients.find((item) => item.id === vehicle.clientId) : undefined;
                if (!vehicle) return null;
                const overdue = reminder.tone === "overdue";
                return (
                  <div key={reminder.vehicleId} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span
                          className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{
                            background: overdue ? "#fff3f3" : "#fdf3e0",
                            color: overdue ? "var(--danger)" : "var(--warning)",
                          }}
                        >
                          {overdue ? "ТО просрочено" : "ТО скоро"}
                        </span>
                        <Link to={`/clients/${vehicle.clientId}`} className="mt-2 block truncate font-bold hover:text-[var(--accent)]">
                          {vehicle.make} {vehicle.model}
                        </Link>
                        <p className="muted truncate text-xs">{vehicle.plate}{client ? ` · ${client.name}` : ""}</p>
                      </span>
                    </div>
                    <p className="mt-2 text-sm">{reminder.label}</p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <Link to={`/orders/new?clientId=${vehicle.clientId}&vehicleId=${vehicle.id}`} className="text-sm font-semibold text-[var(--accent)]">
                        Записать
                      </Link>
                      {client && (
                        <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]">
                          <IconPhone size={16} /> Позвонить
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <div className="mt-4 flex justify-end">
          <Link to="/orders/new">
            <span className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(15,122,77,.16)]">
              <IconCalendarEvent size={18} /> Новая запись
            </span>
          </Link>
        </div>
      </Page>
    </>
  );
}

function Stat({ icon, label, value, unit, tone, to }: {
  icon: ReactNode; label: string; value: number; unit: string; tone?: "accent" | "warning"; to: string;
}) {
  const color = tone === "accent" ? "var(--accent)" : tone === "warning" ? "var(--warning)" : "var(--text)";
  return (
    <Link to={to} className="bg-white p-4 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
      <div className="flex items-start gap-2 text-sm muted"><span className="mt-0.5 shrink-0">{icon}</span><span className="leading-tight">{label}</span></div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2"><span className="text-[28px] font-bold leading-none tabular-nums" style={{ color }}>{value}</span><span className="muted text-sm">{unit}</span></div>
    </Link>
  );
}
