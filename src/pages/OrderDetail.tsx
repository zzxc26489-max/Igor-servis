import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { IconArrowLeft, IconCar, IconFileDescription, IconNotes, IconPrinter, IconReceipt2, IconUser } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { useToast } from "../components/Toast";
import { Button, Card, Page, StatusBadge, TopBar } from "../components/ui";
import { formatDateTime, formatMoney } from "../lib/format";
import type { OrderLinePart, OrderLineWork, OrderStatus } from "../types";

const STATUS_FLOW: OrderStatus[] = ["запись", "диагностика", "в работе", "готово", "выдан"];
const CUSTOM_SERVICE = "custom";

export default function OrderDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const {
    orders,
    clients,
    vehicles,
    services,
    stock,
    employees,
    company,
    settings,
    updateOrder,
    updateStockItem,
    addStockMovement,
  } = useAppStore();
  const { showToast } = useToast();
  const order = orders.find((o) => o.id === orderId);

  const [addingWork, setAddingWork] = useState(false);
  const [workServiceId, setWorkServiceId] = useState("");
  const [workCustomName, setWorkCustomName] = useState("");
  const [workCustomPrice, setWorkCustomPrice] = useState("");
  const [workQty, setWorkQty] = useState("1");
  const [workExecutor, setWorkExecutor] = useState("");

  const [addingPart, setAddingPart] = useState(false);
  const [partItemId, setPartItemId] = useState("");
  const [partQty, setPartQty] = useState("1");
  const [partPrice, setPartPrice] = useState("");
  const [partError, setPartError] = useState("");

  const [editingDiscount, setEditingDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState("0");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [targetTotal, setTargetTotal] = useState("");

  if (!order) {
    return (
      <Page>
        <p>Заказ-наряд не найден.</p>
        <Link to="/orders" style={{ color: "var(--accent)" }}>
          Назад к списку
        </Link>
      </Page>
    );
  }

  const client = clients.find((c) => c.id === order.clientId);
  const vehicle = vehicles.find((v) => v.id === order.vehicleId);

  const worksTotal = order.works.reduce((s, w) => s + w.price * w.qty, 0);
  const partsTotal = order.parts.reduce((s, p) => s + p.price * p.qty, 0);
  const discount = order.discount ?? 0;
  const due = worksTotal + partsTotal - discount;
  const paid = order.paid ?? 0;
  const debt = due - paid;

  const currentStepIndex = STATUS_FLOW.indexOf(order.status);

  function adjustWorkPrices(works: OrderLineWork[], target: number, partsAmount = partsTotal, discountAmount = discount) {
    const targetWorksTotal = target - partsAmount + discountAmount;
    const currentWorksTotal = works.reduce((sum, work) => sum + work.price * work.qty, 0);
    if (targetWorksTotal <= 0 || currentWorksTotal <= 0) return works;
    const ratio = targetWorksTotal / currentWorksTotal;
    return works.map((work) => ({ ...work, price: Math.max(10, Math.round((work.price * ratio) / 10) * 10) }));
  }

  function applyTargetTotal() {
    if (!order) return;
    const target = Number(targetTotal);
    if (!settings.autoPriceAdjustment || target <= 0) return;
    if (order.works.length === 0) {
      showToast("Сначала добавьте хотя бы одну работу", "error");
      return;
    }
    if (target <= partsTotal - discount) {
      showToast("Согласованная сумма должна быть больше стоимости запчастей", "error");
      return;
    }
    updateOrder(order.id, { works: adjustWorkPrices(order.works, target) });
    showToast("Цены работ подогнаны под согласованную сумму");
  }

  function resetWorkForm() {
    setAddingWork(false);
    setWorkServiceId("");
    setWorkCustomName("");
    setWorkCustomPrice("");
    setWorkQty("1");
    setWorkExecutor("");
  }

  function handleAddWork() {
    if (!order) return;
    const qty = Math.max(1, Number(workQty) || 1);
    let name = "";
    let price = 0;
    if (workServiceId === CUSTOM_SERVICE) {
      name = workCustomName.trim();
      price = Number(workCustomPrice) || 0;
      if (!name || price <= 0) return;
    } else {
      const service = services.find((s) => s.id === workServiceId);
      if (!service) return;
      name = service.name;
      price = service.price;
    }
    const newWork: OrderLineWork = {
      id: `work-${Date.now()}`,
      name,
      qty,
      price,
      executor: workExecutor || undefined,
    };
    const nextWorks = [...order.works, newWork];
    const target = Number(targetTotal);
    updateOrder(order.id, { works: settings.autoPriceAdjustment && target > 0 ? adjustWorkPrices(nextWorks, target) : nextWorks });
    resetWorkForm();
    showToast(`Добавлена работа «${name}»`);
  }

  function handleRemoveWork(workId: string) {
    if (!order) return;
    const nextWorks = order.works.filter((w) => w.id !== workId);
    const target = Number(targetTotal);
    updateOrder(order.id, { works: settings.autoPriceAdjustment && target > 0 ? adjustWorkPrices(nextWorks, target) : nextWorks });
    showToast("Работа удалена", "error");
  }

  function resetPartForm() {
    setAddingPart(false);
    setPartItemId("");
    setPartQty("1");
    setPartPrice("");
    setPartError("");
  }

  function handleAddPart() {
    if (!order) return;
    setPartError("");
    const stockItem = stock.find((s) => s.id === partItemId);
    if (!stockItem) return;
    const qty = Math.max(1, Number(partQty) || 1);
    if (qty > stockItem.qty) {
      setPartError(`На складе доступно только ${stockItem.qty} ${stockItem.unit}.`);
      return;
    }
    const price = Number(partPrice) || stockItem.purchasePrice;

    const newPart: OrderLinePart = {
      id: `part-${Date.now()}`,
      name: stockItem.name,
      sku: stockItem.sku,
      qty,
      price,
      availability: "reserved",
    };
    const nextParts = [...order.parts, newPart];
    const target = Number(targetTotal);
    const nextPartsTotal = nextParts.reduce((sum, part) => sum + part.price * part.qty, 0);
    updateOrder(order.id, {
      parts: nextParts,
      works: settings.autoPriceAdjustment && target > 0 ? adjustWorkPrices(order.works, target, nextPartsTotal) : order.works,
    });
    updateStockItem(stockItem.id, { qty: stockItem.qty - qty });
    addStockMovement({
      id: `mv-${Date.now()}`,
      date: new Date().toISOString(),
      itemId: stockItem.id,
      operation: "Резерв",
      qty,
      from: stockItem.cell,
      employee: order.advisor || "—",
    });
    resetPartForm();
    showToast(`Добавлена запчасть «${stockItem.name}»`);
  }

  function handleRemovePart(part: OrderLinePart) {
    if (!order) return;
    const nextParts = order.parts.filter((p) => p.id !== part.id);
    const target = Number(targetTotal);
    const nextPartsTotal = nextParts.reduce((sum, item) => sum + item.price * item.qty, 0);
    updateOrder(order.id, {
      parts: nextParts,
      works: settings.autoPriceAdjustment && target > 0 ? adjustWorkPrices(order.works, target, nextPartsTotal) : order.works,
    });
    const stockItem = stock.find((s) => s.sku === part.sku);
    if (stockItem) {
      updateStockItem(stockItem.id, { qty: stockItem.qty + part.qty });
      addStockMovement({
        id: `mv-${Date.now()}`,
        date: new Date().toISOString(),
        itemId: stockItem.id,
        operation: "Возврат",
        qty: part.qty,
        to: stockItem.cell,
        employee: order.advisor || "—",
      });
    }
    showToast("Запчасть возвращена на склад", "error");
  }

  function handleSaveDiscount() {
    if (!order) return;
    const value = Math.max(0, Number(discountInput) || 0);
    const target = Number(targetTotal);
    updateOrder(order.id, {
      discount: value,
      works: settings.autoPriceAdjustment && target > 0 ? adjustWorkPrices(order.works, target, partsTotal, value) : order.works,
    });
    setEditingDiscount(false);
    showToast("Скидка обновлена");
  }

  function handleAcceptPayment(amount: number) {
    if (!order || amount <= 0) return;
    updateOrder(order.id, { paid: (order.paid ?? 0) + amount });
    setPaymentAmount("");
    showToast(`Принята оплата ${formatMoney(amount)}`);
  }

  return (
    <>
      <TopBar
        title={`Заказ-наряд ${order.number}`}
        subtitle={`Создан ${formatDateTime(order.createdAt)}${order.advisor ? ` · Мастер-приёмщик: ${order.advisor}` : ""}`}
        hideNewRecordOnMobile
        actions={
          <>
            <Link to={`/orders/${order.id}/act`} aria-label="Открыть акт работ" title="Акт работ">
              <Button variant="secondary" size="sm">
                <IconFileDescription size={18} /> <span className="hidden sm:inline">Акт работ</span>
              </Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <IconPrinter size={18} /> <span className="hidden sm:inline">Печать</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
              <IconArrowLeft size={18} /> <span className="hidden sm:inline">Назад</span>
            </Button>
          </>
        }
      />
      <Page>
        <div className="mb-4 hidden print:block">
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--border)" }}>
            <div>
              <div className="text-lg font-bold">{company.shortName}</div>
              <div className="text-sm">{company.address}</div>
              <div className="text-sm">{company.phone} · {company.workHours}</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold">Заказ-наряд {order.number}</div>
              <div className="text-sm">{formatDateTime(order.createdAt)}</div>
            </div>
          </div>
        </div>

        <Card className="mb-3 overflow-hidden p-0">
          <div className="grid grid-cols-1 divide-y divide-[#e5e8e5] lg:grid-cols-3 lg:divide-x lg:divide-y-0 print:grid-cols-3 print:divide-x print:divide-y-0">
            <div className="flex min-w-0 items-center gap-3 p-3.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#e9f5ed] text-[var(--accent)]">
                <IconUser size={20} />
              </div>
              <div className="min-w-0">
                <div className="muted text-[11px]">Клиент</div>
                <div className="truncate text-sm font-semibold">{client?.name}</div>
                <div className="muted truncate text-xs">{client?.phone}</div>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-3 p-3.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#edf4ff] text-[#3978c9]">
                <IconCar size={20} />
              </div>
              <div className="min-w-0">
                <div className="muted text-[11px]">Автомобиль</div>
                <div className="truncate text-sm font-semibold">
                  {vehicle?.make} {vehicle?.model}
                </div>
                <div className="muted truncate text-xs">
                  {vehicle?.plate} {vehicle?.mileage ? `· ${vehicle.mileage.toLocaleString("ru-RU")} км` : ""}
                </div>
              </div>
            </div>
            <div className="flex min-h-16 items-center justify-between p-3.5">
              <div>
                <div className="muted mb-1 text-[11px]">Статус заказа</div>
                <StatusBadge status={order.status} />
              </div>
            </div>
          </div>
        </Card>

        <Card className="mb-3 p-3 print:hidden">
          <div className="flex items-center justify-between">
            {STATUS_FLOW.map((step, idx) => (
              <div key={step} className="relative flex min-w-0 flex-1 flex-col items-center">
                {idx > 0 && (
                  <div
                    className="absolute right-1/2 top-3 h-0.5 w-full"
                    style={{ background: idx <= currentStepIndex ? "var(--accent)" : "var(--border)" }}
                  />
                )}
                <button
                  onClick={() => {
                    updateOrder(order.id, { status: step });
                    showToast(`Статус изменён: «${step}»`);
                  }}
                  className="relative z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-xs font-semibold text-white transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                  style={{ background: idx <= currentStepIndex ? "var(--accent)" : "#cfd3da" }}
                  aria-label={`Установить статус «${step}»`}
                >
                  {idx <= currentStepIndex ? "✓" : idx + 1}
                </button>
                <div className="mt-1.5 max-w-full truncate px-0.5 text-center text-[10px] capitalize sm:text-xs">{step}</div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="panel-title">Работы и услуги</h2>
              {!addingWork && (
                <button
                  onClick={() => setAddingWork(true)}
                  className="text-sm font-medium rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--accent)] print:hidden"
                  style={{ color: "var(--accent)" }}
                >
                  + Добавить работу
                </button>
              )}
            </div>
            <table className="app-table">
              <thead>
                <tr>
                  <th>Наименование</th>
                  <th className="text-right">Сумма</th>
                  <th className="w-6 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {order.works.map((w) => (
                  <tr key={w.id} className="group">
                    <td>
                      {w.name}
                      {w.qty > 1 && <span className="muted"> × {w.qty}</span>}
                      {w.executor && <div className="muted text-xs">Исполнитель: {w.executor}</div>}
                    </td>
                    <td className="whitespace-nowrap text-right">{formatMoney(w.price * w.qty)}</td>
                    <td className="text-right">
                      <button
                        onClick={() => handleRemoveWork(w.id)}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)] transition-opacity text-xs px-1 rounded"
                        style={{ color: "var(--danger)" }}
                        aria-label={`Удалить работу «${w.name}»`}
                        title="Удалить"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                {order.works.length === 0 && !addingWork && (
                  <tr>
                    <td colSpan={3} className="py-3 text-center muted">
                      Работы не добавлены
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {addingWork && (
              <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="field-control mb-2">
                  <select value={workServiceId} onChange={(e) => setWorkServiceId(e.target.value)}>
                    <option value="">Выберите услугу…</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {formatMoney(s.price)}
                      </option>
                    ))}
                    <option value={CUSTOM_SERVICE}>Другое (ввести вручную)</option>
                  </select>
                </div>
                {workServiceId === CUSTOM_SERVICE && (
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="field-control">
                      <input
                        placeholder="Название работы"
                        value={workCustomName}
                        onChange={(e) => setWorkCustomName(e.target.value)}
                      />
                    </div>
                    <div className="field-control">
                      <input
                        placeholder="Цена, ₽"
                        inputMode="numeric"
                        value={workCustomPrice}
                        onChange={(e) => setWorkCustomPrice(e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="field-control">
                    <input
                      placeholder="Количество"
                      inputMode="numeric"
                      value={workQty}
                      onChange={(e) => setWorkQty(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                  <div className="field-control">
                    <select value={workExecutor} onChange={(e) => setWorkExecutor(e.target.value)}>
                      <option value="">Исполнитель не указан</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.name}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={resetWorkForm}>
                    Отмена
                  </Button>
                  <Button onClick={handleAddWork}>Добавить</Button>
                </div>
              </div>
            )}
            <div className="text-right font-semibold mt-3">Итого за работы: {formatMoney(worksTotal)}</div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="panel-title">Запчасти</h2>
              {!addingPart && (
                <button
                  onClick={() => setAddingPart(true)}
                  className="text-sm font-medium rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--accent)] print:hidden"
                  style={{ color: "var(--accent)" }}
                >
                  + Добавить запчасть
                </button>
              )}
            </div>
            <table className="app-table">
              <thead>
                <tr>
                  <th>Наименование</th>
                  <th className="text-right">Сумма</th>
                  <th className="w-6 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {order.parts.map((p) => (
                  <tr key={p.id} className="group">
                    <td>
                      {p.name}
                      {p.qty > 1 && <span className="muted"> × {p.qty}</span>}
                      {p.sku && <div className="muted text-xs">Артикул: {p.sku}</div>}
                    </td>
                    <td className="whitespace-nowrap text-right">{formatMoney(p.price * p.qty)}</td>
                    <td className="text-right">
                      <button
                        onClick={() => handleRemovePart(p)}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)] transition-opacity text-xs px-1 rounded"
                        style={{ color: "var(--danger)" }}
                        aria-label={`Убрать запчасть «${p.name}»`}
                        title="Убрать (вернуть на склад)"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                {order.parts.length === 0 && !addingPart && (
                  <tr>
                    <td colSpan={3} className="py-3 text-center muted">
                      Запчасти не добавлены
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {addingPart && (
              <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="field-control mb-2">
                  <select
                    value={partItemId}
                    onChange={(e) => {
                      setPartItemId(e.target.value);
                      setPartError("");
                      const item = stock.find((s) => s.id === e.target.value);
                      setPartPrice(item ? String(item.purchasePrice) : "");
                    }}
                  >
                    <option value="">Выберите запчасть со склада…</option>
                    {stock.map((s) => (
                      <option key={s.id} value={s.id} disabled={s.qty === 0}>
                        {s.name} — в наличии {s.qty} {s.unit}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="field-control">
                    <input
                      placeholder="Количество"
                      inputMode="numeric"
                      value={partQty}
                      onChange={(e) => {
                        setPartQty(e.target.value.replace(/\D/g, ""));
                        setPartError("");
                      }}
                    />
                  </div>
                  <div className="field-control">
                    <input
                      placeholder="Цена для клиента, ₽"
                      inputMode="numeric"
                      value={partPrice}
                      onChange={(e) => setPartPrice(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                </div>
                {partError && (
                  <div className="text-xs mb-2" style={{ color: "var(--danger)" }}>
                    {partError}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={resetPartForm}>
                    Отмена
                  </Button>
                  <Button onClick={handleAddPart}>Добавить</Button>
                </div>
              </div>
            )}
            <div className="text-right font-semibold mt-3">Итого за запчасти: {formatMoney(partsTotal)}</div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <h2 className="panel-title mb-2 flex items-center gap-2"><IconNotes size={18} /> Заметки</h2>
            <p className="text-sm muted">
              {order.notes || "Нет заметок"}
            </p>
          </Card>

          <Card>
            <h2 className="panel-title mb-3 flex items-center gap-2"><IconReceipt2 size={18} /> Итог по заказу</h2>
            <div className="flex justify-between text-sm mb-1">
              <span>Работы</span>
              <span>{formatMoney(worksTotal)}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span>Запчасти</span>
              <span>{formatMoney(partsTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm mb-1">
              {editingDiscount ? (
                <>
                  <span>Скидка</span>
                  <span className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveDiscount()}
                      onBlur={handleSaveDiscount}
                      className="w-20 rounded border px-2 py-0.5 text-right text-sm"
                      style={{ borderColor: "var(--border)" }}
                      inputMode="numeric"
                    />
                    ₽
                  </span>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setDiscountInput(String(discount));
                      setEditingDiscount(true);
                    }}
                    className="underline decoration-dotted print:no-underline"
                    style={{ color: "var(--text)" }}
                  >
                    Скидка
                  </button>
                  <span style={{ color: discount > 0 ? "var(--danger)" : undefined }}>
                    {discount > 0 ? `-${formatMoney(discount)}` : "нет"}
                  </span>
                </>
              )}
            </div>
            <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2" style={{ borderColor: "var(--border)" }}>
              <span>К оплате</span>
              <span>{formatMoney(due)}</span>
            </div>
            {settings.autoPriceAdjustment && (
              <div className="mt-3 rounded-lg border bg-[#f7faf8] p-3 print:hidden" style={{ borderColor: "var(--border)" }}>
                <label className="text-xs font-medium">Согласованная сумма заказа</label>
                <div className="mt-2 flex gap-2">
                  <input
                    value={targetTotal}
                    onChange={(event) => setTargetTotal(event.target.value.replace(/\D/g, ""))}
                    onKeyDown={(event) => event.key === "Enter" && applyTargetTotal()}
                    placeholder={String(due)}
                    inputMode="numeric"
                    className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)" }}
                  />
                  <Button variant="secondary" onClick={applyTargetTotal}>Подогнать</Button>
                </div>
                <p className="muted mt-2 text-xs">Пересчитываются только цены работ, с округлением до 10 ₽.</p>
              </div>
            )}
            <div className="flex justify-between text-sm mt-1">
              <span>Оплачено</span>
              <span>{formatMoney(paid)}</span>
            </div>
            <div className="flex justify-between text-sm" style={{ color: debt > 0 ? "var(--danger)" : "var(--accent)" }}>
              <span>Долг</span>
              <span>{formatMoney(debt)}</span>
            </div>
            {debt > 0 && (
              <div className="mt-3 flex gap-2 print:hidden">
                <input
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value.replace(/\D/g, ""))}
                  placeholder={String(debt)}
                  inputMode="numeric"
                  className="w-24 rounded-lg border px-2 py-2 text-sm"
                  style={{ borderColor: "var(--border)" }}
                  aria-label="Сумма оплаты"
                />
                <Button onClick={() => handleAcceptPayment(paymentAmount ? Number(paymentAmount) : debt)}>
                  Принять оплату
                </Button>
              </div>
            )}
          </Card>
        </div>
      </Page>
    </>
  );
}
