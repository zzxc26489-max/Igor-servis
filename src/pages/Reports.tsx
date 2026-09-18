import { Link } from "react-router-dom";
import {
  IconCar, IconChartBar, IconClipboardList, IconClockHour4, IconCoin, IconGauge, IconTool, IconUsersGroup,
} from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { liftState } from "../lib/lift";
import { isCostExpense } from "../lib/analytics";
import { Card, EmptyState, Metric, Page, TopBar } from "../components/ui";
import { formatMoney, plural } from "../lib/format";
import { computePayroll } from "../lib/payroll";
import { orderTotals } from "../lib/order";

export default function Reports() {
  const { orders, employees: rawEmployees, vehicles, lifts, clients, expenses } = useAppStore();
  const today = new Date().toISOString().slice(0, 10);
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
  const byExecutor = new Map<string, { name: string; count: number; revenue: number }>();
  orders.forEach((order) =>
    order.works.forEach((work) => {
      const name = work.executor || "Не указан";
      const entry = byExecutor.get(name) ?? { name, count: 0, revenue: 0 };
      entry.count += work.qty;
      entry.revenue += work.price * work.qty;
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
                          <span className="muted text-xs">{executor.count} {plural(executor.count, "работа", "работы", "работ")}</span>
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
