import { useMemo, useState, type FormEvent } from "react";
import { IconCheck, IconInfoCircle, IconMapPin, IconScan, IconX } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Confirm";
import { isValidMoney, moneyInput } from "../lib/formats";
import { Button, Modal } from "../components/ui";
import { formatDate, formatMoney } from "../lib/format";
import type { PartReference, PaymentMethod, StockItem } from "../types";
import { isValidQuantity, parseQuantity } from "../lib/quantity";
import { activeCashShift } from "../lib/cashShift";
import BarcodeScanner from "../components/BarcodeScanner";
import { findStockItemByScannedCode, preferredScannedValue } from "../lib/scannedCode";

export const RACKS = ["A", "B", "C"];
export const SHELVES = ["01", "02", "03", "04"];
export const PLACES = ["01", "02"];

export function buildCell(rack: string, shelf: string, place: string) {
  return `${rack}-${shelf}-${place}`;
}

function parseCell(cell?: string) {
  const [rack, shelf, place] = (cell ?? "").split("-");
  return {
    rack: RACKS.includes(rack) ? rack : RACKS[0],
    shelf: SHELVES.includes(shelf) ? shelf : SHELVES[0],
    place: PLACES.includes(place) ? place : PLACES[0],
  };
}

const COMMON_UNITS = ["шт.", "компл.", "л", "мл", "кг", "г", "бал.", "упак.", "м"];

