import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IconChevronRight, IconStar, IconUsers } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Card, EmptyState, ListCard, Page, TopBar } from "../components/ui";
import { plural } from "../lib/format";

export default function Clients() {
  const { clients, vehicles, orders } = useAppStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = (searchParams.get("q") ?? "").toLocaleLowerCase("ru-RU");
  const filteredClients = useMemo(() => clients.filter((client) => {
    if (!query) return true;
    const clientVehicles = vehicles.filter((vehicle) => vehicle.clientId === client.id);
    return `${client.code ?? ""} ${client.name} ${client.phone} ${clientVehicles.map((vehicle) => `${vehicle.code ?? ""} ${vehicle.make} ${vehicle.model} ${vehicle.plate} ${vehicle.vin ?? ""}`).join(" ")}`
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

        <Card className="overflow-hidden p-0 max-sm:-mx-3 max-sm:rounded-none max-sm:border-x-0 max-sm:shadow-none">
          <div className="space-y-2 p-3 max-sm:p-2 lg:hidden">
            {filteredClients.map((c) => {
              const clientVehicles = vehicles.filter((v) => v.clientId === c.id);
              const clientOrders = orders.filter((o) => o.clientId === c.id);
              return (
                <ListCard
                  key={c.id}
                  onClick={() => navigate(`/clients/${c.id}`)}
                  title={<>{c.name} <span className="muted font-normal">· {c.code}</span></>}
                  amount={c.isRegular ? <span className="text-xs font-semibold text-[var(--accent)]">постоянный</span> : undefined}
                  lines={[
                    c.phone,
                    clientVehicles.map((v) => `${v.make} ${v.model}`).join(", ") || "Автомобилей нет",
                  ]}
                  meta={`${clientOrders.length} ${plural(clientOrders.length, "заказ", "заказа", "заказов")}`}
                />
              );
            })}
            {filteredClients.length === 0 && (
              <EmptyState icon={<IconUsers size={22} />} title="Ничего не найдено" hint="Проверьте написание или попробуйте другой запрос" />
            )}
          </div>

          <div className="table-scroll hidden lg:block">
            <table className="app-table min-w-[640px]">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Клиент</th>
                  <th>Телефон</th>
                  <th>Автомобили</th>
                  <th className="text-right">Заказов</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((c) => {
                  const clientVehicles = vehicles.filter((v) => v.clientId === c.id);
                  const clientOrders = orders.filter((o) => o.clientId === c.id);
                  return (
                    <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="cursor-pointer">
                      <td className="muted whitespace-nowrap">{c.code}</td>
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
                      <td>
                        <a
                          href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
                          onClick={(event) => event.stopPropagation()}
                          className="text-[var(--accent)] hover:underline"
                        >
                          {c.phone}
                        </a>
                      </td>
                      <td>{clientVehicles.map((v) => `${v.make} ${v.model}`).join(", ") || "—"}</td>
                      <td className="text-right font-medium">{clientOrders.length}</td>
                      <td className="text-right"><IconChevronRight size={16} className="muted inline" /></td>
                    </tr>
                  );
                })}
                {filteredClients.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState icon={<IconUsers size={22} />} title="Ничего не найдено" hint="Проверьте написание или попробуйте другой запрос" />
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
