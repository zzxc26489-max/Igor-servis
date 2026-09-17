import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconAlertTriangle, IconBox, IconCoin, IconMapPin, IconPackageImport,
  IconSearch, IconShoppingCart, IconX,
} from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Button, Card, EmptyState, ListCard, Page, TopBar } from "../components/ui";
import { formatDateTime, formatMoney, plural } from "../lib/format";
import StockReceive from "./StockReceive";
import type { StockItem } from "../types";

type StockFilter = "all" | "low" | "out" | "ok";
type SortKey = "name" | "qty" | "value";

const FILTERS: { value: StockFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "low", label: "Заканчивается" },
  { value: "out", label: "Закончилось" },
  { value: "ok", label: "В наличии" },
];

function stockState(item: StockItem): StockFilter {
  if (item.qty <= 0) return "out";
  if (item.qty <= item.minQty) return "low";
  return "ok";
}

export default function Stock() {
  const { stock, stockMovements } = useAppStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [category, setCategory] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [receiveFor, setReceiveFor] = useState<string | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const categories = useMemo(() => Array.from(new Set(stock.map((item) => item.category))).sort(), [stock]);
  const lowCount = stock.filter((item) => item.qty > 0 && item.qty <= item.minQty).length;
  const outCount = stock.filter((item) => item.qty <= 0).length;
  const totalValue = stock.reduce((sum, item) => sum + item.qty * item.purchasePrice, 0);

  const shown = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ru-RU");
    const filtered = stock.filter((item) => {
      if (filter !== "all" && stockState(item) !== filter) return false;
      if (category !== "all" && item.category !== category) return false;
      if (!term) return true;
      return `${item.code ?? ""} ${item.name} ${item.sku} ${item.brand ?? ""} ${item.cell ?? ""}`.toLocaleLowerCase("ru-RU").includes(term);
    });
    return [...filtered].sort((a, b) => {
      if (sortKey === "qty") return a.qty - b.qty;
      if (sortKey === "value") return b.qty * b.purchasePrice - a.qty * a.purchasePrice;
      return a.name.localeCompare(b.name, "ru");
    });
  }, [category, filter, query, sortKey, stock]);

  function openReceive(itemId?: string) {
    setReceiveFor(itemId ?? null);
    setReceiveOpen(true);
  }

  return (
    <>
      <TopBar
        title="Склад"
        subtitle={`${stock.length} ${plural(stock.length, "позиция", "позиции", "позиций")} · остаток на ${formatMoney(totalValue)}`}
        hideNewRecordOnMobile
        actions={
          <Button size="sm" onClick={() => openReceive()} aria-label="Приёмка на склад" title="Приёмка">
            <IconPackageImport size={18} /><span className="hidden sm:inline">Приёмка</span>
          </Button>
        }
      />
      <Page>
        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={<IconBox size={18} />} tone="#e9f5ed" color="var(--accent)" label="Позиций" value={String(stock.length)} />
          <Metric icon={<IconCoin size={18} />} tone="#edf4ff" color="#3978c9" label="Стоимость остатка" value={formatMoney(totalValue)} />
          <Metric icon={<IconAlertTriangle size={18} />} tone="#fdf3e0" color="var(--warning)" label="Заканчивается" value={String(lowCount)} onClick={() => setFilter("low")} />
          <Metric icon={<IconX size={18} />} tone="#fbe9e9" color="var(--danger)" label="Закончилось" value={String(outCount)} onClick={() => setFilter("out")} />
        </div>

        <Card className="mb-3">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-3" size={18} color="var(--text-muted)" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск: название, артикул, бренд, ячейка"
              className="w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border)" }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                onClick={() => setFilter(item.value)}
                className="rounded-lg border px-3 py-1.5 text-sm transition"
                style={{
                  borderColor: filter === item.value ? "var(--accent)" : "var(--border)",
                  background: filter === item.value ? "var(--accent)" : "white",
                  color: filter === item.value ? "white" : "var(--text)",
                }}
              >
                {item.label}
                {item.value === "low" && lowCount > 0 ? ` · ${lowCount}` : ""}
                {item.value === "out" && outCount > 0 ? ` · ${outCount}` : ""}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block muted">Категория</span>
              <div className="field-control">
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="all">Все категории</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block muted">Сортировка</span>
              <div className="field-control">
                <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
                  <option value="name">По названию</option>
                  <option value="qty">Сначала с малым остатком</option>
                  <option value="value">По стоимости остатка</option>
                </select>
              </div>
            </label>
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between gap-2 border-b p-4" style={{ borderColor: "var(--border)" }}>
            <h2 className="panel-title">Позиции{shown.length !== stock.length ? `: ${shown.length}` : ""}</h2>
            <Link to="/purchases" className="text-sm font-semibold text-[var(--accent)]">К закупкам</Link>
          </div>

          <div className="space-y-2 p-3 lg:hidden">
            {shown.map((item) => (
              <ListCard
                key={item.id}
                onClick={() => openReceive(item.id)}
                title={item.name}
                amount={<span style={{ color: item.qty <= item.minQty ? "var(--danger)" : undefined }}>{item.qty} {item.unit}</span>}
                lines={[
                  `${item.code ? `${item.code} · ` : ""}${item.brand ? `${item.brand} · ` : ""}${item.sku}`,
                  <>
                    {item.cell ? <><IconMapPin size={13} className="inline" /> {item.cell} · </> : null}
                    {formatMoney(item.purchasePrice)} за {item.unit} · мин. {item.minQty}
                  </>,
                ]}
                meta={formatMoney(item.qty * item.purchasePrice)}
              />
            ))}
            {shown.length === 0 && <EmptyState icon={<IconBox size={22} />} title="Ничего не найдено" hint="Смените фильтр или поисковый запрос" />}
          </div>

          <div className="table-scroll hidden lg:block">
            <table className="app-table min-w-[820px]">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Запчасть</th>
                  <th>Категория</th>
                  <th>Ячейка</th>
                  <th className="text-right">Остаток</th>
                  <th className="text-right">Мин.</th>
                  <th className="text-right">Цена закупки</th>
                  <th className="text-right">Сумма</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={item.id}>
                    <td className="muted whitespace-nowrap">{item.code}</td>
                    <td>
                      <b className="block">{item.name}</b>
                      <span className="muted text-xs">{item.brand ? `${item.brand} · ` : ""}{item.sku}</span>
                    </td>
                    <td className="muted">{item.category}</td>
                    <td>{item.cell || "—"}</td>
                    <td className="text-right font-medium" style={{ color: item.qty <= item.minQty ? "var(--danger)" : undefined }}>
                      {item.qty} {item.unit}
                    </td>
                    <td className="muted text-right">{item.minQty}</td>
                    <td className="text-right">{formatMoney(item.purchasePrice)}</td>
                    <td className="text-right font-medium">{formatMoney(item.qty * item.purchasePrice)}</td>
                    <td className="text-right">
                      <Button size="sm" variant="secondary" onClick={() => openReceive(item.id)} aria-label={`Принять ${item.name}`}>
                        <IconPackageImport size={16} /> Принять
                      </Button>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState icon={<IconBox size={22} />} title="Ничего не найдено" hint="Смените фильтр или поисковый запрос" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="mt-3 overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b p-4" style={{ borderColor: "var(--border)" }}>
            <h2 className="panel-title">Последние движения</h2>
            <Link to="/purchases" className="shrink-0 text-sm font-semibold text-[var(--accent)]">
              <IconShoppingCart size={14} className="inline" /> Закупки
            </Link>
          </div>

          <div className="space-y-2 p-3 lg:hidden">
            {stockMovements.slice(0, 15).map((movement) => {
              const item = stock.find((entry) => entry.id === movement.itemId);
              return (
                <ListCard
                  key={movement.id}
                  title={item?.name || "Позиция удалена"}
                  amount={movement.amount ? formatMoney(movement.amount) : undefined}
                  lines={[`${movement.operation} · ${movement.qty} ${item?.unit ?? "шт."}${movement.to ? ` → ${movement.to}` : ""}`]}
                  meta={`${formatDateTime(movement.date)} · ${movement.employee}`}
                />
              );
            })}
            {stockMovements.length === 0 && <p className="muted p-3 text-sm">Движений пока не было.</p>}
          </div>

          <div className="table-scroll hidden lg:block">
            <table className="app-table min-w-[760px]">
              <thead>
                <tr>
                  <th>Дата и время</th>
                  <th>Запчасть</th>
                  <th>Операция</th>
                  <th className="text-right">Кол-во</th>
                  <th className="text-right">Сумма</th>
                  <th>Ячейка</th>
                  <th>Сотрудник</th>
                </tr>
              </thead>
              <tbody>
                {stockMovements.slice(0, 20).map((movement) => {
                  const item = stock.find((entry) => entry.id === movement.itemId);
                  return (
                    <tr key={movement.id}>
                      <td className="muted whitespace-nowrap">{formatDateTime(movement.date)}</td>
                      <td>
                        <b>{item?.name || "Позиция удалена"}</b>
                        <div className="muted text-xs">{item?.sku}</div>
                      </td>
                      <td>
                        <span className="rounded-full bg-[#e8f5ed] px-2 py-1 text-xs text-[var(--accent)]">{movement.operation}</span>
                      </td>
                      <td className="text-right">{movement.qty} {item?.unit}</td>
                      <td className="text-right">{movement.amount ? formatMoney(movement.amount) : "—"}</td>
                      <td>{movement.to || movement.from || "—"}</td>
                      <td className="muted">{movement.employee}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </Page>

      {receiveOpen && <StockReceive onClose={() => setReceiveOpen(false)} presetItemId={receiveFor ?? undefined} />}
    </>
  );
}

function Metric({ icon, tone, color, label, value, onClick }: {
  icon: React.ReactNode; tone: string; color: string; label: string; value: string; onClick?: () => void;
}) {
  const content = (
    <>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: tone, color }}>{icon}</div>
      <div className="min-w-0 text-left">
        <p className="muted truncate text-xs">{label}</p>
        <p className="truncate text-base font-semibold sm:text-lg">{value}</p>
      </div>
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className="flex items-center gap-2.5 rounded-xl border bg-white p-3 shadow-[0_2px_8px_rgba(23,34,30,0.045)] transition hover:bg-gray-50 sm:p-4" style={{ borderColor: "var(--border)" }}>
        {content}
      </button>
    );
  }
  return <Card className="flex items-center gap-2.5 p-3 sm:p-4">{content}</Card>;
}
