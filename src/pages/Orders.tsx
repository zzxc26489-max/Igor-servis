import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconChevronDown, IconChevronUp, IconClipboardList, IconClockHour4, IconAlertTriangle, IconCoin } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { EmptyState, Page, StatusBadge, TopBar, Card } from "../components/ui";
import { formatDateTime, formatMoney } from "../lib/format";
import type { Order, OrderStatus } from "../types";

function orderTotals(o: { works: { price: number; qty: number }[]; parts: { price: number; qty: number }[]; discount?: number; paid?: number }) {
  const works = o.works.reduce((s, w) => s + w.price * w.qty, 0);
  const parts = o.parts.reduce((s, p) => s + p.price * p.qty, 0);
  const due = works + parts - (o.discount ?? 0);
  const debt = due - (o.paid ?? 0);
  return { due, debt };
}

const STATUS_FILTERS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "Все статусы" },
  { value: "запись", label: "Запись" },
  { value: "диагностика", label: "Диагностика" },
  { value: "в работе", label: "В работе" },
  { value: "ожидает запчасти", label: "Ожидает запчасти" },
  { value: "готово", label: "Готово" },
  { value: "выдан", label: "Выдан" },
];

type SortKey = "date" | "client" | "amount" | "debt";

export default function Orders() {
  const { orders, clients, vehicles } = useAppStore();
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const active = orders.filter((o) => o.status !== "выдан");
  const waitingParts = orders.filter((o) => o.status === "ожидает запчасти");
  const totalDebt = orders.reduce((s, o) => s + Math.max(0, orderTotals(o).debt), 0);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "client" ? "asc" : "desc");
    }
  }

  function clientName(o: Order) {
    return clients.find((c) => c.id === o.clientId)?.name ?? "";
  }

  const shown = useMemo(() => {
    const filtered = statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter);
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = a.createdAt.localeCompare(b.createdAt);
      else if (sortKey === "client") cmp = clientName(a).localeCompare(clientName(b), "ru");
      else if (sortKey === "amount") cmp = orderTotals(a).due - orderTotals(b).due;
      else if (sortKey === "debt") cmp = orderTotals(a).debt - orderTotals(b).debt;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [orders, statusFilter, sortKey, sortDir, clients]);

  function SortHeader({ label, sortKeyName, align }: { label: string; sortKeyName: SortKey; align?: "right" }) {
    const isActive = sortKey === sortKeyName;
    return (
      <th className={align === "right" ? "text-right" : ""}>
        <button
          onClick={() => toggleSort(sortKeyName)}
          className={`inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded ${align === "right" ? "flex-row-reverse" : ""}`}
          style={{ color: isActive ? "var(--accent)" : undefined }}
        >
          {label}
          {isActive ? (
            sortDir === "asc" ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
          ) : (
            <IconChevronDown size={14} className="opacity-30" />
          )}
        </button>
      </th>
    );
  }

  return (
    <>
      <TopBar title="Заказ-наряды" subtitle={`Всего заказ-нарядов: ${orders.length}`} />
      <Page>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<IconClipboardList />} label="Активных" value={String(active.length)} hint="Ещё не выданы клиенту" />
          <Metric icon={<IconClockHour4 />} label="В работе" value={String(orders.filter((o) => o.status === "в работе").length)} hint="Идёт обслуживание" />
          <Metric icon={<IconAlertTriangle />} label="Ждут запчасти" value={String(waitingParts.length)} hint="Требуют внимания" tone="warning" />
          <Metric icon={<IconCoin />} label="Долг клиентов" value={formatMoney(totalDebt)} hint="По неоплаченным заказам" tone="danger" />
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="panel-title">Список заказ-нарядов</h2>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "all")}
              className="rounded-lg border bg-white px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-auto">
            <table className="app-table min-w-[760px]">
              <thead>
                <tr>
                  <th>№</th>
                  <SortHeader label="Клиент" sortKeyName="client" />
                  <th>Автомобиль</th>
                  <SortHeader label="Создан" sortKeyName="date" />
                  <th>Статус</th>
                  <SortHeader label="Сумма" sortKeyName="amount" align="right" />
                  <SortHeader label="Долг" sortKeyName="debt" align="right" />
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => {
                  const client = clients.find((c) => c.id === o.clientId);
                  const vehicle = vehicles.find((v) => v.id === o.vehicleId);
                  const { due, debt } = orderTotals(o);
                  return (
                    <tr key={o.id}>
                      <td>
                        <Link to={`/orders/${o.id}`} className="font-semibold" style={{ color: "var(--accent)" }}>
                          {o.number}
                        </Link>
                      </td>
                      <td>{client?.name}</td>
                      <td className="muted">
                        {vehicle?.make} {vehicle?.model} · {vehicle?.plate}
                      </td>
                      <td className="muted">{formatDateTime(o.createdAt)}</td>
                      <td>
                        <StatusBadge status={o.status} />
                      </td>
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
                      <EmptyState icon={<IconClipboardList size={22} />} title="Заказ-нарядов с таким статусом нет" hint="Попробуйте выбрать другой статус" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </Page>
    </>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
  tone = "green",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "green" | "warning" | "danger";
}) {
  const colors = {
    green: "bg-[#e9f5ed] text-[var(--accent)]",
    warning: "bg-[#fdf3e0] text-[var(--warning)]",
    danger: "bg-[#fbe9e9] text-[var(--danger)]",
  };
  return (
    <Card className="flex items-start gap-3">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${colors[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="muted text-sm">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs muted">{hint}</p>
      </div>
    </Card>
  );
}
