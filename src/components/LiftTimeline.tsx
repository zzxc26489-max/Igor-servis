import { Link } from "react-router-dom";
import { useAppStore } from "../store/AppStore";

const DEFAULT_HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

export default function LiftTimeline({ hours = DEFAULT_HOURS }: { hours?: string[] }) {
  const { lifts, orders, clients, vehicles } = useAppStore();
  const startHour = Number(hours[0].slice(0, 2));
  const colCount = hours.length;

  return (
    <div className="overflow-x-auto px-4 py-3">
      <div style={{ minWidth: `${138 + colCount * 46}px` }}>
        <div
          className="grid border-b text-xs font-medium muted"
          style={{ gridTemplateColumns: `138px repeat(${colCount}, minmax(46px, 1fr))`, borderColor: "var(--border)" }}
        >
          <div className="py-2" />
          {hours.map((hour) => (
            <div key={hour} className="py-2 text-center">
              {hour}
            </div>
          ))}
        </div>
        {lifts.map((lift) => {
          const order = orders.find((item) => item.liftId === lift.id && item.status !== "выдан");
          const client = order && clients.find((item) => item.id === order.clientId);
          const vehicle = order && vehicles.find((item) => item.id === order.vehicleId);
          const start = order ? Math.max(0, Number(order.scheduledStart?.slice(0, 2) ?? String(startHour)) - startHour) : 0;
          const end = order ? Math.min(colCount, Number(order.scheduledEnd?.slice(0, 2) ?? String(startHour + 1)) - startHour) : 0;
          const palette = lift.id === 2 ? "#e8f1ff" : lift.id === 4 ? "#fff4dc" : "#e4f3e9";
          return (
            <div
              key={lift.id}
              className="grid min-h-24 border-b last:border-b-0"
              style={{ gridTemplateColumns: `138px repeat(${colCount}, minmax(46px, 1fr))`, borderColor: "var(--border)" }}
            >
              <div className="flex flex-col justify-center pr-3">
                <b className="text-sm">{lift.name}</b>
                <span className="mt-1 text-xs muted">
                  <span className={`mr-1 inline-block h-2 w-2 rounded-full ${order ? "bg-emerald-500" : "bg-slate-300"}`} />
                  {order ? "Занят" : "Свободен"}
                </span>
              </div>
              {hours.map((hour) => (
                <div key={hour} className="border-l" style={{ borderColor: "#eef0ee" }} />
              ))}
              {order ? (
                <Link
                  to={`/orders/${order.id}`}
                  className="z-10 m-2 rounded-lg border border-white/70 p-3 text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  style={{ gridColumn: `${start + 2} / ${Math.max(start + 3, end + 2)}`, gridRow: 1, background: palette }}
                >
                  <div className="font-semibold">
                    {order.scheduledStart} – {order.scheduledEnd}
                  </div>
                  <div className="mt-1 font-semibold">{client?.name}</div>
                  <div className="mt-1 text-xs muted">
                    {vehicle?.make} {vehicle?.model} · {order.works[0]?.name ?? "Диагностика"}
                  </div>
                </Link>
              ) : (
                <div
                  className="z-10 flex items-center justify-center rounded-lg border border-dashed text-xs muted"
                  style={{ gridColumn: `2 / ${colCount + 2}`, gridRow: 1, margin: "0.5rem", borderColor: "var(--border)" }}
                >
                  Подъёмник свободен
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
