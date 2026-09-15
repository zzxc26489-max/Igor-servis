import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppStore";

export function TopBar({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { clients, vehicles, orders } = useAppStore();
  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ru-RU");
    if (term.length < 2) return [];

    const matches = [
      ...clients
        .filter((client) => `${client.name} ${client.phone}`.toLocaleLowerCase("ru-RU").includes(term))
        .slice(0, 3)
        .map((client) => ({ label: client.name, detail: client.phone, to: `/clients?q=${encodeURIComponent(term)}` })),
      ...vehicles
        .filter((vehicle) => `${vehicle.make} ${vehicle.model} ${vehicle.plate} ${vehicle.vin ?? ""}`.toLocaleLowerCase("ru-RU").includes(term))
        .slice(0, 3)
        .map((vehicle) => ({ label: `${vehicle.make} ${vehicle.model}`, detail: vehicle.plate, to: `/clients?q=${encodeURIComponent(term)}` })),
      ...orders
        .filter((order) => order.number.toLocaleLowerCase("ru-RU").includes(term))
        .slice(0, 3)
        .map((order) => ({ label: order.number, detail: "Заказ-наряд", to: `/orders/${order.id}` })),
    ];
    return matches.slice(0, 6);
  }, [clients, orders, query, vehicles]);

  return (
    <header className="flex flex-col gap-3 border-b bg-white px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: "var(--border)" }}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          {title}
        </h1>
        {subtitle && <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
      </div>

      <div className="relative w-full lg:max-w-md">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск: клиент, авто, номер заказа"
          className="w-full rounded-lg border bg-white px-3 py-2 pl-9 text-sm outline-none focus:ring-2"
          style={{ borderColor: "var(--border)", boxShadow: "none" }}
          aria-label="Поиск по CRM"
        />
        <span className="pointer-events-none absolute left-3 top-2 text-sm" aria-hidden="true">⌕</span>
        {query.trim().length >= 2 && (
          <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border bg-white shadow-lg" style={{ borderColor: "var(--border)" }}>
            {results.length > 0 ? results.map((result, index) => (
              <button
                key={`${result.to}-${index}`}
                onClick={() => { setQuery(""); navigate(result.to); }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-50"
              >
                <span>{result.label}</span>
                <span className="ml-3 text-xs" style={{ color: "var(--text-muted)" }}>{result.detail}</span>
              </button>
            )) : (
              <div className="px-3 py-3 text-sm" style={{ color: "var(--text-muted)" }}>Ничего не найдено</div>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link to="/orders/new"><Button>+ Новая запись</Button></Link>
        {actions}
      </div>
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-white rounded-xl border p-4 ${className}`}
      style={{ borderColor: "var(--border)" }}
    >
      {children}
    </div>
  );
}

export function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "up" | "down" }) {
  return (
    <Card className="flex-1 min-w-[180px]">
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {hint && (
        <div className="text-xs mt-1" style={{ color: tone === "down" ? "var(--danger)" : "var(--accent)" }}>
          {hint}
        </div>
      )}
    </Card>
  );
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  "в работе": { bg: "#e7f5ec", text: "#1f7a4d" },
  "готово": { bg: "#e7f5ec", text: "#1f7a4d" },
  "выдан": { bg: "#eef0f4", text: "#5b6270" },
  "запись": { bg: "#eaf1ff", text: "#2f6fed" },
  "диагностика": { bg: "#eaf1ff", text: "#2f6fed" },
  "ожидает запчасти": { bg: "#fdf3e0", text: "#c98a1f" },
  "Оплачено": { bg: "#e7f5ec", text: "#1f7a4d" },
  "Ожидает": { bg: "#fdf3e0", text: "#c98a1f" },
  "Выставлен": { bg: "#eaf1ff", text: "#2f6fed" },
  "Просрочен": { bg: "#fbe9e9", text: "#d64545" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { bg: "#eef0f4", text: "#5b6270" };
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ background: style.bg, color: style.text }}
    >
      {status}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  type?: "button" | "submit";
}) {
  const base =
    "px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)]";
  if (variant === "secondary") {
    return (
      <button
        type={type}
        onClick={onClick}
        className={`${base} border hover:bg-gray-50`}
        style={{ borderColor: "var(--border)", color: "var(--text)" }}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      className={`${base} text-white hover:brightness-95`}
      style={{ background: "var(--accent)" }}
    >
      {children}
    </button>
  );
}
