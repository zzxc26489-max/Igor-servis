import { Link } from "react-router-dom";
import { useAppStore } from "../store/AppStore";
import type { Order } from "../types";

const DEFAULT_HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

/** Дата визита: плановая, иначе день создания заказа. */
export function orderDay(order: Order) {
  return order.plannedAt ?? order.createdAt.slice(0, 10);
}

const PALETTE = [
  { bg: "#e8f5ed", border: "#c9e6d5" },
  { bg: "#eaf1ff", border: "#cfdffb" },
  { bg: "#fdf3e0", border: "#f3e0bb" },
  { bg: "#f5f0ff", border: "#e0d7f7" },
];

export default function LiftTimeline({
  hours = DEFAULT_HOURS,
  date,
}: {
  hours?: string[];
  /** День в формате YYYY-MM-DD; по умолчанию сегодня. */
  date?: string;
}) {
  const { lifts, orders, clients, vehicles } = useAppStore();
  const day = date ?? new Date().toISOString().slice(0, 10);
  const startMinutes = toMinutes(hours[0]);
  const endMinutes = toMinutes(hours[hours.length - 1]) + 60;
  const span = endMinutes - startMinutes;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isToday = day === new Date().toISOString().slice(0, 10);
  const showNow = isToday && nowMinutes >= startMinutes && nowMinutes <= endMinutes;

  function percent(minutes: number) {
    return ((minutes - startMinutes) / span) * 100;
  }

  return (
    <div className="table-scroll">
      <div className="min-w-[660px] px-4 pb-4">
        <div className="relative flex border-b pb-2 text-xs muted" style={{ borderColor: "var(--border)" }}>
          <div className="w-[128px] shrink-0" />
          <div className="relative flex-1">
            {hours.map((hour) => (
              <span
                key={hour}
                className="absolute -translate-x-1/2"
                style={{ left: `${percent(toMinutes(hour))}%` }}
              >
                {hour}
              </span>
            ))}
            {showNow && (
              <span
                className="absolute -translate-x-1/2 rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
                style={{ left: `${percent(nowMinutes)}%`, background: "var(--sidebar-bg)" }}
              >
                {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
              </span>
            )}
          </div>
        </div>

        <div className="relative mt-4">
          {showNow && (
            <div
              className="pointer-events-none absolute top-0 z-20 w-px"
              style={{ left: `calc(128px + ${percent(nowMinutes)}% * (100% - 128px) / 100%)`, bottom: 0, background: "var(--text)" }}
            />
          )}

          {lifts.map((lift) => {
            // Все визиты этого подъёмника за выбранный день, а не первый попавшийся заказ.
            const dayOrders = orders
              .filter((order) => order.liftId === lift.id && order.status !== "выдан" && orderDay(order) === day)
              .sort((a, b) => (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? ""));
            const busy = dayOrders.length > 0;
            const freeFrom = dayOrders.length
              ? dayOrders[dayOrders.length - 1].scheduledEnd
              : null;

            return (
              <div key={lift.id} className="flex min-h-[86px] items-stretch border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <div className="flex w-[128px] shrink-0 flex-col justify-center pr-3">
                  <b className="text-sm">{lift.name}</b>
                  <span className="mt-1 flex items-center gap-1.5 text-xs muted">
                    <i className="h-2 w-2 rounded-full" style={{ background: busy ? "var(--accent)" : "var(--border)" }} />
                    {busy ? "Занят" : "Свободен"}
                  </span>
                </div>

                <div className="relative flex-1 py-2">
                  <div className="absolute inset-0 flex">
                    {hours.map((hour) => (
                      <div key={hour} className="flex-1 border-l" style={{ borderColor: "#eef0ee" }} />
                    ))}
                  </div>

                  {dayOrders.map((order, index) => {
                    const start = toMinutes(order.scheduledStart ?? hours[0]);
                    const end = toMinutes(order.scheduledEnd ?? hours[0]) || start + 60;
                    const client = clients.find((item) => item.id === order.clientId);
                    const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                    const palette = PALETTE[index % PALETTE.length];
                    const left = Math.max(0, percent(start));
                    const width = Math.min(100 - left, percent(end) - percent(start));
                    return (
                      <Link
                        key={order.id}
                        to={`/orders/${order.id}`}
                        className="absolute inset-y-2 z-10 overflow-hidden rounded-lg border px-2.5 py-2 text-xs transition hover:-translate-y-0.5 hover:shadow-sm"
                        style={{ left: `${left}%`, width: `${Math.max(width, 8)}%`, background: palette.bg, borderColor: palette.border }}
                      >
                        <b className="block truncate text-[13px]">{vehicle ? `${vehicle.make} ${vehicle.model}` : client?.name}</b>
                        <span className="muted block truncate">
                          {order.scheduledStart}-{order.scheduledEnd} | {order.works[0]?.name ?? "Осмотр"}
                        </span>
                      </Link>
                    );
                  })}

                  {!busy && (
                    <Link
                      to="/orders/new"
                      className="absolute inset-y-2 left-0 right-0 z-10 flex items-center justify-center rounded-lg border border-dashed text-xs muted transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      + Записать на подъёмник
                    </Link>
                  )}
                  {busy && freeFrom && toMinutes(freeFrom) < endMinutes - 30 && (
                    <span
                      className="absolute inset-y-2 z-0 flex items-center justify-center text-xs muted"
                      style={{ left: `${percent(toMinutes(freeFrom))}%`, right: 0 }}
                    >
                      Свободен с {freeFrom}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
