import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconClipboardList,
  IconClockHour4,
  IconCoin,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Button, Card, EmptyState, ListCard, Metric, Page, StatusBadge, TopBar } from "../components/ui";
import { formatDate, formatMoney } from "../lib/format";
import { orderTotals } from "../lib/order";
import type { Order, OrderStatus } from "../types";

type FilterValue = OrderStatus | "all" | "active" | "debt";
type SortKey = "date" | "client" | "amount" | "debt";

const STATUS_FILTERS: { value: FilterValue; label: string }[] = [
  { value: "active", label: "Активные" },
  { value: "all", label: "Все заказы" },
  { value: "запись", label: "Запись" },
  { value: "диагностика", label: "Диагностика" },
  { value: "в работе", label: "В работе" },
  { value: "ожидает запчасти", label: "Ожидает запчасти" },
  { value: "готово", label: "Готово" },
  { value: "debt", label: "Есть долг" },
  { value: "выдан", label: "Выдан" },
];

const PAGE_SIZE = 25;

function SortHeader({
  label,
  sortKeyName,
  activeKey,
  direction,
  align,
  onSort,
}: {
  label: string;
  sortKeyName: SortKey;
  activeKey: SortKey;
  direction: "asc" | "desc";
  align?: "right";
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === sortKeyName;
  return (
    <th className={align === "right" ? "text-right" : ""}>
      <button
        onClick={() => onSort(sortKeyName)}
        className={`inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${align === "right" ? "flex-row-reverse" : ""}`}
        style={{ color: active ? "var(--accent)" : undefined }}
      >
        {label}
        {active ? (
          direction === "asc" ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
        ) : (
          <IconChevronDown size={14} className="opacity-30" />
        )}
      </button>
    </th>
  );
}

function visitLabel(order: Order) {
  const date = order.plannedAt || order.createdAt;
  return `${formatDate(date)}${order.scheduledStart ? ` · ${order.scheduledStart}` : ""}`;
}

function initialFilter(value: string | null): FilterValue {
  return STATUS_FILTERS.some((item) => item.value === value) ? value as FilterValue : "active";
}

export default function Orders() {
  const { orders, clients, vehicles } = useAppStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<FilterValue>(() => initialFilter(searchParams.get("filter")));
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const clientById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const vehicleById = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);

  const active = orders.filter((order) => order.status !== "выдан");
  const waitingParts = orders.filter((order) => order.status === "ожидает запчасти");
  const inWork = orders.filter((order) => order.status === "в работе");
  const totalDebt = orders.reduce((sum, order) => sum + Math.max(0, orderTotals(order).debt), 0);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "client" ? "asc" : "desc");
    }
  }

  function applyFilter(next: FilterValue) {
    setStatusFilter(next);
    setLimit(PAGE_SIZE);
  }

  const shown = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ru-RU");
    const digits = query.replace(/\D/g, "");
    const compactTerm = term.replace(/[\s-]/g, "");

    const filtered = orders.filter((order) => {
      if (statusFilter === "active" && order.status === "выдан") return false;
      if (statusFilter === "debt" && orderTotals(order).debt <= 0) return false;
      if (statusFilter !== "all" && statusFilter !== "active" && statusFilter !== "debt" && order.status !== statusFilter) return false;

      if (!term) return true;
      const client = clientById.get(order.clientId);
      const vehicle = vehicleById.get(order.vehicleId);
      const haystack = [
        order.number,
        client?.name,
        client?.phone,
        client?.phone2,
        vehicle?.make,
        vehicle?.model,
        vehicle?.plate,
        vehicle?.vin,
      ].filter(Boolean).join(" ").toLocaleLowerCase("ru-RU");

      if (haystack.includes(term)) return true;
      if (compactTerm.length >= 2 && haystack.replace(/[\s-]/g, "").includes(compactTerm)) return true;
      return digits.length >= 3 && haystack.replace(/\D/g, "").includes(digits);
    });

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortKey === "date") {
        const aDate = `${a.plannedAt || a.createdAt} ${a.scheduledStart || ""}`;
        const bDate = `${b.plannedAt || b.createdAt} ${b.scheduledStart || ""}`;
        comparison = aDate.localeCompare(bDate);
      } else if (sortKey === "client") {
        comparison = (clientById.get(a.clientId)?.name ?? "").localeCompare(clientById.get(b.clientId)?.name ?? "", "ru");
      } else if (sortKey === "amount") {
        comparison = orderTotals(a).due - orderTotals(b).due;
      } else {
        comparison = orderTotals(a).debt - orderTotals(b).debt;
      }
      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [clientById, orders, query, sortDir, sortKey, statusFilter, vehicleById]);

  const page = shown.slice(0, limit);
  const emptyTitle = query.trim() ? "По вашему запросу ничего не найдено" : "Заказ-нарядов с таким фильтром нет";
  const emptyHint = query.trim() ? "Проверьте имя, телефон, госномер или номер заказ-наряда" : "Выберите другой фильтр";

  return (
    <>
      <TopBar title="Заказ-наряды" subtitle={`Показано: ${shown.length} из ${orders.length}`} />
      <Page>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:mb-4 sm:gap-3 xl:grid-cols-4">
          <Metric
            icon={<IconClipboardList size={18} />}
            label="Активных"
            value={String(active.length)}
            hint="Ещё не выданы клиенту"
            onClick={() => applyFilter("active")}
          />
          <Metric
            icon={<IconClockHour4 size={18} />}
            label="В работе"
            value={String(inWork.length)}
            hint="Идёт обслуживание"
            onClick={() => applyFilter("в работе")}
          />
          <Metric
            icon={<IconAlertTriangle size={18} />}
            label="Ждут запчасти"
            value={String(waitingParts.length)}
            hint="Требуют внимания"
            tone="warning"
            onClick={() => applyFilter("ожидает запчасти")}
          />
          <Metric
            icon={<IconCoin size={18} />}
            label="Долг клиентов"
            value={formatMoney(totalDebt)}
            hint="Открыть неоплаченные"
            tone="danger"
            onClick={() => applyFilter("debt")}
          />
        </div>

        <Card className="overflow-hidden p-0 max-sm:-mx-2.5 max-sm:rounded-none max-sm:border-x-0 max-sm:shadow-none">
          <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:gap-3 sm:items-center sm:justify-between" style={{ borderColor: "var(--border)" }}>
            <div>
              <h2 className="panel-title">Список заказ-нарядов</h2>
              <p className="muted mt-0.5 text-xs">Поиск работает по клиенту, телефону, машине, госномеру и номеру заказа.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <div className="relative min-w-0 sm:w-72">
                <IconSearch className="pointer-events-none absolute left-3 top-2.5" size={17} color="var(--text-muted)" />
                <input
                  value={query}
                  onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }}
                  placeholder="Найти заказ"
                  className="w-full rounded-lg border bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)" }}
                  aria-label="Поиск заказ-нарядов"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1.5 rounded-md p-1.5 hover:bg-gray-100"
                    aria-label="Очистить поиск"
                  >
                    <IconX size={16} />
                  </button>
                )}
              </div>
              <select
                value={statusFilter}
                onChange={(event) => applyFilter(event.target.value as FilterValue)}
                className="rounded-lg border bg-white px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)" }}
                aria-label="Фильтр по статусу"
              >
                {STATUS_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>{filter.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5 p-2 lg:hidden sm:space-y-2 sm:p-3">
            {page.map((order) => {
              const client = clientById.get(order.clientId);
              const vehicle = vehicleById.get(order.vehicleId);
              const { due, debt } = orderTotals(order);
              return (
                <ListCard
                  key={order.id}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  accent
                  title={order.number}
                  amount={formatMoney(due)}
                  lines={[
                    client?.name,
                    `${vehicle?.make ?? ""} ${vehicle?.model ?? ""} · ${vehicle?.plate ?? ""}`,
                    <span key="visit" className="muted">Визит {visitLabel(order)}</span>,
                    debt > 0 ? <span key="debt" style={{ color: "var(--danger)" }}>Долг {formatMoney(debt)}</span> : null,
                  ]}
                  badge={<StatusBadge status={order.status} />}
                />
              );
            })}
            {shown.length === 0 && (
              <EmptyState icon={<IconClipboardList size={22} />} title={emptyTitle} hint={emptyHint} />
            )}
          </div>

          <div className="table-scroll hidden lg:block">
            <table className="app-table min-w-[760px]">
              <thead>
                <tr>
                  <th>№</th>
                  <SortHeader label="Клиент" sortKeyName="client" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <th>Автомобиль</th>
                  <SortHeader label="Визит" sortKeyName="date" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <th>Статус</th>
                  <SortHeader label="Сумма" sortKeyName="amount" activeKey={sortKey} direction={sortDir} align="right" onSort={toggleSort} />
                  <SortHeader label="Долг" sortKeyName="debt" activeKey={sortKey} direction={sortDir} align="right" onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {page.map((order) => {
                  const client = clientById.get(order.clientId);
                  const vehicle = vehicleById.get(order.vehicleId);
                  const { due, debt } = orderTotals(order);
                  return (
                    <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)} className="cursor-pointer">
                      <td>
                        <Link to={`/orders/${order.id}`} className="font-semibold" style={{ color: "var(--accent)" }}>
                          {order.number}
                        </Link>
                      </td>
                      <td>
                        <div className="font-medium">{client?.name || "—"}</div>
                        {client?.phone && <div className="muted text-xs">{client.phone}</div>}
                      </td>
                      <td className="muted">
                        {vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.plate}` : "—"}
                      </td>
                      <td>
                        <div className="font-medium">{visitLabel(order)}</div>
                      </td>
                      <td><StatusBadge status={order.status} /></td>
                      <td className="text-right font-medium">{formatMoney(due)}</td>
                      <td className="text-right font-medium" style={{ color: debt > 0 ? "var(--danger)" : "var(--accent)" }}>
                        {debt > 0 ? formatMoney(debt) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState icon={<IconClipboardList size={22} />} title={emptyTitle} hint={emptyHint} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {shown.length > page.length && (
            <div className="border-t p-3 text-center" style={{ borderColor: "var(--border)" }}>
              <Button variant="secondary" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
                Показать ещё {Math.min(PAGE_SIZE, shown.length - page.length)} из {shown.length}
              </Button>
            </div>
          )}
        </Card>
      </Page>
    </>
  );
}
