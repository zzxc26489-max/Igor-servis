import { NavLink, Outlet } from "react-router-dom";
import { company } from "../data/company";
import logo from "../assets/logo.jpg";

const NAV_ITEMS = [
  { to: "/", label: "Главная", icon: "🏠", end: true },
  { to: "/schedule", label: "Расписание", icon: "📅" },
  { to: "/orders", label: "Заказ-наряды", icon: "📋" },
  { to: "/stock", label: "Склад", icon: "📦" },
  { to: "/purchases", label: "Закупки", icon: "🛒" },
  { to: "/services", label: "Услуги", icon: "🔧" },
  { to: "/clients", label: "Клиенты", icon: "👥" },
  { to: "/employees", label: "Сотрудники", icon: "👤" },
  { to: "/finance", label: "Финансы", icon: "💰" },
  { to: "/reports", label: "Отчёты", icon: "📊" },
];

const MOBILE_NAV_ITEMS = [
  NAV_ITEMS[0],
  NAV_ITEMS[1],
  NAV_ITEMS[2],
  NAV_ITEMS[3],
  NAV_ITEMS[8],
];

export default function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside
        className="hidden lg:flex w-64 shrink-0 flex-col p-4 gap-1"
        style={{ background: "var(--sidebar-bg)", color: "var(--sidebar-text)" }}
      >
        <div className="flex items-center gap-3 px-2 py-3 mb-2">
          <img src={logo} alt={company.shortName} className="w-10 h-10 rounded object-cover bg-white" />
          <div>
            <div className="text-white font-semibold leading-tight text-sm">{company.shortName}</div>
            <div className="text-[11px] opacity-60">Автосервис</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? "text-white" : "hover:bg-white/5"
                }`
              }
              style={({ isActive }) => (isActive ? { background: "var(--accent)" } : undefined)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-4 text-[11px] opacity-50 px-2">
          <div>{company.address}</div>
          <div className="mt-1">{company.workHours}</div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-0">
        <Outlet />
      </div>

      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t bg-white px-1"
        style={{ borderColor: "var(--border)" }}
        aria-label="Основная навигация"
      >
        {MOBILE_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] ${
                isActive ? "font-semibold" : ""
              }`
            }
            style={({ isActive }) => ({ color: isActive ? "var(--accent)" : "var(--text-muted)" })}
          >
            <span className="text-base" aria-hidden="true">{item.icon}</span>
            <span className="max-w-16 truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
