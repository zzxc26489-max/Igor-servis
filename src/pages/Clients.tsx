import { useAppStore } from "../store/AppStore";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, Page, TopBar } from "../components/ui";

export default function Clients() {
  const { clients, vehicles, orders } = useAppStore();
  const [searchParams] = useSearchParams();
  const query = (searchParams.get("q") ?? "").toLocaleLowerCase("ru-RU");
  const filteredClients = useMemo(() => clients.filter((client) => {
    if (!query) return true;
    const clientVehicles = vehicles.filter((vehicle) => vehicle.clientId === client.id);
    return `${client.name} ${client.phone} ${clientVehicles.map((vehicle) => `${vehicle.make} ${vehicle.model} ${vehicle.plate} ${vehicle.vin ?? ""}`).join(" ")}`
      .toLocaleLowerCase("ru-RU")
      .includes(query);
  }), [clients, query, vehicles]);

  return (
    <>
      <TopBar title="Клиенты" subtitle={query ? `Найдено: ${filteredClients.length}` : `Всего: ${clients.length}`} />
      <Page>
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="px-4 py-2 font-medium">Клиент</th>
                <th className="px-4 py-2 font-medium">Телефон</th>
                <th className="px-4 py-2 font-medium">Автомобили</th>
                <th className="px-4 py-2 font-medium text-right">Заказов</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((c) => {
                const clientVehicles = vehicles.filter((v) => v.clientId === c.id);
                const clientOrders = orders.filter((o) => o.clientId === c.id);
                return (
                  <tr key={c.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2">
                      {c.name}
                      {c.isRegular && (
                        <span className="ml-2 text-xs" style={{ color: "var(--accent)" }}>
                          постоянный
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>
                      {c.phone}
                    </td>
                    <td className="px-4 py-2">
                      {clientVehicles.map((v) => `${v.make} ${v.model}`).join(", ")}
                    </td>
                    <td className="px-4 py-2 text-right">{clientOrders.length}</td>
                  </tr>
                );
              })}
              {filteredClients.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>По этому запросу клиентов и автомобилей не найдено.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </Page>
    </>
  );
}
