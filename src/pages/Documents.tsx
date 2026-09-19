import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { IconFileDescription, IconPrinter, IconSearch } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Button, Card, Page, StatusBadge, TopBar } from "../components/ui";
import { formatDateTime, formatMoney } from "../lib/format";
import { orderTotals } from "../lib/order";

export default function Documents() {
  const { orders, clients, vehicles } = useAppStore();
  const [query, setQuery] = useState("");

  const clientById = useMemo(() => new Map(clients.map((item) => [item.id, item])), [clients]);
  const vehicleById = useMemo(() => new Map(vehicles.map((item) => [item.id, item])), [vehicles]);
  const normalized = query.trim().toLocaleLowerCase("ru-RU");

  const visible = useMemo(() => {
    return [...orders]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((order) => {
        if (!normalized) return true;
        const client = clientById.get(order.clientId);
        const vehicle = vehicleById.get(order.vehicleId);
        const haystack = [
          order.number,
          client?.name,
          client?.phone,
          vehicle?.make,
          vehicle?.model,
          vehicle?.plate,
          vehicle?.vin,
        ].filter(Boolean).join(" ").toLocaleLowerCase("ru-RU");
        return haystack.includes(normalized);
      });
  }, [clientById, normalized, orders, vehicleById]);

  return (
    <>
      <TopBar
        title="Документы"
        subtitle="Клиентские заказ-наряды для печати и PDF"
        actions={null}
      />
      <Page>
        <div className="mx-auto max-w-6xl space-y-4">
          <Card className="p-3 sm:p-4">
            <label className="relative block">
              <IconSearch
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-muted)" }}
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Заказ, клиент, телефон, госномер или VIN"
                className="w-full rounded-lg border bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[var(--accent)]"
                style={{ borderColor: "var(--border)" }}
                aria-label="Поиск документов"
              />
            </label>
          </Card>

          {visible.length === 0 ? (
            <Card>
              <div className="py-8 text-center">
                <IconFileDescription size={34} className="mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
                <p className="font-medium">Заказ-наряды не найдены</p>
                <p className="muted mt-1 text-sm">Измените поиск или создайте новый заказ.</p>
              </div>
            </Card>
          ) : (
            <div className="grid gap-3">
              {visible.map((order) => {
                const client = clientById.get(order.clientId);
                const vehicle = vehicleById.get(order.vehicleId);
                const totals = orderTotals(order);
                const car = vehicle ? `${vehicle.make} ${vehicle.model}` : "Автомобиль не указан";

                return (
                  <Card key={order.id} className="p-3 sm:p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <b className="text-base">{order.number}</b>
                          <StatusBadge status={order.status} />
                        </div>
                        <div className="mt-1 text-sm">
                          <span className="font-medium">{client?.name || "Клиент не указан"}</span>
                          <span className="muted"> · {car}{vehicle?.plate ? ` · ${vehicle.plate}` : ""}</span>
                        </div>
                        <div className="muted mt-1 text-xs">
                          {formatDateTime(order.createdAt)} · Итого {formatMoney(totals.due)}
                        </div>
                      </div>
                      <Link to={`/orders/${order.id}/print`} className="sm:shrink-0">
                        <Button variant="secondary" className="w-full sm:w-auto">
                          <IconPrinter size={18} /> Открыть заказ-наряд
                        </Button>
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </Page>
    </>
  );
}
