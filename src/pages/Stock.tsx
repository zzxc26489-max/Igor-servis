import { useMemo, useState } from "react";
import { IconBarcode, IconBox, IconCamera, IconMapPin, IconPlus, IconShoppingCart } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Button, Card, Page, TopBar } from "../components/ui";
import { formatDateTime, formatMoney } from "../lib/format";

const CELLS = ["A-01-01", "A-01-02", "A-02-01", "A-02-02", "A-03-01", "A-03-02", "A-04-01", "A-04-02", "B-01-01", "B-01-02", "B-02-01", "B-02-02", "B-03-01", "B-03-02", "B-04-01", "B-04-02"];

export default function Stock() {
  const { stock, stockMovements, updateStockItem, addStockMovement } = useAppStore();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(stock[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [cell, setCell] = useState(stock[0]?.cell || "A-03-02");
  const [notice, setNotice] = useState("");
  const critical = stock.filter((i) => i.qty <= i.minQty);
  const selected = useMemo(() => stock.find((item) => item.id === selectedId) ?? stock[0], [selectedId, stock]);
  const shownStock = stock.filter((item) => `${item.name} ${item.sku} ${item.brand ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const occupiedCells = new Set(stock.map((item) => item.cell).filter(Boolean));

  function receive() {
    if (!selected) return;
    const received = Math.max(1, Number(qty) || 1);
    updateStockItem(selected.id, { qty: selected.qty + received, cell });
    addStockMovement({ id: `mv-${Date.now()}`, date: new Date().toISOString(), itemId: selected.id, operation: "Приёмка", qty: received, to: cell, employee: "Юра" });
    setNotice(`${selected.name}: принято ${received} ${selected.unit} в ячейку ${cell}.`);
  }

  return (
    <>
      <TopBar title="Склад — приёмка запчастей" subtitle="Отсканируйте штрихкод, укажите ячейку хранения и оприходуйте деталь." />
      <Page>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.45fr_.86fr_.64fr]">
          <Card className="p-0 overflow-hidden">
            <div className="p-5 border-b" style={{ borderColor: "var(--border)" }}>
              <h2 className="panel-title">Сканируйте штрихкод или найдите запчасть</h2>
              <div className="mt-4 flex gap-2">
                <div className="relative flex-1">
                  <IconBarcode className="absolute left-3 top-3" size={22} color="var(--text-muted)" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-lg border py-3 pl-11 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" style={{ borderColor: "var(--accent)" }} placeholder="Введите артикул или название…" />
                </div>
                <button className="rounded-lg border px-3 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" style={{ borderColor: "var(--border)" }} aria-label="Сканировать камерой" onClick={() => setNotice("Камера будет подключена после запуска серверной версии CRM.")}><IconCamera size={22} /></button>
              </div>
              <p className="muted mt-2 text-xs">Сканер штрихкода работает как клавиатура: наведите его в это поле.</p>
            </div>
            <div className="max-h-64 overflow-auto divide-y" style={{ borderColor: "var(--border)" }}>
              {shownStock.map((item) => (
                <button key={item.id} className="flex w-full items-center gap-3 p-4 text-left hover:bg-[#f7faf8] focus-visible:outline-none focus-visible:bg-[#f7faf8]" onClick={() => { setSelectedId(item.id); setCell(item.cell || "A-03-02"); setNotice(""); }}>
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-[#edf5f0] text-[var(--accent)]"><IconBox size={28} /></div>
                  <span className="min-w-0 flex-1"><b className="block">{item.name}</b><span className="muted text-xs">{item.brand || "Без бренда"} · {item.sku}</span></span>
                  <span className="text-right text-xs"><b className="block">{item.qty} {item.unit}</b><span className={item.qty <= item.minQty ? "text-red-500" : "muted"}>мин. {item.minQty}</span></span>
                </button>
              ))}
            </div>
            {selected && <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
              <div><div className="text-sm font-semibold">{selected.name}</div><div className="muted mt-1 text-sm">Закупочная цена: {formatMoney(selected.purchasePrice)} · {selected.category}</div></div>
              <label className="text-sm">Количество к приёмке<div className="field-control mt-1 w-32"><input value={qty} inputMode="numeric" onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} /></div></label>
            </div>}
          </Card>

          <Card>
            <div className="flex items-start justify-between gap-3"><div><h2 className="panel-title">Куда положить</h2><p className="muted mt-1 text-xs">Ячейка хранения детали</p></div><IconMapPin size={22} color="var(--accent)" /></div>
            <div className="mt-5 rounded-lg bg-[#edf7f0] p-4"><span className="muted text-xs">Рекомендуемая ячейка</span><b className="mt-1 block text-xl">{cell}</b><span className="mt-2 inline-block rounded-full bg-white px-2 py-1 text-xs text-[var(--accent)]">Свободна</span></div>
            <label className="mt-4 block text-sm font-medium">Или выберите другую ячейку<select className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }} value={cell} onChange={(e) => setCell(e.target.value)}>{CELLS.map((value) => <option value={value} key={value}>{value} {occupiedCells.has(value) && value !== selected?.cell ? "(занята)" : "(свободна)"}</option>)}</select></label>
            <div className="mt-5 grid grid-cols-4 gap-1 text-center text-[10px]">{CELLS.map((value) => <button onClick={() => setCell(value)} key={value} className="rounded border px-1 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" style={{ borderColor: value === cell ? "var(--accent)" : "var(--border)", background: value === cell ? "var(--accent)" : occupiedCells.has(value) ? "#f1f3f2" : "white", color: value === cell ? "white" : "var(--text)" }}>{value}</button>)}</div>
          </Card>

          <Card className="p-0 overflow-hidden"><div className="p-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}><h2 className="panel-title">Остатки и закупка</h2><span className="text-sm text-[var(--accent)]">Все</span></div><div className="p-2">{critical.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 border-b p-3 last:border-0" style={{ borderColor: "var(--border)" }}><span className="text-sm"><b className="block">{item.name}</b><span className="text-xs text-red-500">Мин. остаток: {item.minQty}</span></span><b className="text-red-500">{item.qty}</b></div>)}</div><div className="p-3"><Button variant="secondary"><span className="inline-flex items-center gap-2"><IconShoppingCart size={18} /> Перейти к закупкам</span></Button></div></Card>
        </div>
        {notice && <div className="mt-4 rounded-lg border border-[#b9dfc8] bg-[#edf7f0] px-4 py-3 text-sm text-[var(--accent)]">{notice}</div>}
        <div className="mt-4"><Button onClick={receive}><span className="inline-flex items-center gap-2"><IconPlus size={18} /> Оприходовать на склад</span></Button></div>
        <Card className="mt-4 p-0 overflow-hidden"><div className="flex items-center justify-between p-4"><h2 className="panel-title">Последние движения по складу</h2><span className="text-sm text-[var(--accent)]">Все движения</span></div><div className="overflow-auto"><table className="app-table min-w-[720px]"><thead><tr><th>Дата и время</th><th>Запчасть</th><th>Операция</th><th className="text-right">Кол-во</th><th>Куда</th><th>Сотрудник</th></tr></thead><tbody>{stockMovements.map((movement) => { const item = stock.find((i) => i.id === movement.itemId); return <tr key={movement.id}><td>{formatDateTime(movement.date)}</td><td><b>{item?.name || "—"}</b><div className="muted text-xs">{item?.sku}</div></td><td><span className="rounded-full bg-[#e8f5ed] px-2 py-1 text-xs text-[var(--accent)]">{movement.operation}</span></td><td className="text-right">{movement.qty} {item?.unit}</td><td>{movement.to || movement.from || "—"}</td><td>{movement.employee}</td></tr>; })}</tbody></table></div></Card>
      </Page>
    </>
  );
}
