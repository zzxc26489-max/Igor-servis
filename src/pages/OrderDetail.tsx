import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  IconArrowBackUp, IconArrowLeft, IconCalendarTime, IconCar, IconCheck, IconClipboardText,
  IconFileDescription, IconNotes, IconPrinter, IconStopwatch, IconTool, IconTrash, IconUser,
} from "@tabler/icons-react";
import { formatWorkHours } from "../lib/workday";
import { useAppStore } from "../store/AppStore";
import { createId } from "../lib/id";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Confirm";
import RowMenu from "../components/RowMenu";
import AddPart from "./AddPart";
import AddWork, { type NewWork } from "./AddWork";
import { reservedByItem } from "../lib/stock";
import { moneyInput } from "../lib/formats";
import { margin } from "../lib/price";
import { actualMinutes, deviationPercent, formatDuration, isEstimatedTiming, normMinutes } from "../lib/worktime";
import { Button, Card, Modal, Page, StatusBadge, TopBar } from "../components/ui";
import { formatDate, formatDateTime, formatMoney } from "../lib/format";
import type { OrderLinePart, OrderLineWork, OrderStatus } from "../types";

const STATUS_FLOW: OrderStatus[] = ["запись", "диагностика", "в работе", "готово", "выдан"];
const TABS = ["Работы и запчасти", "Приёмка", "Оплаты", "Документы"] as const;
type Tab = (typeof TABS)[number];

