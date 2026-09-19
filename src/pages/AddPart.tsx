import { useCallback, useMemo, useState } from "react";
import { IconMapPin, IconScan, IconSearch } from "@tabler/icons-react";
import { Button, Modal } from "../components/ui";
import { useAppStore } from "../store/AppStore";
import { formatMoney } from "../lib/format";
import { isValidMoney, moneyInput } from "../lib/formats";
import { clientPrice, margin } from "../lib/price";
import { reservedByItem } from "../lib/stock";
import { formatQuantity, isValidQuantity, parseQuantity } from "../lib/quantity";
import type { StockItem, Vehicle } from "../types";
import BarcodeScanner from "../components/BarcodeScanner";
import { useToast } from "../components/Toast";
import { findStockItemByScannedCode, preferredScannedValue } from "../lib/scannedCode";

/**
 * Подбор запчасти для заказ-наряда: сначала выбираем позицию поиском и
 * категориями, потом задаём количество и цену клиенту. Раньше это был один
 * безымянный список на весь склад и два поля без подписей.
 */
export default function AddPart({
  onClose,
  onSubmit,
  error,
  vehicle,
}: {
  onClose: () => void;
  onSubmit: (itemId: string, qty: number, price: number) => void;
  error?: string;
  vehicle?: Vehicle;
}) {
  const { stock, orders, settings } = useAppStore();
  const { showToast } = useToast();
  const reserved = useMemo(() => reservedByItem(orders, stock), [orders, stock]);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<StockItem | null>(null);
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(stock.map((item) => item.category))).sort()],
    [stock],
  );

  const available = useCallback(
    (item: StockItem) => item.qty - (reserved.get(item.id) ?? 0),
    [reserved],
  );

  const found = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ru-RU");
    return stock
      .filter((item) => {
        if (category !== "all" && item.category !== category) return false;
        if (!term) return true;
        return `${item.name} ${item.sku} ${item.barcode ?? ""} ${item.brand ?? ""} ${item.cell ?? ""} ${(item.crossNumbers ?? []).join(" ")} ${(item.oeNumbers ?? []).join(" ")} ${(item.fitments ?? []).join(" ")}`
          .toLocaleLowerCase("ru-RU")
          .includes(term);
      })
      .sort((a, b) => available(b) - available(a) || a.name.localeCompare(b.name, "ru"));
  }, [available, category, query, stock]);

  function pick(item: StockItem) {
    setSelected(item);
    // Цена клиенту сразу с наценкой: продавать по закупке — это работа в ноль.
    setPrice(String(clientPrice(item.purchasePrice, settings.partMarkupPercent)));
    setQty("1");
  }

  const numericQty = Number(qty.replace(",", "."));
  const validQty = isValidQuantity(numericQty);
  const count = validQty ? numericQty : 0;
  const validPrice = isValidMoney(price);
  const clientSum = (Number(price) || 0) * count;
  const purchaseSum = (selected?.purchasePrice ?? 0) * count;
  const profit = margin(selected?.purchasePrice ?? 0, Number(price) || 0, count);
  const free = selected ? available(selected) : 0;
  const tooMany = selected ? count > free : false;

  return (
    <>
    <Modal
      title={selected ? "Количество и цена" : "Запчасть со склада"}
      subtitle={selected ? `${selected.name} · ${selected.sku}` : "Найдите позицию по названию, артикулу, штрихкоду или ячейке"}
      onClose={onClose}
      wide={!selected}
    >
      {!selected ? (
        <div className="flex min-h-0 flex-col">
          <div className="space-y-2 border-b p-4" style={{ borderColor: "var(--border)" }}>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <IconSearch className="pointer-events-none absolute left-3 top-3" size={18} color="var(--text-muted)" />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Название, артикул, штрихкод, OE/кросс-номер, авто или ячейка"
                  aria-label="Поиск запчасти"
                  className="w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[var(--accent)]"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setScannerOpen(true)}
                title="Сканировать штрихкод камерой телефона"
                aria-label="Сканировать штрихкод"
              >
                <IconScan size={18} />
                <span className="hidden sm:inline">Сканировать</span>
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className="rounded-lg border px-2.5 py-1 text-xs font-medium transition"
                  style={{
                    borderColor: category === item ? "var(--accent)" : "var(--border)",
                    background: category === item ? "var(--accent)" : "white",
                    color: category === item ? "white" : "var(--text)",
                  }}
                >
                  {item === "all" ? "Все категории" : item}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[52vh] overflow-y-auto">
            {found.length === 0 && <p className="muted p-4 text-sm">Ничего не нашлось. Проверьте запрос или категорию.</p>}
            {found.map((item) => {
              const free = available(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pick(item)}
                  disabled={free <= 0}
                  className="flex w-full items-start justify-between gap-3 border-b px-4 py-3 text-left transition last:border-b-0 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{item.name}</span>
                    <span className="muted block truncate text-xs">
                      {item.brand ? `${item.brand} · ` : ""}{item.sku}
                      {item.cell ? <> · <IconMapPin size={11} className="inline" /> {item.cell}</> : " · без ячейки"}
                    </span>
                    {(item.crossNumbers?.length || item.oeNumbers?.length) ? (
                      <span className="muted mt-0.5 block truncate text-[11px]">
                        аналоги: {[...(item.oeNumbers ?? []), ...(item.crossNumbers ?? [])].slice(0, 4).join(" · ")}
                      </span>
                    ) : null}
                    {vehicle && item.fitments?.some((fitment) =>
                      fitment.toLocaleLowerCase("ru-RU").includes(vehicle.make.toLocaleLowerCase("ru-RU"))
                      || fitment.toLocaleLowerCase("ru-RU").includes(vehicle.model.toLocaleLowerCase("ru-RU"))
                    ) && (
                      <span className="mt-1 block text-[11px] font-semibold text-[var(--accent)]">
                        Есть применяемость для {vehicle.make} {vehicle.model} · всё равно проверить по VIN
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className="block text-sm font-semibold tabular-nums"
                      style={{ color: free <= 0 ? "var(--danger)" : free <= item.minQty ? "var(--warning)" : "var(--accent)" }}
                    >
                      {free <= 0 ? "нет в наличии" : `${formatQuantity(free)} ${item.unit}`}
                    </span>
                    <span className="muted block text-xs tabular-nums">
                      закупка {formatMoney(item.purchasePrice)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <div className="rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
            <div className="flex justify-between gap-3"><span className="muted">Ячейка</span><b>{selected.cell || "—"}</b></div>
            <div className="flex justify-between gap-3"><span className="muted">Свободно на складе</span><b>{formatQuantity(free)} {selected.unit}</b></div>
            <div className="flex justify-between gap-3"><span className="muted">Цена закупки</span><b>{formatMoney(selected.purchasePrice)}</b></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="muted mb-1 block">Количество, {selected.unit}</span>
              <div className="field-control">
                <input
                  autoFocus
                  inputMode="decimal"
                  aria-label="Количество"
                  value={qty}
                  onChange={(event) => setQty(parseQuantity(event.target.value))}
                />
              </div>
              {tooMany && <span className="mt-1 block text-xs" style={{ color: "var(--danger)" }}>Свободно только {formatQuantity(free)} {selected.unit}</span>}
              {!tooMany && qty !== "" && !validQty && <span className="mt-1 block text-xs" style={{ color: "var(--danger)" }}>Количество должно быть больше нуля</span>}
            </label>
            <label className="block text-sm">
              <span className="muted mb-1 block">Цена клиенту за {selected.unit}</span>
              <div className="field-control">
                <input
                  inputMode="numeric"
                  aria-label="Цена клиенту"
                  value={price}
                  onChange={(event) => setPrice(moneyInput(event.target.value))}
                />
              </div>
              <span className="muted mt-1 block text-xs">
                Наценка {settings.partMarkupPercent}% подставлена автоматически
              </span>
              {price !== "" && !validPrice && <span className="mt-1 block text-xs" style={{ color: "var(--danger)" }}>Цена должна быть больше нуля и не более 10 млн ₽</span>}
            </label>
          </div>

          <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
            <div className="flex justify-between gap-3"><span className="muted">Закупка</span><span className="tabular-nums">{formatMoney(purchaseSum)}</span></div>
            <div className="flex justify-between gap-3"><span className="muted">Клиенту</span><span className="tabular-nums">{formatMoney(clientSum)}</span></div>
            <div className="mt-1 flex justify-between gap-3 border-t pt-1 font-semibold" style={{ borderColor: "var(--border)" }}>
              <span>Заработок</span>
              <span className="tabular-nums" style={{ color: profit.rub > 0 ? "var(--accent)" : "var(--danger)" }}>
                {formatMoney(profit.rub)}{profit.percent !== null ? ` · ${profit.percent}%` : ""}
              </span>
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="secondary" onClick={() => setSelected(null)}>Выбрать другую</Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>Отмена</Button>
              <Button
                disabled={tooMany || !validQty || !validPrice}
                onClick={() => onSubmit(selected.id, count, Number(price) || 0)}
              >
                Добавить в заказ
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
    {scannerOpen && (
      <BarcodeScanner
        title="Найти запчасть по штрихкоду или QR"
        onClose={() => setScannerOpen(false)}
        onDetected={(value) => {
          const { item: exact } = findStockItemByScannedCode(stock, value);
          if (!exact) {
            setQuery(preferredScannedValue(value));
            setCategory("all");
            showToast("Позиция по этому коду на складе не найдена", "error");
            return;
          }
          if (available(exact) <= 0) {
            setQuery(exact.sku);
            setCategory("all");
            showToast(`${exact.name}: свободного остатка нет`, "error");
            return;
          }
          pick(exact);
          showToast(`Найдена позиция: ${exact.name}`);
        }}
      />
    )}
    </>
  );
}
