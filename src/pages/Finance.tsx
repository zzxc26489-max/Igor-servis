import type { ReactNode } from "react";
import { IconBriefcase, IconChartBar, IconCoin, IconCreditCardPay, IconPlus } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Button, Card, Page, StatusBadge, TopBar } from "../components/ui";
import { formatDate, formatMoney } from "../lib/format";
import { computePayroll } from "../lib/payroll";

const daily = [42, 58, 45, 50, 68, 60, 44, 52, 64, 73, 59, 84, 62, 92, 78, 56, 69, 83, 71, 112, 91, 57, 64, 80, 93, 118, 86];

export default function Finance() {
  const { orders, expenses, employees: rawEmployees } = useAppStore();
  const employees = computePayroll(rawEmployees, orders);
  const worksRevenue = orders.reduce((sum, order) => sum + order.works.reduce((s, work) => s + work.price * work.qty, 0), 0);
  const partsRevenue = orders.reduce((sum, order) => sum + order.parts.reduce((s, part) => s + part.price * part.qty, 0), 0);
  const revenue = worksRevenue + partsRevenue;
  const totalExpenses = expenses.reduce((s, expense) => s + expense.amount, 0);
  const totalSalaries = employees.reduce((s, employee) => s + employee.accrued, 0);
  const net = revenue - totalExpenses - totalSalaries;

  return <>
    <TopBar title="Финансы и зарплаты" subtitle="Выручка, себестоимость, зарплаты и чистая прибыль за период." />
    <Page>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyCard icon={<IconCreditCardPay size={25} />} label="Выручка" value={revenue} hint="Работы и запчасти" />
        <MoneyCard icon={<IconBriefcase size={25} />} label="Расходы" value={totalExpenses} hint="Закупки, аренда, прочее" tone="blue" />
        <MoneyCard icon={<IconCoin size={25} />} label="Зарплаты мастерам" value={totalSalaries} hint="Начислено за выполненные работы" tone="violet" />
        <MoneyCard icon={<IconChartBar size={25} />} label="Чистая прибыль" value={net} hint="После расходов и зарплат" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_.8fr]">
        <Card>
          <div className="flex items-center justify-between"><div><h2 className="panel-title">Доходы и расходы по дням</h2><p className="muted mt-1 text-xs">Работы, запчасти и расходы</p></div><span className="rounded-lg bg-[#edf7f0] px-3 py-2 text-sm text-[var(--accent)]">Сентябрь 2026</span></div>
          <div className="mt-8 flex h-52 items-end gap-1 border-b px-2" style={{ borderColor: "var(--border)" }}>{daily.map((height, index) => <div className="group relative flex flex-1 items-end" key={index}><div className="w-full rounded-t-sm bg-[#4aa979]" style={{ height: `${height}%` }} /><div className="absolute bottom-0 w-full rounded-t-sm bg-[#4f91ec]" style={{ height: `${Math.max(8, height * .27)}%` }} /></div>)}</div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm"><Summary label="Выручка за работы" value={worksRevenue} color="#1f9d63" /><Summary label="Выручка за запчасти" value={partsRevenue} color="#4f91ec" /><Summary label="Расходы" value={totalExpenses} color="#e39230" /></div>
        </Card>
        <Card className="p-0 overflow-hidden"><div className="flex items-center justify-between p-4"><h2 className="panel-title">Зарплата сотрудников</h2><span className="text-xs text-[var(--text-muted)]">По выполненным работам</span></div><div className="overflow-auto"><table className="app-table min-w-[500px]"><thead><tr><th>Сотрудник</th><th>Способ расчёта</th><th className="text-right">Начислено</th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id}><td><span className="mr-2 inline-grid h-8 w-8 place-items-center rounded-full bg-[#e9f4ed] text-xs font-bold text-[var(--accent)]">{employee.name.slice(0,2).toUpperCase()}</span><b>{employee.name}</b><div className="muted ml-10 text-xs">{employee.role}</div></td><td className="text-sm">{employee.payType === "percent" ? `${employee.payValue}% от работ` : employee.payType === "salary" ? "Оклад" : "Оклад + %"}</td><td className="text-right font-semibold">{formatMoney(employee.accrued)}</td></tr>)}</tbody></table></div><div className="border-t p-4 text-right font-semibold" style={{ borderColor: "var(--border)" }}>Итого к выплате: {formatMoney(totalSalaries)}</div></Card>
      </div>
      <Card className="mt-4 p-0 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="panel-title">Последние расходы</h2><p className="muted mt-1 text-xs">Оплаченные и ожидающие платежи</p></div><Button variant="secondary"><span className="inline-flex items-center gap-2"><IconPlus size={18} /> Добавить расход</span></Button></div><div className="overflow-auto"><table className="app-table min-w-[800px]"><thead><tr><th>Дата</th><th>Категория</th><th>Описание</th><th className="text-right">Сумма</th><th>Поставщик</th><th>Статус</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id}><td>{formatDate(expense.date)}</td><td>{expense.category}</td><td>{expense.description}</td><td className="text-right font-medium">{formatMoney(expense.amount)}</td><td>{expense.counterparty}</td><td><StatusBadge status={expense.status} /></td></tr>)}</tbody></table></div></Card>
    </Page>
  </>;
}

function MoneyCard({ icon, label, value, hint, tone = "green" }: { icon: ReactNode; label: string; value: number; hint: string; tone?: "green" | "blue" | "violet" }) {
  const colors = { green: "bg-[#e9f5ed] text-[#147449]", blue: "bg-[#edf4ff] text-[#3978c9]", violet: "bg-[#f0efff] text-[#6656b8]" };
  return <Card className="flex items-start gap-3"><div className={`grid h-11 w-11 place-items-center rounded-xl ${colors[tone]}`}>{icon}</div><div><p className="muted text-sm">{label}</p><p className="mt-1 text-2xl font-semibold">{formatMoney(value)}</p><p className="mt-1 text-xs text-[var(--accent)]">{hint}</p></div></Card>;
}

function Summary({ label, value, color }: { label: string; value: number; color: string }) { return <div><div className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><i className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{label}</div><b className="mt-1 block">{formatMoney(value)}</b></div>; }
