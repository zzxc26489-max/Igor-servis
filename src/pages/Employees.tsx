import { useState } from "react";
import { IconCash, IconCheck } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Button, Card, Modal, Page, TopBar } from "../components/ui";
import { useConfirm } from "../components/Confirm";
import { useToast } from "../components/Toast";
import { formatDate, formatMoney, plural } from "../lib/format";
import { computePayroll, payrollBalance } from "../lib/payroll";
import { moneyInput } from "../lib/formats";
import type { Employee } from "../types";

function payLabel(employee: Employee) {
  if (employee.payType === "percent") return `${employee.payValue}% от работ`;
  if (employee.payType === "salary") return `Оклад ${formatMoney(employee.payValue)} в месяц`;
  return `Оклад + ${employee.payValue}% от работ`;
}

export default function Employees() {
  const { employees: rawEmployees, orders, payEmployee } = useAppStore();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [payFor, setPayFor] = useState<string | null>(null);

  const employees = computePayroll(rawEmployees, orders);
  const totalAccrued = employees.reduce((sum, employee) => sum + employee.accrued, 0);
  const totalDue = employees.reduce((sum, employee) => sum + payrollBalance(employee), 0);
  const target = employees.find((employee) => employee.id === payFor) ?? null;

  async function handlePay(employee: Employee, amount: number) {
    if (amount <= 0) {
      showToast("Сумма выплаты должна быть больше нуля", "error");
      return;
    }
    const sdelnaya = employee.payType !== "salary";
    const balance = payrollBalance(employee);
    if (sdelnaya && amount > balance) {
      showToast(`К выплате осталось ${formatMoney(balance)}`, "error");
      return;
    }
    const ok = await confirm({
      title: "Выплата зарплаты",
      question: sdelnaya
        ? "Выплата запишется как движение денег. Начисление уже учтено в прибыли, поэтому повторно расходы не вырастут."
        : "Оклад запишется в расходы за сегодня и уменьшит прибыль периода.",
      summary: [
        { label: "Сотрудник", value: employee.name },
        { label: "Расчёт", value: payLabel(employee) },
        ...(sdelnaya
          ? [
              { label: "Начислено всего", value: formatMoney(employee.accrued) },
              { label: "Уже выплачено", value: formatMoney(employee.paid) },
              { label: "Остаток после выплаты", value: formatMoney(balance - amount) },
            ]
          : []),
        { label: "Выплачиваем", value: formatMoney(amount), total: true, tone: "accent" },
      ],
      confirmLabel: "Выплатить",
    });
    if (!ok) return;
    payEmployee(employee.id, amount);
    setPayFor(null);
    showToast(`Выплачено ${formatMoney(amount)} · ${employee.name}`);
  }

  return (
    <>
      <TopBar
        title="Сотрудники"
        subtitle={`${employees.length} ${plural(employees.length, "сотрудник", "сотрудника", "сотрудников")} · начислено ${formatMoney(totalAccrued)} · к выплате ${formatMoney(totalDue)}`}
      />
      <Page>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {employees.map((employee) => {
            const balance = payrollBalance(employee);
            const sdelnaya = employee.payType !== "salary";
            return (
              <Card key={employee.id}>
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#e9f4ed] text-sm font-bold text-[var(--accent)]">
                    {employee.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{employee.name}</div>
                    <div className="muted text-sm">{employee.role}</div>
                  </div>
                </div>

                <div className="mt-3 space-y-1 border-t pt-3 text-sm" style={{ borderColor: "var(--border)" }}>
                  <div className="flex justify-between"><span className="muted">Расчёт</span><span className="text-right">{payLabel(employee)}</span></div>
                  {sdelnaya && (
                    <>
                      <div className="flex justify-between"><span className="muted">Начислено</span><span className="tabular-nums">{formatMoney(employee.accrued)}</span></div>
                      <div className="flex justify-between"><span className="muted">Выплачено</span><span className="tabular-nums">{formatMoney(employee.paid)}</span></div>
                      <div className="flex justify-between font-semibold">
                        <span>К выплате</span>
                        <span className="tabular-nums" style={{ color: balance > 0 ? "var(--danger)" : "var(--accent)" }}>{formatMoney(balance)}</span>
                      </div>
                    </>
                  )}
                  {!sdelnaya && (
                    <div className="flex justify-between"><span className="muted">Выплачено всего</span><span className="tabular-nums">{formatMoney(employee.paid)}</span></div>
                  )}
                  {employee.lastPaidAt && (
                    <div className="flex justify-between"><span className="muted">Последняя выплата</span><span>{formatDate(employee.lastPaidAt)}</span></div>
                  )}
                </div>

                <Button
                  className="mt-3 w-full justify-center"
                  variant={sdelnaya && balance === 0 ? "secondary" : "primary"}
                  disabled={sdelnaya && balance === 0}
                  onClick={() => setPayFor(employee.id)}
                >
                  {sdelnaya && balance === 0 ? <><IconCheck size={18} /> Всё выплачено</> : <><IconCash size={18} /> Выплатить</>}
                </Button>
              </Card>
            );
          })}
        </div>
      </Page>

      {target && (
        <PayDialog
          employee={target}
          onClose={() => setPayFor(null)}
          onSubmit={(amount) => handlePay(target, amount)}
        />
      )}
    </>
  );
}

function PayDialog({
  employee, onClose, onSubmit,
}: {
  employee: Employee;
  onClose: () => void;
  onSubmit: (amount: number) => void;
}) {
  const sdelnaya = employee.payType !== "salary";
  const suggested = sdelnaya ? payrollBalance(employee) : employee.payValue;
  const [amount, setAmount] = useState(String(suggested));
  const value = Number(amount) || 0;

  return (
    <Modal title="Выплата зарплаты" subtitle={employee.name} onClose={onClose}>
      <div className="space-y-3 p-4">
        <div className="rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
          <div className="flex justify-between"><span className="muted">Расчёт</span><b>{payLabel(employee)}</b></div>
          {sdelnaya && <div className="flex justify-between"><span className="muted">К выплате</span><b>{formatMoney(suggested)}</b></div>}
        </div>
        <label className="block text-sm">
          <span className="muted mb-1 block">Сумма выплаты, ₽</span>
          <div className="field-control">
            <input
              autoFocus
              inputMode="numeric"
              aria-label="Сумма выплаты"
              value={amount}
              onChange={(event) => setAmount(moneyInput(event.target.value))}
              onKeyDown={(event) => event.key === "Enter" && onSubmit(value)}
            />
          </div>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={() => onSubmit(value)} disabled={value <= 0 || (sdelnaya && value > suggested)}>
            Выплатить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
