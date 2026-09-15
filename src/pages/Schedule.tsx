import { Link } from "react-router-dom";
import { useAppStore } from "../store/AppStore";
import { Card, Page, StatusBadge, TopBar } from "../components/ui";

export default function Schedule() {
  const { orders, lifts, clients, vehicles } = useAppStore();

  return (
    <>
      <TopBar title="Расписание" subtitle="Загруженность подъёмников на сегодня" />
      <Page>
        <div className="flex flex-col gap-3">
          {lifts.map((lift) => {
            const lineOrders = orders.filter((o) => o.liftId === lift.id && o.status !== "выдан");
            return (
              <Card key={lift.id}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-semibold">{lift.name}</h2>
                  <span
                    className="text-xs px-2 py-1 rounded-full"
                    style={{
                      background: lineOrders.length ? "#fdf3e0" : "#e7f5ec",
                      color: lineOrders.length ? "var(--warning)" : "var(--accent)",
                    }}
                  >
                    {lineOrders.length ? "Занят" : "Свободен"}
                  </span>
                </div>
                {lineOrders.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Нажмите «+ Новая запись», чтобы добавить клиента
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {lineOrders.map((o) => {
                      const client = clients.find((c) => c.id === o.clientId);
                      const vehicle = vehicles.find((v) => v.id === o.vehicleId);
                      return (
                        <li key={o.id}>
                          <Link to={`/orders/${o.id}`} className="flex items-center justify-between text-sm">
                            <span>
                              {o.scheduledStart}–{o.scheduledEnd} · {client?.name} · {vehicle?.make} {vehicle?.model}
                            </span>
                            <StatusBadge status={o.status} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      </Page>
    </>
  );
}
