import type { Employee } from "../types.ts";

export function isMechanicEmployee(employee: Employee) {
  return employee.role.toLocaleLowerCase("ru-RU").includes("механик");
}

export function mechanicEmployees(employees: Employee[]) {
  return employees.filter(isMechanicEmployee);
}
