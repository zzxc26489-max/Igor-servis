import { NavLink, Outlet } from "react-router-dom";
import {
  IconCalendarEvent, IconChartBar, IconClipboardList, IconCoin,
  IconCube, IconHome2, IconSettings, IconShoppingCart,
  IconTool, IconUsers, IconUsersGroup,
} from "@tabler/icons-react";
import { company } from "../data/company";
import logo from "../assets/logo.jpg";

const NAV_ITEMS = [
  { to: "/", label: "Главная", icon: IconHome2, end: true },
  { to: "/schedule", label: "Расписание", icon: IconCalendarEvent },
  { to: "/orders", label: "Заказ-наряды", icon: IconClipboardList },
  { to: "/stock", label: "Склад", icon: IconCube },
  { to: "/purchases", label: "Закупки", icon: IconShoppingCart },
  { to: "/services", label: "Услуги", icon: IconTool },
  { to: "/clients", label: "Клиенты", icon: IconUsers },
  { to: "/employees", label: "Сотрудники", icon: IconUsersGroup },
  { to: "/finance", label: "Финансы", icon: IconCoin },
  { to: "/reports", label: "Отчёты", icon: IconChartBar },
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
        className="hidden lg:flex w-60 shrink-0 flex-col p-4 gap-1"
        style={{ background: "var(--sidebar-bg)", color: "var(--sidebar-text)" }}
      >
        <div className="flex items-center gap-3 px-2 py-2 mb-4">
          <img src={logo} alt={company.shortName} className="h-10 w-10 rounded-lg object-cover bg-white" />
          <div>
            <div className="text-white font-semibold leading-tight text-sm">{company.shortName}</div>
            <div className="text-[11px] opacity-55">CRM автосервиса</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? "text-white" : "hover:bg-white/5"
                }`
              }
              style={({ isActive }) => (isActive ? { background: "var(--accent)" } : undefined)}
            >
              <item.icon size={20} stroke={1.8} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-4 text-[11px] opacity-50 px-2">
          <div className="mb-3 flex items-center gap-2"><IconSettings size={16} /> Настройки</div>
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
            <item.icon size={20} stroke={1.8} aria-hidden="true" />
            <span className="max-w-16 truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
