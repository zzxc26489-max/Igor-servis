import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  IconAlertTriangle, IconCar, IconChartBar, IconClipboardList, IconClockHour4, IconCoin,
  IconGauge, IconStopwatch, IconTool, IconTrendingUp, IconUsersGroup,
} from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { liftState } from "../lib/lift";
import { getRange, type PeriodKey } from "../lib/analytics";

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "year", label: "Год" },
  { value: "all", label: "Всё время" },
];
import {
  actualMinutes, biggestDeviations, formatDuration, loadByLift, runningOrders,
  timingByExecutor, timingByService, timingSummary,
} from "../lib/worktime";
import { isCostExpense } from "../lib/analytics";
import { Card, EmptyState, Metric, Page, TopBar } from "../components/ui";
import { formatMoney, plural } from "../lib/format";
import { computePayroll } from "../lib/payroll";
import { orderTotals } from "../lib/order";
import { todayISO } from "../lib/date";
import { workSessionMinutes } from "../lib/workSessions";

/** Компактная строка времени для телефона: таблица на 390px нечитаема. */
function TimeRow({
  title, subtitle, norm, actual, deviation, right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  norm: number;
  actual: number;
  deviation: number | null;
  right?: ReactNode;
}) {
  return (
    <div className="border-b px-4 py-3 last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{title}</span>
          {subtitle && <span className="muted block text-xs">{subtitle}</span>}
        </span>
        <span
          className="shrink-0 text-sm font-semibold tabular-nums"
          style={{ color: deviation === null ? undefined : deviation > 0 ? "var(--danger)" : "var(--accent)" }}
        >
          {deviation === null ? "—" : `${deviation > 0 ? "+" : ""}${deviation}%`}
        </span>
      </div>
      <div className="muted mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums">
        <span>норматив {norm > 0 ? formatDuration(norm) : "—"}</span>
        <span>факт {formatDuration(actual)}</span>
        {right}
      </div>
    </div>
  );
}

