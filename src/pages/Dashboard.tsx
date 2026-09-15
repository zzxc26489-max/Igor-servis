import { Link } from "react-router-dom";
import { useAppStore } from "../store/AppStore";
import { Card, Page, StatTile, StatusBadge, TopBar, Button } from "../components/ui";
import { formatMoney } from "../lib/format";

export default function Dashboard() {
  const { orders, lifts, stock, clients, employees } = useAppStore();

  const todayRevenue = orders.reduce((sum, o) => {
    const works = o.works.reduce((s, w) => s + w.price * w.qty, 0);
    const parts = o.parts.reduce((s, p) => s + p.price * p.qty, 0);
    return sum + works + parts;
  }, 0);

  const partsCost = stock.reduce((s, i) => s + i.purchasePrice * i.qty, 0);
  const salaries = employees.reduce((s, e) => s + e.accrued, 0);
  const criticalStock = stock.filter((i) => i.qty <= i.minQty);
  const activeOrders = orders.filter((o) => o.status !== "выдан");

  const today = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <>
      <TopBar
        title="Главная"
        subtitle={`Всё под контролем. Сегодня: ${today}`}
        actions={
          <Link to="/orders">
            <Button>+ Новая запись</Button>
          </Link>
        }
      />
      <Page>
        <div className="flex flex-wrap gap-4 mb-6">
          <StatTile label="Выручка сегодня" value={formatMoney(todayRevenue)} hint={`${orders.length} заказ-наряда(ов)`} />
          <StatTile label="Запчасти на складе" value={formatMoney(partsCost)} hint={`${stock.length} позиций`} />
          <StatTile label="Зарплаты начислено" value={formatMoney(salaries)} />
          <StatTile label="Клиентов в базе" value={String(clients.length)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <Card>
              <h2 className="font-semibold mb-3">Подъёмники сегодня</h2>
              <div className="flex flex-col gap-2">
                {lifts.map((lift) => {
                  const order = orders.find((o) => o.liftId === lift.id && o.status !== "выдан");
                  const client = order && clients.find((c) => c.id === order.clientId);
                  return (
                    <div
                      key={lift.id}
                      className="flex items-center justify-between border rounded-lg px-3 py-2"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ background: order ? "var(--warning)" : "var(--accent)" }}
                        />
                        <span className="font-medium text-sm">{lift.name}</span>
                      </div>
                      {order ? (
                        <Link to={`/orders/${order.id}`} className="text-sm" style={{ color: "var(--text-muted)" }}>
                          {order.scheduledStart}–{order.scheduledEnd} · {client?.name} · {order.number}
                        </Link>
                      ) : (
                        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                          Свободен
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Заканчиваются запчасти</h2>
                <Link to="/stock" className="text-xs" style={{ color: "var(--accent)" }}>
                  Все ({criticalStock.length})
                </Link>
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                {criticalStock.slice(0, 5).map((item) => (
                  <li key={item.id} className="flex justify-between">
                    <span>{item.name}</span>
                    <span style={{ color: "var(--danger)" }}>
                      {item.qty} {item.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Активные заказ-наряды</h2>
                <Link to="/orders" className="text-xs" style={{ color: "var(--accent)" }}>
                  Все ({activeOrders.length})
                </Link>
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                {activeOrders.slice(0, 5).map((o) => {
                  const client = clients.find((c) => c.id === o.clientId);
                  return (
                    <li key={o.id}>
                      <Link to={`/orders/${o.id}`} className="flex items-center justify-between">
                        <span>
                          {o.number} · {client?.name}
                        </span>
                        <StatusBadge status={o.status} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        </div>
      </Page>
    </>
  );
}
