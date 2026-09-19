import { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  IconCalendarEvent, IconChartBar, IconChevronDown, IconClipboardList, IconCoin,
  IconCube, IconDotsCircleHorizontal, IconHome2, IconSettings, IconShoppingCart,
  IconTool, IconUsers, IconUsersGroup, IconX, IconGauge, IconFileDescription,
} from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { needsPurchaseItems } from "../lib/lowStock";
import { useMobileMenu } from "./MobileMenu";
import logo from "../assets/logo.jpg";
import { APP_VERSION } from "../data/version";
import { canManageSettings, canOpenPath, ROLE_LABELS } from "../lib/access";
import type { CloudRole } from "../lib/cloud";
import { useAuth } from "../auth/AuthContext";

type NavItem = {
  to: string;
  label: string;
  icon: typeof IconHome2;
  end?: boolean;
  badge?: "orders" | "purchases";
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Работа",
    items: [
      { to: "/", label: "Сегодня", icon: IconHome2, end: true },
      { to: "/schedule", label: "Расписание", icon: IconCalendarEvent },
      { to: "/orders", label: "Заказ-наряды", icon: IconClipboardList, badge: "orders" },
      { to: "/my-work", label: "Мои работы", icon: IconGauge },
    ],
  },
  {
    label: "Запчасти",
    items: [
      { to: "/stock", label: "Склад", icon: IconCube },
      { to: "/purchases", label: "Закупки", icon: IconShoppingCart, badge: "purchases" },
    ],
  },
  {
    label: "Управление",
    items: [
      { to: "/clients", label: "Клиенты", icon: IconUsers },
      { to: "/services", label: "Услуги", icon: IconTool },
      { to: "/employees", label: "Сотрудники", icon: IconUsersGroup },
      { to: "/documents", label: "Документы", icon: IconFileDescription },
      { to: "/finance", label: "Финансы", icon: IconCoin },
      { to: "/reports", label: "Отчёты", icon: IconChartBar },
    ],
  },
];

const MOBILE_NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Сегодня", icon: IconHome2, end: true },
  { to: "/orders", label: "Заказы", icon: IconClipboardList },
  { to: "/stock", label: "Склад", icon: IconCube },
];

const MECHANIC_MOBILE_NAV: NavItem[] = [
  { to: "/my-work", label: "Мои работы", icon: IconGauge, end: true },
];

const PARTS_MOBILE_NAV: NavItem[] = [
  { to: "/stock", label: "Склад", icon: IconCube, end: true },
  { to: "/purchases", label: "Закупки", icon: IconShoppingCart, badge: "purchases" },
  { to: "/orders", label: "Заказы", icon: IconClipboardList },
];

