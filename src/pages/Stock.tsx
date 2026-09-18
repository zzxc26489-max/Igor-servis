import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconAlertTriangle, IconArrowBackUp, IconBox, IconCoin, IconLock, IconMapPin,
  IconPackageImport, IconScan, IconSearch,
} from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Button, Card, EmptyState, ListCard, Metric, Modal, Page, TopBar } from "../components/ui";
import { formatDateTime, formatMoney, plural } from "../lib/format";
import { reservedByItem, reservingOrders } from "../lib/stock";
import { lowStockItems } from "../lib/lowStock";
import { useConfirm } from "../components/Confirm";
import { useToast } from "../components/Toast";
import StockReceive from "./StockReceive";
import type { Order, StockItem } from "../types";

type Chip = "all" | "low" | "reserved" | "movements";

export default function Stock() {
  const { stock, stockMovements, orders, vehicles, employees, returnToSupplier } = useAppStore();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [returnFor, setReturnFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<Chip>("all");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [receiveFor, setReceiveFor] = useState<string | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);

  const categories = useMemo(() => Array.from(new Set(stock.map((item) => item.category))).sort(), [stock]);

  const reservations = useMemo(() => reservedByItem(orders, stock), [orders, stock]);

  const lowCount = lowStockItems(stock, orders).length;
  const reservedCount = stock.filter((item) => (reservations.get(item.id) ?? 0) > 0).length;
  const totalValue = stock.reduce((sum, item) => sum + item.qty * item.purchasePrice, 0);

  const CHIPS: { value: Chip; label: string; count?: number }[] = [
    { value: "all", label: "Все", count: stock.length },
    { value: "low", label: "Заканчиваются", count: lowCount },
    { value: "reserved", label: "В резерве", count: reservedCount },
    { value: "movements", label: "Движения" },
  ];

  const shown = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ru-RU");
    return stock
      .filter((item) => {
        if (chip === "low" && item.qty - (reservations.get(item.id) ?? 0) > item.minQty) return false;
        if (chip === "reserved" && (reservations.get(item.id) ?? 0) === 0) return false;
        if (category !== "all" && item.category !== category) return false;
        if (!term) return true;
        return `${item.code ?? ""} ${item.name} ${item.sku} ${item.brand ?? ""} ${item.cell ?? ""}`
          .toLocaleLowerCase("ru-RU")
          .includes(term);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [category, chip, query, reservations, stock]);

  const selected = stock.find((item) => item.id === selectedId) ?? null;
  const returnItem = stock.find((item) => item.id === returnFor) ?? null;

  function openReceive(itemId?: string) {
    setReceiveFor(itemId ?? null);
    setReceiveOpen(true);
  }

  function movementsOf(itemId: string) {
    return stockMovements.filter((movement) => movement.itemId === itemId).slice(0, 10);
  }

  async function handleReturn(item: StockItem, qty: number, reason: string) {
    const free = item.qty - (reservations.get(item.id) ?? 0);
    if (qty <= 0 || qty > free) {
      showToast(`Свободно только ${free} ${item.unit}`, "error");
      return;
    }
    const amount = qty * item.purchasePrice;
    const ok = await confirm({
      title: "Оформить возврат поставщику",
      question: "Запчасть спишется со склада, а в финансах появится ожидание возврата денег. В расчёт возврат пойдёт только после подтверждения, что деньги пришли.",
      summary: [
        { label: "Запчасть", value: `${item.name} · ${item.sku}` },
        { label: "Поставщик", value: item.supplier || "не указан" },
        { label: "Количество", value: `${qty} ${item.unit}` },
        { label: "Цена закупки", value: formatMoney(item.purchasePrice) },
        { label: "Остаток после возврата", value: `${item.qty - qty} ${item.unit}` },
        { label: "Ждём от поставщика", value: formatMoney(amount), total: true, tone: "accent" },
      ],
      note: reason ? `Причина: ${reason}` : "Укажите причину возврата — она попадёт в историю движений.",
      confirmLabel: "Оформить возврат",
    });
    if (!ok) return;
    returnToSupplier({
      itemId: item.id,
      qty,
      unitPrice: item.purchasePrice,
      supplier: item.supplier ?? "",
      employee: employees[0]?.name ?? "—",
      reason,
    });
    setReturnFor(null);
    showToast(`Возврат оформлен, ждём ${formatMoney(amount)} от поставщика`);
  }

  const detail = selected && (
    <ItemCard
      item={selected}
      reserved={reservations.get(selected.id) ?? 0}
      reservedOrders={reservingOrders(orders, selected)}
      vehicles={vehicles}
      movements={movementsOf(selected.id)}
      onReceive={() => openReceive(selected.id)}
      onReturn={() => setReturnFor(selected.id)}
    />
  );

  return (
    <>
      <TopBar
        title="Склад"
        subtitle={`${stock.length} ${plural(stock.length, "позиция", "позиции", "позиций")} · остаток на ${formatMoney(totalValue)}`}
        actions={
          <Button onClick={() => openReceive()}>
            <IconPackageImport size={18} /> Приёмка
          </Button>
        }
      />
      <Page>
        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={<IconBox size={18} />} label="Позиций" value={String(stock.length)} />
          <Metric icon={<IconCoin size={18} />} tone="blue" label="Стоимость остатка" value={formatMoney(totalValue)} />
          <Metric icon={<IconAlertTriangle size={18} />} tone="warning" label="Заканчиваются" value={String(lowCount)} onClick={() => setChip("low")} />
          <Metric icon={<IconLock size={18} />} tone="violet" label="В резерве" value={String(reservedCount)} onClick={() => setChip("reserved")} />
        </div>

        <Card className="mb-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-0 flex-1 basis-full sm:basis-0">
              <IconSearch className="pointer-events-none absolute left-3 top-3" size={18} color="var(--text-muted)" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Название, артикул, штрихкод или ячейка"
                aria-label="Поиск по складу"
                className="w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[var(--accent)]"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                // Сканер работает как клавиатура: наша задача — поставить курсор в поле.
                setQuery("");
                setChip("all");
                searchRef.current?.focus();
                showToast("Поле готово — отсканируйте штрихкод или введите артикул");
              }}
              title="Курсор встанет в поле поиска: сканер вводит код как клавиатура"
            >
              <IconScan size={18} /> Сканировать
            </Button>
            <div className="field-control w-full sm:w-52">
              <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Категория">
                <option value="all">Все категории</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {CHIPS.map((item) => (
              <button
                key={item.value}
                onClick={() => setChip(item.value)}
                className="rounded-lg border px-3 py-1.5 text-sm font-medium transition"
                style={{
                  borderColor: chip === item.value ? "var(--accent)" : "var(--border)",
                  background: chip === item.value ? "var(--accent)" : "white",
                  color: chip === item.value ? "white" : "var(--text)",
                }}
              >
                {item.label}
                {item.count !== undefined ? ` ${item.count}` : ""}
              </button>
            ))}
          </div>
        </Card>

        {chip === "movements" ? (
          <Card className="overflow-hidden p-0">
            <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
              <h2 className="panel-title">История движений</h2>
            </div>
            <div className="space-y-2 p-3 lg:hidden">
              {stockMovements.slice(0, 30).map((movement) => {
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
            <div className="hidden lg:block">
              <table className="app-table">
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
                  {stockMovements.slice(0, 40).map((movement) => {
                    const item = stock.find((entry) => entry.id === movement.itemId);
                    return (
                      <tr key={movement.id}>
                        <td className="muted whitespace-nowrap">{formatDateTime(movement.date)}</td>
                        <td>
                          <b>{item?.name || "Позиция удалена"}</b>
                          <div className="muted text-xs">{item?.sku}</div>
                        </td>
                        <td><OperationChip operation={movement.operation} /></td>
                        <td className="text-right tabular-nums">{movement.qty} {item?.unit}</td>
                        <td className="text-right tabular-nums">{movement.amount ? formatMoney(movement.amount) : "—"}</td>
                        <td>{movement.to || movement.from || "—"}</td>
                        <td className="muted">{movement.employee}</td>
                      </tr>
                    );
                  })}
                  {stockMovements.length === 0 && (
                    <tr><td colSpan={7} className="muted text-center">Движений пока не было.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <Card className="overflow-hidden p-0">
              <div className="flex items-center justify-between gap-2 border-b p-4" style={{ borderColor: "var(--border)" }}>
                <h2 className="panel-title">Позиции{shown.length !== stock.length ? `: ${shown.length}` : ""}</h2>
                <Link to="/purchases" className="shrink-0 text-sm font-semibold text-[var(--accent)]">К закупкам</Link>
              </div>

              <div className="space-y-2 p-3 xl:hidden">
                {shown.map((item) => {
                  const reserved = reservations.get(item.id) ?? 0;
                  return (
                    <ListCard
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      title={item.name}
                      amount={
                        <span style={{ color: item.qty <= item.minQty ? "var(--danger)" : undefined }}>
                          {item.qty - reserved} / {item.qty} {item.unit}
                        </span>
                      }
                      lines={[
                        `${item.brand ? `${item.brand} · ` : ""}${item.sku}`,
                        <>
                          {item.cell ? <><IconMapPin size={13} className="inline" /> {item.cell} · </> : null}
                          закупка {formatMoney(item.purchasePrice)}
                          {reserved > 0 ? ` · в резерве ${reserved}` : ""}
                        </>,
                      ]}
                      meta={formatMoney(item.qty * item.purchasePrice)}
                    />
                  );
                })}
                {shown.length === 0 && <EmptyState icon={<IconBox size={22} />} title="Ничего не найдено" hint="Смените фильтр или поисковый запрос" />}
              </div>

              <div className="hidden xl:block">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th>Запчасть</th>
                      <th className="w-28">Ячейка</th>
                      <th className="w-24 text-right">Доступно</th>
                      <th className="w-20 text-right">Резерв</th>
                      <th className="w-28 text-right">Закупка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((item) => {
                      const reserved = reservations.get(item.id) ?? 0;
                      const available = item.qty - reserved;
                      return (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className="cursor-pointer"
                          style={{ background: item.id === selectedId ? "var(--accent-soft)" : undefined }}
                        >
                          <td>
                            <b className="block">{item.name}</b>
                            <span className="muted text-xs">{item.brand ? `${item.brand} · ` : ""}{item.sku}</span>
                          </td>
                          <td><CellChip cell={item.cell} /></td>
                          <td className="text-right font-semibold tabular-nums" style={{ color: available <= item.minQty ? "var(--danger)" : undefined }}>
                            {available} {item.unit}
                          </td>
                          <td className="muted text-right tabular-nums">{reserved || "—"}</td>
                          <td className="text-right tabular-nums">{formatMoney(item.purchasePrice)}</td>
                        </tr>
                      );
                    })}
                    {shown.length === 0 && (
                      <tr><td colSpan={5}><EmptyState icon={<IconBox size={22} />} title="Ничего не найдено" hint="Смените фильтр или поисковый запрос" /></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="hidden xl:block">
              <Card className="xl:sticky xl:top-20">
                {detail ?? (
                  <div className="py-6 text-center">
                    <EmptyState icon={<IconBox size={22} />} title="Карточка запчасти" hint="Выберите позицию в списке слева" />
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}
      </Page>

      {selected && (
        <div className="xl:hidden">
          <Modal title={selected.name} subtitle={selected.sku} onClose={() => setSelectedId(null)}>
            <div className="overflow-y-auto p-4">{detail}</div>
          </Modal>
        </div>
      )}

      {returnItem && (
        <ReturnDialog
          item={returnItem}
          free={returnItem.qty - (reservations.get(returnItem.id) ?? 0)}
          onClose={() => setReturnFor(null)}
          onSubmit={(qty, reason) => handleReturn(returnItem, qty, reason)}
        />
      )}

      {receiveOpen && <StockReceive onClose={() => setReceiveOpen(false)} presetItemId={receiveFor ?? undefined} />}
    </>
  );
}

function CellChip({ cell }: { cell?: string }) {
  if (!cell) return <span className="muted">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold tabular-nums"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <IconMapPin size={13} /> {cell}
    </span>
  );
}

const OPERATION_TONES: Record<string, { bg: string; color: string }> = {
  "Приёмка": { bg: "#e8f5ed", color: "var(--accent)" },
  "Возврат": { bg: "#e8f5ed", color: "var(--accent)" },
  "Резерв": { bg: "#fdf3e0", color: "var(--warning)" },
  "Перемещение": { bg: "#edf4ff", color: "#3978c9" },
  "Списание": { bg: "#fbe9e9", color: "var(--danger)" },
};

function OperationChip({ operation }: { operation: string }) {
  const tone = OPERATION_TONES[operation] ?? { bg: "var(--bg)", color: "var(--text-muted)" };
  return (
    <span className="rounded-full px-2 py-1 text-xs font-semibold" style={{ background: tone.bg, color: tone.color }}>
      {operation}
    </span>
  );
}

function ItemCard({
  item, reserved, reservedOrders, vehicles, movements, onReceive, onReturn,
}: {
  item: StockItem;
  reserved: number;
  reservedOrders: Order[];
  vehicles: { id: string; make: string; model: string; plate: string }[];
  movements: { id: string; date: string; operation: string; qty: number; from?: string; to?: string; employee: string }[];
  onReceive: () => void;
  onReturn: () => void;
}) {
  const reservedQty = reserved;
  const available = item.qty - reservedQty;
  return (
    <div>
      <div className="muted text-xs font-semibold uppercase tracking-[.07em]">Карточка запчасти</div>
      <h3 className="mt-1 text-lg font-bold leading-tight">{item.name}</h3>
      <p className="muted text-sm">{item.brand ? `${item.brand} · ` : ""}{item.sku}</p>

      <div className="mt-3 rounded-xl border p-3 text-center" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
        <div className="muted text-[11px] uppercase tracking-[.07em]">Ячейка хранения</div>
        <div className="text-[28px] font-bold leading-none tracking-[-0.02em] tabular-nums">{item.cell || "—"}</div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <Fact label="На полке" value={`${item.qty}`} />
        <Fact label="Резерв" value={`${reservedQty}`} />
        <Fact label="Свободно" value={`${available}`} tone={available <= item.minQty ? "var(--danger)" : undefined} />
        <Fact label="Минимум" value={`${item.minQty}`} />
      </div>

      <div className="mt-3 space-y-1 border-t pt-3 text-sm" style={{ borderColor: "var(--border)" }}>
        <Row label="Категория" value={item.category} />
        <Row label="Цена закупки" value={formatMoney(item.purchasePrice)} />
        {item.lastPurchasePrice !== undefined && <Row label="Последняя закупка" value={formatMoney(item.lastPurchasePrice)} />}
        {item.supplier && <Row label="Поставщик" value={item.supplier} />}
        <Row label="Стоимость остатка" value={formatMoney(item.qty * item.purchasePrice)} />
      </div>

      {reservedOrders.length > 0 && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <div className="muted mb-1.5 text-xs font-semibold uppercase tracking-[.07em]">Зарезервировано под</div>
          <div className="space-y-1.5">
            {reservedOrders.map((order) => {
              const vehicle = vehicles.find((entry) => entry.id === order.vehicleId);
              return (
                <Link
                  key={order.id}
                  to={`/orders/${order.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-sm hover:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="min-w-0 truncate">{vehicle ? `${vehicle.make} ${vehicle.model}` : order.number}</span>
                  <span className="muted shrink-0 text-xs">{order.number}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
        <div className="muted mb-1.5 text-xs font-semibold uppercase tracking-[.07em]">История движений</div>
        {movements.length === 0 ? (
          <p className="muted text-sm">Движений по позиции не было.</p>
        ) : (
          <div className="space-y-1.5">
            {movements.map((movement) => (
              <div key={movement.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <OperationChip operation={movement.operation} />
                  <span className="muted truncate text-xs">{formatDateTime(movement.date)}</span>
                </span>
                <span className="shrink-0 tabular-nums">{movement.qty} {item.unit}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button className="mt-3 w-full justify-center" onClick={onReceive}>
        <IconPackageImport size={18} /> Принять на склад
      </Button>
      <Button variant="secondary" className="mt-2 w-full justify-center" onClick={onReturn} disabled={available <= 0}>
        <IconArrowBackUp size={18} /> Вернуть поставщику
      </Button>
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
      <div className="muted text-[11px]">{label}</div>
      <div className="text-lg font-bold leading-tight tabular-nums" style={{ color: tone }}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="muted">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

/** Возврат поставщику: количество и причина, деньги подтверждаются позже в финансах. */
function ReturnDialog({
  item, free, onClose, onSubmit,
}: {
  item: StockItem;
  free: number;
  onClose: () => void;
  onSubmit: (qty: number, reason: string) => void;
}) {
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const amount = (Number(qty) || 0) * item.purchasePrice;

  return (
    <Modal title="Вернуть поставщику" subtitle={`${item.name} · ${item.sku}`} onClose={onClose}>
      <div className="space-y-3 p-4">
        <div className="rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
          <div className="flex justify-between"><span className="muted">Свободно на складе</span><b>{free} {item.unit}</b></div>
          <div className="flex justify-between"><span className="muted">Цена закупки</span><b>{formatMoney(item.purchasePrice)}</b></div>
          <div className="flex justify-between"><span className="muted">Поставщик</span><b>{item.supplier || "не указан"}</b></div>
        </div>
        <label className="block text-sm">
          <span className="muted mb-1 block">Количество к возврату</span>
          <div className="field-control">
            <input
              autoFocus
              inputMode="numeric"
              aria-label="Количество к возврату"
              value={qty}
              onChange={(event) => setQty(event.target.value.replace(/\D/g, ""))}
            />
          </div>
        </label>
        <label className="block text-sm">
          <span className="muted mb-1 block">Причина возврата</span>
          <div className="field-control">
            <textarea
              rows={2}
              aria-label="Причина возврата"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Например: не подошла по артикулу"
            />
          </div>
        </label>
        <div className="flex items-center justify-between text-sm">
          <span className="muted">Ждём от поставщика</span>
          <b className="tabular-nums">{formatMoney(amount)}</b>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={() => onSubmit(Number(qty) || 0, reason.trim())} disabled={!Number(qty) || Number(qty) > free}>
            Оформить возврат
          </Button>
        </div>
      </div>
    </Modal>
  );
}
