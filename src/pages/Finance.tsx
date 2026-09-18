import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  IconArrowBackUp, IconBriefcase, IconChartBar, IconChevronLeft,
  IconChevronRight, IconCoin, IconCreditCardPay, IconPlus, IconUsers,
} from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { createId } from "../lib/id";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Confirm";
import { isValidMoney, moneyInput } from "../lib/formats";
import { Button, Card, ListCard, Metric, Page, StatusBadge, TopBar } from "../components/ui";
import { formatDate, formatMoney, plural } from "../lib/format";
import { computePayroll } from "../lib/payroll";
import { paymentMethodSummary } from "../lib/payments";
import { todayISO } from "../lib/date";
import {
  buildChart, buildOperations, computeMetrics, getRange,
  ordersInRange, pendingPayments, previousRange, type PeriodKey,
} from "../lib/analytics";

const EXPENSE_CATEGORIES = ["Закупка запчастей", "Аренда", "Доставка", "Коммунальные услуги", "Инструмент", "Реклама", "Прочее"];
const TABS = ["Обзор", "Операции", "Зарплаты"] as const;
type Tab = (typeof TABS)[number];

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "today", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "year", label: "Год" },
  { value: "all", label: "Всё время" },
];

export default function Finance() {
  const { orders, expenses, payments, employees: rawEmployees, clients, addExpense, confirmRefund } = useAppStore();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>("Обзор");
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [offset, setOffset] = useState(0);
  const [pickedDay, setPickedDay] = useState<number | null>(null);

  const range = useMemo(() => getRange(period, offset), [period, offset]);

  // Единое правило начисления живёт в payroll.ts: там учитываются только выданные заказы.
  const periodOrders = useMemo(() => ordersInRange(range, orders), [orders, range]);
  const employees = useMemo(() => computePayroll(rawEmployees, periodOrders), [periodOrders, rawEmployees]);
  const totalSalaries = employees.reduce((sum, employee) => sum + employee.accrued, 0);
  const metrics = useMemo(() => computeMetrics(range, orders, expenses, totalSalaries, payments), [expenses, orders, payments, range, totalSalaries]);
  const previous = useMemo(() => {
    const prev = previousRange(range);
    if (!prev) return null;
    const prevSalaries = computePayroll(rawEmployees, ordersInRange(prev, orders))
      .reduce((sum, employee) => sum + employee.accrued, 0);
    return computeMetrics(prev, orders, expenses, prevSalaries, payments);
  }, [expenses, orders, payments, range, rawEmployees]);

  const chart = useMemo(() => buildChart(range, payments, expenses), [expenses, payments, range]);
  const methodSummary = useMemo(
    () => paymentMethodSummary(payments, range.from, range.to),
    [payments, range],
  );

  const pending = useMemo(() => pendingPayments(orders, clients), [clients, orders]);
  // Возвраты, по которым деньги ещё не пришли: в расчёт не идут, пока не подтвердят.
  const awaitingRefunds = useMemo(
    () => expenses.filter((expense) => expense.source === "supplier_refund" && expense.status !== "Возвращено"),
    [expenses],
  );

  async function handleConfirmRefund(expenseId: string) {
    const expense = expenses.find((item) => item.id === expenseId);
    if (!expense) return;
    const ok = await confirm({
      title: "Подтвердить возврат денег",
      question: "Подтвердите, что деньги от поставщика пришли. Сумма уменьшит расходы периода и появится в ленте операций.",
      summary: [
        { label: "Возврат", value: expense.description },
        { label: "Поставщик", value: expense.counterparty },
        { label: "Оформлен", value: formatDate(expense.date) },
        { label: "Сумма к возврату", value: `+${formatMoney(expense.amount)}`, total: true, tone: "accent" },
      ],
      confirmLabel: "Деньги пришли",
    });
    if (!ok) return;
    confirmRefund(expenseId);
    showToast(`Возврат подтверждён: ${formatMoney(expense.amount)}`);
  }
  const operations = useMemo(() => buildOperations(range, orders, expenses, payments), [expenses, orders, payments, range]);
  const periodExpenses = useMemo(
    () => expenses
      .filter((expense) => {
        const time = new Date(expense.date).getTime();
        return time >= range.from.getTime() && time <= range.to.getTime();
      })
      .sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, range],
  );

  const [addingExpense, setAddingExpense] = useState(false);
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [counterparty, setCounterparty] = useState("");

  function resetExpenseForm() {
    setAddingExpense(false);
    setCategory(EXPENSE_CATEGORIES[0]);
    setDescription("");
    setAmount("");
    setCounterparty("");
  }

  async function handleAddExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);
    if (!description.trim()) {
      showToast("Опишите, за что расход", "error");
      return;
    }
    if (!isValidMoney(amount)) {
      showToast("Сумма расхода должна быть больше нуля и не более 10 млн ₽", "error");
      return;
    }
    const ok = await confirm({
      title: "Добавить расход",
      question: "Расход попадёт в финансы за сегодня и уменьшит прибыль периода.",
      summary: [
        { label: "Категория", value: category },
        { label: "Описание", value: description.trim() },
        { label: "Поставщик", value: counterparty.trim() || "—" },
        { label: "Сумма", value: `−${formatMoney(value)}`, total: true, tone: "danger" },
      ],
      confirmLabel: "Добавить расход",
    });
    if (!ok) return;
    addExpense({
      id: createId("ex"),
      date: todayISO(),
      category,
      description: description.trim(),
      amount: value,
      counterparty: counterparty.trim() || "—",
      status: "Оплачено",
    });
    showToast(`Расход добавлен: ${formatMoney(value)}`);
    resetExpenseForm();
  }

  function changePeriod(next: PeriodKey) {
    setPeriod(next);
    setOffset(0);
    setPickedDay(null);
  }

  const maxChartValue = Math.max(1, ...chart.map((point) => Math.max(point.revenue, point.expenses)));
  const axisMax = niceMax(maxChartValue);
  const axisTicks = [axisMax, (axisMax / 4) * 3, axisMax / 2, axisMax / 4, 0];

  return (
    <>
      <TopBar
        title="Финансы"
        subtitle="Выручка, расходы и прибыль за выбранный период"
        actions={
          <Button onClick={() => { setTab("Операции"); setAddingExpense(true); }}>
            <IconPlus size={18} /> Добавить расход
          </Button>
        }
      />
      <Page>
        <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl border bg-white p-1" style={{ borderColor: "var(--border)" }}>
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

        {/* Одна строка периода: переключатель, стрелки и сам период рядом. */}
        <div
          className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-white px-3 py-2"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex flex-wrap gap-1">
            {PERIODS.map((item) => (
              <button
                key={item.value}
                onClick={() => changePeriod(item.value)}
                className="rounded-lg px-2.5 py-1.5 text-sm font-medium transition"
                style={{
                  background: period === item.value ? "var(--accent)" : "transparent",
                  color: period === item.value ? "white" : "var(--text-muted)",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          {period !== "all" && (
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setOffset((value) => value - 1)} aria-label="Предыдущий период" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-gray-100">
                <IconChevronLeft size={18} />
              </button>
              <span className="min-w-0 px-1 text-sm font-semibold">{range.title}</span>
              <button onClick={() => setOffset((value) => Math.min(0, value + 1))} disabled={offset >= 0} aria-label="Следующий период" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-gray-100 disabled:opacity-40">
                <IconChevronRight size={18} />
              </button>
              <span className="muted hidden text-xs sm:inline">{range.label}</span>
            </div>
          )}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Metric icon={<IconCreditCardPay size={18} />} label="Выручка по выданным" value={formatMoney(metrics.revenue)} current={metrics.revenue} previous={previous?.revenue} hint={`${metrics.closed.length} ${plural(metrics.closed.length, "выданный заказ", "выданных заказа", "выданных заказов")}`} />
          <Metric icon={<IconBriefcase size={18} />} tone="warning" label="Расходы" value={formatMoney(metrics.expenses)} current={metrics.expenses} previous={previous?.expenses} lowerIsBetter hint="За вычетом возвратов поставщиков" />
          <Metric icon={<IconCoin size={18} />} tone="violet" label="Зарплаты" value={formatMoney(metrics.salaries)} hint="Начислено по выданным заказам" />
          <Metric icon={<IconChartBar size={18} />} label="Прибыль" value={formatMoney(metrics.profit)} current={metrics.profit} previous={previous?.profit} hint="По начислению, не по кассе" />
        </div>
        <p className="muted mb-3 text-xs">
          Выручка и прибыль считаются по выданным заказам. «Получено» и зелёные столбцы графика — реальные движения денег по датам оплаты.
          Возврат клиенту здесь уменьшает кассовые поступления, но сам по себе не пересчитывает стоимость уже выданного заказа и начисление мастеру.
        </p>

        {tab === "Обзор" && (
        <>
        <Card className="mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="panel-title">Сверка оплат</h2>
              <p className="muted mt-1 text-xs">Чистые поступления за период с учётом возвратов клиентам</p>
            </div>
            <b className="tabular-nums">{formatMoney(metrics.received)}</b>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Row label="Наличные" value={methodSummary.cash} />
            <Row label="Терминал / карта" value={methodSummary.terminal} />
            <Row label="Перевод / СБП" value={methodSummary.transfer} />
            <Row label="Способ не указан" value={methodSummary.unknown} />
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="section-kicker">Динамика</p>
                <h2 className="panel-title mt-1">Поступления и расходы</h2>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#1f9d63]" /> Поступления</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#e39230]" /> Расходы</span>
              </div>
            </div>
            {chart.length === 0 || maxChartValue <= 1 ? (
              <p className="muted py-8 text-center text-sm">За этот период движения денег не было.</p>
            ) : (
              <div className="flex gap-2">
                {/* Ось значений: без неё по высоте столбиков ничего не понять. */}
                <div className="flex h-44 w-12 shrink-0 flex-col justify-between text-right text-[10px] muted">
                  {axisTicks.map((tick) => (
                    <span key={tick} className="leading-none">{formatAxis(tick)}</span>
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="relative h-44">
                    <div className="absolute inset-0 flex flex-col justify-between">
                      {axisTicks.map((tick) => (
                        <div key={tick} className="h-px w-full" style={{ background: "#eef0ee" }} />
                      ))}
                    </div>
                    <div className="relative flex h-full items-end gap-0.5 border-b" style={{ borderColor: "var(--border)" }}>
                      {/* Точные суммы доступны нажатием: на телефоне наведения нет. */}
                      {chart.map((point, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setPickedDay(pickedDay === index ? null : index)}
                          aria-label={`${point.label}: выручка ${formatMoney(point.revenue)}, расходы ${formatMoney(point.expenses)}`}
                          title={`${point.label}: выручка ${formatMoney(point.revenue)}, расходы ${formatMoney(point.expenses)}`}
                          className="flex h-full flex-1 items-end gap-px rounded-t-sm transition"
                          style={{ background: pickedDay === index ? "var(--accent-soft)" : undefined }}
                        >
                          <div className="flex-1 rounded-t-sm bg-[#1f9d63]" style={{ height: `${(Math.max(0, point.revenue) / axisMax) * 100}%` }} />
                          <div className="flex-1 rounded-t-sm bg-[#e39230]" style={{ height: `${(Math.max(0, point.expenses) / axisMax) * 100}%` }} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-1 flex gap-0.5 text-[10px] muted">
                    {chart.map((point, index) => (
                      <span
                        key={index}
                        className="min-w-0 flex-1 text-center"
                        style={{ color: pickedDay === index ? "var(--accent)" : undefined, fontWeight: pickedDay === index ? 700 : undefined }}
                      >
                        {chart.length <= 14 || index % Math.ceil(chart.length / 10) === 0 || pickedDay === index ? point.label : ""}
                      </span>
                    ))}
                  </div>

                  {pickedDay !== null && chart[pickedDay] && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg)" }}>
                      <b>{chart[pickedDay].label}</b>
                      <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#1f9d63]" /> {formatMoney(chart[pickedDay].revenue)}</span>
                      <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#e39230]" /> {formatMoney(chart[pickedDay].expenses)}</span>
                      <button onClick={() => setPickedDay(null)} className="muted ml-auto text-xs underline decoration-dotted">Скрыть</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-2 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
              <Row label="Работы" value={metrics.worksRevenue} />
              <Row label="Запчасти клиентам" value={metrics.partsRevenue} />
              <Row label="Получено от клиентов" value={metrics.received} tone="accent" />
              <Row label="Долг клиентов за период" value={metrics.debt} tone={metrics.debt > 0 ? "danger" : undefined} />
              <Row label="Закупка запчастей" value={-metrics.stockPurchases} tone="danger" />
              <Row label="Прочие расходы" value={-metrics.otherExpenses} tone="danger" />
              <Row label="Зарплаты (начислено)" value={-metrics.salaries} tone="danger" />
              {metrics.refunds > 0 && <Row label="Возвраты поставщикам" value={metrics.refunds} tone="accent" />}
              {metrics.payouts > 0 && <Row label="Выплачено зарплат (движение денег)" value={metrics.payouts} />}
              <div className="flex items-center justify-between border-t pt-2 text-base font-semibold" style={{ borderColor: "var(--border)" }}>
                <span>Прибыль</span>
                <span style={{ color: metrics.profit >= 0 ? "var(--accent)" : "var(--danger)" }}>{formatMoney(metrics.profit)}</span>
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            {awaitingRefunds.length > 0 && (
              <Card>
                <h2 className="panel-title mb-3 flex items-center gap-2"><IconArrowBackUp size={18} /> Ждём возврат от поставщика</h2>
                <div className="space-y-2">
                  {awaitingRefunds.map((expense) => (
                    <div key={expense.id} className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <b className="block truncate text-sm">{expense.description}</b>
                          <span className="muted text-xs">{expense.counterparty} · {formatDate(expense.date)}</span>
                        </span>
                        <b className="shrink-0 text-sm tabular-nums">{formatMoney(expense.amount)}</b>
                      </div>
                      {expense.comment && <p className="muted mt-1 text-xs">{expense.comment}</p>}
                      <Button size="sm" className="mt-2 w-full justify-center" onClick={() => handleConfirmRefund(expense.id)}>
                        Подтвердить возврат денег
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card>
              <h2 className="panel-title mb-3 flex items-center gap-2"><IconUsers size={18} /> Ожидаем оплату</h2>
              {pending.length === 0 ? (
                <p className="muted text-sm">Все заказы оплачены.</p>
              ) : (
                <div className="space-y-2">
                  {pending.map((entry) => (
                    <Link
                      key={entry.order.id}
                      to={`/orders/${entry.order.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-sm transition hover:border-[var(--accent)]"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <span className="min-w-0">
                        <b className="block truncate">{entry.client?.name ?? "Клиент"}</b>
                        <span className="muted text-xs">{entry.order.number}</span>
                      </span>
                      <b className="shrink-0 tabular-nums" style={{ color: "var(--danger)" }}>{formatMoney(entry.debt)}</b>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        <p className="muted mt-3 text-sm">
          Средний чек, популярные работы, марки и разбивка расходов — в разделе{" "}
          <Link to="/reports" className="font-semibold text-[var(--accent)]">Отчёты</Link>.
        </p>

        </>
        )}

        {tab === "Операции" && (
        <>
        <Card className="mb-3 overflow-hidden p-0">
          <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
            <h2 className="panel-title">Последние операции</h2>
            <p className="muted mt-1 text-xs">Поступления от клиентов и расходы за выбранный период</p>
          </div>

          <div className="space-y-2 p-3 lg:hidden">
            {operations.map((operation) => (
              <ListCard
                key={operation.id}
                onClick={operation.orderId ? () => navigate(`/orders/${operation.orderId}`) : undefined}
                title={operation.title}
                amount={
                  <span style={{ color: operation.pending ? "var(--text-muted)" : operation.amount >= 0 ? "var(--accent)" : "var(--danger)" }}>
                    {operation.pending
                      ? "ждём возврат"
                      : `${operation.amount >= 0 ? "+" : "−"}${formatMoney(Math.abs(operation.amount))}`}
                  </span>
                }
                lines={[operation.category, operation.orderNumber ?? null]}
                meta={formatDate(operation.date)}
              />
            ))}
            {operations.length === 0 && <p className="muted p-3 text-sm">За этот период операций нет.</p>}
          </div>

          <div className="hidden lg:block">
            <table className="app-table">
              <thead>
                <tr>
                  <th className="w-28">Дата</th>
                  <th>Операция</th>
                  <th className="w-44">Категория</th>
                  <th className="w-40">Связь с заказом</th>
                  <th className="w-32 text-right">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {operations.map((operation) => (
                  <tr key={operation.id}>
                    <td className="muted whitespace-nowrap">{formatDate(operation.date)}</td>
                    <td>{operation.title}</td>
                    <td className="muted">{operation.category}</td>
                    <td>
                      {operation.orderId ? (
                        <Link to={`/orders/${operation.orderId}`} className="font-medium text-[var(--accent)]">{operation.orderNumber}</Link>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="text-right font-semibold tabular-nums" style={{ color: operation.pending ? "var(--text-muted)" : operation.amount >= 0 ? "var(--accent)" : "var(--danger)" }}>
                      {operation.pending
                        ? "ждём возврат"
                        : `${operation.amount >= 0 ? "+" : "−"}${formatMoney(Math.abs(operation.amount))}`}
                    </td>
                  </tr>
                ))}
                {operations.length === 0 && (
                  <tr><td colSpan={5} className="muted text-center">За этот период операций нет.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="mt-3 overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <h2 className="panel-title">Расходы за период</h2>
              <p className="muted mt-1 text-xs">Закупки склада попадают сюда автоматически</p>
            </div>
            {!addingExpense && (
              <Button variant="secondary" onClick={() => setAddingExpense(true)}>
                <IconPlus size={18} /> Добавить расход
              </Button>
            )}
          </div>

          {addingExpense && (
            <form onSubmit={handleAddExpense} className="grid grid-cols-1 gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end" style={{ borderColor: "var(--border)" }}>
              <label className="block text-sm">
                <span className="muted mb-1 block">Категория</span>
                <div className="field-control">
                  <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Категория расхода">
                    {EXPENSE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
              </label>
              <label className="block text-sm lg:col-span-2">
                <span className="muted mb-1 block">За что</span>
                <div className="field-control">
                  <input placeholder="Например, поставка масел" value={description} onChange={(event) => setDescription(event.target.value)} aria-label="За что расход" required />
                </div>
              </label>
              <label className="block text-sm">
                <span className="muted mb-1 block">Сумма, ₽</span>
                <div className="field-control">
                  <input placeholder="12000" inputMode="numeric" value={amount} onChange={(event) => setAmount(moneyInput(event.target.value))} aria-label="Сумма расхода" required />
                </div>
              </label>
              <label className="block text-sm">
                <span className="muted mb-1 block">Кому платим</span>
                <div className="field-control">
                  <input placeholder="Exist.ru" value={counterparty} onChange={(event) => setCounterparty(event.target.value)} aria-label="Кому платим" />
                </div>
              </label>
              <div className="flex gap-2 sm:col-span-2 lg:col-span-5 lg:justify-end">
                <Button variant="secondary" onClick={resetExpenseForm}>Отмена</Button>
                <Button type="submit">Добавить</Button>
              </div>
            </form>
          )}

          <div className="space-y-2 p-3 lg:hidden">
            {periodExpenses.map((expense) => (
              <ListCard
                key={expense.id}
                title={expense.description}
                amount={formatMoney(expense.amount)}
                lines={[`${expense.code ? `${expense.code} · ` : ""}${expense.category}`, expense.counterparty || null]}
                badge={<StatusBadge status={expense.status} />}
                meta={formatDate(expense.date)}
              />
            ))}
            {periodExpenses.length === 0 && <p className="muted p-3 text-sm">За этот период расходов нет.</p>}
          </div>

          <div className="table-scroll hidden lg:block">
            <table className="app-table min-w-[800px]">
              <thead>
                <tr><th>№</th><th>Дата</th><th>Категория</th><th>Описание</th><th className="text-right">Сумма</th><th>Поставщик</th><th>Статус</th></tr>
              </thead>
              <tbody>
                {periodExpenses.map((expense) => (
                  <tr key={expense.id}>
                    <td className="muted whitespace-nowrap">{expense.code}</td>
                    <td className="whitespace-nowrap">{formatDate(expense.date)}</td>
                    <td>{expense.category}</td>
                    <td>{expense.description}</td>
                    <td className="text-right font-medium">{formatMoney(expense.amount)}</td>
                    <td className="muted">{expense.counterparty}</td>
                    <td><StatusBadge status={expense.status} /></td>
                  </tr>
                ))}
                {periodExpenses.length === 0 && (
                  <tr><td colSpan={7} className="muted text-center">За этот период расходов нет.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        </>
        )}

        {tab === "Зарплаты" && (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b p-4" style={{ borderColor: "var(--border)" }}>
            <div>
              <p className="section-kicker">Команда</p>
              <h2 className="panel-title mt-1">Зарплата сотрудников</h2>
            </div>
            <span className="muted text-xs">По выполненным работам</span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {employees.map((employee) => (
              <div key={employee.id} className="flex items-center justify-between gap-3 p-4">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e9f4ed] text-xs font-bold text-[var(--accent)]">
                    {employee.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <b className="block truncate text-sm">{employee.name}</b>
                    <span className="muted block text-xs">
                      {employee.payType === "percent" ? `${employee.payValue}% от работ` : employee.payType === "salary" ? "Оклад" : "Оклад + %"}
                    </span>
                  </span>
                </span>
                <b className="whitespace-nowrap text-sm tabular-nums">{formatMoney(employee.accrued)}</b>
              </div>
            ))}
          </div>
          <div className="border-t bg-[#fafbfa] p-4 text-right font-semibold" style={{ borderColor: "var(--border)" }}>
            Итого к выплате: {formatMoney(totalSalaries)}
          </div>
        </Card>
        )}
      </Page>
    </>
  );
}


function Row({ label, value, tone, raw = false }: { label: string; value: number; tone?: "accent" | "danger"; raw?: boolean }) {
  const resolvedTone = tone ?? (value < 0 ? "danger" : value > 0 ? "accent" : undefined);
  const color = resolvedTone === "accent" ? "var(--accent)" : resolvedTone === "danger" ? "var(--danger)" : undefined;
  const formatted = raw
    ? value
    : `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatMoney(Math.abs(value))}`;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="muted">{label}</span>
      <b className="tabular-nums" style={{ color }}>{formatted}</b>
    </div>
  );
}

/** Округляем верх шкалы до «красивого» числа, чтобы подписи оси читались. */
function niceMax(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

function formatAxis(value: number) {
  if (value === 0) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
  if (value >= 1000) return `${(value / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} тыс.`;
  return value.toLocaleString("ru-RU");
}