export default function StockReceive({
  onClose,
  presetItemId,
  presetReference,
}: {
  onClose: () => void;
  presetItemId?: string;
  presetReference?: PartReference;
}) {
  const { stock, employees, cashShifts, receiveStock } = useAppStore();
  const confirm = useConfirm();
  const { showToast } = useToast();

  const preset = presetItemId ? stock.find((item) => item.id === presetItemId) : undefined;
  const [sku, setSku] = useState(preset?.sku ?? presetReference?.sku ?? "");
  const [barcode, setBarcode] = useState(preset?.barcode ?? "");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [matchedId, setMatchedId] = useState(preset?.id ?? "");
  const [name, setName] = useState(preset?.name ?? presetReference?.name ?? "");
  const [brand, setBrand] = useState(preset?.brand ?? presetReference?.brand ?? "");
  const [category, setCategory] = useState(preset?.category ?? presetReference?.category ?? "");
  const [unit, setUnit] = useState(preset?.unit ?? presetReference?.unit ?? "шт.");
  const [minQty, setMinQty] = useState(preset ? String(preset.minQty) : "");
  const [qty, setQty] = useState(preset?.onOrderQty ? String(preset.onOrderQty) : "1");
  const [unitPrice, setUnitPrice] = useState(
    preset ? String(preset.lastPurchasePrice ?? preset.purchasePrice ?? "") : "",
  );
  const [supplier, setSupplier] = useState(preset?.supplier ?? "");
  const [employee, setEmployee] = useState(employees[0]?.name ?? "");
  const [createExpense, setCreateExpense] = useState(true);
  const [expenseMethod, setExpenseMethod] = useState<PaymentMethod | "">("");
  const cellParts = parseCell(preset?.cell);
  const [rack, setRack] = useState(cellParts.rack);
  const [shelf, setShelf] = useState(cellParts.shelf);
  const [place, setPlace] = useState(cellParts.place);
  const [withoutCell, setWithoutCell] = useState(!preset?.cell);

  const matched = useMemo(() => stock.find((item) => item.id === matchedId), [matchedId, stock]);
  const categories = useMemo(() => Array.from(new Set(stock.map((item) => item.category))), [stock]);
  const occupied = useMemo(() => {
    const map = new Map<string, StockItem>();
    stock.forEach((item) => { if (item.cell) map.set(item.cell, item); });
    return map;
  }, [stock]);

  const cell = withoutCell ? "" : buildCell(rack, shelf, place);
  const cellOwner = cell ? occupied.get(cell) : undefined;
  const numericQty = Number(qty.replace(",", "."));
  const total = Math.round((numericQty || 0) * (Number(unitPrice) || 0));

  // Артикул — ключ позиции: по нему подтягиваем прошлую цену закупки и ячейку.
  function applySku(value: string) {
    setSku(value);
    const normalized = value.trim().toLowerCase();
    const found = stock.find((item) =>
      item.sku.toLowerCase() === normalized || item.barcode?.toLowerCase() === normalized
    );
    if (!found) {
      setMatchedId("");
      return;
    }
    setMatchedId(found.id);
    setBarcode(found.barcode ?? value.trim());
    setName(found.name);
    setBrand(found.brand ?? "");
    setCategory(found.category);
    setUnit(found.unit);
    setMinQty(String(found.minQty));
    setUnitPrice(String(found.lastPurchasePrice ?? found.purchasePrice ?? ""));
    setSupplier(found.supplier ?? "");
    const parts = parseCell(found.cell);
    setRack(parts.rack);
    setShelf(parts.shelf);
    setPlace(parts.place);
    setWithoutCell(!found.cell);
    if (found.onOrderQty) setQty(String(found.onOrderQty));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const receivedQty = Number(qty.replace(",", "."));
    const price = Number(unitPrice);
    if (!name.trim() || !sku.trim()) {
      showToast("Укажите артикул и название", "error");
      return;
    }
    if (!isValidQuantity(receivedQty)) {
      showToast("Количество должно быть больше нуля", "error");
      return;
    }
    if (!isValidMoney(String(price), { allowZero: true })) {
      showToast("Цена должна быть от 0 до 10 млн ₽", "error");
      return;
    }
    if (receivedQty > 100_000) {
      showToast("Количество слишком большое — проверьте ввод", "error");
      return;
    }
    if (cellOwner && cellOwner.id !== matchedId) {
      showToast(`Ячейка ${cell} занята: ${cellOwner.name}`, "error");
      return;
    }
    if (createExpense && total > 0 && !expenseMethod) {
      showToast("Выберите, как оплачена поставка", "error");
      return;
    }
    if (createExpense && expenseMethod === "cash" && !activeCashShift(cashShifts)) {
      showToast("Для оплаты поставки наличными сначала откройте кассовую смену", "error");
      return;
    }

    const nextQty = (matched?.qty ?? 0) + receivedQty;
    const nextPrice = matched && price > 0 && nextQty > 0
      ? Math.round((matched.qty * matched.purchasePrice + total) / nextQty)
      : price;

    const ok = await confirm({
      title: matched ? "Принять на склад" : "Завести новую позицию",
      question: matched
        ? "Остаток и средняя цена закупки пересчитаются, движение попадёт в историю склада."
        : "На складе появится новая позиция с указанной ячейкой и ценой закупки.",
      summary: [
        { label: "Запчасть", value: `${name.trim()} · ${sku.trim()}` },
        { label: "Хранение", value: cell || "Без ячейки · быстрый доступ" },
        { label: "Принимаем", value: `${receivedQty} ${unit || "шт."}` },
        { label: "Цена закупки", value: formatMoney(price) },
        ...(matched
          ? [
              { label: "Остаток станет", value: `${matched.qty} → ${nextQty} ${matched.unit}` },
              { label: "Средняя цена станет", value: `${formatMoney(matched.purchasePrice)} → ${formatMoney(nextPrice)}` },
            ]
          : []),
        {
          label: createExpense ? "Запишем в расходы" : "Сумма приёмки (без расхода)",
          value: formatMoney(total),
          total: true,
          tone: createExpense ? "danger" : undefined,
        },
      ],
      note: createExpense
        ? undefined
        : "Расход в финансы не попадёт — поставьте галочку, если поставку уже оплатили.",
      confirmLabel: "Принять",
    });
    if (!ok) return;

    const receiveError = receiveStock({
      itemId: matched?.id,
      name: name.trim(),
      sku: sku.trim(),
      barcode: barcode.trim() || undefined,
      brand: brand.trim() || undefined,
      category: category.trim() || "Без категории",
      unit: unit.trim() || "шт.",
      minQty: Number(minQty) || 0,
      qty: receivedQty,
      unitPrice: price,
      cell,
      supplier: supplier.trim() || undefined,
      employee: employee || "Не указан",
      createExpense,
      expenseMethod: createExpense ? (expenseMethod || undefined) : undefined,
    });
    if (receiveError) {
      showToast(receiveError, "error");
      return;
    }

    showToast(
      matched
        ? `${name}: принято ${receivedQty} ${unit} в ячейку ${cell}`
        : `Новая позиция «${name}» принята на склад`,
    );
    onClose();
  }

  return (
    <>
    <Modal
      title="Приёмка на склад"
      subtitle="Введите артикул — если такая запчасть уже была, данные подставятся"
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Артикул *">
            <div className="flex gap-2">
              <input value={sku} onChange={(event) => applySku(event.target.value)} list="stock-skus" placeholder="GDB1956" autoFocus />
              <Button type="button" size="sm" variant="secondary" onClick={() => setScannerOpen(true)} title="Сканировать камерой телефона">
                <IconScan size={17} />
              </Button>
            </div>
          </Field>
          <Field label="Название *">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Тормозные колодки" />
          </Field>
        </div>
        <datalist id="stock-skus">
          {stock.map((item) => <option key={item.id} value={item.sku}>{item.name}</option>)}
        </datalist>
        <Field label="Штрихкод">
          <div className="flex gap-2">
            <input value={barcode} onChange={(event) => setBarcode(event.target.value.trim())} placeholder="EAN / UPC / Code128 / QR" />
            <Button type="button" size="sm" variant="secondary" onClick={() => setScannerOpen(true)}>
              <IconScan size={17} /> Камера
            </Button>
          </div>
        </Field>

        {matched && (
          <div className="flex items-start gap-2 rounded-lg p-3 text-sm" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
            <IconInfoCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              Позиция уже на складе: остаток <b>{matched.qty} {matched.unit}</b>, средняя цена закупки <b>{formatMoney(matched.purchasePrice)}</b>
              {matched.onOrderQty ? <> · ожидаем <b>{matched.onOrderQty} {matched.unit}</b></> : null}
              {matched.lastPurchasePrice ? (
                <> · прошлая покупка <b>{formatMoney(matched.lastPurchasePrice)}</b>{matched.lastPurchaseAt ? ` от ${formatDate(matched.lastPurchaseAt)}` : ""}</>
              ) : null}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Количество *">
            <input value={qty} onChange={(event) => setQty(parseQuantity(event.target.value))} inputMode="decimal" placeholder="1 или 4,5" />
          </Field>
          <Field label="Единица">
            <select value={unit} onChange={(event) => setUnit(event.target.value)}>
              {Array.from(new Set([...COMMON_UNITS, unit])).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Цена закупки, ₽">
            <input value={unitPrice} onChange={(event) => setUnitPrice(moneyInput(event.target.value))} inputMode="numeric" placeholder="за единицу" />
          </Field>
          <Field label="Мин. остаток">
            <input value={minQty} onChange={(event) => setMinQty(event.target.value.replace(/\D/g, ""))} inputMode="numeric" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Бренд"><input value={brand} onChange={(event) => setBrand(event.target.value)} /></Field>
          <Field label="Категория">
            <input value={category} onChange={(event) => setCategory(event.target.value)} list="stock-categories" />
          </Field>
          <Field label="Поставщик"><input value={supplier} onChange={(event) => setSupplier(event.target.value)} /></Field>
        </div>
        <datalist id="stock-categories">{categories.map((item) => <option key={item} value={item} />)}</datalist>

        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <IconMapPin size={16} className="text-[var(--accent)]" /> Где хранится
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={withoutCell} onChange={(event) => setWithoutCell(event.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Без ячейки / быстрый доступ
            </label>
          </div>
          {!withoutCell && <div className="grid grid-cols-3 gap-3">
            <Field label="Стеллаж">
              <select value={rack} onChange={(event) => setRack(event.target.value)}>
                {RACKS.map((item) => <option key={item} value={item}>Стеллаж {item}</option>)}
              </select>
            </Field>
            <Field label="Полка">
              <select value={shelf} onChange={(event) => setShelf(event.target.value)}>
                {SHELVES.map((item) => <option key={item} value={item}>Полка {Number(item)}</option>)}
              </select>
            </Field>
            <Field label="Место">
              <select value={place} onChange={(event) => setPlace(event.target.value)}>
                {PLACES.map((item) => <option key={item} value={item}>Место {Number(item)}</option>)}
              </select>
            </Field>
          </div>}
          <p className="mt-2 text-sm">
            {withoutCell ? (
              <span className="muted">Позиция будет храниться без адресной ячейки — удобно для деталей под текущий ремонт и расходников.</span>
            ) : (
              <>Ячейка <b>{cell}</b>{" "}
                {cellOwner && cellOwner.id !== matchedId ? (
                  <span style={{ color: "var(--danger)" }}>— занята: {cellOwner.name}</span>
                ) : (
                  <span className="text-[var(--accent)]">— свободна</span>
                )}
              </>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Кто принял">
            <select value={employee} onChange={(event) => setEmployee(event.target.value)}>
              {employees.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
            <input type="checkbox" checked={createExpense} onChange={(event) => setCreateExpense(event.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Записать расход в финансы
          </label>
        </div>

        {createExpense && total > 0 && (
          <Field label="Как оплачена поставка">
            <select value={expenseMethod} onChange={(event) => setExpenseMethod(event.target.value as PaymentMethod | "")}>
              <option value="">Выберите способ</option>
              <option value="cash">Наличные</option>
              <option value="terminal">Терминал / карта</option>
              <option value="transfer">Перевод / СБП</option>
            </select>
          </Field>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-3" style={{ background: "var(--bg)" }}>
          <span className="text-sm muted">Сумма приёмки</span>
          <b className="text-lg">{formatMoney(total)}</b>
        </div>

        <div className="flex gap-2">
          <Button type="submit"><IconCheck size={18} /> Оприходовать</Button>
          <Button variant="secondary" onClick={onClose}><IconX size={18} /> Отмена</Button>
        </div>
      </form>
    </Modal>
    {scannerOpen && (
      <BarcodeScanner
        title="Сканировать штрихкод или QR"
        onClose={() => setScannerOpen(false)}
        onDetected={(value) => {
          const { parsed, item: found } = findStockItemByScannedCode(stock, value);
          const preferred = preferredScannedValue(value);
          if (found) {
            setBarcode(found.barcode ?? parsed.barcode ?? preferred);
            applySku(found.sku);
            showToast(`Найдена позиция: ${found.name}`);
            return;
          }

          setMatchedId("");
          if (parsed.barcode) setBarcode(parsed.barcode);
          if (parsed.sku) setSku(parsed.sku);
          if (!parsed.barcode && !parsed.sku) setSku(preferred);
          showToast(parsed.kind === "plain"
            ? "Код не найден. Значение подставлено для новой позиции."
            : "QR распознан. Данные подставлены для новой позиции.");
        }}
      />
    )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block muted">{label}</span>
      <div className="field-control">{children}</div>
    </label>
  );
}
