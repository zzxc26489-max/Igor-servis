import { useRef, useState } from "react";
import { IconCash, IconCheck, IconChevronDown, IconChevronUp, IconPercentage } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Button, Card, Modal, Page, TopBar } from "../components/ui";
import { useConfirm } from "../components/Confirm";
import { useToast } from "../components/Toast";
import { formatDate, formatMoney, plural } from "../lib/format";
import { computePayroll, employeeSalaryAmount, employeeWorkPercent, payrollBalance, payrollBreakdown } from "../lib/payroll";
import { moneyInput } from "../lib/formats";
import type { Employee, PaymentMethod, PayrollComponent } from "../types";
import { paymentMethodLabel } from "../lib/payments";
import { activeCashShift } from "../lib/cashShift";

function payLabel(employee: Employee) {
  if (employee.payType === "percent") return `${employeeWorkPercent(employee)}% от работ`;
  if (employee.payType === "salary") return `Оклад ${formatMoney(employeeSalaryAmount(employee))} в месяц`;
  return `Оклад ${formatMoney(employeeSalaryAmount(employee))} + ${employeeWorkPercent(employee)}% от работ`;
}

export default function Employees() {
  const { employees: rawEmployees, orders, cashShifts, payEmployee, updateEmployee, cloud } = useAppStore();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [payFor, setPayFor] = useState<string | null>(null);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [rateFor, setRateFor] = useState<string | null>(null);
  const [termsFor, setTermsFor] = useState<string | null>(null);
  const paySubmitRef = useRef(false);
  const payOperationRef = useRef<{ fingerprint: string; id: string } | null>(null);

  const employees = computePayroll(rawEmployees, orders);
  const totalAccrued = employees.reduce((sum, employee) => sum + employee.accrued, 0);
  const totalDue = employees.reduce((sum, employee) => sum + payrollBalance(employee), 0);
  const target = employees.find((employee) => employee.id === payFor) ?? null;
  const rateTarget = rawEmployees.find((employee) => employee.id === rateFor) ?? null;
  const termsTarget = rawEmployees.find((employee) => employee.id === termsFor) ?? null;
  const canEditRates = !cloud.configured || cloud.role === "owner" || cloud.role === "partner";

  async function handlePay(employee: Employee, amount: number, method: PaymentMethod, component: PayrollComponent) {
    if (paySubmitRef.current) return;
    if (method === "cash" && !activeCashShift(cashShifts)) {
      showToast("Для выплаты наличными сначала откройте кассовую смену в Финансах → Касса", "error");
      return;
    }
    if (amount <= 0) {
      showToast("Сумма выплаты должна быть больше нуля", "error");
      return;
    }
    const isPiecework = component === "piecework";
    const balance = payrollBalance(employee);
    if (isPiecework && amount > balance) {
      showToast(`По проценту к выплате осталось ${formatMoney(balance)}`, "error");
      return;
    }
    const ok = await confirm({
      title: "Выплата зарплаты",
      question: isPiecework
        ? "Сдельная выплата запишется как движение денег. Начисление уже учтено в прибыли, поэтому повторно расходы не вырастут."
        : "Оклад запишется отдельным расходом за сегодня и уменьшит прибыль периода.",
      summary: [
        { label: "Сотрудник", value: employee.name },
        { label: "Расчёт", value: payLabel(employee) },
        { label: "Способ выплаты", value: paymentMethodLabel(method) },
        ...(isPiecework
          ? [
              { label: "Начислено по работам", value: formatMoney(employee.accrued) },
              { label: "Уже выплачено %", value: formatMoney(employee.paid) },
              { label: "Остаток после выплаты", value: formatMoney(balance - amount) },
            ]
          : [
              { label: "Месячный оклад", value: formatMoney(employeeSalaryAmount(employee)) },
            ]),
        { label: "Выплачиваем", value: formatMoney(amount), total: true, tone: "accent" },
      ],
      confirmLabel: "Выплатить",
    });
    if (!ok) return;

    const fingerprint = JSON.stringify({ employeeId: employee.id, amount, method, component });
    if (!payOperationRef.current || payOperationRef.current.fingerprint !== fingerprint) {
      payOperationRef.current = { fingerprint, id: `payroll-${crypto.randomUUID()}` };
    }

    paySubmitRef.current = true;
    try {
      const payError = await payEmployee(
        employee.id,
        amount,
        undefined,
        method,
        component,
        payOperationRef.current.id,
      );
      if (payError) {
        showToast(payError, "error");
        return;
      }
      payOperationRef.current = null;
      setPayFor(null);
      showToast(`Выплачено ${formatMoney(amount)} · ${employee.name}`);
    } finally {
      paySubmitRef.current = false;
    }
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
                  <div className="flex justify-between gap-3"><span className="muted">Расчёт</span><span className="text-right">{payLabel(employee)}</span></div>
                  {employee.payType !== "percent" && (
                    <div className="flex justify-between"><span className="muted">Оклад</span><span className="tabular-nums">{formatMoney(employeeSalaryAmount(employee))}</span></div>
                  )}
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

                {canEditRates && (
                  <Button
                    className="mt-3 w-full justify-center"
                    variant="secondary"
                    onClick={() => setTermsFor(employee.id)}
                  >
                    Условия зарплаты
                  </Button>
                )}

                {sdelnaya && canEditRates && (
                  <Button
                    className="mt-3 w-full justify-center"
                    variant="secondary"
                    onClick={() => setRateFor(employee.id)}
                  >
                    <IconPercentage size={18} /> Процент от работ: {employeeWorkPercent(employee)}%
                  </Button>
                )}

                {sdelnaya && (
                  <>
                    <button
                      type="button"
                      onClick={() => setDetailsFor(detailsFor === employee.id ? null : employee.id)}
                      className="mt-3 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-gray-50"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <span>Из чего начислено</span>
                      {detailsFor === employee.id ? <IconChevronUp size={17} /> : <IconChevronDown size={17} />}
                    </button>

                    {detailsFor === employee.id && (() => {
                      const rows = payrollBreakdown(employee, orders);
                      return (
                        <div className="mt-2 overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
                          {rows.length === 0 ? (
                            <p className="muted p-3 text-sm">По выданным заказам начислений пока нет.</p>
                          ) : (
                            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                              {rows.map((row) => (
                                <div key={row.orderId} className="p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <b className="block text-sm">{row.orderNumber}</b>
                                      <span className="muted text-xs">{formatDate(row.completedAt)}</span>
                                    </div>
                                    <div className="shrink-0 text-right">
                                      <b className="block text-sm tabular-nums">{formatMoney(row.accrued)}</b>
                                      <span className="muted text-xs">с {formatMoney(row.worksAmount)} работ</span>
                                    </div>
                                  </div>
                                  <div className="mt-2 space-y-1">
                                    {row.works.map((work) => (
                                      <div key={work.id} className="flex justify-between gap-3 text-xs">
                                        <span className="muted truncate">{work.name}{work.qty !== 1 ? ` × ${work.qty}` : ""}</span>
                                        <span className="shrink-0 tabular-nums">{formatMoney(work.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}

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

      {termsTarget && (
        <PayrollTermsDialog
          employee={termsTarget}
          onClose={() => setTermsFor(null)}
          onSubmit={(patch) => {
            updateEmployee(termsTarget.id, patch);
            setTermsFor(null);
            showToast(`Условия зарплаты обновлены: ${termsTarget.name}`);
          }}
        />
      )}

      {rateTarget && (
        <WorkPercentDialog
          employee={rateTarget}
          onClose={() => setRateFor(null)}
          onSubmit={(percent) => {
            updateEmployee(rateTarget.id, { workPercent: percent });
            setRateFor(null);
            showToast(`Процент от работ обновлён: ${rateTarget.name} · ${percent}%`);
          }}
        />
      )}

      {target && (
        <PayDialog
          employee={target}
          onClose={() => setPayFor(null)}
          onSubmit={(amount, method, component) => handlePay(target, amount, method, component)}
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
  onSubmit: (amount: number, method: PaymentMethod, component: PayrollComponent) => void;
}) {
  const hasPiecework = employee.payType !== "salary";
  const [component, setComponent] = useState<PayrollComponent>(hasPiecework ? "piecework" : "salary");
  const suggested = component === "piecework" ? payrollBalance(employee) : employeeSalaryAmount(employee);
  const [amount, setAmount] = useState(String(suggested));
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const value = Number(amount) || 0;

  function chooseComponent(next: PayrollComponent) {
    setComponent(next);
    setAmount(String(next === "piecework" ? payrollBalance(employee) : employeeSalaryAmount(employee)));
  }

  return (
    <Modal title="Выплата зарплаты" subtitle={employee.name} onClose={onClose}>
      <div className="space-y-3 p-4">
        <div className="rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
          <div className="flex justify-between"><span className="muted">Расчёт</span><b>{payLabel(employee)}</b></div>
          <div className="flex justify-between"><span className="muted">{component === "piecework" ? "К выплате по работам" : "Оклад"}</span><b>{formatMoney(suggested)}</b></div>
        </div>
        {employee.payType === "salary+percent" && (
          <label className="block text-sm">
            <span className="muted mb-1 block">Что выплачиваем</span>
            <div className="field-control">
              <select value={component} onChange={(event) => chooseComponent(event.target.value as PayrollComponent)}>
                <option value="piecework">Процент от работ</option>
                <option value="salary">Оклад</option>
              </select>
            </div>
          </label>
        )}
        <label className="block text-sm">
          <span className="muted mb-1 block">Сумма выплаты, ₽</span>
          <div className="field-control">
            <input
              autoFocus
              inputMode="numeric"
              aria-label="Сумма выплаты"
              value={amount}
              onChange={(event) => setAmount(moneyInput(event.target.value))}
            />
          </div>
        </label>
        <label className="block text-sm">
          <span className="muted mb-1 block">Как выплачиваем</span>
          <div className="field-control">
            <select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod | "")}>
              <option value="">Выберите способ</option>
              <option value="cash">Наличные</option>
              <option value="terminal">Терминал / карта</option>
              <option value="transfer">Перевод / СБП</option>
            </select>
          </div>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button
            onClick={() => method && onSubmit(value, method, component)}
            disabled={!method || value <= 0 || (component === "piecework" && value > suggested)}
          >
            Выплатить
          </Button>
        </div>
      </div>
    </Modal>
  );
}


function WorkPercentDialog({
  employee, onClose, onSubmit,
}: {
  employee: Employee;
  onClose: () => void;
  onSubmit: (percent: number) => void;
}) {
  const [value, setValue] = useState(String(employeeWorkPercent(employee)));
  const percent = Number(value);

  return (
    <Modal title="Процент от работ" subtitle={employee.name} onClose={onClose}>
      <div className="space-y-3 p-4">
        <p className="muted text-sm">
          Процент применяется к стоимости работ, где сотрудник указан исполнителем. Старые выданные заказы сохраняют ставку, действовавшую на момент выдачи.
        </p>
        <label className="block text-sm">
          <span className="muted mb-1 block">Процент, %</span>
          <div className="field-control">
            <input
              autoFocus
              inputMode="decimal"
              aria-label="Процент от работ"
              value={value}
              onChange={(event) => setValue(event.target.value.replace(",", ".").replace(/[^0-9.]/g, "").slice(0, 5))}
            />
          </div>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button disabled={!Number.isFinite(percent) || percent < 0 || percent > 100} onClick={() => onSubmit(percent)}>
            Сохранить
          </Button>
        </div>
      </div>
    </Modal>
  );
}


function PayrollTermsDialog({
  employee, onClose, onSubmit,
}: {
  employee: Employee;
  onClose: () => void;
  onSubmit: (patch: Partial<Employee>) => void;
}) {
  const [payType, setPayType] = useState<Employee["payType"]>(employee.payType);
  const [salary, setSalary] = useState(String(employeeSalaryAmount(employee)));
  const [percent, setPercent] = useState(String(employeeWorkPercent(employee)));
  const salaryValue = Number(salary);
  const percentValue = Number(percent);
  const validSalary = payType === "percent" || (Number.isFinite(salaryValue) && salaryValue >= 0 && salaryValue <= 10_000_000);
  const validPercent = payType === "salary" || (Number.isFinite(percentValue) && percentValue >= 0 && percentValue <= 100);

  return (
    <Modal title="Условия зарплаты" subtitle={employee.name} onClose={onClose}>
      <div className="space-y-3 p-4">
        <label className="block text-sm">
          <span className="muted mb-1 block">Схема оплаты</span>
          <div className="field-control">
            <select value={payType} onChange={(event) => setPayType(event.target.value as Employee["payType"])}>
              <option value="percent">Только % от работ</option>
              <option value="salary">Только оклад</option>
              <option value="salary+percent">Оклад + % от работ</option>
            </select>
          </div>
        </label>
        {payType !== "percent" && (
          <label className="block text-sm">
            <span className="muted mb-1 block">Оклад в месяц, ₽</span>
            <div className="field-control">
              <input inputMode="numeric" value={salary} onChange={(event) => setSalary(moneyInput(event.target.value))} />
            </div>
          </label>
        )}
        {payType !== "salary" && (
          <label className="block text-sm">
            <span className="muted mb-1 block">Процент от работ, %</span>
            <div className="field-control">
              <input
                inputMode="decimal"
                value={percent}
                onChange={(event) => setPercent(event.target.value.replace(",", ".").replace(/[^0-9.]/g, "").slice(0, 5))}
              />
            </div>
          </label>
        )}
        <p className="muted text-xs">
          Процент фиксируется в выданных заказах. Изменение ставки не пересчитает старую историю.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button
            disabled={!validSalary || !validPercent}
            onClick={() => onSubmit({
              payType,
              salaryAmount: payType === "percent" ? 0 : Math.round(salaryValue),
              workPercent: payType === "salary" ? 0 : percentValue,
              payValue: payType === "salary" ? Math.round(salaryValue) : employee.payValue,
            })}
          >
            Сохранить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