const ACCOUNTANT_MOBILE_NAV: NavItem[] = [
  { to: "/finance", label: "Финансы", icon: IconCoin, end: true },
  { to: "/documents", label: "Документы", icon: IconFileDescription },
  { to: "/reports", label: "Отчёты", icon: IconChartBar },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
    isActive ? "font-semibold text-white" : "text-[var(--sidebar-text)] hover:bg-white/8 hover:text-white"
  }`;

const navLinkStyle = ({ isActive }: { isActive: boolean }) => (isActive ? { background: "var(--accent)" } : undefined);

function SidebarContent({
  badges,
  role,
  displayName,
  cloudConnected,
  onNavigate,
  onSignOut,
  brandLogo,
}: {
  badges: { orders: number; purchases: number };
  role?: CloudRole;
  displayName?: string;
  cloudConnected?: boolean;
  onNavigate?: () => void;
  onSignOut?: () => void;
  brandLogo: string;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-3 py-4">
        <img src={brandLogo} alt="" className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-0.5 ring-1 ring-white/10" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold uppercase leading-tight tracking-[0.01em] text-white">
            The Service
          </div>
          <div className="mt-0.5 text-[11px] opacity-55">&amp; UMC <span className="opacity-60">/ CRM</span></div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2.5 pb-3">
        {NAV_GROUPS.map((group) => ({
          ...group,
          items: group.items.filter((item) => (item.to !== "/my-work" || role === "mechanic") && (!role || canOpenPath(role, item.to))),
        })).filter((group) => group.items.length > 0).map((group) => (
          <div key={group.label}>
            <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[.12em] opacity-38">{group.label}</div>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                const badge = item.badge ? badges[item.badge] : 0;
                return (
                  <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass} style={navLinkStyle} onClick={onNavigate}>
                    <item.icon size={20} stroke={1.8} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {badge > 0 && (
                      <span className="shrink-0 rounded-md bg-white/12 px-1.5 py-0.5 text-[11px] font-semibold text-white/80">
                        {badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {(!role || canManageSettings(role)) && (
        <div className="px-2.5 pb-2.5">
          <NavLink to="/settings" className={navLinkClass} style={navLinkStyle} onClick={onNavigate}>
            <IconSettings size={20} stroke={1.8} />
            <span>Настройки</span>
          </NavLink>
        </div>
      )}
      <div className="border-t px-3 py-3" style={{ borderColor: "var(--sidebar-border)" }}>
        <button
          type="button"
          onClick={cloudConnected ? onSignOut : undefined}
          className="flex w-full items-center gap-3 rounded-lg text-left"
          title={cloudConnected ? "Выйти из CRM" : undefined}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-bold text-white">
            {(displayName || "И").slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">{displayName || "Игорь"}</span>
            <span className="block truncate text-[11px] opacity-55">
              {role ? ROLE_LABELS[role] : "Локальное рабочее место"} · v{APP_VERSION}
            </span>
          </span>
          {cloudConnected && <IconChevronDown size={16} className="shrink-0 opacity-50" />}
        </button>
      </div>
    </>
  );
}

export default function Layout() {
  const { orders, stock, cloud, company } = useAppStore();
  const { session, signOut } = useAuth();
  const { open, setOpen } = useMobileMenu();

  const brandLogo = company.logoDataUrl || logo;

  useEffect(() => {
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.removeAttribute("type");
    icon.href = brandLogo;

    let appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (!appleIcon) {
      appleIcon = document.createElement("link");
      appleIcon.rel = "apple-touch-icon";
      document.head.appendChild(appleIcon);
    }
    appleIcon.href = brandLogo;
  }, [brandLogo]);

  const badges = {
    orders: orders.filter((order) => order.status !== "выдан").length,
    purchases: needsPurchaseItems(stock, orders).length,
  };

  return (
    <div className="app-shell flex min-h-screen print:min-h-0">
      <aside
        className="hidden w-[240px] shrink-0 flex-col lg:flex print:hidden"
        style={{ background: "var(--sidebar-bg)", color: "var(--sidebar-text)" }}
      >
        <SidebarContent
          badges={badges}
          role={cloud.role}
          displayName={cloud.displayName}
          cloudConnected={Boolean(session)}
          brandLogo={brandLogo}
          onSignOut={() => void signOut()}
        />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <button className="absolute inset-0 bg-black/40" aria-label="Закрыть меню" onClick={() => setOpen(false)} />
          <div
            className="relative flex h-full w-72 max-w-[82vw] flex-col shadow-xl"
            style={{ background: "var(--sidebar-bg)", color: "var(--sidebar-text)" }}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Закрыть меню"
              className="absolute right-2 top-2 z-10 grid h-11 w-11 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <IconX size={20} />
            </button>
            <SidebarContent
              badges={badges}
              role={cloud.role}
              displayName={cloud.displayName}
              cloudConnected={Boolean(session)}
              brandLogo={brandLogo}
              onNavigate={() => setOpen(false)}
              onSignOut={() => void signOut()}
            />
          </div>
        </div>
      )}

      <div className="app-content flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 print:block print:min-h-0 print:pb-0">
        {cloud.configured && cloud.status === "error" && (
          <div className="border-b bg-[#fff8e8] px-4 py-2 text-xs font-medium text-[#9a6a12] print:hidden sm:px-5">
            Связи с сервером нет. Изменения сохранены на этом устройстве и отправятся автоматически после восстановления связи.
          </div>
        )}
        <Outlet />
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex min-h-16 items-center justify-around border-t bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
        style={{ borderColor: "var(--border)" }}
        aria-label="Основная навигация"
      >
        {(cloud.role === "mechanic"
          ? MECHANIC_MOBILE_NAV
          : cloud.role === "accountant"
            ? ACCOUNTANT_MOBILE_NAV
            : cloud.role === "parts"
              ? PARTS_MOBILE_NAV
              : MOBILE_NAV_ITEMS)
          .filter((item) => !cloud.role || canOpenPath(cloud.role, item.to)).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `relative flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${
                isActive ? "font-semibold" : ""
              }`
            }
            style={({ isActive }) => ({ color: isActive ? "var(--accent)" : "var(--text-muted)" })}
          >
            {({ isActive }) => (
              <>
                <span className={`relative grid h-8 w-12 place-items-center rounded-full transition-colors ${isActive ? "bg-[var(--accent-soft)]" : ""}`}>
                  <item.icon size={22} stroke={1.8} aria-hidden="true" />
                  {item.badge && badges[item.badge] > 0 && (
                    <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-[var(--danger)] px-1 text-center text-[9px] font-bold leading-4 text-white">
                      {badges[item.badge]}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={() => setOpen(true)}
          className="flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
          style={{ color: "var(--text-muted)" }}
          aria-label="Открыть меню"
        >
          <span className="grid h-8 w-12 place-items-center rounded-full">
            <IconDotsCircleHorizontal size={22} stroke={1.8} aria-hidden="true" />
          </span>
          <span>Ещё</span>
        </button>
      </nav>
    </div>
  );
}
