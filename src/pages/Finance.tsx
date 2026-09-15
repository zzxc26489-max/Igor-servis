import { useAppStore } from "../store/AppStore";
import { Button, Card, Page, StatTile, StatusBadge, TopBar } from "../components/ui";
import { formatDate, formatMoney } from "../lib/format";

export default function Finance() {
  const { orders, expenses, employees, invoices } = useAppStore();

  const revenue = orders.reduce((sum, o) => {
    const works = o.works.reduce((s, w) => s + w.price * w.qty, 0);
    const parts = o.parts.reduce((s, p) => s + p.price * p.qty, 0);
    return sum + works + parts;
  }, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalSalaries = employees.reduce((s, e) => s + e.accrued, 0);
  const net = revenue - totalExpenses - totalSalaries;

  return (
    <>
      <TopBar title="Финансы и зарплаты" subtitle="Выручка, расходы, зарплаты и счета клиентам — всё в одном месте" />
      <Page>
        <div className="flex flex-wrap gap-4 mb-6">
          <StatTile label="Выручка" value={formatMoney(revenue)} />
          <StatTile label="Расходы" value={formatMoney(totalExpenses)} />
          <StatTile label="Зарплаты" value={formatMoney(totalSalaries)} />
          <StatTile label="Чистая прибыль" value={formatMoney(net)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 pb-0 flex items-center justify-between">
              <h2 className="font-semibold">Зарплата сотрудников</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <th className="px-4 py-2 font-medium">Сотрудник</th>
                  <th className="px-4 py-2 font-medium">Расчёт</th>
                  <th className="px-4 py-2 font-medium text-right">Начислено</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2">
                      {e.name}
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {e.role}
                      </div>
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>
                      {e.payType === "percent" ? `${e.payValue}% от работ` : e.payType === "salary" ? "Оклад" : "Оклад + %"}
                    </td>
                    <td className="px-4 py-2 text-right">{formatMoney(e.accrued)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="p-4 pb-0 flex items-center justify-between">
              <h2 className="font-semibold">Счета клиентам</h2>
              <Button>+ Новый счёт</Button>
            </div>
            <table className="w-full text-sm mt-3">
              <thead>
                <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <th className="px-4 py-2 font-medium">№</th>
                  <th className="px-4 py-2 font-medium">Дата</th>
                  <th className="px-4 py-2 font-medium text-right">Сумма</th>
                  <th className="px-4 py-2 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2">{inv.number}</td>
                    <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>
                      {formatDate(inv.issuedAt)}
                    </td>
                    <td className="px-4 py-2 text-right">{formatMoney(inv.amount)}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={inv.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="p-4 pb-0 flex items-center justify-between">
            <h2 className="font-semibold">Последние расходы</h2>
            <Button variant="secondary">+ Добавить расход</Button>
          </div>
          <table className="w-full text-sm mt-3">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="px-4 py-2 font-medium">Дата</th>
                <th className="px-4 py-2 font-medium">Категория</th>
                <th className="px-4 py-2 font-medium">Описание</th>
                <th className="px-4 py-2 font-medium text-right">Сумма</th>
                <th className="px-4 py-2 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>
                    {formatDate(e.date)}
                  </td>
                  <td className="px-4 py-2">{e.category}</td>
                  <td className="px-4 py-2">{e.description}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(e.amount)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={e.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Page>
    </>
  );
}
