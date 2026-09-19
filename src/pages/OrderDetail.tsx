import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  IconArrowBackUp, IconArrowLeft, IconCalendarTime, IconCar, IconCheck, IconClipboardText,
  IconBrandWhatsapp, IconFileDescription, IconHistory, IconMessage, IconNotes, IconStopwatch, IconTool, IconTrash, IconUser,
} from "@tabler/icons-react";
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
import { paymentMethodLabel } from "../lib/payments";
import { readyMessage, smsMessageHref, whatsappMessageHref } from "../lib/customerMessages";
import { actualMinutes, deviationPercent, formatDuration, isEstimatedTiming, normMinutes } from "../lib/worktime";
import { Button, Card, Modal, Page, StatusBadge, TopBar } from "../components/ui";
import { formatDate, formatDateTime, formatMoney } from "../lib/format";
import { CONSUMABLE_PRESETS } from "../data/consumables";
import { formatQuantity, isValidQuantity } from "../lib/quantity";
import { nowISO } from "../lib/date";
import type { OrderConsumable, OrderLinePart, OrderLineWork, OrderStatus, PaymentMethod } from "../types";
import { effectiveWorkStatus, WORK_STATUS_LABEL, workSessionMinutes } from "../lib/workSessions";
import OrderMediaPanel from "../components/OrderMediaPanel";
import ClientOrderDocument from "../components/ClientOrderDocument";
import { orderActivity } from "../lib/orderActivity";

