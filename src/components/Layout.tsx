import { NavLink, Outlet } from "react-router-dom";
import {
  IconCalendarEvent, IconChartBar, IconClipboardList, IconCoin,
  IconCube, IconHome2, IconSettings, IconShoppingCart,
  IconTool, IconUsers, IconUsersGroup, IconX,
} from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { useMobileMenu } from "./MobileMenu";
import logo from "../assets/logo.jpg";
import { APP_VERSION } from "../data/version";

const NAV_GROUPS = [
  {
    label: "Работа",
    items: [
      { to: "/", label: "Главная", icon: IconHome2, end: true },
      { to: "/schedule", label: "Расписание", icon: IconCalendarEvent },
      { to: "/orders", label: "Заказ-наряды", icon: IconClipboardList },
    ],
  },
  {
    label: "Склад",
    items: [
      { to: "/stock", label: "Склад", icon: IconCube },
      { to: "/purchases", label: "Закупки", icon: IconShoppingCart },
      { to: "/services", label: "Услуги", icon: IconTool },
    ],
  },
  {
    label: "Бизнес",
    items: [
      { to: "/clients", label: "Клиенты", icon: IconUsers },
      { to: "/employees", label: "Сотрудники", icon: IconUsersGroup },
      { to: "/finance", label: "Финансы", icon: IconCoin },
      { to: "/reports", label: "Отчёты", icon: IconChartBar },
    ],
  },
];

const MOBILE_NAV_ITEMS = [
  NAV_GROUPS[0].items[0],
  NAV_GROUPS[0].items[1],
  NAV_GROUPS[0].items[2],
  NAV_GROUPS[1].items[0],
  NAV_GROUPS[2].items[2],
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
    isActive ? "font-semibold text-white shadow-[0_6px_18px_rgba(0,0,0,.12)]" : "text-[var(--sidebar-text)] hover:bg-white/8 hover:text-white"
  }`;

const navLinkStyle = ({ isActive }: { isActive: boolean }) => (isActive ? { background: "var(--accent)" } : undefined);

function SidebarContent({ company, onNavigate }: { company: { shortName: string; address: string; workHours: string }; onNavigate?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-3 border-b px-4 py-5" style={{ borderColor: "var(--sidebar-border)" }}>
        <img src={logo} alt={company.shortName} className="h-11 w-11 rounded-xl bg-white object-cover ring-1 ring-white/10" />
        <div>
          <div className="text-[15px] font-bold leading-tight text-white">{company.shortName}</div>
          <div className="mt-1 text-[11px] opacity-55">Надёжно. По-честному.</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto p-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[.12em] opacity-38">
              {group.label}
            </div>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass} style={navLinkStyle} onClick={onNavigate}>
                  <item.icon size={20} stroke={1.8} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t p-3" style={{ borderColor: "var(--sidebar-border)", background: "var(--sidebar-bg-alt)" }}>
        <NavLink to="/settings" className={navLinkClass} style={navLinkStyle} onClick={onNavigate}>
          <IconSettings size={20} stroke={1.8} />
          <span>Настройки</span>
        </NavLink>
        <div className="mt-2 px-3 text-[11px] opacity-50">
          <div>{company.address}</div>
          <div className="mt-1">{company.workHours}</div>
          <div className="mt-3">Версия {APP_VERSION}</div>
        </div>
      </div>
    </>
  );
}

export default function Layout() {
  const { company } = useAppStore();
  const { open, setOpen } = useMobileMenu();

  return (
    <div className="app-shell flex min-h-screen print:min-h-0">
      <aside
        className="hidden w-[228px] shrink-0 flex-col lg:flex print:hidden"
        style={{ background: "var(--sidebar-bg)", color: "var(--sidebar-text)" }}
      >
        <SidebarContent company={company} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <button
            className="absolute inset-0 bg-black/40"
            aria-label="Закрыть меню"
            onClick={() => setOpen(false)}
          />
          <div
            className="relative flex h-full w-72 max-w-[80vw] flex-col shadow-xl"
            style={{ background: "var(--sidebar-bg)", color: "var(--sidebar-text)" }}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Закрыть меню"
              className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <IconX size={20} />
            </button>
            <SidebarContent company={company} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="app-content flex min-w-0 flex-1 flex-col pb-16 lg:pb-0 print:block print:min-h-0 print:pb-0">
        <Outlet />
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t bg-white/95 px-1 shadow-[0_-4px_18px_rgba(23,34,30,.06)] backdrop-blur lg:hidden print:hidden"
        style={{ borderColor: "var(--border)" }}
        aria-label="Основная навигация"
      >
        {MOBILE_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
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
