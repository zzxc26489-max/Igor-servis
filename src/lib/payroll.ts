import type { Employee, Order } from "../types";

export function computePayroll(employees: Employee[], orders: Order[]): Employee[] {
  return employees.map((employee) => {
    if (employee.payType === "salary") return employee;

    const revenue = orders
      .flatMap((order) => order.works)
      .filter((work) => work.executor === employee.name)
      .reduce((sum, work) => sum + work.price * work.qty, 0);

    return { ...employee, accrued: Math.round((revenue * employee.payValue) / 100) };
  });
}