const STATUS_FLOW: OrderStatus[] = ["запись", "диагностика", "в работе", "готово", "выдан"];
const TABS = ["Работы и запчасти", "Приёмка", "Оплаты", "История", "Документы"] as const;
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
    payments,
    employees,
    updateOrder,
    deleteOrder,
    updateVehicle,
    setOrderStatus,
    reservePart,
    releasePart,
    acceptPayment,
    refundPayment,
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
  const [consumablesOpen, setConsumablesOpen] = useState(false);
  const [selectedConsumables, setSelectedConsumables] = useState<Record<string, boolean>>({});

  const [editingDiscount, setEditingDiscount] = useState(false);
  const [discountInput, setDiscountInput] = useState("0");
  const [cashAmount, setCashAmount] = useState("");
  const [terminalAmount, setTerminalAmount] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [cashCommitted, setCashCommitted] = useState(0);
  const [terminalCommitted, setTerminalCommitted] = useState(0);
  const [transferCommitted, setTransferCommitted] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("cash");
  const [paymentEmployee, setPaymentEmployee] = useState(order?.advisor ?? "");
  const [targetTotal, setTargetTotal] = useState("");
  const [intakeComplaint, setIntakeComplaint] = useState(order?.complaint ?? "");
  const [intakeDiagnosis, setIntakeDiagnosis] = useState(order?.diagnosis ?? "");
  const [intakeDefects, setIntakeDefects] = useState(order?.defects ?? "");
  const [intakeRecommendations, setIntakeRecommendations] = useState(order?.recommendations ?? "");
  const [intakeGuarantee, setIntakeGuarantee] = useState(order?.guaranteeMonths ? String(order.guaranteeMonths) : "");
  const [intakePromisedAt, setIntakePromisedAt] = useState(order?.promisedAt ? order.promisedAt.slice(0, 16) : "");
  const [intakeMileage, setIntakeMileage] = useState("");
  const [mechanicComment, setMechanicComment] = useState(order?.mechanicComment ?? "");
  const loadedIntakeOrderRef = useRef<string | null>(null);

  const client = order ? clients.find((c) => c.id === order.clientId) : undefined;
  const vehicle = order ? vehicles.find((v) => v.id === order.vehicleId) : undefined;
  const lift = order ? lifts.find((l) => l.id === order.liftId) : undefined;

  useEffect(() => {
    if (!order || loadedIntakeOrderRef.current === order.id) return;
    loadedIntakeOrderRef.current = order.id;
    setIntakeComplaint(order.complaint ?? "");
    setIntakeDiagnosis(order.diagnosis ?? "");
    setIntakeDefects(order.defects ?? "");
    setIntakeRecommendations(order.recommendations ?? "");
    setIntakeGuarantee(order.guaranteeMonths ? String(order.guaranteeMonths) : "");
    setIntakePromisedAt(order.promisedAt ? order.promisedAt.slice(0, 16) : "");
    setIntakeMileage(vehicle?.mileage ? String(vehicle.mileage) : "");
    setMechanicComment(order.mechanicComment ?? "");
    setPaymentEmployee(order.advisor ?? "");
  }, [order, vehicle?.mileage]);

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

  const worksTotal = order.works.reduce((s, w) => s + w.price * w.qty, 0);
  const partsTotal = order.parts.reduce((s, p) => s + p.price * p.qty, 0);
  const discount = order.discount ?? 0;
  const clientDiscount = client?.discountPercent
    ? Math.round(((worksTotal + partsTotal) * client.discountPercent) / 100)
    : 0;
  const due = worksTotal + partsTotal - discount;
  const paid = order.paid ?? 0;
  const debt = due - paid;
  const orderPayments = payments
    .filter((payment) => payment.orderId === order.id)
    .sort((a, b) => b.at.localeCompare(a.at));

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
    if (order.status === "выдан") {
      showToast("Выданный заказ нельзя менять. Сначала верните автомобиль в работу.", "error");
      return;
    }
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
    if (order.status === "выдан") {
      showToast("Выданный заказ нельзя изменять. Сначала верните автомобиль в работу.", "error");
      return;
    }
    if (!Number.isInteger(work.qty) || work.qty <= 0 || work.price <= 0 || work.price > 10_000_000) {
      showToast("Проверьте количество и цену работы", "error");
      return;
    }
    const newWork: OrderLineWork = { id: createId("work"), ...work };
    const nextWorks = [...order.works, newWork];
    const target = Number(targetTotal);
    updateOrder(order.id, { works: settings.autoPriceAdjustment && target > 0 ? adjustWorkPrices(nextWorks, target) : nextWorks });
    setAddingWork(false);
    showToast(`Добавлена работа «${work.name}»`);
  }

  function handleRemoveWork(workId: string) {
    if (!order) return;
    if (order.status === "выдан") {
      showToast("Выданный заказ нельзя изменять. Сначала верните автомобиль в работу.", "error");
      return;
    }
    const nextWorks = order.works.filter((w) => w.id !== workId);
    const target = Number(targetTotal);
    updateOrder(order.id, { works: settings.autoPriceAdjustment && target > 0 ? adjustWorkPrices(nextWorks, target) : nextWorks });
    showToast("Работа удалена", "error");
  }

  async function handleAddPart(itemId: string, qty: number, price: number) {
    if (!order) return;
    if (order.status === "выдан") {
      showToast("Выданный заказ нельзя изменять. Сначала верните автомобиль в работу.", "error");
      return;
    }
    if (!isValidQuantity(qty) || price <= 0 || price > 10_000_000) {
      setPartError("Проверьте количество и цену запчасти");
      return;
    }
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
        { label: "Количество", value: `${formatQuantity(qty)} ${stockItem.unit}` },
        { label: "Закупка", value: formatMoney(stockItem.purchasePrice * qty) },
        { label: "Цена клиенту", value: formatMoney(price * qty) },
        { label: "Свободно после резерва", value: `${formatQuantity(free - qty)} ${stockItem.unit}` },
        {
          label: "Наценка до скидки",
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
    if (order.status === "выдан") {
      showToast("Выданный заказ нельзя изменять. Сначала верните автомобиль в работу.", "error");
      return;
    }
    const ok = await confirm({
      title: "Убрать запчасть из заказа",
      question: "Резерв снимется, запчасть снова станет свободной на складе.",
      summary: [
        { label: "Запчасть", value: `${part.name}${part.sku ? ` · ${part.sku}` : ""}` },
        { label: "Количество", value: part.qty },
        { label: "Сумма уйдёт из заказа", value: `−${formatMoney(part.price * part.qty)}`, total: true, tone: "danger" },
      ],
      confirmLabel: "Убрать",
      danger: true,
    });
    if (!ok) return;
    const error = releasePart(order.id, part.id);
    if (error) {
      showToast(error, "error");
      return;
    }
    showToast("Резерв запчасти снят");
  }

  function handleSaveDiscount() {
    if (!order) return;
    if (order.status === "выдан") {
      showToast("Выданный заказ нельзя менять. Сначала верните автомобиль в работу.", "error");
      return;
    }
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
    const error = deleteOrder(order.id);
    if (error) {
      showToast(error, "error");
      return;
    }
    showToast(`Заказ-наряд ${order.number} удалён`, "error");
    navigate("/orders");
  }

  async function handleAcceptPayment() {
    if (!order) return;
    const parts = [
      { method: "cash" as const, amount: Number(cashAmount) || 0 },
      { method: "terminal" as const, amount: Number(terminalAmount) || 0 },
      { method: "transfer" as const, amount: Number(transferAmount) || 0 },
    ].filter((part) => part.amount > 0);
    const total = parts.reduce((sum, part) => sum + part.amount, 0);
    if (total <= 0) {
      showToast("Укажите сумму хотя бы для одного способа оплаты", "error");
      return;
    }
    if (total > debt) {
      showToast(`Больше долга принять нельзя: превышение ${formatMoney(total - debt)}`, "error");
      return;
    }
    const ok = await confirm({
      title: "Принять оплату",
      question: `Оплата запишется в заказ-наряд ${order.number} отдельными частями и попадёт в финансы за сегодня.`,
      summary: [
        { label: "Клиент", value: client?.name ?? "—" },
        { label: "Автомобиль", value: carTitle },
        ...parts.map((part) => ({
          label: paymentMethodLabel(part.method),
          value: formatMoney(part.amount),
        })),
        { label: "Всего принимаем", value: formatMoney(total), tone: "accent" as const },
        { label: "Останется долг", value: formatMoney(debt - total), total: true, tone: debt - total > 0 ? "danger" as const : "accent" as const },
      ],
      confirmLabel: "Принять оплату",
    });
    if (!ok) return;
    const error = acceptPayment(order.id, parts, paymentEmployee);
    if (error) {
      showToast(error, "error");
      return;
    }
    setCashAmount("");
    setTerminalAmount("");
    setTransferAmount("");
    setCashCommitted(0);
    setTerminalCommitted(0);
    setTransferCommitted(0);
    setPayOpen(false);
    showToast(`Принята оплата ${formatMoney(total)}`);
  }

  async function handleRefundPayment() {
    if (!order) return;
    const amount = Number(refundAmount) || 0;
    if (amount <= 0) {
      showToast("Укажите сумму возврата", "error");
      return;
    }
    if (amount > paid) {
      showToast(`Вернуть можно не больше ${formatMoney(paid)}`, "error");
      return;
    }
    const ok = await confirm({
      title: "Вернуть деньги клиенту",
      question: "Возврат уменьшит оплаченную сумму заказа и появится отдельной строкой в финансах.",
      summary: [
        { label: "Клиент", value: client?.name ?? "—" },
        { label: "Способ", value: paymentMethodLabel(refundMethod) },
        { label: "Возвращаем", value: formatMoney(amount), total: true, tone: "danger" },
        { label: "Останется оплачено", value: formatMoney(paid - amount) },
      ],
      confirmLabel: "Оформить возврат",
      danger: true,
    });
    if (!ok) return;
    const error = refundPayment(order.id, amount, refundMethod, paymentEmployee);
    if (error) {
      showToast(error, "error");
      return;
    }
    setRefundAmount("");
    setRefundOpen(false);
    showToast(`Клиенту возвращено ${formatMoney(amount)}`);
  }

  function saveIntake() {
    if (!order) return;
    const guaranteeMonths = Number(intakeGuarantee.replace(/\D/g, "")) || undefined;
    updateOrder(order.id, {
      complaint: intakeComplaint.trim(),
      diagnosis: intakeDiagnosis.trim(),
      defects: intakeDefects.trim(),
      recommendations: intakeRecommendations.trim(),
      guaranteeMonths,
      promisedAt: intakePromisedAt ? new Date(intakePromisedAt).toISOString() : undefined,
      mechanicComment: mechanicComment.trim(),
    });
    const mileage = Number(intakeMileage.replace(/\D/g, ""));
    if (vehicle && mileage > 0 && mileage !== vehicle.mileage) {
      updateVehicle(vehicle.id, { mileage });
    }
    showToast("Приёмка сохранена");
  }

  async function handleChangeStatus(next: OrderStatus) {
    if (!order || next === order.status) return;
    if (next === "готово" && order.status !== "готово" && order.status !== "выдан") {
      setSelectedConsumables({});
      setConsumablesOpen(true);
      return;
    }
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
    const statusError = setOrderStatus(order.id, next);
    if (statusError) {
      showToast(statusError, "error");
      return;
    }
    showToast(`Статус изменён: «${next}»`);
  }

  function finishWithConsumables() {
    if (!order) return;
    const chosen = CONSUMABLE_PRESETS.filter((item) => selectedConsumables[item.key]);
    const total = chosen.reduce((sum, item) => sum + item.amount, 0);
    if (total > 0 && order.works.length === 0) {
      showToast("Чтобы включить внутренние расходники в сумму, в заказе должна быть хотя бы одна работа", "error");
      return;
    }

    const works = order.works.map((work, index) => {
      if (index !== 0 || total <= 0) return work;
      return { ...work, price: work.price + total / Math.max(1, work.qty) };
    });
    const consumables: OrderConsumable[] = chosen.map((item) => ({
      id: createId("cons"),
      key: item.key,
      label: item.label,
      amount: item.amount,
      appliedAt: nowISO(),
    }));

    if (total > 0) {
      updateOrder(order.id, {
        works,
        consumables: [...(order.consumables ?? []), ...consumables],
      });
    }

    const statusError = setOrderStatus(order.id, "готово");
    if (statusError) {
      showToast(statusError, "error");
      return;
    }
    setConsumablesOpen(false);
    showToast(total > 0
      ? `Работы завершены · внутренние расходники учтены на ${formatMoney(total)}`
      : "Работы завершены");
  }

  const carTitle = vehicle ? `${vehicle.make} ${vehicle.model}` : order.number;
  const readyText = readyMessage({
    clientName: client?.name,
    vehicle: carTitle,
    orderNumber: order.number,
    serviceName: company.shortName || company.name,
    phone: [company.phone, company.phone2].filter(Boolean).join(" / "),
  });
  const whatsappReadyHref = client?.phone ? whatsappMessageHref(client.phone, readyText) : "";
  const smsReadyHref = client?.phone ? smsMessageHref(client.phone, readyText) : "";

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
                onClick={() => {
                  if (order.status === "выдан") {
                    showToast("Выданный заказ нельзя менять. Сначала верните автомобиль в работу.", "error");
                    return;
                  }
                  updateOrder(order.id, { discount: clientDiscount });
                }}
                className="mt-2 w-full rounded-lg border border-dashed px-2 py-1.5 text-xs transition hover:bg-[var(--bg)]"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                Скидка клиента {client?.discountPercent}% — применить {formatMoney(clientDiscount)}
              </button>
            )}

            {debt > 0 && (
              <Button className="mt-3 w-full justify-center" onClick={() => {
              setCashAmount("");
              setTerminalAmount("");
              setTransferAmount("");
              setCashCommitted(0);
              setTerminalCommitted(0);
              setTransferCommitted(0);
              setPayOpen(true);
            }}>Принять оплату</Button>
            )}
            <Link to={`/orders/${order.id}/print`} className="mt-2 block">
              <Button variant="secondary" className="w-full justify-center"><IconFileDescription size={18} /> Заказ-наряд для клиента</Button>
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
                <textarea rows={3} defaultValue={order.notes || ""} onBlur={(e) => updateOrder(order.id, { notes: e.target.value })} placeholder="Внутренняя договорённость, клиенту не показывается" />
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
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <StatusBadge status={order.status} />
            {canReopen && (
              <Button className="max-sm:flex-1" variant="secondary" onClick={() => handleChangeStatus("в работе")}>
                <IconArrowBackUp size={18} /> Вернуть в работу
              </Button>
            )}
            {order.status === "готово" && client?.phone && (
              <>
                <a href={whatsappReadyHref} target="_blank" rel="noreferrer" className="max-sm:flex-1">
                  <Button className="max-sm:w-full" variant="secondary">
                    <IconBrandWhatsapp size={18} /> <span className="hidden sm:inline">WhatsApp</span>
                  </Button>
                </a>
                <a href={smsReadyHref} className="max-sm:flex-1">
                  <Button className="max-sm:w-full" variant="secondary">
                    <IconMessage size={18} /> <span className="hidden sm:inline">SMS</span>
                  </Button>
                </a>
              </>
            )}
            {nextStatusLabel && (
              <Button className="max-sm:flex-1" onClick={() => nextStatus && handleChangeStatus(nextStatus)}>
                <IconCheck size={18} /> {nextStatusLabel}
              </Button>
            )}
            <Button className="max-sm:ml-auto" variant="secondary" size="sm" onClick={() => navigate(-1)} aria-label="Назад" title="Назад">
              <IconArrowLeft size={18} />
            </Button>
          </div>
        }
      />
      <Page>
        <div className="order-doc">
        <div
          className="order-facts mb-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border shadow-[0_2px_8px_rgba(23,34,30,0.045)] sm:grid-cols-2 lg:grid-cols-3"
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

        </div>

        <details className="mb-4 rounded-xl border bg-white print:hidden" style={{ borderColor: "var(--border)" }}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Внутренняя информация сервиса</summary>
          <div className="grid grid-cols-1 gap-px border-t sm:grid-cols-3" style={{ background: "var(--border)", borderColor: "var(--border)" }}>
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
        </details>

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
                    <button onClick={() => order.status === "выдан" ? showToast("Сначала верните автомобиль в работу", "error") : setAddingWork(true)} className="text-sm font-semibold print:hidden" style={{ color: order.status === "выдан" ? "var(--text-muted)" : "var(--accent)" }}>
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
                              {w.executor ? `Исполнитель: ${w.executor}` : "Исполнитель не назначен"}
                              {w.executor && w.normMinutes ? " · " : ""}
                              {w.normMinutes ? `норматив ${formatDuration(w.normMinutes * w.qty)}` : ""}
                              {w.executor ? ` · ${WORK_STATUS_LABEL[effectiveWorkStatus(w)]}` : ""}
                              {workSessionMinutes(w) > 0 ? ` · факт ${formatDuration(workSessionMinutes(w))}` : ""}
                            </div>
                            <div className="mt-2 print:hidden">
                              <select
                                value={w.executor ?? ""}
                                onChange={(event) => {
                                  if (order.status === "выдан") {
                                    showToast("Сначала верните автомобиль в работу", "error");
                                    return;
                                  }
                                  const executor = event.target.value || undefined;
                                  updateOrder(order.id, {
                                    works: order.works.map((item) => item.id === w.id ? { ...item, executor } : item),
                                  });
                                  showToast(executor ? `Исполнитель: ${executor}` : "Исполнитель снят");
                                }}
                                className="max-w-full rounded-md border bg-white px-2 py-1 text-xs"
                                style={{ borderColor: w.executor ? "var(--border)" : "var(--warning)" }}
                                aria-label={`Исполнитель работы ${w.name}`}
                              >
                                <option value="">Без механика</option>
                                {employees.map((employee) => <option key={employee.id} value={employee.name}>{employee.name}</option>)}
                              </select>
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
                    <button onClick={() => {
                       if (order.status === "выдан") {
                         showToast("Сначала верните автомобиль в работу", "error");
                         return;
                       }
                       setPartError("");
                       setAddingPart(true);
                     }} className="text-sm font-semibold print:hidden" style={{ color: order.status === "выдан" ? "var(--text-muted)" : "var(--accent)" }}>
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
                                const purchasePrice = p.purchasePrice ?? item?.purchasePrice;
                                if (purchasePrice === undefined) return null;
                                const profit = margin(purchasePrice, p.price, p.qty);
                                return (
                                  <>
                                    {p.sku ? " · " : ""}закупка {formatMoney(purchasePrice * p.qty)}
                                    <span style={{ color: profit.rub > 0 ? "var(--accent)" : "var(--danger)" }}>
                                      {" "}· наценка до скидки {formatMoney(profit.rub)}
                                    </span>
                                    {p.purchasePriceEstimated && (
                                      <span className="ml-1">· себестоимость восстановлена</span>
                                    )}
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
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="panel-title flex items-center gap-2"><IconClipboardText size={18} /> Приёмка автомобиля</h2>
                    <p className="muted mt-1 text-sm">Заполните нужные поля и нажмите «Сохранить приёмку». Ничего само по себе не теряется между полями.</p>
                  </div>
                  <Button onClick={saveIntake}>Сохранить приёмку</Button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="muted mb-1 block">Что беспокоит клиента</span>
                    <div className="field-control">
                      <textarea rows={3} value={intakeComplaint} onChange={(e) => setIntakeComplaint(e.target.value)} placeholder="Например: стук спереди, вибрация на скорости" />
                    </div>
                  </label>
                  <label className="block text-sm">
                    <span className="muted mb-1 block">Что нашли при диагностике</span>
                    <div className="field-control">
                      <textarea rows={3} value={intakeDiagnosis} onChange={(e) => setIntakeDiagnosis(e.target.value)} placeholder="Коротко: что нашли и что нужно сделать" />
                    </div>
                  </label>
                  <label className="block text-sm">
                    <span className="muted mb-1 block">Внешние повреждения</span>
                    <div className="field-control">
                      <textarea rows={3} value={intakeDefects} onChange={(e) => setIntakeDefects(e.target.value)} placeholder="Царапины, сколы, вмятины и т.п." />
                    </div>
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="muted mb-1 block">Рекомендации клиенту</span>
                    <div className="field-control">
                      <textarea rows={3} value={intakeRecommendations} onChange={(e) => setIntakeRecommendations(e.target.value)} placeholder="Например: через 5 000 км заменить задние колодки, наблюдать запотевание амортизатора" />
                    </div>
                    <span className="muted mt-1 block text-xs">Показывается клиенту в заказ-наряде и сохраняется в истории автомобиля.</span>
                  </label>
                  <label className="block text-sm sm:col-span-2">
                    <span className="muted mb-1 block">Комментарий мастера для своих</span>
                    <div className="field-control">
                      <textarea rows={3} value={mechanicComment} onChange={(e) => setMechanicComment(e.target.value)} placeholder="Например: клиент просил позвонить после разбора, болт прикипел, нужен повторный контроль" />
                    </div>
                    <span className="muted mt-1 block text-xs">Внутренняя заметка: клиенту и в заказ-наряде не показывается.</span>
                  </label>
                  <label className="block text-sm">
                    <span className="muted mb-1 block">Обещано клиенту к</span>
                    <div className="field-control">
                      <input type="datetime-local" value={intakePromisedAt} onChange={(e) => setIntakePromisedAt(e.target.value)} />
                    </div>
                    <span className="muted mt-1 block text-xs">Только для внутреннего контроля. В клиентском заказ-наряде не печатается.</span>
                  </label>
                  <label className="block text-sm">
                    <span className="muted mb-1 block">Гарантия на работы, месяцев</span>
                    <div className="field-control">
                      <input inputMode="numeric" value={intakeGuarantee} onChange={(e) => setIntakeGuarantee(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="Например, 6" />
                    </div>
                  </label>
                  <label className="block text-sm">
                    <span className="muted mb-1 block">Пробег при приёмке, км</span>
                    <div className="field-control">
                      <input inputMode="numeric" value={intakeMileage} onChange={(e) => setIntakeMileage(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="Например, 121000" />
                    </div>
                  </label>
                </div>
                <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                  <OrderMediaPanel order={order} defaultKind="intake" />
                </div>
                <div className="mt-4 flex justify-end border-t pt-4" style={{ borderColor: "var(--border)" }}>
                  <Button onClick={saveIntake}>Сохранить приёмку</Button>
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

                <Card className="mt-3 overflow-hidden p-0 print:hidden">
                  <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
                    <h2 className="panel-title">История оплат</h2>
                    <p className="muted mt-1 text-xs">Новые оплаты фиксируются по фактической дате приёма денег.</p>
                  </div>
                  <div className="flex justify-end border-b px-4 py-2" style={{ borderColor: "var(--border)" }}>
                    <Button variant="secondary" size="sm" disabled={paid <= 0} onClick={() => setRefundOpen(true)}>
                      Вернуть деньги клиенту
                    </Button>
                  </div>
                  {orderPayments.length === 0 ? (
                    <p className="muted p-4 text-sm">Оплат по заказу пока нет.</p>
                  ) : (
                    <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                      {orderPayments.map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                          <span>
                            <b>{formatDateTime(payment.at)}</b>
                            <span className="muted ml-2 text-xs">· {paymentMethodLabel(payment.method)}</span>
                            {payment.employee && <span className="muted ml-2 text-xs">· {payment.employee}</span>}
                            {payment.estimated && <span className="muted ml-2 text-xs">· дата восстановлена</span>}
                          </span>
                          <b
                            className="tabular-nums"
                            style={{ color: payment.kind === "refund" ? "var(--danger)" : "var(--accent)" }}
                          >
                            {payment.kind === "refund" ? "−" : "+"}{formatMoney(payment.amount)}
                          </b>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </>
            )}

            {tab === "История" && (
              <Card className="overflow-hidden p-0 print:hidden">
                <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
                  <h2 className="panel-title flex items-center gap-2"><IconHistory size={18} /> История заказа</h2>
                  <p className="muted mt-1 text-xs">Статусы, работа механиков, оплаты и медиа — в одной хронологии.</p>
                </div>
                {orderActivity(order, payments).length === 0 ? (
                  <p className="muted p-4 text-sm">Событий по заказу пока нет.</p>
                ) : (
                  <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {orderActivity(order, payments).map((item) => (
                      <div key={item.id} className="flex gap-3 px-4 py-3">
                        <span
                          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{
                            background:
                              item.kind === "payment" ? "var(--accent)"
                                : item.kind === "work" ? "#3978c9"
                                  : item.kind === "media" ? "#6656b8"
                                    : item.kind === "status" ? "var(--warning)"
                                      : "var(--text-muted)",
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <b className="text-sm">{item.title}</b>
                            <span className="muted shrink-0 text-xs">{formatDateTime(item.at)}</span>
                          </div>
                          {(item.detail || item.actor || item.estimated) && (
                            <p className="muted mt-1 text-xs">
                              {item.detail}
                              {item.detail && item.actor ? " · " : ""}
                              {item.actor ? item.actor : ""}
                              {(item.detail || item.actor) && item.estimated ? " · " : ""}
                              {item.estimated ? "дата восстановлена" : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {tab === "Документы" && (
              <Card className="print:hidden">
                <h2 className="panel-title mb-3">Документы по заказу</h2>
                <div className="flex flex-wrap gap-2">
                  <Link to={`/orders/${order.id}/print`}>
                    <Button variant="secondary"><IconFileDescription size={18} /> Заказ-наряд для клиента</Button>
                  </Link>
                </div>
                <p className="muted mt-3 text-sm">В клиентской версии нет внутренних данных сервиса: подъёмника, рабочего времени, себестоимости, наценки и служебных комментариев.</p>
                <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                  {order.status === "выдан" || paid > 0 ? (
                    <p className="muted text-sm">
                      Закрытый или оплаченный заказ не удаляется: история склада и денег должна сохраниться.
                    </p>
                  ) : (
                    <button
                      onClick={handleDeleteOrder}
                      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition hover:bg-[#fff7f7]"
                      style={{ borderColor: "#f1c2c2", color: "var(--danger)" }}
                    >
                      <IconTrash size={16} /> Удалить заказ-наряд
                    </button>
                  )}
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
          <ClientOrderDocument order={order} client={client} vehicle={vehicle} company={company} payments={payments} />
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
        {order.status === "готово" ? (
          <div className="flex shrink-0 gap-2">
            {debt > 0 && <Button variant="secondary" onClick={() => {
              setCashAmount("");
              setTerminalAmount("");
              setTransferAmount("");
              setCashCommitted(0);
              setTerminalCommitted(0);
              setTransferCommitted(0);
              setPayOpen(true);
            }}>Оплата</Button>}
            <Button onClick={() => void handleChangeStatus("выдан")}><IconCheck size={18} /> Выдать</Button>
          </div>
        ) : debt > 0 ? (
          <Button className="shrink-0" onClick={() => {
              setCashAmount("");
              setTerminalAmount("");
              setTransferAmount("");
              setCashCommitted(0);
              setTerminalCommitted(0);
              setTransferCommitted(0);
              setPayOpen(true);
            }}>Принять оплату</Button>
        ) : (
          <span className="shrink-0 text-sm font-semibold" style={{ color: "var(--accent)" }}>Заказ оплачен</span>
        )}
      </div>

      {addingWork && <AddWork onClose={() => setAddingWork(false)} onSubmit={handleAddWork} />}
      {addingPart && (
        <AddPart onClose={() => setAddingPart(false)} onSubmit={handleAddPart} error={partError} vehicle={vehicle} />
      )}

      {consumablesOpen && (
        <Modal
          title="Расходники при работе"
          subtitle="Отметьте то, что реально использовали. Клиенту отдельной строкой это не показывается."
          onClose={() => setConsumablesOpen(false)}
        >
          <div className="space-y-3 p-4">
            <p className="muted text-sm">
              Сумма выбранных расходников распределится внутри стоимости работ. В клиентском заказ-наряде останутся обычные работы без строк «медная смазка», «жидкий ключ» и т. п.
            </p>
            <div className="space-y-2">
              {CONSUMABLE_PRESETS.map((item) => (
                <label
                  key={item.key}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedConsumables[item.key])}
                      onChange={(event) => setSelectedConsumables((prev) => ({ ...prev, [item.key]: event.target.checked }))}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="text-sm font-medium">{item.label}</span>
                  </span>
                  <b className="text-sm tabular-nums">+{formatMoney(item.amount)}</b>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
              <span className="muted">Внутренне добавится к работам</span>
              <b>
                {formatMoney(CONSUMABLE_PRESETS.filter((item) => selectedConsumables[item.key]).reduce((sum, item) => sum + item.amount, 0))}
              </b>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConsumablesOpen(false)}>Отмена</Button>
              <Button onClick={finishWithConsumables}>Завершить работы</Button>
            </div>
          </div>
        </Modal>
      )}

      {refundOpen && (
        <Modal title="Вернуть деньги клиенту" subtitle={`${carTitle} · ${order.number}`} onClose={() => setRefundOpen(false)}>
          <div className="space-y-3 p-4">
            <div className="rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
              <div className="flex justify-between"><span className="muted">Оплачено сейчас</span><b>{formatMoney(paid)}</b></div>
            </div>
            <label className="block text-sm">
              <span className="muted mb-1 block">Сумма возврата, ₽</span>
              <div className="field-control">
                <input
                  autoFocus
                  inputMode="numeric"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(moneyInput(e.target.value))}
                  placeholder={String(paid)}
                  aria-label="Сумма возврата клиенту"
                />
              </div>
            </label>
            <label className="block text-sm">
              <span className="muted mb-1 block">Куда возвращаем</span>
              <div className="field-control">
                <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}>
                  <option value="cash">Наличные</option>
                  <option value="terminal">Терминал / карта</option>
                  <option value="transfer">Перевод / СБП</option>
                </select>
              </div>
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRefundOpen(false)}>Отмена</Button>
              <Button variant="danger" onClick={handleRefundPayment}>Вернуть деньги</Button>
            </div>
          </div>
        </Modal>
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
            <div className="grid gap-2 sm:grid-cols-3">
              <Button variant="secondary" size="sm" onClick={() => {
                setCashAmount(String(debt)); setTerminalAmount(""); setTransferAmount("");
                setCashCommitted(debt); setTerminalCommitted(0); setTransferCommitted(0);
              }}>
                Весь долг наличными
              </Button>
              <Button variant="secondary" size="sm" onClick={() => {
                setCashAmount(""); setTerminalAmount(String(debt)); setTransferAmount("");
                setCashCommitted(0); setTerminalCommitted(debt); setTransferCommitted(0);
              }}>
                Весь долг по карте
              </Button>
              <Button variant="secondary" size="sm" onClick={() => {
                setCashAmount(""); setTerminalAmount(""); setTransferAmount(String(debt));
                setCashCommitted(0); setTerminalCommitted(0); setTransferCommitted(debt);
              }}>
                Весь долг переводом
              </Button>
            </div>
            <label className="block text-sm">
              <span className="muted mb-1 block">Кто принял оплату</span>
              <div className="field-control">
                <select value={paymentEmployee} onChange={(e) => setPaymentEmployee(e.target.value)} aria-label="Кто принял оплату">
                  <option value="">Не указан</option>
                  {employees.map((employee) => <option key={employee.id} value={employee.name}>{employee.name}</option>)}
                </select>
              </div>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="muted mb-1 block">Наличные, ₽</span>
                <div className="field-control">
                  <input
                    autoFocus
                    value={cashAmount}
                    onChange={(e) => setCashAmount(moneyInput(e.target.value))}
                    onBlur={() => setCashCommitted(Number(cashAmount) || 0)}
                    placeholder="0"
                    inputMode="numeric"
                    aria-label="Оплата наличными"
                  />
                </div>
              </label>
              <label className="block text-sm">
                <span className="muted mb-1 block">Терминал / карта, ₽</span>
                <div className="field-control">
                  <input
                    value={terminalAmount}
                    onChange={(e) => setTerminalAmount(moneyInput(e.target.value))}
                    onBlur={() => setTerminalCommitted(Number(terminalAmount) || 0)}
                    placeholder="0"
                    inputMode="numeric"
                    aria-label="Оплата по терминалу"
                  />
                </div>
              </label>
              <label className="block text-sm">
                <span className="muted mb-1 block">Перевод / СБП, ₽</span>
                <div className="field-control">
                  <input
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(moneyInput(e.target.value))}
                    onBlur={() => setTransferCommitted(Number(transferAmount) || 0)}
                    placeholder="0"
                    inputMode="numeric"
                    aria-label="Оплата переводом"
                  />
                </div>
              </label>
            </div>
            {(() => {
              const total = cashCommitted + terminalCommitted + transferCommitted;
              const left = debt - total;
              return (
                <div className="rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
                  <div className="flex justify-between"><span className="muted">Всего принимаем</span><b>{formatMoney(total)}</b></div>
                  <div className="mt-1 flex justify-between"><span className="muted">{left < 0 ? "Превышение" : "Останется"}</span><b style={{ color: left < 0 ? "var(--danger)" : left === 0 ? "var(--accent)" : undefined }}>{formatMoney(Math.abs(left))}</b></div>
                </div>
              );
            })()}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPayOpen(false)}>Отмена</Button>
              <Button onClick={handleAcceptPayment}>Принять</Button>
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
