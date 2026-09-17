import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  IconArrowDown, IconArrowUp, IconBox, IconBriefcase, IconChartBar, IconChevronLeft,
  IconChevronRight, IconCoin, IconCreditCardPay, IconPlus, IconUsers,
} from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { createId } from "../lib/id";
import { useToast } from "../components/Toast";
import { Button, Card, ListCard, Page, StatusBadge, TopBar } from "../components/ui";
import { formatDate, formatMoney, plural } from "../lib/format";
import { computePayroll } from "../lib/payroll";
import {
  buildChart, byVehicleMake, clientsBreakdown, computeMetrics, getRange,
  previousRange, stockValue, topDebtors, topServices, type PeriodKey,
} from "../lib/analytics";

const EXPENSE_CATEGORIES = ["Закупка запчастей", "Аренда", "Доставка", "Коммунальные услуги", "Инструмент", "Реклама", "Прочее"];
const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "today", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "year", label: "Год" },
  { value: "all", label: "Всё время" },
];

export default function Finance() {
  const { orders, expenses, employees: rawEmployees, clients, vehicles, stock, addExpense } = useAppStore();
  const { showToast } = useToast();

  const [period, setPeriod] = useState<PeriodKey>("month");
  const [offset, setOffset] = useState(0);

  const employees = computePayroll(rawEmployees, orders);
  const totalSalaries = employees.reduce((sum, employee) => sum + employee.accrued, 0);

  const range = useMemo(() => getRange(period, offset), [period, offset]);
  const metrics = useMemo(() => computeMetrics(range, orders, expenses, totalSalaries), [expenses, orders, range, totalSalaries]);
  const previous = useMemo(() => {
    const prev = previousRange(range);
    return prev ? computeMetrics(prev, orders, expenses, totalSalaries) : null;
  }, [expenses, orders, range, totalSalaries]);

  const chart = useMemo(() => buildChart(range, metrics.orders, expenses.filter((expense) => {
    const time = new Date(expense.date).getTime();
    return time >= range.from.getTime() && time <= range.to.getTime();
  })), [expenses, metrics.orders, range]);

  const services = useMemo(() => topServices(metrics.orders), [metrics.orders]);
  const makes = useMemo(() => byVehicleMake(metrics.orders, vehicles), [metrics.orders, vehicles]);
  const clientStats = useMemo(() => clientsBreakdown(range, metrics.orders, orders), [metrics.orders, orders, range]);
  const debtors = useMemo(() => topDebtors(orders, clients), [clients, orders]);
  const periodExpenses = useMemo(
    () => expenses
      .filter((expense) => {
        const time = new Date(expense.date).getTime();
        return time >= range.from.getTime() && time <= range.to.getTime();
      })
      .sort((a, b) => b.date.localeCompare(a.date)),
    [expenses, range],
  );
  const expensesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    periodExpenses.forEach((expense) => map.set(expense.category, (map.get(expense.category) ?? 0) + expense.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [periodExpenses]);

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

  function handleAddExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);
    if (!description.trim() || value <= 0) return;
    addExpense({
      id: createId("ex"),
      date: new Date().toISOString().slice(0, 10),
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
  }

  const maxChartValue = Math.max(1, ...chart.map((point) => Math.max(point.revenue, point.expenses)));

  return (
    <>
      <TopBar title="Финансы" subtitle="Выручка, расходы, зарплаты и прибыль за выбранный период" hideNewRecordOnMobile />
      <Page>
        <Card className="mb-3">
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map((item) => (
              <button
                key={item.value}
                onClick={() => changePeriod(item.value)}
                className="rounded-lg border px-3 py-1.5 text-sm transition"
                style={{
                  borderColor: period === item.value ? "var(--accent)" : "var(--border)",
                  background: period === item.value ? "var(--accent)" : "white",
                  color: period === item.value ? "white" : "var(--text)",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          {period !== "all" && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button size="icon" variant="secondary" onClick={() => setOffset((value) => value - 1)} aria-label="Предыдущий период">
                <IconChevronLeft size={18} />
              </Button>
              <div className="min-w-0 text-center">
                <div className="truncate text-sm font-semibold">{range.title}</div>
                <div className="muted truncate text-xs">{range.label}</div>
              </div>
              <Button size="icon" variant="secondary" onClick={() => setOffset((value) => Math.min(0, value + 1))} disabled={offset >= 0} aria-label="Следующий период">
                <IconChevronRight size={18} />
              </Button>
            </div>
          )}
        </Card>

        <div className="mb-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MoneyCard icon={<IconCreditCardPay size={20} />} label="Выручка" value={metrics.revenue} previous={previous?.revenue} hint={`${metrics.orders.length} ${plural(metrics.orders.length, "заказ", "заказа", "заказов")}`} />
          <MoneyCard icon={<IconBriefcase size={20} />} label="Расходы" value={metrics.expenses} previous={previous?.expenses} hint="Закупки и прочее" tone="blue" invert />
          <MoneyCard icon={<IconCoin size={20} />} label="Зарплаты" value={metrics.salaries} hint="Начислено мастерам" tone="violet" invert />
          <MoneyCard icon={<IconChartBar size={20} />} label="Прибыль" value={metrics.profit} previous={previous?.profit} hint="После расходов и зарплат" />
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="section-kicker">Динамика</p>
                <h2 className="panel-title mt-1">Выручка и расходы</h2>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#1f9d63]" /> Выручка</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-[#e39230]" /> Расходы</span>
              </div>
            </div>
            {chart.length === 0 || maxChartValue <= 1 ? (
              <p className="muted py-8 text-center text-sm">За этот период движения денег не было.</p>
            ) : (
              <div className="flex h-44 items-end gap-0.5 border-b pb-0" style={{ borderColor: "var(--border)" }}>
                {chart.map((point, index) => (
                  <div key={index} className="flex h-full flex-1 items-end gap-px" title={`${point.label}: выручка ${formatMoney(point.revenue)}, расходы ${formatMoney(point.expenses)}`}>
                    <div className="flex-1 rounded-t-sm bg-[#1f9d63]" style={{ height: `${(point.revenue / maxChartValue) * 100}%` }} />
                    <div className="flex-1 rounded-t-sm bg-[#e39230]" style={{ height: `${(point.expenses / maxChartValue) * 100}%` }} />
                  </div>
                ))}
              </div>
            )}
            {chart.length > 0 && (
              <div className="mt-1 flex justify-between text-[10px] muted">
                <span>{chart[0]?.label}</span>
                <span>{chart[chart.length - 1]?.label}</span>
              </div>
            )}

            <div className="mt-4 space-y-2 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
              <Row label="Работы" value={metrics.worksRevenue} />
              <Row label="Запчасти клиентам" value={metrics.partsRevenue} />
              <Row label="Получено от клиентов" value={metrics.received} tone="accent" />
              <Row label="Долг клиентов за период" value={metrics.debt} tone={metrics.debt > 0 ? "danger" : undefined} />
              <Row label="Закупка запчастей" value={-metrics.stockPurchases} tone="danger" />
              <Row label="Прочие расходы" value={-metrics.otherExpenses} tone="danger" />
              <Row label="Зарплаты" value={-metrics.salaries} tone="danger" />
              <div className="flex items-center justify-between border-t pt-2 text-base font-semibold" style={{ borderColor: "var(--border)" }}>
                <span>Прибыль</span>
                <span style={{ color: metrics.profit >= 0 ? "var(--accent)" : "var(--danger)" }}>{formatMoney(metrics.profit)}</span>
              </div>
            </div>
          </Card>

          <div className="space-y-3">
            <Card>
              <h2 className="panel-title mb-3">Ключевые показатели</h2>
              <div className="grid grid-cols-2 gap-3">
                <Tile label="Средний чек" value={formatMoney(metrics.averageCheck)} />
                <Tile label="Выдано машин" value={String(metrics.closed.length)} />
                <Tile label="Новых клиентов" value={String(clientStats.fresh)} />
                <Tile label="Повторных" value={String(clientStats.repeat)} />
              </div>
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="panel-title flex items-center gap-2"><IconBox size={18} /> Склад</h2>
                <Link to="/stock" className="text-sm font-semibold text-[var(--accent)]">Открыть</Link>
              </div>
              <div className="space-y-2 text-sm">
                <Row label="Стоимость остатка" value={stockValue(stock)} />
                <Row label="Закуплено за период" value={metrics.stockPurchases} />
                <Row label="Заканчивается" value={stock.filter((item) => item.qty <= item.minQty).length} raw />
              </div>
            </Card>

            <Card>
              <h2 className="panel-title mb-3 flex items-center gap-2"><IconUsers size={18} /> Должники</h2>
              {debtors.length === 0 ? (
                <p className="muted text-sm">Долгов нет.</p>
              ) : (
                <div className="space-y-2 text-sm">
                  {debtors.map((debtor) => (
                    <div key={debtor.name} className="flex items-center justify-between gap-2">
                      <span className="truncate">{debtor.name}</span>
                      <b style={{ color: "var(--danger)" }}>{formatMoney(debtor.debt)}</b>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card>
            <h2 className="panel-title mb-3">Популярные работы</h2>
            {services.length === 0 ? <p className="muted text-sm">Работ за период нет.</p> : (
              <div className="space-y-2 text-sm">
                {services.map((service) => (
                  <div key={service.name} className="flex items-center justify-between gap-2">
                    <span className="min-w-0"><b className="block truncate">{service.name}</b><span className="muted text-xs">{service.count} раз</span></span>
                    <b className="shrink-0">{formatMoney(service.revenue)}</b>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="panel-title mb-3">По маркам авто</h2>
            {makes.length === 0 ? <p className="muted text-sm">Данных за период нет.</p> : (
              <div className="space-y-2 text-sm">
                {makes.map((make) => (
                  <div key={make.make} className="flex items-center justify-between gap-2">
                    <span className="min-w-0"><b className="block truncate">{make.make}</b><span className="muted text-xs">{make.count} {plural(make.count, "заказ", "заказа", "заказов")}</span></span>
                    <b className="shrink-0">{formatMoney(make.revenue)}</b>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="panel-title mb-3">Расходы по категориям</h2>
            {expensesByCategory.length === 0 ? <p className="muted text-sm">Расходов за период нет.</p> : (
              <div className="space-y-2 text-sm">
                {expensesByCategory.map(([name, value]) => (
                  <div key={name}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{name}</span>
                      <b className="shrink-0">{formatMoney(value)}</b>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bg)" }}>
                      <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(value / metrics.expenses) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

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
            <form onSubmit={handleAddExpense} className="grid grid-cols-1 gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-5" style={{ borderColor: "var(--border)" }}>
              <div className="field-control">
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {EXPENSE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="field-control lg:col-span-2">
                <input placeholder="Описание" value={description} onChange={(event) => setDescription(event.target.value)} required />
              </div>
              <div className="field-control">
                <input placeholder="Сумма, ₽" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} required />
              </div>
              <div className="field-control">
                <input placeholder="Поставщик" value={counterparty} onChange={(event) => setCounterparty(event.target.value)} />
              </div>
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

        <Card className="mt-3 overflow-hidden p-0">
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
      </Page>
    </>
  );
}

function MoneyCard({ icon, label, value, hint, previous, tone = "green", invert = false }: {
  icon: ReactNode; label: string; value: number; hint: string; previous?: number; tone?: "green" | "blue" | "violet"; invert?: boolean;
}) {
  const colors = { green: "bg-[#e9f5ed] text-[#147449]", blue: "bg-[#edf4ff] text-[#3978c9]", violet: "bg-[#f0efff] text-[#6656b8]" };
  const delta = previous !== undefined && previous !== 0 ? Math.round(((value - previous) / Math.abs(previous)) * 100) : null;
  const positive = invert ? (delta ?? 0) < 0 : (delta ?? 0) > 0;

  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-center gap-2.5">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${colors[tone]}`}>{icon}</div>
        <div className="min-w-0">
          <p className="muted truncate text-xs">{label}</p>
          <p className="truncate text-lg font-bold tabular-nums">{formatMoney(value)}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta !== null && delta !== 0 && (
          <span className="inline-flex items-center gap-0.5 font-semibold" style={{ color: positive ? "var(--accent)" : "var(--danger)" }}>
            {delta > 0 ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />}
            {Math.abs(delta) > 999 ? ">999" : Math.abs(delta)}%
          </span>
        )}
        <span className="muted truncate">{hint}</span>
      </div>
    </Card>
  );
}

function Row({ label, value, tone, raw = false }: { label: string; value: number; tone?: "accent" | "danger"; raw?: boolean }) {
  const color = tone === "accent" ? "var(--accent)" : tone === "danger" ? "var(--danger)" : undefined;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="muted">{label}</span>
      <b style={{ color }}>{raw ? value : formatMoney(Math.abs(value))}</b>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--bg)" }}>
      <p className="muted text-xs">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
    </div>
  );
}
