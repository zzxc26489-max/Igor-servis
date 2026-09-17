import { Link } from "react-router-dom";
import { IconChartBar, IconCoin, IconPackage, IconUsersGroup } from "@tabler/icons-react";
import { Metric, Page, StatusBadge, TopBar } from "../components/ui";
import LiftTimeline from "../components/LiftTimeline";
import { useAppStore } from "../store/AppStore";
import { formatMoney, plural } from "../lib/format";
import { computePayroll } from "../lib/payroll";
import { orderTotals } from "../lib/order";

export default function Dashboard() {
  const { orders, stock, clients, vehicles, employees: rawEmployees, expenses } = useAppStore();
  const employees = computePayroll(rawEmployees, orders);
  const revenue = orders.reduce((sum, order) => sum + orderTotals(order).due, 0);
  const partsRevenue = orders.reduce((sum, order) => sum + orderTotals(order).parts, 0);
  const salaries = employees.reduce((sum, employee) => sum + employee.accrued, 0);
  const expensesTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const profit = revenue - expensesTotal - salaries;
  const critical = stock.filter((item) => item.qty <= item.minQty);
  const active = orders.filter((order) => order.status !== "выдан");
  const todayLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const hour = new Date().getHours();
  const greeting = hour < 6 ? "Доброй ночи!" : hour < 12 ? "Доброе утро!" : hour < 18 ? "Добрый день!" : "Добрый вечер!";

  return <>
    <TopBar title={greeting} subtitle="Всё под контролем. Хорошего рабочего дня!" />
    <Page>
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric icon={<IconCoin size={18} />} label="Выручка" value={formatMoney(revenue)} hint={`${orders.length} ${plural(orders.length, "заказ-наряд", "заказ-наряда", "заказ-нарядов")}`} />
        <Metric icon={<IconPackage size={18} />} tone="blue" label="Запчасти" value={formatMoney(partsRevenue)} hint={`${stock.length} ${plural(stock.length, "позиция", "позиции", "позиций")} на складе`} />
        <Metric icon={<IconUsersGroup size={18} />} tone="violet" label="Зарплаты" value={formatMoney(salaries)} hint="Начислено за период" />
        <Metric icon={<IconChartBar size={18} />} tone={profit >= 0 ? "accent" : "danger"} label="Прибыль" value={formatMoney(profit)} hint="После расходов и зарплат" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="soft-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
            <div><p className="section-kicker">Рабочий день</p><h2 className="section-title mt-1">Расписание на сегодня</h2><p className="mt-1 text-sm muted">Загрузка подъёмников и текущие работы</p></div>
            <Link to="/schedule" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold transition hover:bg-[var(--bg)]" style={{ borderColor: "var(--border)" }}>{todayLabel}</Link>
          </div>
          <LiftTimeline />
        </section>
        <aside className="space-y-4">
          <section className="soft-panel p-4"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="panel-title">Заканчиваются</h2><Link to="/stock" className="shrink-0 whitespace-nowrap text-sm font-semibold text-[var(--accent)]">Все ({critical.length})</Link></div><ul className="divide-y" style={{ borderColor: "var(--border)" }}>{critical.slice(0, 5).map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="flex items-center gap-2"><i className="h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />{item.name}</span><b className="whitespace-nowrap text-[var(--danger)]">{item.qty} {item.unit}</b></li>)}</ul></section>
          <section className="soft-panel p-4"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="panel-title">В работе</h2><Link to="/orders" className="shrink-0 whitespace-nowrap text-sm font-semibold text-[var(--accent)]">Все ({active.length})</Link></div><ul className="divide-y" style={{ borderColor: "var(--border)" }}>{active.slice(0, 5).map((order) => { const client = clients.find((item) => item.id === order.clientId); const vehicle = vehicles.find((item) => item.id === order.vehicleId); const total = order.works.reduce((sum, item) => sum + item.price * item.qty, 0) + order.parts.reduce((sum, item) => sum + item.price * item.qty, 0); return <li key={order.id} className="py-3"><Link to={`/orders/${order.id}`} className="block rounded-lg transition hover:bg-[var(--bg)]"><span className="flex items-start justify-between gap-2"><b className="text-sm">{order.number}</b><b className="text-sm tabular-nums">{formatMoney(total)}</b></span><span className="mt-1 flex items-center justify-between gap-2"><span className="truncate text-xs muted">{client?.name} · {vehicle?.make} {vehicle?.model}</span><span className="shrink-0"><StatusBadge status={order.status} /></span></span></Link></li>; })}</ul></section>
        </aside>
      </div>
    </Page>
  </>;
}