export default function Reports() {
  const { orders, employees: rawEmployees, vehicles, lifts, clients, expenses } = useAppStore();
  const today = todayISO();
  const [period, setPeriod] = useState<PeriodKey>("month");
  // Восстановленное время старых заказов — оценка по плану, а не замер.
  // По умолчанию держим его отдельно, чтобы не смешивать с точными цифрами.
  const [includeEstimated, setIncludeEstimated] = useState(false);

  // Время считаем за выбранный период: за всё время цифры теряют смысл.
  const range = useMemo(() => getRange(period, 0), [period]);
  // Время режем по самому периоду: заказ мог начаться вчера, а закрыться сегодня.
  const window = useMemo(() => ({ from: range.from, to: range.to }), [range]);
  const timeOrders = useMemo(
    () => orders.filter((order) => actualMinutes(order, window) > 0),
    [orders, window],
  );
  const now = useMemo(() => new Date(), []);
  const summary = useMemo(
    () => timingSummary(timeOrders, window, now, includeEstimated),
    [includeEstimated, now, timeOrders, window],
  );
  const serviceTiming = useMemo(
    () => timingByService(timeOrders, window, now, includeEstimated),
    [includeEstimated, now, timeOrders, window],
  );
  const executorTiming = useMemo(
    () => timingByExecutor(timeOrders, window, now, includeEstimated),
    [includeEstimated, now, timeOrders, window],
  );
  const liftLoad = useMemo(
    () => loadByLift(timeOrders, lifts.map((lift) => lift.id), window),
    [lifts, timeOrders, window],
  );
  const deviations = useMemo(
    () => biggestDeviations(timeOrders, window, 6, now, includeEstimated),
    [includeEstimated, now, timeOrders, window],
  );
  // Машины, которые стоят на подъёмнике прямо сейчас: видно, где уже перебор.
  const running = useMemo(() => runningOrders(orders), [orders]);
  const employees = computePayroll(rawEmployees, orders);

  const active = orders.filter((order) => order.status !== "выдан");
  const done = orders.filter((order) => order.status === "выдан");
  // Занят именно сейчас, а не «есть запись на сегодня».
  const liftStates = lifts.map((lift) => ({ lift, state: liftState(orders, lift, today) }));
  const busyLifts = liftStates.filter(({ state }) => state.busyNow).length;
  const loadPercent = lifts.length ? Math.round((busyLifts / lifts.length) * 100) : 0;

  const expensesByCategory = (() => {
    const map = new Map<string, number>();
    expenses.filter(isCostExpense).forEach((expense) => map.set(expense.category, (map.get(expense.category) ?? 0) + expense.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const expensesTotal = expensesByCategory.reduce((sum, [, value]) => sum + value, 0);

  const averageCheck = orders.length
    ? Math.round(orders.reduce((sum, order) => sum + orderTotals(order).due, 0) / orders.length)
    : 0;

  // Выработка мастера: работы, где он указан исполнителем.
  const byExecutor = new Map<string, { name: string; count: number; revenue: number; actualMinutes: number }>();
  orders.forEach((order) =>
    order.works.forEach((work) => {
      const name = work.executor || "Не указан";
      const entry = byExecutor.get(name) ?? { name, count: 0, revenue: 0, actualMinutes: 0 };
      entry.count += work.qty;
      entry.revenue += work.price * work.qty;
      entry.actualMinutes += workSessionMinutes(work);
      byExecutor.set(name, entry);
    }),
  );
  const executors = [...byExecutor.values()].sort((a, b) => b.revenue - a.revenue);

  const serviceCounts = new Map<string, { count: number; revenue: number }>();
  orders.forEach((order) =>
    order.works.forEach((work) => {
      const entry = serviceCounts.get(work.name) ?? { count: 0, revenue: 0 };
      entry.count += work.qty;
      entry.revenue += work.price * work.qty;
      serviceCounts.set(work.name, entry);
    }),
  );
  const topServices = [...serviceCounts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 6);

  const byMake = new Map<string, number>();
  orders.forEach((order) => {
    const make = vehicles.find((item) => item.id === order.vehicleId)?.make ?? "Без марки";
    byMake.set(make, (byMake.get(make) ?? 0) + 1);
  });
  const makes = [...byMake.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxMake = Math.max(1, ...makes.map(([, count]) => count));

  const statusCounts = new Map<string, number>();
  orders.forEach((order) => statusCounts.set(order.status, (statusCounts.get(order.status) ?? 0) + 1));

  return (
    <>
      <TopBar title="Отчёты" subtitle="Загрузка сервиса и выработка мастеров" />
      <Page>
        <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Metric icon={<IconGauge size={18} />} label="Подъёмники" value={`${loadPercent}%`} hint={`${busyLifts} из ${lifts.length} занято`} />
          <Metric icon={<IconClipboardList size={18} />} tone="blue" label="В работе" value={String(active.length)} hint={`${done.length} выдано`} />
          <Metric icon={<IconChartBar size={18} />} tone="violet" label="Средний чек" value={formatMoney(averageCheck)} hint="по всем заказ-нарядам" />
          <Metric icon={<IconUsersGroup size={18} />} label="Клиентов" value={String(clients.length)} hint={`${vehicles.length} ${plural(vehicles.length, "автомобиль", "автомобиля", "автомобилей")}`} />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Card>
            <h2 className="panel-title mb-3 flex items-center gap-2"><IconGauge size={18} /> Подъёмники сейчас</h2>
            <div className="mb-2 flex items-end justify-between gap-3">
              <span className="text-3xl font-bold">{loadPercent}%</span>
              <span className="muted text-sm">{busyLifts} из {lifts.length} занято</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--bg)" }}>
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${loadPercent}%` }} />
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {liftStates.map(({ lift, state }) => {
                const order = state.current;
                const client = order && clients.find((item) => item.id === order.clientId);
                return (
                  <div key={lift.id} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: order ? "var(--accent)" : state.orders.length ? "var(--warning)" : "var(--border)" }} />
                      <span className="truncate">{lift.name}</span>
                    </span>
                    {order ? (
                      <Link to={`/orders/${order.id}`} className="shrink-0 truncate text-[var(--accent)] hover:underline">
                        {client?.name ?? order.number}
                      </Link>
                    ) : (
                      <span className="muted shrink-0">
                        {state.next?.scheduledStart ? `свободен до ${state.next.scheduledStart}` : "свободен"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <h2 className="panel-title mb-3 flex items-center gap-2"><IconTool size={18} /> Выработка мастеров</h2>
            {executors.length === 0 ? (
              <EmptyState icon={<IconTool size={22} />} title="Работы ещё не распределены" hint="Укажите исполнителя в заказ-наряде" />
            ) : (
              <div className="space-y-3 text-sm">
                {executors.map((executor) => {
                  const employee = employees.find((item) => item.name === executor.name);
                  return (
                    <div key={executor.name} className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e9f4ed] text-xs font-bold text-[var(--accent)]">
                          {executor.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <b className="block truncate">{executor.name}</b>
                          <span className="muted text-xs">
                            {executor.count} {plural(executor.count, "работа", "работы", "работ")}
                            {executor.actualMinutes > 0 ? ` · факт ${formatDuration(executor.actualMinutes)}` : ""}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <b className="block">{formatMoney(executor.revenue)}</b>
                        {employee && <span className="muted text-xs">зарплата {formatMoney(employee.accrued)}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Card className="overflow-hidden p-0">
            <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
              <h2 className="panel-title">Востребованные работы</h2>
              <p className="muted mt-1 text-xs">По количеству выполнений</p>
            </div>
            {topServices.length === 0 ? (
              <EmptyState icon={<IconClipboardList size={22} />} title="Пока нет выполненных работ" />
            ) : (
              <table className="app-table">
                <thead>
                  <tr><th>Работа</th><th className="text-right">Кол-во</th><th className="text-right">Выручка</th></tr>
                </thead>
                <tbody>
                  {topServices.map(([name, data]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td className="text-right">{data.count}</td>
                      <td className="text-right font-medium">{formatMoney(data.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <h2 className="panel-title mb-3 flex items-center gap-2"><IconCar size={18} /> Марки в работе</h2>
            {makes.length === 0 ? (
              <EmptyState icon={<IconCar size={22} />} title="Заказ-нарядов пока нет" />
            ) : (
              <div className="space-y-2.5 text-sm">
                {makes.map(([make, count]) => (
                  <div key={make}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{make}</span>
                      <b className="shrink-0">{count}</b>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bg)" }}>
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(count / maxMake) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h2 className="panel-title mb-3 mt-6 flex items-center gap-2"><IconClockHour4 size={18} /> Заказы по статусам</h2>
            <div className="space-y-2 text-sm">
              {[...statusCounts.entries()].map(([status, count]) => (
                <div key={status} className="flex items-center justify-between gap-2">
                  <span className="truncate">{status}</span>
                  <b className="shrink-0">{count}</b>
                </div>
              ))}
              {statusCounts.size === 0 && <p className="muted">Заказ-нарядов пока нет.</p>}
            </div>
          </Card>
        </div>


        {/* --- Время на подъёмнике и темп работы ------------------------- */}
        <div
          className="mb-3 mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-white px-3 py-2"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-sm font-semibold">Время и выработка</span>
          <div className="flex flex-wrap gap-1">
            {PERIODS.map((item) => (
              <button
                key={item.value}
                onClick={() => setPeriod(item.value)}
                className="rounded-lg px-2.5 py-1.5 text-sm font-medium transition"
                style={{
                  background: period === item.value ? "var(--accent)" : "transparent",
                  color: period === item.value ? "white" : "var(--text-muted)",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="muted ml-auto text-xs">{range.title}</span>
        </div>

        {summary.estimatedOrders > 0 && (
          <div
            className="mb-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm"
            style={{ background: "var(--surface-muted, #f6f7f9)" }}
          >
            <span className="muted">
              {summary.estimatedOrders} {plural(summary.estimatedOrders, "заказ", "заказа", "заказов")} за период
              заведены до учёта времени: их время восстановлено по плану, а не замерено.
            </span>
            <label className="ml-auto flex cursor-pointer items-center gap-2 font-medium">
              <input type="checkbox" checked={includeEstimated} onChange={(e) => setIncludeEstimated(e.target.checked)} />
              Учитывать восстановленные
            </label>
          </div>
        )}

        <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Metric
            icon={<IconClockHour4 size={18} />}
            label="Норматив"
            value={formatDuration(summary.normMinutes)}
            hint={`${summary.orders} ${plural(summary.orders, "заказ", "заказа", "заказов")} со временем`}
          />
          <Metric
            icon={<IconStopwatch size={18} />}
            tone="blue"
            label="Фактически на подъёмнике"
            value={formatDuration(summary.actualMinutes)}
            hint="По закрытым заказам, машины в работе не в счёт"
          />
          <Metric
            icon={<IconTrendingUp size={18} />}
            tone={summary.deviation !== null && summary.deviation > 10 ? "danger" : "accent"}
            label="Отклонение от норматива"
            value={summary.deviation === null ? "—" : `${summary.deviation > 0 ? "+" : ""}${summary.deviation}%`}
            hint={summary.deviation !== null && summary.deviation > 0 ? "Дольше норматива" : "Быстрее норматива"}
          />
          <Metric
            icon={<IconGauge size={18} />}
            tone="violet"
            label="Средняя загрузка подъёмника"
            value={`${liftLoad.length ? Math.round(liftLoad.reduce((sum, item) => sum + item.loadPercent, 0) / liftLoad.length) : 0}%`}
            hint="От рабочего времени в дни с машинами"
          />
        </div>

        {running.length > 0 && (
          <Card className="mb-3 overflow-hidden p-0">
            <div className="p-4">
              <h2 className="panel-title flex items-center gap-2"><IconStopwatch size={18} /> Сейчас на подъёмнике</h2>
              <p className="muted mt-1 text-xs">Время идёт с момента постановки. Красное — уже дольше норматива</p>
            </div>
            <div className="lg:hidden">
              {running.map(({ order, minutes, norm, deviation }) => {
                const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                const lift = lifts.find((item) => item.id === order.liftId);
                return (
                  <TimeRow
                    key={order.id}
                    title={<Link to={`/orders/${order.id}`} className="text-[var(--accent)]">{vehicle ? `${vehicle.make} ${vehicle.model}` : order.number}</Link>}
                    subtitle={`${order.number} · ${lift?.name ?? "без подъёмника"}`}
                    norm={norm}
                    actual={minutes}
                    deviation={deviation}
                  />
                );
              })}
            </div>
            <table className="app-table hidden lg:table">
              <thead>
                <tr>
                  <th>Автомобиль</th>
                  <th className="w-40">Подъёмник</th>
                  <th className="w-28 text-right">Норматив</th>
                  <th className="w-28 text-right">Уже стоит</th>
                  <th className="w-20 text-right">Разница</th>
                </tr>
              </thead>
              <tbody>
                {running.map(({ order, minutes, norm, deviation }) => {
                  const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                  const lift = lifts.find((item) => item.id === order.liftId);
                  return (
                    <tr key={order.id}>
                      <td>
                        <Link to={`/orders/${order.id}`} className="font-medium text-[var(--accent)]">
                          {vehicle ? `${vehicle.make} ${vehicle.model}` : order.number}
                        </Link>
                        <div className="muted text-xs">{order.number}</div>
                      </td>
                      <td className="muted">{lift?.name ?? "Без подъёмника"}</td>
                      <td className="muted text-right tabular-nums">{norm > 0 ? formatDuration(norm) : "—"}</td>
                      <td className="text-right font-semibold tabular-nums">{formatDuration(minutes)}</td>
                      <td
                        className="text-right font-semibold tabular-nums"
                        style={{ color: deviation === null ? undefined : deviation > 0 ? "var(--danger)" : "var(--accent)" }}
                      >
                        {deviation === null ? "—" : `${deviation > 0 ? "+" : ""}${deviation}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Card className="overflow-hidden p-0">
            <div className="p-4">
              <h2 className="panel-title flex items-center gap-2"><IconTool size={18} /> Работы: норматив против факта</h2>
              <p className="muted mt-1 text-xs">Время заказа делится между работами пропорционально нормативу</p>
            </div>
            {serviceTiming.length === 0 ? (
              <p className="muted px-4 pb-4 text-sm">За период нет заказов с указанным нормативом.</p>
            ) : (
              <>
              <div className="lg:hidden">
                {serviceTiming.map((row) => (
                  <TimeRow
                    key={row.name}
                    title={row.name}
                    subtitle={`${row.count} ${plural(row.count, "раз", "раза", "раз")}`}
                    norm={row.normMinutes}
                    actual={row.actualMinutes}
                    deviation={row.deviation}
                  />
                ))}
              </div>
              <table className="app-table hidden lg:table">
                <thead>
                  <tr>
                    <th>Работа</th>
                    <th className="w-16 text-right">Раз</th>
                    <th className="w-24 text-right">Норматив</th>
                    <th className="w-24 text-right">Факт</th>
                    <th className="w-20 text-right">Разница</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceTiming.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td className="text-right tabular-nums">{row.count}</td>
                      <td className="muted text-right tabular-nums">{formatDuration(row.normMinutes)}</td>
                      <td className="text-right tabular-nums">{formatDuration(row.actualMinutes)}</td>
                      <td
                        className="text-right font-semibold tabular-nums"
                        style={{ color: row.deviation === null ? undefined : row.deviation > 0 ? "var(--danger)" : "var(--accent)" }}
                      >
                        {row.deviation === null ? "—" : `${row.deviation > 0 ? "+" : ""}${row.deviation}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="p-4">
              <h2 className="panel-title flex items-center gap-2"><IconStopwatch size={18} /> Мастера: темп и вовлечённость</h2>
              <p className="muted mt-1 text-xs">Минус в разнице — укладывается быстрее норматива</p>
            </div>
            {executorTiming.length === 0 ? (
              <p className="muted px-4 pb-4 text-sm">За период нет работ с нормативом.</p>
            ) : (
              <>
              <div className="lg:hidden">
                {executorTiming.map((row) => (
                  <TimeRow
                    key={row.name}
                    title={row.name}
                    subtitle={`${row.orders} ${plural(row.orders, "заказ", "заказа", "заказов")} · ${row.works} ${plural(row.works, "работа", "работы", "работ")}`}
                    norm={row.normMinutes}
                    actual={row.actualMinutes}
                    deviation={row.deviation}
                    right={<span>{formatMoney(row.revenuePerHour)} в час</span>}
                  />
                ))}
              </div>
              <table className="app-table hidden lg:table">
                <thead>
                  <tr>
                    <th>Мастер</th>
                    <th className="w-20 text-right">Заказов</th>
                    <th className="w-24 text-right">Норматив</th>
                    <th className="w-24 text-right">Факт</th>
                    <th className="w-20 text-right">Разница</th>
                    <th className="w-24 text-right">₽ в час</th>
                  </tr>
                </thead>
                <tbody>
                  {executorTiming.map((row) => (
                    <tr key={row.name}>
                      <td className="font-medium">{row.name}</td>
                      <td className="text-right tabular-nums">{row.orders}</td>
                      <td className="muted text-right tabular-nums">{formatDuration(row.normMinutes)}</td>
                      <td className="text-right tabular-nums">{formatDuration(row.actualMinutes)}</td>
                      <td
                        className="text-right font-semibold tabular-nums"
                        style={{ color: row.deviation === null ? undefined : row.deviation > 0 ? "var(--danger)" : "var(--accent)" }}
                      >
                        {row.deviation === null ? "—" : `${row.deviation > 0 ? "+" : ""}${row.deviation}%`}
                      </td>
                      <td className="text-right tabular-nums">{formatMoney(row.revenuePerHour)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )}
          </Card>

          <Card>
            <h2 className="panel-title mb-3 flex items-center gap-2"><IconGauge size={18} /> Загрузка подъёмников за период</h2>
            <div className="space-y-2 text-sm">
              {liftLoad.map((row) => {
                const lift = lifts.find((item) => item.id === row.liftId);
                return (
                  <div key={row.liftId}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{lift?.name ?? `Подъёмник ${row.liftId}`}</span>
                      <span className="muted shrink-0 tabular-nums">
                        {formatDuration(row.minutes)} · {row.orders} {plural(row.orders, "заказ", "заказа", "заказов")} · {row.loadPercent}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bg)" }}>
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${row.loadPercent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="p-4">
              <h2 className="panel-title flex items-center gap-2"><IconAlertTriangle size={18} /> Сильнее всего разошлось с нормативом</h2>
              <p className="muted mt-1 text-xs">Куда смотреть в первую очередь: или норматив занижен, или работу растянули</p>
            </div>
            {deviations.length === 0 ? (
              <p className="muted px-4 pb-4 text-sm">Отклонений за период нет.</p>
            ) : (
              <>
              <div className="lg:hidden">
                {deviations.map(({ order, norm, actual, deviation }) => {
                  const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                  return (
                    <TimeRow
                      key={order.id}
                      title={<Link to={`/orders/${order.id}`} className="text-[var(--accent)]">{order.number}</Link>}
                      subtitle={vehicle ? `${vehicle.make} ${vehicle.model}` : undefined}
                      norm={norm}
                      actual={actual}
                      deviation={deviation}
                    />
                  );
                })}
              </div>
              <table className="app-table hidden lg:table">
                <thead>
                  <tr>
                    <th>Заказ-наряд</th>
                    <th className="w-24 text-right">Норматив</th>
                    <th className="w-24 text-right">Факт</th>
                    <th className="w-20 text-right">Разница</th>
                  </tr>
                </thead>
                <tbody>
                  {deviations.map(({ order, norm, actual, deviation }) => {
                    const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                    return (
                      <tr key={order.id}>
                        <td>
                          <Link to={`/orders/${order.id}`} className="font-medium text-[var(--accent)]">{order.number}</Link>
                          <div className="muted text-xs">{vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}</div>
                        </td>
                        <td className="muted text-right tabular-nums">{formatDuration(norm)}</td>
                        <td className="text-right tabular-nums">{formatDuration(actual)}</td>
                        <td
                          className="text-right font-semibold tabular-nums"
                          style={{ color: deviation! > 0 ? "var(--danger)" : "var(--accent)" }}
                        >
                          {deviation! > 0 ? "+" : ""}{deviation}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </>
            )}
          </Card>
        </div>

        <Card className="mt-3">
          <h2 className="panel-title mb-3 flex items-center gap-2"><IconCoin size={18} /> Расходы по категориям</h2>
          {expensesByCategory.length === 0 ? (
            <p className="muted text-sm">Расходов пока не было.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {expensesByCategory.map(([name, value]) => (
                <div key={name}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{name}</span>
                    <b className="shrink-0 tabular-nums">{formatMoney(value)}</b>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bg)" }}>
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, (value / Math.max(1, expensesTotal)) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="mt-3">
          <p className="muted text-sm">
            Деньги — выручка, расходы и прибыль за период — в разделе{" "}
            <Link to="/finance" className="font-semibold text-[var(--accent)]">Финансы</Link>.
          </p>
        </Card>
      </Page>
    </>
  );
}
