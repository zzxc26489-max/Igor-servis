import { Link } from "react-router-dom";
import { useAppStore } from "../store/AppStore";
import { bookingLink, bookingTarget, liftLabel, liftState, toMinutes } from "../lib/lift";
import { workDay, workHourScale } from "../lib/workday";
import { todayISO } from "../lib/date";
export { orderDay } from "../lib/lift";


const PALETTE = [
  { bg: "#e8f5ed", border: "#c9e6d5" },
  { bg: "#eaf1ff", border: "#cfdffb" },
  { bg: "#fdf3e0", border: "#f3e0bb" },
  { bg: "#f5f0ff", border: "#e0d7f7" },
];

export default function LiftTimeline({
  hours,
  date,
}: {
  /** Часы шкалы; по умолчанию — рабочие часы из настроек мастерской. */
  hours?: string[];
  /** День в формате YYYY-MM-DD; по умолчанию сегодня. */
  date?: string;
}) {
  const { lifts, orders, clients, vehicles } = useAppStore();
  const day = date ?? todayISO();
  const scale = hours ?? workHourScale();
  // Шкала заканчивается концом рабочего дня, а не «последний час плюс час».
  const startMinutes = toMinutes(scale[0]);
  const endMinutes = Math.max(toMinutes(scale[scale.length - 1]) + 60, toMinutes(workDay().end));
  const span = endMinutes - startMinutes;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isToday = day === todayISO();
  const showNow = isToday && nowMinutes >= startMinutes && nowMinutes <= endMinutes;

  function percent(minutes: number) {
    return ((minutes - startMinutes) / span) * 100;
  }

  return (
    <div className="table-scroll">
      <div className="min-w-[720px] px-4 pb-4">
        <div className="relative flex border-b pb-2 text-xs muted" style={{ borderColor: "var(--border)" }}>
          <div className="w-[132px] shrink-0" />
          <div className="relative flex-1">
            {scale.map((hour) => (
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
              style={{ left: `calc(132px + ${percent(nowMinutes)}% * (100% - 132px) / 100%)`, bottom: 0, background: "var(--text)" }}
            />
          )}

          {lifts.map((lift) => {
            const state = liftState(orders, lift, day);
            const dayOrders = state.orders;
            const busy = dayOrders.length > 0;

            return (
              <div key={lift.id} className="flex min-h-[86px] items-stretch border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                <div className="flex w-[132px] shrink-0 flex-col justify-center pr-3">
                  <b className="whitespace-nowrap text-[13px]">{lift.name}</b>
                  <span className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[11px] muted">
                    <i className="h-2 w-2 rounded-full" style={{ background: state.busyNow ? "var(--accent)" : state.orders.length ? "var(--warning)" : "var(--border)" }} />
                    {liftLabel(state)}
                  </span>
                </div>

                <div className="relative flex-1 py-2">
                  <div className="absolute inset-0 flex">
                    {scale.map((hour) => (
                      <div key={hour} className="flex-1 border-l" style={{ borderColor: "#eef0ee" }} />
                    ))}
                  </div>

                  {dayOrders.map((order, index) => {
                    const start = toMinutes(order.scheduledStart ?? scale[0]);
                    const end = toMinutes(order.scheduledEnd ?? scale[0]) || start + 60;
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

                  {state.freeSlots.length === 0 && (
                    <Link
                      to={bookingTarget(lift.id, day, state, orders, lift).to}
                      className="absolute inset-y-2 right-0 z-0 flex w-[160px] items-center justify-center rounded-lg border border-dashed px-2 text-xs muted transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {bookingTarget(lift.id, day, state, orders, lift).label}
                    </Link>
                  )}
                  {/* Показываем все окна, куда влезает час, а не только «после последней записи». */}
                  {state.freeSlots.map((slot) => {
                    const start = Math.max(startMinutes, toMinutes(slot.from));
                    const end = slot.to ? toMinutes(slot.to) : endMinutes;
                    if (end - start < 30) return null;
                    const left = Math.max(0, percent(start));
                    const width = Math.min(100 - left, percent(end) - percent(start));
                    return (
                      <Link
                        key={slot.from}
                        to={bookingLink(lift.id, day, slot.from)}
                        className="absolute inset-y-2 z-0 flex items-center justify-center overflow-hidden rounded-lg border border-dashed px-2 text-xs muted transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                        style={{ left: `${left}%`, width: `${width}%`, borderColor: "var(--border)" }}
                      >
                        <span className="truncate">{busy ? `+ ${slot.from}` : "+ Записать на подъёмник"}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
