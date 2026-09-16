import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconChartBar, IconCoin, IconPackage, IconUsersGroup } from "@tabler/icons-react";
import { Page, StatusBadge, TopBar } from "../components/ui";
import LiftTimeline from "../components/LiftTimeline";
import { useAppStore } from "../store/AppStore";
import { formatMoney } from "../lib/format";

export default function Dashboard() {
  const { orders, stock, clients, employees } = useAppStore();
  const workRevenue = orders.reduce((sum, order) => sum + order.works.reduce((acc, work) => acc + work.price * work.qty, 0), 0);
  const partsRevenue = orders.reduce((sum, order) => sum + order.parts.reduce((acc, part) => acc + part.price * part.qty, 0), 0);
  const salaries = employees.reduce((sum, employee) => sum + employee.accrued, 0);
  const critical = stock.filter((item) => item.qty <= item.minQty);
  const active = orders.filter((order) => order.status !== "выдан");
  const todayLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return <>
    <TopBar title="Доброе утро!" subtitle="Всё под контролем. Хорошего рабочего дня!" />
    <Page>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={<IconCoin />} label="Выручка сегодня" value={formatMoney(workRevenue + partsRevenue)} hint={`${orders.length} заказ-нарядов`} />
        <Metric icon={<IconPackage />} label="Выручка за запчасти" value={formatMoney(partsRevenue)} hint={`${stock.length} позиций на складе`} />
        <Metric icon={<IconUsersGroup />} label="Зарплаты" value={formatMoney(salaries)} hint="Начислено за период" />
        <Metric icon={<IconChartBar />} label="Чистая прибыль" value={formatMoney(Math.max(workRevenue + partsRevenue - salaries, 0))} hint="Расчётный показатель" />
        <Link to="/orders/new" className="flex h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent-strong)] sm:min-h-28 sm:text-base">+ Новая запись</Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="soft-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
            <div><h2 className="text-xl font-bold tracking-tight">Расписание на сегодня</h2><p className="mt-1 text-sm muted">Загрузка подъёмников и текущие работы</p></div>
            <div className="rounded-lg border bg-white px-3 py-2 text-sm font-medium" style={{ borderColor: "var(--border)" }}>{todayLabel}</div>
          </div>
          <LiftTimeline />
        </section>
        <aside className="space-y-4">
          <section className="soft-panel p-4"><div className="mb-3 flex items-center justify-between"><h2 className="panel-title">Заканчиваются запчасти</h2><Link to="/stock" className="text-sm font-medium text-[var(--accent)]">Все ({critical.length})</Link></div><ul className="divide-y" style={{ borderColor: "var(--border)" }}>{critical.slice(0, 5).map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span>{item.name}</span><b className="whitespace-nowrap text-[var(--danger)]">{item.qty} {item.unit}</b></li>)}</ul></section>
          <section className="soft-panel p-4"><div className="mb-3 flex items-center justify-between"><h2 className="panel-title">Активные заказ-наряды</h2><Link to="/orders" className="text-sm font-medium text-[var(--accent)]">Все ({active.length})</Link></div><ul className="divide-y" style={{ borderColor: "var(--border)" }}>{active.slice(0, 5).map((order) => { const client = clients.find((item) => item.id === order.clientId); return <li key={order.id} className="py-3"><Link to={`/orders/${order.id}`} className="flex items-start justify-between gap-2"><span><b className="block text-sm">{order.number}</b><span className="text-xs muted">{client?.name}</span></span><StatusBadge status={order.status} /></Link></li>; })}</ul></section>
        </aside>
      </div>
    </Page>
  </>;
}

function Metric({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return <div className="soft-panel flex min-h-28 items-center gap-3 p-4"><div className="rounded-xl bg-emerald-50 p-2.5 text-[var(--accent)]">{icon}</div><div><div className="text-sm muted">{label}</div><div className="mt-1 text-2xl font-bold tracking-tight">{value}</div><div className="mt-1 text-xs muted">{hint}</div></div></div>;
}
