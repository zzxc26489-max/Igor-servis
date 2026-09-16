import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconChartBar, IconCoin, IconPackage, IconPlus, IconUsersGroup } from "@tabler/icons-react";
import { Card, Page, StatusBadge, TopBar } from "../components/ui";
import LiftTimeline from "../components/LiftTimeline";
import { useAppStore } from "../store/AppStore";
import { formatMoney } from "../lib/format";

export default function Dashboard() {
  const { orders, stock, clients, vehicles, employees } = useAppStore();
  const workRevenue = orders.reduce((sum, order) => sum + order.works.reduce((acc, work) => acc + work.price * work.qty, 0), 0);
  const partsRevenue = orders.reduce((sum, order) => sum + order.parts.reduce((acc, part) => acc + part.price * part.qty, 0), 0);
  const salaries = employees.reduce((sum, employee) => sum + employee.accrued, 0);
  const critical = stock.filter((item) => item.qty <= item.minQty);
  const active = orders.filter((order) => order.status !== "выдан");
  const todayLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return <>
    <TopBar title="Доброе утро, Игорь!" subtitle="Всё под контролем. Хорошего рабочего дня!" />
    <Page>
      <div className="mb-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_230px]">
        <Card className="grid grid-cols-2 overflow-hidden p-0 lg:grid-cols-4">
          <Metric icon={<IconCoin />} label="Выручка сегодня" value={formatMoney(workRevenue + partsRevenue)} hint={`${orders.length} заказ-нарядов`} />
          <Metric icon={<IconPackage />} label="Запчасти" value={formatMoney(partsRevenue)} hint={`${stock.length} позиций на складе`} />
          <Metric icon={<IconUsersGroup />} label="Зарплаты" value={formatMoney(salaries)} hint="Начислено за период" />
          <Metric icon={<IconChartBar />} label="Чистая прибыль" value={formatMoney(Math.max(workRevenue + partsRevenue - salaries, 0))} hint="Расчётный показатель" />
        </Card>
        <Link to="/orders/new" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(15,122,77,.18)] transition hover:bg-[var(--accent-strong)] xl:h-auto xl:text-base"><IconPlus size={20} /> Новая запись</Link>
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
          <section className="soft-panel p-4"><div className="mb-3 flex items-center justify-between"><h2 className="panel-title">Заканчиваются запчасти</h2><Link to="/stock" className="text-sm font-semibold text-[var(--accent)]">Все ({critical.length})</Link></div><ul className="divide-y" style={{ borderColor: "var(--border)" }}>{critical.slice(0, 5).map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="flex items-center gap-2"><i className="h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />{item.name}</span><b className="whitespace-nowrap text-[var(--danger)]">{item.qty} {item.unit}</b></li>)}</ul></section>
          <section className="soft-panel p-4"><div className="mb-3 flex items-center justify-between"><h2 className="panel-title">Активные заказ-наряды</h2><Link to="/orders" className="text-sm font-semibold text-[var(--accent)]">Все ({active.length})</Link></div><ul className="divide-y" style={{ borderColor: "var(--border)" }}>{active.slice(0, 5).map((order) => { const client = clients.find((item) => item.id === order.clientId); const vehicle = vehicles.find((item) => item.id === order.vehicleId); const total = order.works.reduce((sum, item) => sum + item.price * item.qty, 0) + order.parts.reduce((sum, item) => sum + item.price * item.qty, 0); return <li key={order.id} className="py-3"><Link to={`/orders/${order.id}`} className="block rounded-lg transition hover:bg-[var(--bg)]"><span className="flex items-start justify-between gap-2"><b className="text-sm">{order.number}</b><b className="text-sm tabular-nums">{formatMoney(total)}</b></span><span className="mt-1 flex items-center justify-between gap-2"><span className="text-xs muted">{client?.name} · {vehicle?.make} {vehicle?.model}</span><StatusBadge status={order.status} /></span></Link></li>; })}</ul></section>
        </aside>
      </div>
    </Page>
  </>;
}

function Metric({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return <div className="flex min-h-[104px] items-center gap-2.5 border-b border-[var(--border)] p-3 [&:nth-child(n+3)]:border-b-0 [&:nth-child(odd)]:border-r lg:border-b-0 lg:border-r lg:p-4 lg:last:border-r-0"><div className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] min-[420px]:grid lg:h-11 lg:w-11">{icon}</div><div className="min-w-0"><div className="truncate text-xs muted sm:text-sm">{label}</div><div className="mt-1 truncate text-lg font-bold tracking-[-0.03em] tabular-nums sm:text-[22px]">{value}</div><div className="mt-1 truncate text-[11px] muted sm:text-xs">{hint}</div></div></div>;
}
