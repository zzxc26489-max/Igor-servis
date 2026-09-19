import type { Employee, Order } from "../types";

export function employeeWorkPercent(employee: Employee) {
  if (employee.payType === "salary") return 0;
  const value = employee.workPercent ?? employee.payValue;
  return Math.max(0, Math.min(100, Number(value) || 0));
}

export function employeeSalaryAmount(employee: Employee) {
  if (employee.payType === "percent") return 0;
  const fallback = employee.payType === "salary" ? employee.payValue : 0;
  return Math.max(0, Math.round(Number(employee.salaryAmount ?? fallback) || 0));
}

/** Зарплата начисляется только по выданным заказам: это единое правило для всей CRM. */
export function accruingOrders(orders: Order[]) {
  return orders.filter((order) => order.status === "выдан");
}

/**
 * Сдельная часть: процент от стоимости работ, где сотрудник указан исполнителем.
 * Оклад здесь не начисляется — он попадает в расходы при выплате.
 */
export function computePayroll(employees: Employee[], orders: Order[]): Employee[] {
  const source = accruingOrders(orders);
  return employees.map((employee) => {
    if (employee.payType === "salary") return { ...employee, accrued: 0 };

    const accrued = source
      .flatMap((order) => order.works)
      .filter((work) => work.executor === employee.name)
      .reduce((sum, work) => {
        const percent = work.payrollPercent ?? employeeWorkPercent(employee);
        return sum + Math.round((work.price * work.qty * percent) / 100);
      }, 0);

    return { ...employee, accrued };
  });
}

/** Сколько ещё должны сотруднику по сдельной части. */
export function payrollBalance(employee: Employee) {
  return Math.max(0, employee.accrued - employee.paid);
}


export interface PayrollBreakdownItem {
  orderId: string;
  orderNumber: string;
  completedAt: string;
  worksAmount: number;
  accrued: number;
  works: { id: string; name: string; qty: number; amount: number }[];
}

/** Детализация сдельного начисления сотрудника по выданным заказам. */
export function payrollBreakdown(employee: Employee, orders: Order[]): PayrollBreakdownItem[] {
  if (employee.payType === "salary") return [];

  return accruingOrders(orders)
    .flatMap((order) => {
      const works = order.works
        .filter((work) => work.executor === employee.name)
        .map((work) => ({
          id: work.id,
          name: work.name,
          qty: work.qty,
          amount: work.price * work.qty,
        }));
      const worksAmount = works.reduce((sum, work) => sum + work.amount, 0);
      if (worksAmount <= 0) return [];

      const item: PayrollBreakdownItem = {
        orderId: order.id,
        orderNumber: order.number,
        completedAt: order.issuedAt ?? order.completedAt ?? order.createdAt,
        worksAmount,
        accrued: works.reduce((sum, work) => {
          const original = order.works.find((item) => item.id === work.id);
          const percent = original?.payrollPercent ?? employeeWorkPercent(employee);
          return sum + Math.round((work.amount * percent) / 100);
        }, 0),
        works,
      };
      return [item];
    })
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}
