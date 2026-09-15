import { useAppStore } from "../store/AppStore";
import { Card, Page, TopBar } from "../components/ui";
import { formatMoney } from "../lib/format";
import { computePayroll } from "../lib/payroll";

export default function Employees() {
  const { employees: rawEmployees, orders } = useAppStore();
  const employees = computePayroll(rawEmployees, orders);
  const totalAccrued = employees.reduce((s, e) => s + e.accrued, 0);

  return (
    <>
      <TopBar title="Сотрудники" subtitle={`${employees.length} человек · начислено за период ${formatMoney(totalAccrued)}`} />
      <Page>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((e) => (
            <Card key={e.id} className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e9f4ed] text-sm font-bold text-[var(--accent)]">
                {e.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{e.name}</div>
                <div className="muted mb-3 text-sm">{e.role}</div>
                <div className="flex justify-between text-sm">
                  <span className="muted">Расчёт</span>
                  <span>{e.payType === "percent" ? `${e.payValue}% от работ` : e.payType === "salary" ? "Оклад" : "Оклад + %"}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="muted">Начислено</span>
                  <span className="font-semibold">{formatMoney(e.accrued)}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Page>
    </>
  );
}
