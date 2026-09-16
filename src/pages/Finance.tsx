import { useState, type FormEvent, type ReactNode } from "react";
import { IconBriefcase, IconChartBar, IconCoin, IconCreditCardPay, IconPlus } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { useToast } from "../components/Toast";
import { Button, Card, Page, StatusBadge, TopBar } from "../components/ui";
import { formatDate, formatMoney } from "../lib/format";
import { computePayroll } from "../lib/payroll";

const daily = [42, 58, 45, 50, 68, 60, 44, 52, 64, 73, 59, 84, 62, 92, 78, 56, 69, 83, 71, 112, 91, 57, 64, 80, 93, 118, 86];
const EXPENSE_CATEGORIES = ["Закупка запчастей", "Аренда", "Доставка", "Коммунальные услуги", "Прочее"];

export default function Finance() {
  const { orders, expenses, employees: rawEmployees, addExpense } = useAppStore();
  const { showToast } = useToast();
  const employees = computePayroll(rawEmployees, orders);
  const worksRevenue = orders.reduce((sum, order) => sum + order.works.reduce((s, work) => s + work.price * work.qty, 0), 0);
  const partsRevenue = orders.reduce((sum, order) => sum + order.parts.reduce((s, part) => s + part.price * part.qty, 0), 0);
  const revenue = worksRevenue + partsRevenue;
  const totalExpenses = expenses.reduce((s, expense) => s + expense.amount, 0);
  const totalSalaries = employees.reduce((s, employee) => s + employee.accrued, 0);
  const net = revenue - totalExpenses - totalSalaries;

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

  function handleAddExpense(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = Number(amount);
    if (!description.trim() || value <= 0) return;
    addExpense({
      id: `ex-${Date.now()}`,
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

  return <>
    <TopBar title="Финансы и зарплаты" subtitle="Выручка, себестоимость, зарплаты и чистая прибыль за период." />
    <Page>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MoneyCard icon={<IconCreditCardPay size={25} />} label="Выручка" value={revenue} hint="Работы и запчасти" />
        <MoneyCard icon={<IconBriefcase size={25} />} label="Расходы" value={totalExpenses} hint="Закупки, аренда, прочее" tone="blue" />
        <MoneyCard icon={<IconCoin size={25} />} label="Зарплаты мастерам" value={totalSalaries} hint="Начислено за выполненные работы" tone="violet" />
        <MoneyCard icon={<IconChartBar size={25} />} label="Чистая прибыль" value={net} hint="После расходов и зарплат" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_.8fr]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="section-kicker">Динамика месяца</p><h2 className="panel-title mt-1">Доходы и расходы по дням</h2><p className="muted mt-1 text-xs">Работы, запчасти и расходы</p></div><span className="rounded-lg bg-[#edf7f0] px-3 py-2 text-sm font-semibold text-[var(--accent)]">Сентябрь 2026</span></div>
          <div className="mt-6 flex h-52 items-end gap-1 border-b px-2" style={{ borderColor: "var(--border)" }}>{daily.map((height, index) => <div className="group relative flex h-full flex-1 items-end" key={index} title={`${index + 1} сентября`}><div className="w-full rounded-t-sm bg-[#4aa979]" style={{ height: `${height}%` }} /><div className="absolute bottom-0 w-full rounded-t-sm bg-[#4f91ec]" style={{ height: `${Math.max(8, height * .27)}%` }} /></div>)}</div>
          <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3"><Summary label="Выручка за работы" value={worksRevenue} color="#1f9d63" /><Summary label="Выручка за запчасти" value={partsRevenue} color="#4f91ec" /><Summary label="Расходы" value={totalExpenses} color="#e39230" /></div>
        </Card>
        <Card className="overflow-hidden p-0"><div className="flex items-center justify-between border-b p-4" style={{ borderColor: "var(--border)" }}><div><p className="section-kicker">Команда</p><h2 className="panel-title mt-1">Зарплата сотрудников</h2></div><span className="text-xs text-[var(--text-muted)]">По выполненным работам</span></div><div className="divide-y sm:hidden" style={{ borderColor: "var(--border)" }}>{employees.map((employee) => <div key={employee.id} className="p-4"><div className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e9f4ed] text-xs font-bold text-[var(--accent)]">{employee.name.slice(0,2).toUpperCase()}</span><span className="min-w-0"><b className="block truncate text-sm">{employee.name}</b><span className="muted block truncate text-xs">{employee.role}</span></span></span><b className="whitespace-nowrap text-sm tabular-nums">{formatMoney(employee.accrued)}</b></div><p className="muted mt-2 pl-10 text-xs">{employee.payType === "percent" ? `${employee.payValue}% от работ` : employee.payType === "salary" ? "Оклад" : "Оклад + %"}</p></div>)}</div><div className="hidden overflow-auto sm:block"><table className="app-table min-w-[500px]"><thead><tr><th>Сотрудник</th><th>Способ расчёта</th><th className="text-right">Начислено</th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id}><td><span className="mr-2 inline-grid h-8 w-8 place-items-center rounded-full bg-[#e9f4ed] text-xs font-bold text-[var(--accent)]">{employee.name.slice(0,2).toUpperCase()}</span><b>{employee.name}</b><div className="muted ml-10 text-xs">{employee.role}</div></td><td className="text-sm">{employee.payType === "percent" ? `${employee.payValue}% от работ` : employee.payType === "salary" ? "Оклад" : "Оклад + %"}</td><td className="text-right font-semibold tabular-nums">{formatMoney(employee.accrued)}</td></tr>)}</tbody></table></div><div className="border-t bg-[#fafbfa] p-4 text-right font-semibold" style={{ borderColor: "var(--border)" }}>Итого к выплате: {formatMoney(totalSalaries)}</div></Card>
      </div>
      <Card className="mt-4 p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="panel-title">Последние расходы</h2>
            <p className="muted mt-1 text-xs">Оплаченные и ожидающие платежи</p>
          </div>
          {!addingExpense && (
            <Button variant="secondary" onClick={() => setAddingExpense(true)}>
              <span className="inline-flex items-center gap-2"><IconPlus size={18} /> Добавить расход</span>
            </Button>
          )}
        </div>

        {addingExpense && (
          <form onSubmit={handleAddExpense} className="grid grid-cols-1 gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-5" style={{ borderColor: "var(--border)" }}>
            <div className="field-control">
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field-control lg:col-span-2">
              <input placeholder="Описание" value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>
            <div className="field-control">
              <input placeholder="Сумма, ₽" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} required />
            </div>
            <div className="field-control">
              <input placeholder="Поставщик" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
            </div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-5 lg:justify-end">
              <Button variant="secondary" onClick={resetExpenseForm}>Отмена</Button>
              <Button type="submit">Добавить</Button>
            </div>
          </form>
        )}

        <div className="overflow-auto">
          <table className="app-table min-w-[800px]">
            <thead><tr><th>Дата</th><th>Категория</th><th>Описание</th><th className="text-right">Сумма</th><th>Поставщик</th><th>Статус</th></tr></thead>
            <tbody>{expenses.map((expense) => <tr key={expense.id}><td>{formatDate(expense.date)}</td><td>{expense.category}</td><td>{expense.description}</td><td className="text-right font-medium">{formatMoney(expense.amount)}</td><td>{expense.counterparty}</td><td><StatusBadge status={expense.status} /></td></tr>)}</tbody>
          </table>
        </div>
      </Card>
    </Page>
  </>;
}

function MoneyCard({ icon, label, value, hint, tone = "green" }: { icon: ReactNode; label: string; value: number; hint: string; tone?: "green" | "blue" | "violet" }) {
  const colors = { green: "bg-[#e9f5ed] text-[#147449]", blue: "bg-[#edf4ff] text-[#3978c9]", violet: "bg-[#f0efff] text-[#6656b8]" };
  return <Card className="flex min-h-[124px] flex-col items-start gap-2 p-3 sm:min-h-[112px] sm:flex-row sm:items-center sm:gap-3 sm:p-4"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-11 sm:w-11 ${colors[tone]}`}>{icon}</div><div className="min-w-0"><p className="truncate text-xs muted sm:text-sm">{label}</p><p className="mt-1 truncate text-lg font-bold tracking-[-0.03em] tabular-nums sm:text-2xl">{formatMoney(value)}</p><p className="mt-1 line-clamp-1 text-[11px] text-[var(--accent)] sm:text-xs">{hint}</p></div></Card>;
}

function Summary({ label, value, color }: { label: string; value: number; color: string }) { return <div><div className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><i className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{label}</div><b className="mt-1 block">{formatMoney(value)}</b></div>; }
