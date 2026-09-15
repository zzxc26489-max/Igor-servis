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

export default function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside
        className="w-64 shrink-0 flex flex-col p-4 gap-1"
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

      <div className="flex-1 flex flex-col min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
