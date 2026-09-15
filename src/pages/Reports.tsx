import { IconBriefcase, IconChartBar, IconCoin, IconCreditCardPay, IconGauge, IconTool } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Card, Page, TopBar } from "../components/ui";
import { formatMoney } from "../lib/format";
import { computePayroll } from "../lib/payroll";
import type { ReactNode } from "react";

export default function Reports() {
  const { orders, expenses, employees: rawEmployees, stock, lifts } = useAppStore();
  const employees = computePayroll(rawEmployees, orders);

  const revenue = orders.reduce((sum, o) => {
    const works = o.works.reduce((s, w) => s + w.price * w.qty, 0);
    const parts = o.parts.reduce((s, p) => s + p.price * p.qty, 0);
    return sum + works + parts;
  }, 0);
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const salariesTotal = employees.reduce((s, e) => s + e.accrued, 0);
  const stockValue = stock.reduce((s, i) => s + i.purchasePrice * i.qty, 0);

  const busyLifts = lifts.filter((l) => orders.some((o) => o.liftId === l.id && o.status !== "выдан")).length;
  const loadPercent = lifts.length ? Math.round((busyLifts / lifts.length) * 100) : 0;

  const serviceCounts = new Map<string, { count: number; revenue: number }>();
  for (const order of orders) {
    for (const work of order.works) {
      const entry = serviceCounts.get(work.name) ?? { count: 0, revenue: 0 };
      entry.count += work.qty;
      entry.revenue += work.price * work.qty;
      serviceCounts.set(work.name, entry);
    }
  }
  const topServices = Array.from(serviceCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  return (
    <>
      <TopBar title="Отчёты" subtitle="Сводка по автосервису за текущий период" />
      <Page>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric icon={<IconCreditCardPay size={22} />} label="Выручка" value={formatMoney(revenue)} tone="green" />
          <Metric icon={<IconBriefcase size={22} />} label="Расходы" value={formatMoney(expensesTotal)} tone="blue" />
          <Metric icon={<IconCoin size={22} />} label="Зарплаты" value={formatMoney(salariesTotal)} tone="violet" />
          <Metric icon={<IconTool size={22} />} label="Стоимость склада" value={formatMoney(stockValue)} tone="blue" />
          <Metric icon={<IconChartBar size={22} />} label="Чистая прибыль" value={formatMoney(revenue - expensesTotal - salariesTotal)} tone="green" />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <IconGauge size={20} className="text-[var(--accent)]" />
              <h2 className="panel-title">Загруженность подъёмников</h2>
            </div>
            <div className="mb-2 flex items-end justify-between">
              <span className="text-3xl font-bold">{loadPercent}%</span>
              <span className="muted text-sm">
                {busyLifts} из {lifts.length} занято сейчас
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#eef0ee]">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${loadPercent}%` }} />
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="p-4 pb-0">
              <h2 className="panel-title">Популярные услуги</h2>
              <p className="muted mt-1 text-xs">По количеству выполнений</p>
            </div>
            <table className="app-table mt-2">
              <thead>
                <tr>
                  <th>Услуга</th>
                  <th className="text-right">Кол-во</th>
                  <th className="text-right">Выручка</th>
                </tr>
              </thead>
              <tbody>
                {topServices.map(([name, data]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td className="text-right">{data.count}</td>
                    <td className="text-right font-medium">{formatMoney(data.revenue)}</td>
                  </tr>
                ))}
                {topServices.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center muted">
                      Пока нет выполненных работ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>

        <Card className="mt-4">
          <p className="text-sm muted">
            Раздел будет расширен: отчёты по периодам и по сотрудникам.
          </p>
        </Card>
      </Page>
    </>
  );
}

function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: "green" | "blue" | "violet" }) {
  const colors = { green: "bg-[#e9f5ed] text-[#147449]", blue: "bg-[#edf4ff] text-[#3978c9]", violet: "bg-[#f0efff] text-[#6656b8]" };
  return (
    <Card className="flex items-start gap-3">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${colors[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="muted text-sm">{label}</p>
        <p className="mt-1 text-xl font-semibold">{value}</p>
      </div>
    </Card>
  );
}
