import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { IconStar, IconUsers } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
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
  const regularCount = clients.filter((c) => c.isRegular).length;

  return (
    <>
      <TopBar title="Клиенты" subtitle={query ? `Найдено: ${filteredClients.length}` : `Всего: ${clients.length}`} />
      <Page>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Card className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#edf4ff] text-[#3978c9]">
              <IconUsers size={22} />
            </div>
            <div>
              <p className="muted text-sm">Всего клиентов</p>
              <p className="mt-1 text-2xl font-semibold">{clients.length}</p>
            </div>
          </Card>
          <Card className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e9f5ed] text-[var(--accent)]">
              <IconStar size={22} />
            </div>
            <div>
              <p className="muted text-sm">Постоянные клиенты</p>
              <p className="mt-1 text-2xl font-semibold">{regularCount}</p>
            </div>
          </Card>
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="overflow-auto">
            <table className="app-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Клиент</th>
                  <th>Телефон</th>
                  <th>Автомобили</th>
                  <th className="text-right">Заказов</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((c) => {
                  const clientVehicles = vehicles.filter((v) => v.clientId === c.id);
                  const clientOrders = orders.filter((o) => o.clientId === c.id);
                  return (
                    <tr key={c.id}>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e9f4ed] text-xs font-bold text-[var(--accent)]">
                            {c.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span>
                            <b className="block">{c.name}</b>
                            {c.isRegular && <span className="text-xs text-[var(--accent)]">постоянный</span>}
                          </span>
                        </span>
                      </td>
                      <td className="muted">{c.phone}</td>
                      <td>{clientVehicles.map((v) => `${v.make} ${v.model}`).join(", ") || "—"}</td>
                      <td className="text-right font-medium">{clientOrders.length}</td>
                    </tr>
                  );
                })}
                {filteredClients.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center muted">
                      По этому запросу клиентов и автомобилей не найдено.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </Page>
    </>
  );
}
