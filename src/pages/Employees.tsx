import { useAppStore } from "../store/AppStore";
import { Card, Page, TopBar } from "../components/ui";
import { formatMoney } from "../lib/format";
import { computePayroll } from "../lib/payroll";

export default function Employees() {
  const { employees: rawEmployees, orders } = useAppStore();
  const employees = computePayroll(rawEmployees, orders);

  return (
    <>
      <TopBar title="Сотрудники" subtitle={`Всего: ${employees.length}`} />
      <Page>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((e) => (
            <Card key={e.id}>
              <div className="font-semibold">{e.name}</div>
              <div className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
                {e.role}
              </div>
              <div className="flex justify-between text-sm">
                <span>Расчёт</span>
                <span>{e.payType === "percent" ? `${e.payValue}% от работ` : e.payType === "salary" ? "Оклад" : "Оклад + %"}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span>Начислено</span>
                <span className="font-medium">{formatMoney(e.accrued)}</span>
              </div>
            </Card>
          ))}
        </div>
      </Page>
    </>
  );
}
