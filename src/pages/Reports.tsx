import { useAppStore } from "../store/AppStore";
import { Card, Page, StatTile, TopBar } from "../components/ui";
import { formatMoney } from "../lib/format";
import { computePayroll } from "../lib/payroll";

export default function Reports() {
  const { orders, expenses, employees: rawEmployees, stock } = useAppStore();
  const employees = computePayroll(rawEmployees, orders);

  const revenue = orders.reduce((sum, o) => {
    const works = o.works.reduce((s, w) => s + w.price * w.qty, 0);
    const parts = o.parts.reduce((s, p) => s + p.price * p.qty, 0);
    return sum + works + parts;
  }, 0);
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const salariesTotal = employees.reduce((s, e) => s + e.accrued, 0);
  const stockValue = stock.reduce((s, i) => s + i.purchasePrice * i.qty, 0);

  return (
    <>
      <TopBar title="Отчёты" subtitle="Сводка по автосервису" />
      <Page>
        <div className="flex flex-wrap gap-4">
          <StatTile label="Выручка" value={formatMoney(revenue)} />
          <StatTile label="Расходы" value={formatMoney(expensesTotal)} />
          <StatTile label="Зарплаты" value={formatMoney(salariesTotal)} />
          <StatTile label="Стоимость склада" value={formatMoney(stockValue)} />
          <StatTile label="Чистая прибыль" value={formatMoney(revenue - expensesTotal - salariesTotal)} />
        </div>
        <Card className="mt-4">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Раздел будет расширен: отчёты по периодам, по сотрудникам, по загруженности подъёмников и по популярным услугам.
          </p>
        </Card>
      </Page>
    </>
  );
}
