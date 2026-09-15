import type { ReactNode } from "react";

export function TopBar({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b bg-white" style={{ borderColor: "var(--border)" }}>
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          {title}
        </h1>
        {subtitle && <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="flex-1 p-6 overflow-auto">{children}</main>;
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
  const base = "px-4 py-2 rounded-lg text-sm font-medium transition-colors";
  if (variant === "secondary") {
    return (
      <button type={type} onClick={onClick} className={`${base} border`} style={{ borderColor: "var(--border)", color: "var(--text)" }}>
        {children}
      </button>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      className={`${base} text-white`}
      style={{ background: "var(--accent)" }}
    >
      {children}
    </button>
  );
}