export default function OrderDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const {
    orders,
    clients,
    vehicles,
    stock,
    lifts,
    company,
    settings,
    updateOrder,
    deleteOrder,
    updateVehicle,
    setOrderStatus,
    reservePart,
    releasePart,
    acceptPayment,
  } = useAppStore();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const reserved = reservedByItem(orders, stock);
  const order = orders.find((o) => o.id === orderId);

  const [tab, setTab] = useState<Tab>("Работы и запчасти");
  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  // Подтягиваем активную вкладку в видимую часть только при её смене, и не
  // при первом показе: иначе страница сама прокручивалась к вкладкам.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Горизонтально — внутри ряда вкладок, вертикально страницу не трогаем.
    const node = activeTabRef.current;
    const row = node?.parentElement;
    if (!node || !row) return;
    row.scrollTo({ left: node.offsetLeft - 8, behavior: "smooth" });
  }, [tab]);

  const [addingWork, setAddingWork] = useState(false);
  const [addingPart, setAddingPart] = useState(false);
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

  // Норматив и фактическое время: видно сразу в карточке, а не только в отчётах.
  const orderNorm = normMinutes(order);
  const orderActual = actualMinutes(order);
  const orderDeviation = deviationPercent(orderNorm, orderActual);

  const currentStepIndex = STATUS_FLOW.indexOf(order.status);
  const nextStatus = currentStepIndex >= 0 && currentStepIndex < STATUS_FLOW.length - 1
    ? STATUS_FLOW[currentStepIndex + 1]
    : null;
  const nextStatusLabel =
    nextStatus === "готово" ? "Завершить работы" : nextStatus === "выдан" ? "Выдать автомобиль" : nextStatus ? `В статус «${nextStatus}»` : null;
  // Клиенту приспичило доделать — машину надо вернуть в работу с любого этапа.
  const canReopen = order.status === "готово" || order.status === "выдан";

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

  function handleAddWork(work: NewWork) {
    if (!order) return;
    const newWork: OrderLineWork = { id: createId("work"), ...work };
    const nextWorks = [...order.works, newWork];
    const target = Number(targetTotal);
    updateOrder(order.id, { works: settings.autoPriceAdjustment && target > 0 ? adjustWorkPrices(nextWorks, target) : nextWorks });
    setAddingWork(false);
    showToast(`Добавлена работа «${work.name}»`);
  }

  function handleRemoveWork(workId: string) {
    if (!order) return;
    const nextWorks = order.works.filter((w) => w.id !== workId);
    const target = Number(targetTotal);
    updateOrder(order.id, { works: settings.autoPriceAdjustment && target > 0 ? adjustWorkPrices(nextWorks, target) : nextWorks });
    showToast("Работа удалена", "error");
  }

  async function handleAddPart(itemId: string, qty: number, price: number) {
    if (!order) return;
    setPartError("");
    const stockItem = stock.find((item) => item.id === itemId);
    if (!stockItem) return;
    const free = stockItem.qty - (reserved.get(stockItem.id) ?? 0);
    const profit = margin(stockItem.purchasePrice, price, qty);

    const ok = await confirm({
      title: "Добавить запчасть в заказ",
      question: `Запчасть уйдёт в резерв по заказ-наряду ${order.number}. Со склада она спишется при выдаче автомобиля.`,
      summary: [
        { label: "Запчасть", value: `${stockItem.name} · ${stockItem.sku}` },
        { label: "Ячейка", value: stockItem.cell || "—" },
        { label: "Количество", value: `${qty} ${stockItem.unit}` },
        { label: "Закупка", value: formatMoney(stockItem.purchasePrice * qty) },
        { label: "Цена клиенту", value: formatMoney(price * qty) },
        { label: "Свободно после резерва", value: `${free - qty} ${stockItem.unit}` },
        {
          label: "Заработок на запчасти",
          value: `${formatMoney(profit.rub)}${profit.percent !== null ? ` · ${profit.percent}%` : ""}`,
          total: true,
          tone: profit.rub > 0 ? "accent" : "danger",
        },
      ],
      note: profit.rub <= 0 ? "Цена клиенту не выше закупки — сервис ничего не заработает." : undefined,
      confirmLabel: "Добавить",
    });
    if (!ok) return;

    const error = reservePart(order.id, stockItem.id, qty, price);
    if (error) {
      setPartError(error);
      return;
    }
    setAddingPart(false);
    showToast(`Добавлена запчасть «${stockItem.name}»`);
  }

  async function handleRemovePart(part: OrderLinePart) {
    if (!order) return;
    const issued = order.status === "выдан";
    const ok = await confirm({
      title: "Убрать запчасть из заказа",
      question: issued
        ? "Заказ уже выдан — запчасть вернётся на склад, сумма заказа уменьшится."
        : "Резерв снимется, запчасть снова станет свободной на складе.",
      summary: [
        { label: "Запчасть", value: `${part.name}${part.sku ? ` · ${part.sku}` : ""}` },
        { label: "Количество", value: part.qty },
        { label: "Сумма уйдёт из заказа", value: `−${formatMoney(part.price * part.qty)}`, total: true, tone: "danger" },
      ],
      confirmLabel: "Убрать",
      danger: true,
    });
    if (!ok) return;
    releasePart(order.id, part.id);
    showToast("Запчасть возвращена на склад", "error");
  }

  function handleSaveDiscount() {
    if (!order) return;
    // Скидка не может быть больше суммы заказа, иначе «к оплате» уходит в минус.
    const value = Math.min(worksTotal + partsTotal, Math.max(0, Number(discountInput) || 0));
    const target = Number(targetTotal);
    updateOrder(order.id, {
      discount: value,
      works: settings.autoPriceAdjustment && target > 0 ? adjustWorkPrices(order.works, target, partsTotal, value) : order.works,
    });
    setEditingDiscount(false);
    showToast("Скидка обновлена");
  }

  async function handleDeleteOrder() {
    if (!order) return;
    const ok = await confirm({
      title: "Удалить заказ-наряд",
      question: "Заказ-наряд исчезнет из списков, статистики и финансов. Отменить это нельзя.",
      summary: [
        { label: "Заказ-наряд", value: order.number },
        { label: "Клиент", value: client?.name ?? "—" },
        { label: "Автомобиль", value: carTitle },
        { label: "Сумма", value: formatMoney(due) },
        { label: "Принято от клиента", value: formatMoney(paid), tone: paid > 0 ? "danger" : undefined },
      ],
      note: paid > 0 ? "По заказу уже принимали деньги — оплата тоже пропадёт из отчётов." : undefined,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    deleteOrder(order.id);
    showToast(`Заказ-наряд ${order.number} удалён`, "error");
    navigate("/orders");
  }

  async function handleAcceptPayment(amount: number) {
    if (!order || amount <= 0) return;
    if (amount > debt) {
      showToast(`Больше долга принять нельзя: осталось ${formatMoney(debt)}`, "error");
      return;
    }
    const ok = await confirm({
      title: "Принять оплату",
      question: `Оплата запишется в заказ-наряд ${order.number} и попадёт в финансы за сегодня.`,
      summary: [
        { label: "Клиент", value: client?.name ?? "—" },
        { label: "Автомобиль", value: carTitle },
        { label: "Всего по заказу", value: formatMoney(due) },
        { label: "Уже оплачено", value: formatMoney(paid) },
        { label: "Принимаем", value: formatMoney(amount), tone: "accent" },
        { label: "Останется долг", value: formatMoney(debt - amount), total: true, tone: debt - amount > 0 ? "danger" : "accent" },
      ],
      confirmLabel: "Принять оплату",
    });
    if (!ok) return;
    acceptPayment(order.id, amount);
    setPaymentAmount("");
    setPayOpen(false);
    showToast(`Принята оплата ${formatMoney(amount)}`);
  }

  async function handleChangeStatus(next: OrderStatus) {
    if (!order || next === order.status) return;
    const issuing = next === "выдан";
    const reverting = order.status === "выдан" && next !== "выдан";
    const reopening = canReopen && (next === "в работе" || next === "диагностика");
    const summary: Parameters<typeof confirm>[0]["summary"] = [
      { label: "Заказ-наряд", value: order.number },
      { label: "Автомобиль", value: carTitle },
      { label: "Статус", value: `${order.status} → ${next}` },
    ];
    if (issuing || reverting) {
      summary.push({
        label: issuing ? "Спишется со склада" : "Вернётся на склад",
        value: order.parts.length
          ? order.parts.map((part) => `${part.name} × ${part.qty}`).join(", ")
          : "запчастей нет",
      });
    }
    if (issuing && debt > 0) {
      summary.push({ label: "Останется долг клиента", value: formatMoney(debt), total: true, tone: "danger" });
    }
    const ok = await confirm({
      title: issuing ? "Выдать автомобиль" : reopening ? "Вернуть в работу" : `Перевести в статус «${next}»`,
      question: issuing
        ? "Запчасти спишутся со склада, заказ попадёт в закрытые и в статистику по выработке."
        : reverting
          ? "Выдача откатится, списанные запчасти вернутся на склад — заказ снова можно дополнять работами и запчастями."
          : reopening
            ? "Заказ снова станет открытым: можно добавить работы и запчасти, принять доплату."
            : "Статус заказ-наряда изменится.",
      summary,
      note: issuing && debt > 0 ? "Клиент остаётся должен — заказ попадёт в «Ожидаем оплату»." : undefined,
      confirmLabel: issuing ? "Выдать" : "Изменить статус",
    });
    if (!ok) return;
    setOrderStatus(order.id, next);
    showToast(`Статус изменён: «${next}»`);
  }

  const carTitle = vehicle ? `${vehicle.make} ${vehicle.model}` : order.number;

  /**
   * Деньги по заказу: итог, скидка, подгонка суммы и договорённость.
   * Один и тот же блок показываем в правой колонке на компьютере и во
   * вкладке «Оплаты» на телефоне — иначе на узком экране часть настроек
   * просто пропадала.
   */
  const moneyPanel = (
    <>
            <div className="muted text-xs font-semibold uppercase tracking-[.07em]">
              {debt < 0 ? "Переплата клиента" : "Осталось оплатить"}
            </div>
            <div className="mt-1 text-[32px] font-bold leading-none tabular-nums" style={{ color: debt > 0 ? "var(--text)" : "var(--accent)" }}>
              {formatMoney(Math.abs(debt))}
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
                        onChange={(e) => setDiscountInput(moneyInput(e.target.value))}
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
                    onChange={(event) => setTargetTotal(moneyInput(event.target.value))}
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
    </>
  );


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
            {canReopen && (
              <Button variant="secondary" onClick={() => handleChangeStatus("в работе")}>
                <IconArrowBackUp size={18} /> Вернуть в работу
              </Button>
            )}
            {nextStatusLabel && (
              <Button onClick={() => nextStatus && handleChangeStatus(nextStatus)}>
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
        <div className="order-doc">
        <div className="mb-4 hidden print:block">
          <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--border)" }}>
            <div>
              <div className="text-lg font-bold">{company.shortName}</div>
              <div className="text-sm">{company.address}</div>
              <div className="text-sm">{[company.phone, formatWorkHours({ start: company.openTime, end: company.closeTime })].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold">Заказ-наряд {order.number}</div>
              <div className="text-sm">{formatDateTime(order.createdAt)}</div>
            </div>
          </div>
        </div>

        <div
          className="order-facts mb-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border shadow-[0_2px_8px_rgba(23,34,30,0.045)] sm:grid-cols-2 lg:grid-cols-5"
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
          <InfoCell icon={<IconStopwatch size={18} />} tone="#f0f4f1" color="var(--text)" label="Время на подъёмнике">
            <div className="truncate text-sm font-semibold">
              {orderActual > 0 ? formatDuration(orderActual) : "ещё не был"}
              {orderNorm > 0 && orderDeviation !== null && (
                <span
                  className="ml-1.5 text-xs font-semibold"
                  style={{ color: orderDeviation > 0 ? "var(--danger)" : "var(--accent)" }}
                >
                  {orderDeviation > 0 ? "+" : ""}{orderDeviation}%
                </span>
              )}
            </div>
            <div className="muted truncate text-xs">
              {isEstimatedTiming(order)
                ? "Восстановлено по плану, не замер"
                : orderNorm > 0 ? `Норматив ${formatDuration(orderNorm)}` : "Норматив не задан"}
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
          <p className="muted mb-2 text-center text-[11px]">Нажмите на этап, чтобы перевести заказ вперёд или вернуть назад</p>
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
                  onClick={() => handleChangeStatus(step)}
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

        <div className="order-body grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl border bg-white p-1 print:hidden" style={{ borderColor: "var(--border)" }}>
              {TABS.map((item) => (
                <button
                  key={item}
                  ref={(node) => { if (tab === item) activeTabRef.current = node; }}
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
                    <button onClick={() => setAddingWork(true)} className="text-sm font-semibold print:hidden" style={{ color: "var(--accent)" }}>
                      + Добавить работу
                    </button>
                  </div>
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th>Наименование</th>
                        <th className="w-20 text-right">Кол-во</th>
                        <th className="w-28 text-right">Сумма</th>
                        <th className="w-12 print:hidden" />
                      </tr>
                    </thead>
                    <tbody>
                      {order.works.map((w) => (
                        <tr key={w.id} className="group">
                          <td>
                            {w.name}
                            <div className="muted text-xs">
                              {w.executor ? `Исполнитель: ${w.executor}` : ""}
                              {w.executor && w.normMinutes ? " · " : ""}
                              {w.normMinutes ? `норматив ${formatDuration(w.normMinutes * w.qty)}` : ""}
                            </div>
                          </td>
                          <td className="text-right tabular-nums">{w.qty}</td>
                          <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(w.price * w.qty)}</td>
                          <td className="text-right print:hidden">
                            <RowMenu
                              label={`Действия по работе «${w.name}»`}
                              actions={[
                                { label: "Удалить работу", icon: <IconTrash size={16} />, danger: true, onSelect: () => handleRemoveWork(w.id) },
                              ]}
                            />
                          </td>
                        </tr>
                      ))}
                      {order.works.length === 0 && (
                        <tr><td colSpan={4} className="muted py-3 text-center">Работы не добавлены</td></tr>
                      )}
                    </tbody>
                  </table>

                  <div className="border-t bg-[#fafbfa] p-4 text-right text-sm font-semibold" style={{ borderColor: "var(--border)" }}>
                    Итого за работы: {formatMoney(worksTotal)}
                  </div>
                </Card>

                <Card className="overflow-hidden p-0">
                  <div className="flex items-center justify-between p-4">
                    <h2 className="panel-title">Запчасти</h2>
                    <button onClick={() => { setPartError(""); setAddingPart(true); }} className="text-sm font-semibold print:hidden" style={{ color: "var(--accent)" }}>
                      + Со склада
                    </button>
                  </div>
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th>Наименование</th>
                        <th className="w-20 text-right">Кол-во</th>
                        <th className="w-28 text-right">Сумма</th>
                        <th className="w-12 print:hidden" />
                      </tr>
                    </thead>
                    <tbody>
                      {order.parts.map((p) => (
                        <tr key={p.id} className="group">
                          <td>
                            {p.name}
                            <div className="muted text-xs">
                              {p.sku ? `Артикул: ${p.sku}` : ""}
                              {(() => {
                                // Показываем заработок на запчасти: закупка есть на складе.
                                const item = stock.find((entry) => entry.sku === p.sku);
                                if (!item) return null;
                                const profit = margin(item.purchasePrice, p.price, p.qty);
                                return (
                                  <>
                                    {p.sku ? " · " : ""}закупка {formatMoney(item.purchasePrice * p.qty)}
                                    <span style={{ color: profit.rub > 0 ? "var(--accent)" : "var(--danger)" }}>
                                      {" "}· заработок {formatMoney(profit.rub)}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="text-right tabular-nums">{p.qty}</td>
                          <td className="whitespace-nowrap text-right tabular-nums">{formatMoney(p.price * p.qty)}</td>
                          <td className="text-right print:hidden">
                            <RowMenu
                              label={`Действия по запчасти «${p.name}»`}
                              actions={[
                                { label: "Вернуть на склад", icon: <IconArrowBackUp size={16} />, danger: true, onSelect: () => handleRemovePart(p) },
                              ]}
                            />
                          </td>
                        </tr>
                      ))}
                      {order.parts.length === 0 && (
                        <tr><td colSpan={4} className="muted py-3 text-center">Запчасти не добавлены</td></tr>
                      )}
                    </tbody>
                  </table>

                  <div className="border-t bg-[#fafbfa] p-4 text-right text-sm font-semibold" style={{ borderColor: "var(--border)" }}>
                    Итого за запчасти: {formatMoney(partsTotal)}
                  </div>
                </Card>
            </div>

            {tab === "Приёмка" && (
              <Card className="print:hidden">
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
              <>
                {/* На узком экране правой колонки нет — показываем полный блок здесь. */}
                <Card className="xl:hidden print:hidden">{moneyPanel}</Card>

                {/* На широком экране блок уже справа: тут только сводка, без повторов. */}
                <Card className="hidden overflow-hidden p-0 xl:block print:hidden">
                  <div className="p-4">
                    <h2 className="panel-title">Расчёт по заказу</h2>
                    <p className="muted mt-1 text-sm">Приём оплаты, скидка и договорённость — в блоке справа.</p>
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
                        <td className="font-semibold">{debt < 0 ? "Переплата" : "Осталось"}</td>
                        <td className="text-right font-semibold tabular-nums" style={{ color: debt > 0 ? "var(--danger)" : "var(--accent)" }}>
                          {formatMoney(Math.abs(debt))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </Card>
              </>
            )}

            {tab === "Документы" && (
              <Card className="print:hidden">
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

          <div className="hidden min-w-0 space-y-4 xl:block print:hidden">
            <Card className="xl:sticky xl:top-20">{moneyPanel}</Card>
          </div>
        </div>

        {/* Место под мобильную панель оплаты, чтобы она не накрывала контент. */}
        <div className="h-16 xl:hidden print:hidden" />

        <div className="hidden print:block">
          <div className="order-print-notes mt-3 text-sm">
            <div><b>Жалоба клиента:</b> {order.complaint || "—"}</div>
            <div><b>Диагностика:</b> {order.diagnosis || "—"}</div>
            <div><b>Внешние дефекты:</b> {order.defects || "—"}</div>
            {order.guaranteeMonths ? <div><b>Гарантия:</b> {order.guaranteeMonths} мес.</div> : null}
          </div>

          <div className="order-print-total mt-3 border-t pt-2 text-sm" style={{ borderColor: "var(--border)" }}>
            <div>Работы: {formatMoney(worksTotal)} · Запчасти: {formatMoney(partsTotal)}{discount > 0 ? ` · Скидка: −${formatMoney(discount)}` : ""}</div>
            <div className="text-base font-bold">
              К оплате: {formatMoney(due)} · Оплачено: {formatMoney(paid)} · Долг: {formatMoney(Math.max(0, debt))}
            </div>
          </div>

          <div className="order-print-signs mt-6 grid grid-cols-2 gap-10 text-sm">
            <div>
              <div>Работы сдал (исполнитель)</div>
              <div className="mt-6 border-t pt-1" style={{ borderColor: "var(--text)" }}>{order.advisor || company.responsible}</div>
            </div>
            <div>
              <div>Работы принял (заказчик)</div>
              <div className="mt-6 border-t pt-1" style={{ borderColor: "var(--text)" }}>{client?.name ?? ""}</div>
            </div>
          </div>
        </div>
        </div>
      </Page>

      <div
        className="fixed inset-x-0 bottom-16 z-20 flex items-center justify-between gap-3 border-t bg-white/95 px-4 py-3 backdrop-blur xl:hidden print:hidden"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="min-w-0">
          <div className="muted text-[11px] uppercase tracking-[.06em]">{debt < 0 ? "Переплата" : "К оплате"}</div>
          <div className="text-lg font-bold leading-tight tabular-nums">{formatMoney(Math.abs(debt))}</div>
        </div>
        {debt > 0 ? (
          <Button className="shrink-0" onClick={() => setPayOpen(true)}>Принять оплату</Button>
        ) : (
          <span className="shrink-0 text-sm font-semibold" style={{ color: "var(--accent)" }}>Заказ оплачен</span>
        )}
      </div>

      {addingWork && <AddWork onClose={() => setAddingWork(false)} onSubmit={handleAddWork} />}
      {addingPart && (
        <AddPart onClose={() => setAddingPart(false)} onSubmit={handleAddPart} error={partError} />
      )}

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
                  onChange={(e) => setPaymentAmount(moneyInput(e.target.value))}
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
      <span className="fact-icon grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: tone, color }}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="muted block text-[11px]">{label}</span>
        {children}
      </span>
    </div>
  );
}
