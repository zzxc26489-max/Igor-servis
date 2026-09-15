import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconChartBar, IconCoin, IconPackage, IconUsersGroup } from "@tabler/icons-react";
import { Page, StatusBadge, TopBar } from "../components/ui";
import { useAppStore } from "../store/AppStore";
import { formatMoney } from "../lib/format";

const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

export default function Dashboard() {
  const { orders, lifts, stock, clients, employees, vehicles } = useAppStore();
  const workRevenue = orders.reduce((sum, order) => sum + order.works.reduce((acc, work) => acc + work.price * work.qty, 0), 0);
  const partsRevenue = orders.reduce((sum, order) => sum + order.parts.reduce((acc, part) => acc + part.price * part.qty, 0), 0);
  const salaries = employees.reduce((sum, employee) => sum + employee.accrued, 0);
  const critical = stock.filter((item) => item.qty <= item.minQty);
  const active = orders.filter((order) => order.status !== "выдан");

  return <>
    <TopBar title="Доброе утро!" subtitle="Всё под контролем. Хорошего рабочего дня!" />
    <Page>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={<IconCoin />} label="Выручка сегодня" value={formatMoney(workRevenue + partsRevenue)} hint={`${orders.length} заказ-нарядов`} />
        <Metric icon={<IconPackage />} label="Запчасти" value={formatMoney(partsRevenue)} hint={`${stock.length} позиций на складе`} />
        <Metric icon={<IconUsersGroup />} label="Зарплаты" value={formatMoney(salaries)} hint="Начислено за период" />
        <Metric icon={<IconChartBar />} label="Чистая прибыль" value={formatMoney(Math.max(workRevenue + partsRevenue - salaries, 0))} hint="Расчётный показатель" />
        <Link to="/orders/new" className="flex min-h-28 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-base font-semibold text-white shadow-sm transition hover:bg-[var(--accent-strong)]">+ Новая запись</Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="soft-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
            <div><h2 className="text-xl font-bold tracking-tight">Расписание на сегодня</h2><p className="mt-1 text-sm muted">Загрузка подъёмников и текущие работы</p></div>
            <div className="rounded-lg border bg-white px-3 py-2 text-sm font-medium" style={{ borderColor: "var(--border)" }}>14 сентября 2026</div>
          </div>
          <div className="overflow-x-auto px-4 py-3"><div className="min-w-[740px]">
            <div className="grid grid-cols-[150px_repeat(12,minmax(46px,1fr))] border-b text-xs font-medium muted" style={{ borderColor: "var(--border)" }}><div className="py-2" />{HOURS.map((hour) => <div key={hour} className="py-2 text-center">{hour}</div>)}</div>
            {lifts.map((lift) => {
              const order = orders.find((item) => item.liftId === lift.id && item.status !== "выдан");
              const client = order && clients.find((item) => item.id === order.clientId);
              const vehicle = order && vehicles.find((item) => item.id === order.vehicleId);
              const start = order ? Math.max(0, Number(order.scheduledStart?.slice(0, 2) ?? "8") - 8) : 0;
              const end = order ? Math.min(12, Number(order.scheduledEnd?.slice(0, 2) ?? "9") - 8) : 0;
              const palette = lift.id === 2 ? "#e8f1ff" : lift.id === 4 ? "#fff4dc" : "#e4f3e9";
              return <div key={lift.id} className="grid min-h-28 grid-cols-[150px_repeat(12,minmax(46px,1fr))] border-b" style={{ borderColor: "var(--border)" }}>
                <div className="flex flex-col justify-center pr-3"><b className="text-sm">{lift.name}</b><span className="mt-1 text-xs muted"><span className={`mr-1 inline-block h-2 w-2 rounded-full ${order ? "bg-emerald-500" : "bg-slate-300"}`} />{order ? "Занят" : "Свободен"}</span></div>
                {HOURS.map((hour) => <div key={hour} className="border-l" style={{ borderColor: "#eef0ee" }} />)}
                {order ? <Link to={`/orders/${order.id}`} className="z-10 m-2 rounded-lg p-3 text-sm shadow-sm" style={{ gridColumn: `${start + 2} / ${Math.max(start + 3, end + 2)}`, gridRow: 1, background: palette }}><div className="font-semibold">{order.scheduledStart} – {order.scheduledEnd}</div><div className="mt-1 font-semibold">{client?.name}</div><div className="mt-1 text-xs muted">{vehicle?.make} {vehicle?.model} · {order.works[0]?.name ?? "Диагностика"}</div></Link> : <div className="z-10 col-[2/14] row-start-1 m-2 flex items-center justify-center rounded-lg border border-dashed text-xs muted" style={{ borderColor: "var(--border)" }}>Подъёмник свободен</div>}
              </div>;
            })}
          </div></div>
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
