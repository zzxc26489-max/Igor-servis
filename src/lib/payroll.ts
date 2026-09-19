import type { Employee, Order } from "../types";

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

    const revenue = source
      .flatMap((order) => order.works)
      .filter((work) => work.executor === employee.name)
      .reduce((sum, work) => sum + work.price * work.qty, 0);

    return { ...employee, accrued: Math.round((revenue * employee.payValue) / 100) };
  });
}

/** Сколько ещё должны сотруднику по сдельной части. */
export function payrollBalance(employee: Employee) {
  return Math.max(0, employee.accrued - employee.paid);
}


export interface PayrollBreakdownItem {
  orderId: string;
  orderNumber: string;
  completedAt?: string;
  worksAmount: number;
  accrued: number;
  works: { id: string; name: string; qty: number; amount: number }[];
}

/** Детализация сдельного начисления сотрудника по выданным заказам. */
export function payrollBreakdown(employee: Employee, orders: Order[]): PayrollBreakdownItem[] {
  if (employee.payType === "salary") return [];

  return accruingOrders(orders)
    .map((order) => {
      const works = order.works
        .filter((work) => work.executor === employee.name)
        .map((work) => ({
          id: work.id,
          name: work.name,
          qty: work.qty,
          amount: work.price * work.qty,
        }));
      const worksAmount = works.reduce((sum, work) => sum + work.amount, 0);
      if (worksAmount <= 0) return null;

      return {
        orderId: order.id,
        orderNumber: order.number,
        completedAt: order.issuedAt ?? order.completedAt ?? order.createdAt,
        worksAmount,
        accrued: Math.round((worksAmount * employee.payValue) / 100),
        works,
      };
    })
    .filter((item): item is PayrollBreakdownItem => Boolean(item))
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
}
