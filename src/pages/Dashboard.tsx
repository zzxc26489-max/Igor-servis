import { useMemo, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBell,
  IconCalendarEvent,
  IconCheck,
  IconClipboardList,
  IconPackage,
  IconPhone,
  IconTool,
} from "@tabler/icons-react";
import { Card, ListCard, Page, StatusBadge, TopBar } from "../components/ui";
import LiftTimeline from "../components/LiftTimeline";
import { liftState, orderDay } from "../lib/lift";
import { useAppStore } from "../store/AppStore";
import { formatMoney, plural } from "../lib/format";
import { orderTotals } from "../lib/order";
import { todayISO } from "../lib/date";
import { serviceReminders } from "../lib/serviceReminder";
import { promiseLabel, promisedOrderAlerts } from "../lib/promisedDeadline";
import { ordersWithUnassignedWorks, unassignedWorks } from "../lib/workAssignment";
import type { Order } from "../types";

export default function Dashboard() {
  const { orders, clients, vehicles, lifts } = useAppStore();
  const navigate = useNavigate();
  const today = todayISO();

  const inWork = orders.filter((order) => order.status === "в работе" || order.status === "диагностика");
  const ready = orders.filter((order) => order.status === "готово");
  const waitingParts = orders.filter((order) => order.status === "ожидает запчасти");
  const debtOrders = orders
    .filter((order) => order.status === "выдан" && orderTotals(order).debt > 0)
    .sort((a, b) => orderTotals(b).debt - orderTotals(a).debt);
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
  const deadlineAlerts = useMemo(() => promisedOrderAlerts(orders), [orders]);
  const unassignedWorkOrders = useMemo(() => ordersWithUnassignedWorks(orders), [orders]);

  const attention = useMemo(() => {
    const result: { order: Order; kind: "ready" | "parts" | "lift" | "debt" | "deadline" | "mechanic" }[] = [];
    deadlineAlerts.forEach((alert) => {
      const order = orders.find((item) => item.id === alert.orderId);
      if (order) result.push({ order, kind: "deadline" });
    });
    unassignedWorkOrders.forEach((order) => {
      if (!result.some((item) => item.order.id === order.id)) result.push({ order, kind: "mechanic" });
    });
    ready.forEach((order) => {
      if (!result.some((item) => item.order.id === order.id)) result.push({ order, kind: "ready" });
    });
    waitingParts.forEach((order) => {
      if (!result.some((item) => item.order.id === order.id)) result.push({ order, kind: "parts" });
    });
    unassigned.forEach((order) => {
      if (!result.some((item) => item.order.id === order.id)) result.push({ order, kind: "lift" });
    });
    debtOrders.forEach((order) => {
      if (!result.some((item) => item.order.id === order.id)) result.push({ order, kind: "debt" });
    });
    return result.slice(0, 6);
  }, [deadlineAlerts, debtOrders, orders, ready, unassigned, unassignedWorkOrders, waitingParts]);

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

        <details open className="mb-4 overflow-hidden rounded-xl border bg-white shadow-[0_2px_8px_rgba(23,34,30,0.045)]" style={{ borderColor: "var(--border)" }}>
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold">Подъёмники сейчас</span>
              <span className="muted mt-0.5 block text-xs">Временная шкала загрузки всех подъёмников на сегодня</span>
            </span>
            <Link
              to="/schedule"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-[var(--accent)] sm:min-h-0"
            >
              Полное расписание <IconArrowRight size={16} />
            </Link>
          </summary>
          <div className="border-t" style={{ borderColor: "var(--border)" }}>
            <LiftTimeline date={today} />
          </div>
        </details>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="overflow-hidden p-0 max-sm:-mx-3 max-sm:rounded-none max-sm:border-x-0 max-sm:shadow-none">
            <div className="flex items-center justify-between gap-3 p-4">
              <div>
                <h2 className="panel-title">Визиты сегодня</h2>
                <p className="muted mt-0.5 text-xs">{visits.length} {plural(visits.length, "запись", "записи", "записей")}</p>
              </div>
              <Link to="/orders?filter=active" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-[var(--accent)] sm:min-h-0">
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
                <p className="muted mt-0.5 text-xs">Сроки, исполнители, выдача, детали, долги и визиты без подъёмника</p>
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
                  const { due, debt } = orderTotals(order);
                  const deadline = kind === "deadline" ? deadlineAlerts.find((item) => item.orderId === order.id) : undefined;
                  const withoutMechanic = kind === "mechanic" ? unassignedWorks(order).length : 0;
                  const label = kind === "parts"
                    ? "Ждём детали"
                    : kind === "lift"
                      ? "Без подъёмника"
                      : kind === "debt"
                        ? "Ожидаем оплату"
                        : kind === "deadline"
                          ? deadline?.urgency === "overdue" ? "Срок просрочен" : "Срок скоро"
                          : kind === "mechanic"
                            ? "Без механика"
                            : "К выдаче";
                  const color = kind === "parts"
                    ? "var(--warning)"
                    : kind === "lift" || kind === "debt" || (kind === "deadline" && deadline?.urgency === "overdue")
                      ? "var(--danger)"
                      : kind === "deadline" || kind === "mechanic"
                        ? "var(--warning)"
                        : "var(--accent-strong)";
                  const bg = kind === "parts" || kind === "mechanic" || (kind === "deadline" && deadline?.urgency === "soon")
                    ? "#fdf3e0"
                    : kind === "lift" || kind === "debt" || kind === "deadline"
                      ? "#fff3f3"
                      : "var(--accent-soft)";

                  return (
                    <div key={order.id} className="p-3 sm:p-4">
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: bg, color }}>
                        {(kind === "lift" || kind === "debt" || kind === "deadline" || kind === "mechanic") && <IconAlertTriangle size={13} />}
                        {label}
                      </span>
                      <Link to={`/orders/${order.id}`} className="mt-2 block text-base font-bold hover:text-[var(--accent)]">{vehicle ? `${vehicle.make} ${vehicle.model}` : order.number}</Link>
                      <p className="muted text-sm">{vehicle?.plate ?? client?.name}</p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        {kind === "ready"
                          ? <b className="text-sm">{formatMoney(due)}</b>
                          : kind === "debt"
                            ? <b className="text-sm" style={{ color: "var(--danger)" }}>Долг {formatMoney(debt)}</b>
                            : kind === "deadline" && deadline
                              ? <b className="text-sm" style={{ color }}>{promiseLabel(deadline.minutesLeft)}</b>
                              : kind === "mechanic"
                                ? <b className="text-sm" style={{ color: "var(--warning)" }}>
                                    {withoutMechanic} {plural(withoutMechanic, "работа", "работы", "работ")} без исполнителя
                                  </b>
                                : <span className="muted text-xs">{order.scheduledStart ?? order.number}</span>}
                        {kind === "mechanic" ? (
                          <Link to={`/orders/${order.id}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[var(--accent)] sm:min-h-0">
                            Назначить механика
                          </Link>
                        ) : client ? (
                          <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[var(--accent)] sm:min-h-0"><IconPhone size={16} /> Позвонить</a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {debtOrders.length > 0 && (
          <div className="mt-4 flex justify-end">
            <Link to="/orders?filter=debt" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[var(--accent)] sm:min-h-0">
              Все долги клиентов · {formatMoney(debtOrders.reduce((sum, order) => sum + orderTotals(order).debt, 0))}
              <IconArrowRight size={16} />
            </Link>
          </div>
        )}

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
                  <div key={reminder.vehicleId} className="p-3 sm:p-4">
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
                      <Link to={`/orders/new?clientId=${vehicle.clientId}&vehicleId=${vehicle.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--accent)] sm:min-h-0">
                        Записать
                      </Link>
                      {client && (
                        <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[var(--accent)] sm:min-h-0">
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
    <Link to={to} className="bg-white p-3 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] sm:p-4">
      <div className="flex items-start gap-2 text-sm muted"><span className="mt-0.5 shrink-0">{icon}</span><span className="leading-tight">{label}</span></div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2"><span className="text-2xl font-bold leading-none tabular-nums sm:text-[28px]" style={{ color }}>{value}</span><span className="muted text-sm">{unit}</span></div>
    </Link>
  );
}
