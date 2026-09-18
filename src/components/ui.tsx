import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { IconMenu2, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { useMobileMenu } from "./MobileMenu";

export function TopBar({
  title,
  subtitle,
  actions,
  breadcrumbs,
  titleChip,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Хлебные крошки над заголовком: путь до текущей карточки. */
  breadcrumbs?: { label: string; to?: string }[];
  /** Плашка рядом с заголовком, например госномер. */
  titleChip?: ReactNode;
  /** Оставлено для совместимости вызовов: на узком экране действия и так переносятся. */
  hideNewRecordOnMobile?: boolean;
}) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { clients, vehicles, orders } = useAppStore();
  const { setOpen } = useMobileMenu();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape" && document.activeElement === inputRef.current) {
        setQuery("");
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const results = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ru-RU");
    if (term.length < 2) return [];
    const matches = [
      ...clients
        .filter((client) => `${client.code ?? ""} ${client.name} ${client.phone}`.toLocaleLowerCase("ru-RU").includes(term))
        .slice(0, 3)
        .map((client) => ({ label: client.name, detail: client.phone, to: `/clients/${client.id}` })),
      ...vehicles
        .filter((vehicle) => `${vehicle.plate} ${vehicle.make} ${vehicle.model}`.toLocaleLowerCase("ru-RU").includes(term))
        .slice(0, 3)
        .map((vehicle) => {
          const order = orders.find((item) => item.vehicleId === vehicle.id);
          return {
            label: `${vehicle.make} ${vehicle.model} · ${vehicle.plate}`,
            detail: "Автомобиль",
            to: order ? `/orders/${order.id}` : `/clients/${vehicle.clientId}`,
          };
        }),
      ...orders
        .filter((order) => order.number.toLocaleLowerCase("ru-RU").includes(term))
        .slice(0, 3)
        .map((order) => ({ label: order.number, detail: "Заказ-наряд", to: `/orders/${order.id}` })),
    ];
    return matches.slice(0, 6);
  }, [clients, orders, query, vehicles]);

  const today = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());

  return (
    <>
      <header
        className="sticky top-0 z-30 flex min-w-0 items-center gap-3 border-b bg-white/95 px-3 py-2.5 backdrop-blur sm:px-6 print:hidden"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={() => setOpen(true)}
          aria-label="Открыть меню"
          className="-ml-1 rounded-lg p-2 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] lg:hidden"
        >
          <IconMenu2 size={22} />
        </button>

        <div className="relative min-w-0 flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-2.5" size={18} color="var(--text-muted)" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Клиент, госномер, телефон или заказ"
            className="w-full rounded-lg bg-transparent py-2 pl-10 pr-12 text-sm outline-none placeholder:text-[var(--text-muted)] focus:bg-[#f5f7f5]"
            aria-label="Поиск по CRM"
          />
          <kbd
            className="pointer-events-none absolute right-2.5 top-1.5 hidden rounded border px-1.5 py-0.5 text-[10px] font-medium sm:block"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            Ctrl K
          </kbd>
          {query.trim().length >= 2 && (
            <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-lg border bg-white shadow-lg" style={{ borderColor: "var(--border)" }}>
              {results.length > 0 ? results.map((result, index) => (
                <button
                  key={`${result.to}-${index}`}
                  onClick={() => { setQuery(""); navigate(result.to); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
                >
                  <span className="truncate">{result.label}</span>
                  <span className="ml-3 shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>{result.detail}</span>
                </button>
              )) : (
                <div className="px-3 py-3 text-sm" style={{ color: "var(--text-muted)" }}>Ничего не найдено</div>
              )}
            </div>
          )}
        </div>

        <div className="hidden shrink-0 items-center gap-4 text-xs md:flex" style={{ color: "var(--text-muted)" }}>
          <span className="font-semibold uppercase tracking-[.08em]">Демо-данные</span>
          <span>{today}</span>
        </div>
      </header>

      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-5 sm:px-5 lg:px-6 print:hidden">
        <div className="min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }} aria-label="Хлебные крошки">
              {breadcrumbs.map((crumb, index) => (
                <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                  {index > 0 && <span aria-hidden="true">/</span>}
                  {crumb.to ? (
                    <Link to={crumb.to} className="hover:text-[var(--accent)]">{crumb.label}</Link>
                  ) : (
                    <span>{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] sm:text-[34px]" style={{ color: "var(--text)" }}>
              {title}
            </h1>
            {titleChip}
          </div>
          {subtitle && <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions ?? <NewRecordButton />}
        </div>
      </div>
    </>
  );
}

function NewRecordButton() {
  const location = useLocation();
  if (location.pathname === "/orders/new") return null;
  return (
    <Link to="/orders/new">
      <Button><IconPlus size={18} /> Новая запись</Button>
    </Link>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="min-w-0 flex-1 overflow-auto overflow-x-hidden p-4 pb-24 sm:p-5 sm:pb-6 lg:p-6 print:flex-none print:overflow-visible print:p-0">{children}</main>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-[0_2px_8px_rgba(23,34,30,0.045)] ${className}`}
      style={{ borderColor: "var(--border)" }}
    >
      {children}
    </div>
  );
}

const METRIC_TONES = {
  accent: { bg: "#e9f5ed", color: "var(--accent)" },
  blue: { bg: "#edf4ff", color: "#3978c9" },
  violet: { bg: "#f5f0ff", color: "#6656b8" },
  warning: { bg: "#fdf3e0", color: "var(--warning)" },
  danger: { bg: "#fbe9e9", color: "var(--danger)" },
} as const;

export type MetricTone = keyof typeof METRIC_TONES;

/** Единая плитка показателя: используется на всех страницах, чтобы цифры выглядели одинаково. */
export function Metric({
  icon,
  label,
  value,
  hint,
  tone = "accent",
  onClick,
  current,
  previous,
  lowerIsBetter = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: MetricTone;
  onClick?: () => void;
  /** Числовое значение для сравнения с прошлым периодом. */
  current?: number;
  previous?: number;
  lowerIsBetter?: boolean;
}) {
  const palette = METRIC_TONES[tone];
  const delta =
    current !== undefined && previous !== undefined && previous !== 0
      ? Math.round(((current - previous) / Math.abs(previous)) * 100)
      : null;
  const deltaIsGood = lowerIsBetter ? (delta ?? 0) < 0 : (delta ?? 0) > 0;

  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: palette.bg, color: palette.color }}>
          {icon}
        </span>
        <span className="min-w-0 text-left">
          <span className="muted block truncate text-xs">{label}</span>
          <span className="block truncate text-base font-semibold tabular-nums sm:text-lg">{value}</span>
        </span>
      </div>
      {(hint || delta) && (
        <p className="mt-2 flex items-center gap-2 text-xs">
          {delta !== null && delta !== 0 && (
            <span className="shrink-0 font-semibold" style={{ color: deltaIsGood ? "var(--accent)" : "var(--danger)" }}>
              {delta > 0 ? "↑" : "↓"} {Math.abs(delta) > 999 ? ">999" : Math.abs(delta)}%
            </span>
          )}
          {hint && <span className="muted truncate">{hint}</span>}
        </p>
      )}
    </>
  );

  const base = "rounded-xl border bg-white p-3 shadow-[0_2px_8px_rgba(23,34,30,0.045)] sm:p-4";
  if (onClick) {
    return (
      <button onClick={onClick} className={`${base} text-left transition hover:bg-gray-50`} style={{ borderColor: "var(--border)" }}>
        {body}
      </button>
    );
  }
  return <div className={base} style={{ borderColor: "var(--border)" }}>{body}</div>;
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
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: style.bg, color: style.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  size = "md",
  className = "",
  disabled = false,
  title,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  size?: "sm" | "md" | "icon";
  className?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  const dimensions = size === "icon" ? "h-11 w-11 p-0 sm:h-9 sm:w-9" : size === "sm" ? "min-h-11 px-3 py-2 sm:min-h-9 sm:py-1.5" : "min-h-11 px-3.5 py-2 sm:min-h-10";
  const base =
    `inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent)] ${dimensions}`;
  if (variant === "danger") {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        className={`${base} text-white shadow-[0_4px_12px_rgba(214,69,69,.18)] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        style={{ background: "var(--danger)" }}
      >
        {children}
      </button>
    );
  }
  if (variant === "secondary") {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        className={`${base} border hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
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
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={`${base} text-white shadow-[0_4px_12px_rgba(15,122,77,.16)] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      style={{ background: "var(--accent)" }}
    >
      {children}
    </button>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center print:hidden">
      <button className="absolute inset-0 bg-black/40" aria-label="Закрыть окно" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
      >
        <div className="flex items-start justify-between gap-3 border-b p-4" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0">
            <h2 className="panel-title truncate">{title}</h2>
            {subtitle && <p className="muted mt-0.5 text-sm">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <IconX size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function ListCard({
  title,
  amount,
  lines,
  badge,
  meta,
  onClick,
  accent,
}: {
  title: ReactNode;
  amount?: ReactNode;
  lines?: ReactNode[];
  badge?: ReactNode;
  meta?: ReactNode;
  onClick?: () => void;
  accent?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={`min-w-0 text-sm font-semibold ${accent ? "text-[var(--accent)]" : ""}`}>{title}</span>
        {amount !== undefined && <span className="shrink-0 text-sm font-semibold tabular-nums">{amount}</span>}
      </div>
      {lines?.filter(Boolean).map((line, index) => (
        <div key={index} className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {line}
        </div>
      ))}
      {(badge || meta) && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0">{badge}</span>
          {meta && <span className="shrink-0 text-xs" style={{ color: "var(--text-muted)" }}>{meta}</span>}
        </div>
      )}
    </>
  );

  const className = "w-full rounded-xl border bg-white p-3 text-left shadow-[0_2px_8px_rgba(23,34,30,0.045)]";
  if (!onClick) {
    return <div className={className} style={{ borderColor: "var(--border)" }}>{inner}</div>;
  }
  return (
    <button onClick={onClick} className={`${className} transition active:scale-[0.99]`} style={{ borderColor: "var(--border)" }}>
      {inner}
    </button>
  );
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-[#f1f3f2]" style={{ color: "var(--text-muted)" }}>
        {icon}
      </div>
      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
        {title}
      </p>
      {hint && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
