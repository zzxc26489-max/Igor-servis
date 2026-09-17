import { useMemo, useState, type FormEvent } from "react";
import { IconCheck, IconInfoCircle, IconMapPin, IconX } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { useToast } from "../components/Toast";
import { Button, Modal } from "../components/ui";
import { formatDate, formatMoney } from "../lib/format";
import type { StockItem } from "../types";

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

export default function StockReceive({ onClose, presetItemId }: { onClose: () => void; presetItemId?: string }) {
  const { stock, employees, receiveStock } = useAppStore();
  const { showToast } = useToast();

  const preset = presetItemId ? stock.find((item) => item.id === presetItemId) : undefined;
  const [sku, setSku] = useState(preset?.sku ?? "");
  const [matchedId, setMatchedId] = useState(preset?.id ?? "");
  const [name, setName] = useState(preset?.name ?? "");
  const [brand, setBrand] = useState(preset?.brand ?? "");
  const [category, setCategory] = useState(preset?.category ?? "");
  const [unit, setUnit] = useState(preset?.unit ?? "шт.");
  const [minQty, setMinQty] = useState(preset ? String(preset.minQty) : "");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState(
    preset ? String(preset.lastPurchasePrice ?? preset.purchasePrice ?? "") : "",
  );
  const [supplier, setSupplier] = useState(preset?.supplier ?? "");
  const [employee, setEmployee] = useState(employees[0]?.name ?? "");
  const [createExpense, setCreateExpense] = useState(true);
  const cellParts = parseCell(preset?.cell);
  const [rack, setRack] = useState(cellParts.rack);
  const [shelf, setShelf] = useState(cellParts.shelf);
  const [place, setPlace] = useState(cellParts.place);

  const matched = useMemo(() => stock.find((item) => item.id === matchedId), [matchedId, stock]);
  const categories = useMemo(() => Array.from(new Set(stock.map((item) => item.category))), [stock]);
  const occupied = useMemo(() => {
    const map = new Map<string, StockItem>();
    stock.forEach((item) => { if (item.cell) map.set(item.cell, item); });
    return map;
  }, [stock]);

  const cell = buildCell(rack, shelf, place);
  const cellOwner = occupied.get(cell);
  const total = Math.round((Number(qty) || 0) * (Number(unitPrice) || 0));

  // Артикул — ключ позиции: по нему подтягиваем прошлую цену закупки и ячейку.
  function applySku(value: string) {
    setSku(value);
    const found = stock.find((item) => item.sku.toLowerCase() === value.trim().toLowerCase());
    if (!found) {
      setMatchedId("");
      return;
    }
    setMatchedId(found.id);
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
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const receivedQty = Number(qty);
    const price = Number(unitPrice);
    if (!name.trim() || !sku.trim()) {
      showToast("Укажите артикул и название", "error");
      return;
    }
    if (!receivedQty || receivedQty <= 0) {
      showToast("Количество должно быть больше нуля", "error");
      return;
    }
    if (price < 0) {
      showToast("Цена не может быть отрицательной", "error");
      return;
    }
    if (cellOwner && cellOwner.id !== matchedId) {
      showToast(`Ячейка ${cell} занята: ${cellOwner.name}`, "error");
      return;
    }

    receiveStock({
      itemId: matched?.id,
      name: name.trim(),
      sku: sku.trim(),
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
    });

    showToast(
      matched
        ? `${name}: принято ${receivedQty} ${unit} в ячейку ${cell}`
        : `Новая позиция «${name}» принята на склад`,
    );
    onClose();
  }

  return (
    <Modal
      title="Приёмка на склад"
      subtitle="Введите артикул — если такая запчасть уже была, данные подставятся"
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Артикул *">
            <input value={sku} onChange={(event) => applySku(event.target.value)} list="stock-skus" placeholder="GDB1956" autoFocus />
          </Field>
          <Field label="Название *">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Тормозные колодки" />
          </Field>
        </div>
        <datalist id="stock-skus">
          {stock.map((item) => <option key={item.id} value={item.sku}>{item.name}</option>)}
        </datalist>

        {matched && (
          <div className="flex items-start gap-2 rounded-lg p-3 text-sm" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}>
            <IconInfoCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              Позиция уже на складе: остаток <b>{matched.qty} {matched.unit}</b>, средняя цена закупки <b>{formatMoney(matched.purchasePrice)}</b>
              {matched.lastPurchasePrice ? (
                <> · прошлая покупка <b>{formatMoney(matched.lastPurchasePrice)}</b>{matched.lastPurchaseAt ? ` от ${formatDate(matched.lastPurchaseAt)}` : ""}</>
              ) : null}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Количество *">
            <input value={qty} onChange={(event) => setQty(event.target.value.replace(/\D/g, ""))} inputMode="numeric" />
          </Field>
          <Field label="Единица">
            <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="шт." />
          </Field>
          <Field label="Цена закупки, ₽">
            <input value={unitPrice} onChange={(event) => setUnitPrice(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="за единицу" />
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
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <IconMapPin size={16} className="text-[var(--accent)]" /> Куда положить
          </div>
          <div className="grid grid-cols-3 gap-3">
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
          </div>
          <p className="mt-2 text-sm">
            Ячейка <b>{cell}</b>{" "}
            {cellOwner && cellOwner.id !== matchedId ? (
              <span style={{ color: "var(--danger)" }}>— занята: {cellOwner.name}</span>
            ) : (
              <span className="text-[var(--accent)]">— свободна</span>
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
