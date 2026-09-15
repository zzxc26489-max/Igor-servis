import { Link } from "react-router-dom";
import { useAppStore } from "../store/AppStore";
import { Page, StatusBadge, TopBar, Card } from "../components/ui";
import { formatDateTime, formatMoney } from "../lib/format";

function orderTotal(o: { works: { price: number; qty: number }[]; parts: { price: number; qty: number }[] }) {
  const works = o.works.reduce((s, w) => s + w.price * w.qty, 0);
  const parts = o.parts.reduce((s, p) => s + p.price * p.qty, 0);
  return works + parts;
}

export default function Orders() {
  const { orders, clients, vehicles } = useAppStore();

  return (
    <>
      <TopBar title="Заказ-наряды" subtitle={`Всего: ${orders.length}`} />
      <Page>
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="px-4 py-3 font-medium">№</th>
                <th className="px-4 py-3 font-medium">Клиент</th>
                <th className="px-4 py-3 font-medium">Автомобиль</th>
                <th className="px-4 py-3 font-medium">Создан</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium text-right">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const client = clients.find((c) => c.id === o.clientId);
                const vehicle = vehicles.find((v) => v.id === o.vehicleId);
                return (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-gray-50" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3">
                      <Link to={`/orders/${o.id}`} className="font-medium" style={{ color: "var(--accent)" }}>
                        {o.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{client?.name}</td>
                    <td className="px-4 py-3">
                      {vehicle?.make} {vehicle?.model} · {vehicle?.plate}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                      {formatDateTime(o.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatMoney(orderTotal(o))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </Page>
    </>
  );
}
