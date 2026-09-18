import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  IconArrowLeft, IconCalendarTime, IconCar, IconCheck, IconClipboardText, IconFileDescription,
  IconNotes, IconPrinter, IconTool, IconTrash, IconUser,
} from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { createId } from "../lib/id";
import { useToast } from "../components/Toast";
import { Button, Card, Modal, Page, StatusBadge, TopBar } from "../components/ui";
import { formatDate, formatDateTime, formatMoney } from "../lib/format";
import type { OrderLinePart, OrderLineWork, OrderStatus } from "../types";

const STATUS_FLOW: OrderStatus[] = ["запись", "диагностика", "в работе", "готово", "выдан"];
const CUSTOM_SERVICE = "custom";
const TABS = ["Работы и запчасти", "Приёмка", "Оплаты", "Документы"] as const;
type Tab = (typeof TABS)[number];

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
    lifts,
    company,
    settings,
    updateOrder,
    deleteOrder,
    updateStockItem,
    addStockMovement,
    updateVehicle,
  } = useAppStore();
  const { showToast } = useToast();
  const order = orders.find((o) => o.id === orderId);

  const [tab, setTab] = useState<Tab>("Работы и запчасти");

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
  const [payOpen, setPayOpen] = useState(false);
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
  const lift = lifts.find((l) => l.id === order.liftId);

  const worksTotal = order.works.reduce((s, w) => s + w.price * w.qty, 0);
  const partsTotal = order.parts.reduce((s, p) => s + p.price * p.qty, 0);
  const discount = order.discount ?? 0;
  const clientDiscount = client?.discountPercent
    ? Math.round(((worksTotal + partsTotal) * client.discountPercent) / 100)
    : 0;
  const due = worksTotal + partsTotal - discount;
  const paid = order.paid ?? 0;
  const debt = due - paid;

  const currentStepIndex = STATUS_FLOW.indexOf(order.status);
  const nextStatus = currentStepIndex >= 0 && currentStepIndex < STATUS_FLOW.length - 1
    ? STATUS_FLOW[currentStepIndex + 1]
    : null;
  const nextStatusLabel =
    nextStatus === "готово" ? "Завершить работы" : nextStatus === "выдан" ? "Выдать автомобиль" : nextStatus ? `В статус «${nextStatus}»` : null;

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
    const newWork: OrderLineWork = { id: createId("work"), name, qty, price, executor: workExecutor || undefined };
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
    const newPart: OrderLinePart = { id: createId("part"), name: stockItem.name, sku: stockItem.sku, qty, price, availability: "reserved" };
    const nextParts = [...order.parts, newPart];
    const target = Number(targetTotal);
    const nextPartsTotal = nextParts.reduce((sum, part) => sum + part.price * part.qty, 0);
    updateOrder(order.id, {
      parts: nextParts,
      works: settings.autoPriceAdjustment && target > 0 ? adjustWorkPrices(order.works, target, nextPartsTotal) : order.works,
    });
    updateStockItem(stockItem.id, { qty: stockItem.qty - qty });
    addStockMovement({
      id: createId("mv"),
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
        id: createId("mv"),
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

  function handleDeleteOrder() {
    if (!order) return;
    if (!window.confirm(`Удалить заказ-наряд ${order.number}? Действие нельзя отменить.`)) return;
    deleteOrder(order.id);
    showToast(`Заказ-наряд ${order.number} удалён`, "error");
    navigate("/orders");
  }

  function handleAcceptPayment(amount: number) {
    if (!order || amount <= 0) return;
    updateOrder(order.id, { paid: (order.paid ?? 0) + amount });
    setPaymentAmount("");
    setPayOpen(false);
    showToast(`Принята оплата ${formatMoney(amount)}`);
  }

  function handleAdvance() {
    if (!order || !nextStatus) return;
    const patch: Parameters<typeof updateOrder>[1] =
      nextStatus === "готово" ? { status: nextStatus, completedAt: new Date().toISOString() } : { status: nextStatus };
    updateOrder(order.id, patch);
    showToast(`Статус изменён: «${nextStatus}»`);
  }

  const carTitle = vehicle ? `${vehicle.make} ${vehicle.model}` : order.number;

  return (
    <>
      <TopBar
        breadcrumbs={[{ label: "Заказ-наряды", to: "/orders" }, { label: order.number }]}
        title={carTitle}
        titleChip={
          vehicle?.plate ? (
            <span
              className="rounded-lg border px-2.5 py-1 text-sm font-semibold tracking-wide"
              style={{ borderColor: "var(--border)", background: "var(--bg)" }}
            >
              {vehicle.plate}
            </span>
          ) : undefined
        }
        subtitle={`Заказ-наряд ${order.number} · ${formatDate(order.createdAt)}${order.advisor ? ` · Приёмщик: ${order.advisor}` : ""}`}
        actions={
          <>
            <StatusBadge status={order.status} />
            {nextStatusLabel && (
              <Button onClick={handleAdvance}>
                <IconCheck size={18} /> {nextStatusLabel}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => navigate(-1)} aria-label="Назад" title="Назад">
              <IconArrowLeft size={18} />
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

        <div
          className="mb-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border shadow-[0_2px_8px_rgba(23,34,30,0.045)] sm:grid-cols-2 lg:grid-cols-4"
          style={{ background: "var(--border)", borderColor: "var(--border)" }}
        >
          <InfoCell icon={<IconUser size={18} />} tone="#e9f5ed" color="var(--accent)" label="Клиент">
            {client ? (
              <>
                <Link to={`/clients/${client.id}`} className="block truncate text-sm font-semibold hover:text-[var(--accent)]">{client.name}</Link>
                <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="muted block truncate text-xs hover:text-[var(--accent)]">{client.phone}</a>
              </>
            ) : (
              <div className="text-sm font-semibold">—</div>
            )}
          </InfoCell>
          <InfoCell icon={<IconCar size={18} />} tone="#edf4ff" color="#3978c9" label="Автомобиль">
            <div className="truncate text-sm font-semibold">{carTitle}</div>
            <div className="muted truncate text-xs">
              {vehicle?.plate}
              {vehicle?.mileage ? ` · ${vehicle.mileage.toLocaleString("ru-RU")} км` : ""}
            </div>
          </InfoCell>
          <InfoCell icon={<IconTool size={18} />} tone="#f5f0ff" color="#6656b8" label="Подъёмник">
            <div className="truncate text-sm font-semibold">{lift?.name ?? "Не назначен"}</div>
            <div className="muted truncate text-xs">
              {order.scheduledStart ? `${order.scheduledStart}–${order.scheduledEnd ?? "…"}` : "Время не задано"}
            </div>
          </InfoCell>
          <InfoCell icon={<IconCalendarTime size={18} />} tone="#fdf3e0" color="var(--warning)" label="Обещано клиенту">
            <div className="truncate text-sm font-semibold">
              {order.plannedAt ? formatDate(order.plannedAt) : formatDate(order.createdAt)}
              {order.scheduledEnd ? `, ${order.scheduledEnd}` : ""}
            </div>
            <div className="muted truncate text-xs">
              {order.guaranteeMonths ? `Гарантия ${order.guaranteeMonths} мес.` : "Гарантия не указана"}
            </div>
          </InfoCell>
        </div>

        <Card className="mb-4 p-3 print:hidden">
          <div className="flex items-center justify-between">
            {STATUS_FLOW.map((step, idx) => (
              <div key={step} className="relative flex min-w-0 flex-1 flex-col items-center">
                {idx > 0 && (
                  <div
                    className="absolute right-1/2 top-5 h-0.5 w-full sm:top-3"
                    style={{ background: idx <= currentStepIndex ? "var(--accent)" : "var(--border)" }}
                  />
                )}
                <button
                  onClick={() => {
                    updateOrder(order.id, { status: step });
                    showToast(`Статус изменён: «${step}»`);
                  }}
                  className="relative z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-xs font-semibold text-white transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 sm:h-7 sm:w-7"
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

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl border bg-white p-1 print:hidden" style={{ borderColor: "var(--border)" }}>
              {TABS.map((item) => (
                <button
                  key={item}
                  onClick={() => setTab(item)}
                  className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition"
                  style={{
                    background: tab === item ? "var(--accent-soft)" : "transparent",
                    color: tab === item ? "var(--accent-strong)" : "var(--text-muted)",
                  }}
                >
                  {item}
                </button>
              ))}
            </div>

            {/* Работы и запчасти остаются в DOM: они нужны при печати с любой вкладки. */}
            <div className={tab === "Работы и запчасти" ? "space-y-4" : "hidden space-y-4 print:block"}>
                <Card className="overflow-hidden p-0">
                  <div className="flex items-center justify-between p-4">
                    <h2 className="panel-title">Работы</h2>
                    {!addingWork && (
                      <button onClick={() => setAddingWork(true)} className="text-sm font-semibold print:hidden" style={{ color: "var(--accent)" }}>
                        + Добавить работу
                      </button>
                    )}
                  </div>
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th>Наименование</th>
                        <th className="w-20 text-right">Кол-во</th>
                        <th className="w-28 text-right">Сумма</th>
                        <th className="w-8 print:hidden" />
                      </tr>
                    </thead>
                    <tbody>
                      {order.works.map((w) => (
                        <tr key={w.id} className="group">
                          <td>
                            {w.name}
                            {w.executor && <div className="muted text-xs">Исполнитель: {w.executor}</div>}
                          </td>
                          <td className="text-right tabular-nums">{w.qty}</td>
                          <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(w.price * w.qty)}</td>
                          <td className="text-right print:hidden">
                            <button
                              onClick={() => handleRemoveWork(w.id)}
                              className="rounded px-1 text-xs opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
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
                        <tr><td colSpan={4} className="muted py-3 text-center">Работы не добавлены</td></tr>
                      )}
                    </tbody>
                  </table>

                  {addingWork && (
                    <div className="m-4 mt-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                      <div className="field-control mb-2">
                        <select value={workServiceId} onChange={(e) => setWorkServiceId(e.target.value)} aria-label="Услуга">
                          <option value="">Выберите услугу…</option>
                          {services.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} · {formatMoney(s.price)}</option>
                          ))}
                          <option value={CUSTOM_SERVICE}>Другое (ввести вручную)</option>
                        </select>
                      </div>
                      {workServiceId === CUSTOM_SERVICE && (
                        <div className="mb-2 grid grid-cols-2 gap-2">
                          <div className="field-control">
                            <input placeholder="Название работы" value={workCustomName} onChange={(e) => setWorkCustomName(e.target.value)} />
                          </div>
                          <div className="field-control">
                            <input placeholder="Цена, ₽" inputMode="numeric" value={workCustomPrice} onChange={(e) => setWorkCustomPrice(e.target.value.replace(/\D/g, ""))} />
                          </div>
                        </div>
                      )}
                      <div className="mb-3 grid grid-cols-2 gap-2">
                        <div className="field-control">
                          <input placeholder="Количество" inputMode="numeric" value={workQty} onChange={(e) => setWorkQty(e.target.value.replace(/\D/g, ""))} aria-label="Количество" />
                        </div>
                        <div className="field-control">
                          <select value={workExecutor} onChange={(e) => setWorkExecutor(e.target.value)} aria-label="Исполнитель">
                            <option value="">Исполнитель не указан</option>
                            {employees.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={resetWorkForm}>Отмена</Button>
                        <Button onClick={handleAddWork}>Добавить</Button>
                      </div>
                    </div>
                  )}
                  <div className="border-t bg-[#fafbfa] p-4 text-right text-sm font-semibold" style={{ borderColor: "var(--border)" }}>
                    Итого за работы: {formatMoney(worksTotal)}
                  </div>
                </Card>

                <Card className="overflow-hidden p-0">
                  <div className="flex items-center justify-between p-4">
                    <h2 className="panel-title">Запчасти</h2>
                    {!addingPart && (
                      <button onClick={() => setAddingPart(true)} className="text-sm font-semibold print:hidden" style={{ color: "var(--accent)" }}>
                        + Со склада
                      </button>
                    )}
                  </div>
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th>Наименование</th>
                        <th className="w-20 text-right">Кол-во</th>
                        <th className="w-28 text-right">Сумма</th>
                        <th className="w-8 print:hidden" />
                      </tr>
                    </thead>
                    <tbody>
                      {order.parts.map((p) => (
                        <tr key={p.id} className="group">
                          <td>
                            {p.name}
                            {p.sku && <div className="muted text-xs">Артикул: {p.sku}</div>}
                          </td>
                          <td className="text-right tabular-nums">{p.qty}</td>
                          <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(p.price * p.qty)}</td>
                          <td className="text-right print:hidden">
                            <button
                              onClick={() => handleRemovePart(p)}
                              className="rounded px-1 text-xs opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
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
                        <tr><td colSpan={4} className="muted py-3 text-center">Запчасти не добавлены</td></tr>
                      )}
                    </tbody>
                  </table>

                  {addingPart && (
                    <div className="m-4 mt-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                      <div className="field-control mb-2">
                        <select
                          value={partItemId}
                          aria-label="Запчасть со склада"
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
                              {s.name} — в наличии {s.qty} {s.unit} · {s.cell}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mb-2 grid grid-cols-2 gap-2">
                        <div className="field-control">
                          <input
                            placeholder="Количество"
                            inputMode="numeric"
                            aria-label="Количество запчастей"
                            value={partQty}
                            onChange={(e) => { setPartQty(e.target.value.replace(/\D/g, "")); setPartError(""); }}
                          />
                        </div>
                        <div className="field-control">
                          <input
                            placeholder="Цена для клиента, ₽"
                            inputMode="numeric"
                            aria-label="Цена для клиента"
                            value={partPrice}
                            onChange={(e) => setPartPrice(e.target.value.replace(/\D/g, ""))}
                          />
                        </div>
                      </div>
                      {partError && <div className="mb-2 text-xs" style={{ color: "var(--danger)" }}>{partError}</div>}
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={resetPartForm}>Отмена</Button>
                        <Button onClick={handleAddPart}>Добавить</Button>
                      </div>
                    </div>
                  )}
                  <div className="border-t bg-[#fafbfa] p-4 text-right text-sm font-semibold" style={{ borderColor: "var(--border)" }}>
                    Итого за запчасти: {formatMoney(partsTotal)}
                  </div>
                </Card>
            </div>

            {tab === "Приёмка" && (
              <Card>
                <h2 className="panel-title mb-3 flex items-center gap-2"><IconClipboardText size={18} /> Приёмка автомобиля</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="muted mb-1 block">Жалоба клиента</span>
                    <div className="field-control">
                      <textarea rows={3} defaultValue={order.complaint || ""} onBlur={(e) => updateOrder(order.id, { complaint: e.target.value })} placeholder="Со слов клиента" />
                    </div>
                  </label>
                  <label className="block text-sm">
                    <span className="muted mb-1 block">Результат диагностики</span>
                    <div className="field-control">
                      <textarea rows={3} defaultValue={order.diagnosis || ""} onBlur={(e) => updateOrder(order.id, { diagnosis: e.target.value })} placeholder="Что выявлено" />
                    </div>
                  </label>
                  <label className="block text-sm">
                    <span className="muted mb-1 block">Внешние дефекты</span>
                    <div className="field-control">
                      <textarea rows={3} defaultValue={order.defects || ""} onBlur={(e) => updateOrder(order.id, { defects: e.target.value })} placeholder="Царапины, сколы и т.п." />
                    </div>
                  </label>
                  <div className="space-y-3">
                    <label className="block text-sm">
                      <span className="muted mb-1 block">Гарантия, мес.</span>
                      <div className="field-control">
                        <input inputMode="numeric" defaultValue={order.guaranteeMonths ?? ""} onBlur={(e) => updateOrder(order.id, { guaranteeMonths: Number(e.target.value.replace(/\D/g, "")) || undefined })} placeholder="Например, 6" />
                      </div>
                    </label>
                    <label className="block text-sm">
                      <span className="muted mb-1 block">Пробег при приёмке, км</span>
                      <div className="field-control">
                        <input
                          inputMode="numeric"
                          defaultValue={vehicle?.mileage ?? ""}
                          onBlur={(event) => {
                            const mileage = Number(event.target.value.replace(/\D/g, ""));
                            if (vehicle && mileage > 0 && mileage !== vehicle.mileage) {
                              updateVehicle(vehicle.id, { mileage });
                              showToast("Пробег обновлён в карточке автомобиля");
                            }
                          }}
                          placeholder="Например, 82000"
                        />
                      </div>
                    </label>
                  </div>
                </div>
              </Card>
            )}

            {tab === "Оплаты" && (
              <Card className="overflow-hidden p-0">
                <div className="p-4">
                  <h2 className="panel-title">Оплаты по заказу</h2>
                </div>
                <table className="app-table">
                  <tbody>
                    <tr><td>Работы</td><td className="text-right tabular-nums">{formatMoney(worksTotal)}</td></tr>
                    <tr><td>Запчасти</td><td className="text-right tabular-nums">{formatMoney(partsTotal)}</td></tr>
                    <tr>
                      <td>Скидка</td>
                      <td className="text-right tabular-nums" style={{ color: discount > 0 ? "var(--danger)" : undefined }}>
                        {discount > 0 ? `-${formatMoney(discount)}` : "нет"}
                      </td>
                    </tr>
                    <tr><td className="font-semibold">К оплате</td><td className="text-right font-semibold tabular-nums">{formatMoney(due)}</td></tr>
                    <tr><td>Оплачено</td><td className="text-right tabular-nums">{formatMoney(paid)}</td></tr>
                    <tr>
                      <td className="font-semibold">Осталось</td>
                      <td className="text-right font-semibold tabular-nums" style={{ color: debt > 0 ? "var(--danger)" : "var(--accent)" }}>{formatMoney(debt)}</td>
                    </tr>
                  </tbody>
                </table>
                {debt > 0 && (
                  <div className="border-t p-4 print:hidden" style={{ borderColor: "var(--border)" }}>
                    <Button onClick={() => setPayOpen(true)}>Принять оплату</Button>
                  </div>
                )}
              </Card>
            )}

            {tab === "Документы" && (
              <Card>
                <h2 className="panel-title mb-3">Документы по заказу</h2>
                <div className="flex flex-wrap gap-2">
                  <Link to={`/orders/${order.id}/act`}>
                    <Button variant="secondary"><IconFileDescription size={18} /> Акт выполненных работ</Button>
                  </Link>
                  <Button variant="secondary" onClick={() => window.print()}><IconPrinter size={18} /> Печать заказ-наряда</Button>
                </div>
                <p className="muted mt-3 text-sm">Акт печатается в альбомной ориентации и старается уместиться на один лист.</p>
                <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                  <button
                    onClick={handleDeleteOrder}
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition hover:bg-[#fff7f7]"
                    style={{ borderColor: "#f1c2c2", color: "var(--danger)" }}
                  >
                    <IconTrash size={16} /> Удалить заказ-наряд
                  </button>
                </div>
              </Card>
            )}
          </div>

          <div className="hidden min-w-0 space-y-4 xl:block">
            <Card className="xl:sticky xl:top-20">
              <div className="muted text-xs font-semibold uppercase tracking-[.07em]">Осталось оплатить</div>
              <div className="mt-1 text-[32px] font-bold leading-none tabular-nums" style={{ color: debt > 0 ? "var(--text)" : "var(--accent)" }}>
                {formatMoney(debt)}
              </div>
              <div className="muted mt-1 text-sm">Всего по заказу {formatMoney(due)} · оплачено {formatMoney(paid)}</div>

              <div className="mt-3 space-y-1 border-t pt-3 text-sm" style={{ borderColor: "var(--border)" }}>
                <div className="flex justify-between"><span className="muted">Работы</span><span className="tabular-nums">{formatMoney(worksTotal)}</span></div>
                <div className="flex justify-between"><span className="muted">Запчасти</span><span className="tabular-nums">{formatMoney(partsTotal)}</span></div>
                <div className="flex items-center justify-between">
                  {editingDiscount ? (
                    <>
                      <span className="muted">Скидка</span>
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
                          aria-label="Скидка, ₽"
                        />
                        ₽
                      </span>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setDiscountInput(String(discount)); setEditingDiscount(true); }}
                        className="muted underline decoration-dotted"
                      >
                        Скидка
                      </button>
                      <span className="tabular-nums" style={{ color: discount > 0 ? "var(--danger)" : undefined }}>
                        {discount > 0 ? `-${formatMoney(discount)}` : "нет"}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {clientDiscount > 0 && discount !== clientDiscount && (
                <button
                  onClick={() => updateOrder(order.id, { discount: clientDiscount })}
                  className="mt-2 w-full rounded-lg border border-dashed px-2 py-1.5 text-xs transition hover:bg-[var(--bg)]"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                >
                  Скидка клиента {client?.discountPercent}% — применить {formatMoney(clientDiscount)}
                </button>
              )}

              {debt > 0 && (
                <Button className="mt-3 w-full justify-center" onClick={() => setPayOpen(true)}>Принять оплату</Button>
              )}
              <Link to={`/orders/${order.id}/act`} className="mt-2 block">
                <Button variant="secondary" className="w-full justify-center"><IconFileDescription size={18} /> Акт работ</Button>
              </Link>

              {settings.autoPriceAdjustment && (
                <div className="mt-3 rounded-lg border bg-[#f7faf8] p-3" style={{ borderColor: "var(--border)" }}>
                  <label className="text-xs font-semibold">Подогнать сумму заказа</label>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={targetTotal}
                      onChange={(event) => setTargetTotal(event.target.value.replace(/\D/g, ""))}
                      onKeyDown={(event) => event.key === "Enter" && applyTargetTotal()}
                      placeholder={String(due)}
                      inputMode="numeric"
                      aria-label="Согласованная сумма"
                      className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm"
                      style={{ borderColor: "var(--border)" }}
                    />
                    <Button variant="secondary" onClick={applyTargetTotal}>ОК</Button>
                  </div>
                  <p className="muted mt-2 text-xs">Пересчитываются только цены работ, с округлением до 10 ₽.</p>
                </div>
              )}

              <label className="mt-3 block text-sm">
                <span className="muted mb-1 flex items-center gap-1.5"><IconNotes size={14} /> Договорённость с клиентом</span>
                <div className="field-control">
                  <textarea rows={3} defaultValue={order.notes || ""} onBlur={(e) => updateOrder(order.id, { notes: e.target.value })} placeholder="Не попадает в акт для клиента" />
                </div>
              </label>
            </Card>
          </div>
        </div>

        {/* Место под мобильную панель оплаты, чтобы она не накрывала контент. */}
        <div className="h-16 xl:hidden print:hidden" />

        <div className="hidden print:block">
          <div className="mt-4 text-sm">
            <div><b>Жалоба клиента:</b> {order.complaint || "—"}</div>
            <div><b>Диагностика:</b> {order.diagnosis || "—"}</div>
            <div><b>Внешние дефекты:</b> {order.defects || "—"}</div>
            <div><b>К оплате:</b> {formatMoney(due)} · <b>Оплачено:</b> {formatMoney(paid)} · <b>Долг:</b> {formatMoney(debt)}</div>
          </div>
        </div>
      </Page>

      <div
        className="fixed inset-x-0 bottom-16 z-20 flex items-center justify-between gap-3 border-t bg-white/95 px-4 py-3 backdrop-blur xl:hidden print:hidden"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="min-w-0">
          <div className="muted text-[11px] uppercase tracking-[.06em]">К оплате</div>
          <div className="text-lg font-bold leading-tight tabular-nums">{formatMoney(debt)}</div>
        </div>
        {debt > 0 ? (
          <Button className="shrink-0" onClick={() => setPayOpen(true)}>Принять оплату</Button>
        ) : (
          <span className="shrink-0 text-sm font-semibold" style={{ color: "var(--accent)" }}>Заказ оплачен</span>
        )}
      </div>

      {payOpen && (
        <Modal title="Принять оплату" subtitle={`${carTitle} · ${order.number}`} onClose={() => setPayOpen(false)}>
          <div className="space-y-3 p-4">
            <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
              <div className="flex justify-between text-sm"><span className="muted">Всего по заказу</span><b className="tabular-nums">{formatMoney(due)}</b></div>
              <div className="flex justify-between text-sm"><span className="muted">Уже оплачено</span><b className="tabular-nums">{formatMoney(paid)}</b></div>
              <div className="mt-1 flex justify-between border-t pt-1 text-sm" style={{ borderColor: "var(--border)" }}>
                <span className="muted">Осталось</span><b className="tabular-nums">{formatMoney(debt)}</b>
              </div>
            </div>
            <label className="block text-sm">
              <span className="muted mb-1 block">Сумма оплаты, ₽</span>
              <div className="field-control">
                <input
                  autoFocus
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleAcceptPayment(paymentAmount ? Number(paymentAmount) : debt)}
                  placeholder={String(debt)}
                  inputMode="numeric"
                  aria-label="Сумма оплаты"
                />
              </div>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPayOpen(false)}>Отмена</Button>
              <Button onClick={() => handleAcceptPayment(paymentAmount ? Number(paymentAmount) : debt)}>Принять</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function InfoCell({
  icon, tone, color, label, children,
}: {
  icon: React.ReactNode; tone: string; color: string; label: string; children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 bg-white p-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: tone, color }}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="muted block text-[11px]">{label}</span>
        {children}
      </span>
    </div>
  );
}
