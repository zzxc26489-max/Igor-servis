import { Link } from "react-router-dom";
import { useAppStore } from "../store/AppStore";
import { bookingLink, bookingTarget, compactLiftLabel, liftLabel, liftState, toMinutes } from "../lib/lift";
import { workDay, workHourScale } from "../lib/workday";
import { todayISO } from "../lib/date";
export { orderDay } from "../lib/lift";


function LiftIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 4v15M19 4v15" />
      <path d="M4 19h16" />
      <path d="M5 11h4l2.2 2.2" />
      <path d="M19 11h-4l-2.2 2.2" />
      <path d="M3.5 4h3M17.5 4h3" />
    </svg>
  );
}

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
  const startMinutes = toMinutes(scale[0]);
  const endMinutes = Math.max(toMinutes(scale[scale.length - 1]) + 60, toMinutes(workDay().end));
  const span = Math.max(60, endMinutes - startMinutes);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isToday = day === todayISO();
  const showNow = isToday && nowMinutes >= startMinutes && nowMinutes <= endMinutes;

  function percent(minutes: number) {
    return ((minutes - startMinutes) / span) * 100;
  }

  return (
    <div className="table-scroll">
      <div className="min-w-[700px] px-3 pb-4 sm:min-w-[780px]">
        <div className="grid grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[132px_minmax(0,1fr)]">
          <div
            className="sticky left-0 z-20 h-12 border-b border-r bg-white"
            style={{ borderColor: "#e6ebe8" }}
          />
          <div
            className="relative h-12 border-b"
            style={{ borderColor: "#e6ebe8" }}
          >
            {scale.map((hour) => (
              <span
                key={hour}
                className="absolute top-1 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium tabular-nums text-[var(--text-muted)]"
                style={{ left: `${percent(toMinutes(hour))}%` }}
              >
                {hour}
              </span>
            ))}

            {showNow && (
              <>
                <span
                  className="absolute top-0 z-30 -translate-x-1/2 rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums text-white shadow-sm"
                  style={{ left: `${percent(nowMinutes)}%`, background: "var(--sidebar-bg)" }}
                >
                  {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
                </span>
                <span
                  className="absolute bottom-0 top-7 z-20 w-px -translate-x-1/2"
                  style={{ left: `${percent(nowMinutes)}%`, background: "var(--text)" }}
                />
              </>
            )}
          </div>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 right-0 left-[64px] z-0 sm:left-[132px]">
            {scale.map((hour) => (
              <span
                key={hour}
                className="absolute inset-y-0 w-px"
                style={{
                  left: `${percent(toMinutes(hour))}%`,
                  background: "#eef2ef",
                }}
              />
            ))}
          </div>

          {showNow && (
            <div className="pointer-events-none absolute inset-y-0 right-0 left-[64px] z-30 sm:left-[132px]">
              <span
                className="absolute inset-y-0 w-px -translate-x-1/2"
                style={{ left: `${percent(nowMinutes)}%`, background: "var(--text)" }}
              />
            </div>
          )}

          {lifts.map((lift) => {
            const state = liftState(orders, lift, day);
            const dayOrders = state.orders;
            const busy = dayOrders.length > 0;

            return (
              <div
                key={lift.id}
                className="relative grid min-h-[96px] grid-cols-[64px_minmax(0,1fr)] border-b last:border-b-0 sm:grid-cols-[132px_minmax(0,1fr)]"
                style={{ borderColor: "#e9eeeb" }}
              >
                <div
                  className="sticky left-0 z-20 flex flex-col items-center justify-center border-r bg-white px-1.5 py-2.5 shadow-[8px_0_12px_-12px_rgba(23,34,30,.45)] sm:items-start sm:px-0 sm:py-3 sm:pr-3"
                  style={{ borderColor: "#e6ebe8" }}
                  aria-label={`${lift.name}: ${liftLabel(state)}`}
                  title={`${lift.name} · ${liftLabel(state)}`}
                >
                  <span className="flex items-center gap-1.5">
                    <LiftIcon size={18} className="shrink-0 text-[var(--text-muted)]" />
                    <b className="text-[13px] leading-tight sm:hidden">{lift.id}</b>
                    <b className="hidden whitespace-nowrap text-[14px] leading-tight sm:block">{lift.name}</b>
                  </span>
                  <span className="mt-1 flex items-center gap-1 whitespace-nowrap text-[9px] text-[var(--text-muted)] sm:mt-1.5 sm:gap-1.5 sm:text-[11px]">
                    <i
                      className="h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5"
                      style={{
                        background: state.busyNow
                          ? "var(--accent)"
                          : state.orders.length
                            ? "var(--warning)"
                            : "#dfe5e1",
                      }}
                    />
                    <span className="sm:hidden">{compactLiftLabel(state)}</span>
                    <span className="hidden sm:inline">{liftLabel(state)}</span>
                  </span>
                </div>

                <div className="relative z-10 min-w-0 py-3">
                  {dayOrders.map((order, index) => {
                    const start = toMinutes(order.scheduledStart ?? scale[0]);
                    const end = order.scheduledEnd ? toMinutes(order.scheduledEnd) : start + 60;
                    const client = clients.find((item) => item.id === order.clientId);
                    const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                    const palette = PALETTE[index % PALETTE.length];
                    const left = Math.max(0, percent(start));
                    const width = Math.max(0, Math.min(100 - left, Math.max(8, percent(end) - percent(start))));

                    return (
                      <Link
                        key={order.id}
                        to={`/orders/${order.id}`}
                        className="absolute inset-y-3 z-10 overflow-hidden rounded-xl border px-3 py-2.5 text-xs shadow-[0_1px_2px_rgba(23,34,30,.04)] transition hover:-translate-y-0.5 hover:shadow-md"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: palette.bg,
                          borderColor: palette.border,
                        }}
                        title={`${vehicle ? `${vehicle.make} ${vehicle.model}` : client?.name ?? order.number} · ${order.scheduledStart}–${order.scheduledEnd}`}
                      >
                        <b className="block truncate text-[13px] leading-tight">
                          {vehicle ? `${vehicle.make} ${vehicle.model}` : client?.name}
                        </b>
                        <span className="mt-1 block truncate text-[11px] text-[var(--text-muted)]">
                          {order.scheduledStart}–{order.scheduledEnd} · {order.works[0]?.name ?? "Осмотр"}
                        </span>
                      </Link>
                    );
                  })}

                  {state.freeSlots.length === 0 && (
                    <Link
                      to={bookingTarget(lift.id, day, state, orders, lift).to}
                      className="absolute inset-y-3 right-0 z-[1] flex w-[160px] items-center justify-center rounded-xl border border-dashed bg-white/70 px-2 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      style={{ borderColor: "#dfe5e1" }}
                    >
                      {bookingTarget(lift.id, day, state, orders, lift).label}
                    </Link>
                  )}

                  {state.freeSlots.map((slot) => {
                    const start = Math.max(startMinutes, toMinutes(slot.from));
                    const end = slot.to ? toMinutes(slot.to) : endMinutes;
                    if (end - start < 30) return null;
                    const left = Math.max(0, percent(start));
                    const width = Math.max(0, Math.min(100 - left, percent(end) - percent(start)));

                    return (
                      <Link
                        key={slot.from}
                        to={bookingLink(lift.id, day, slot.from)}
                        className="absolute inset-y-3 z-[1] flex items-center justify-center overflow-hidden rounded-xl border border-dashed bg-white/65 px-2 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:bg-white hover:text-[var(--accent)]"
                        style={{ left: `${left}%`, width: `${width}%`, borderColor: "#dfe5e1" }}
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
