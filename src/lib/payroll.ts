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
