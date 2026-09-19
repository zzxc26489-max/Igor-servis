import type { Employee, Order } from "../types.ts";
import { effectiveWorkStatus } from "./workSessions.ts";

export interface MechanicWorkload {
  activeWorks: number;
  runningWorks: number;
  remainingNormMinutes: number;
}

export function mechanicWorkload(orders: Order[], mechanicName: string): MechanicWorkload {
  if (!mechanicName) return { activeWorks: 0, runningWorks: 0, remainingNormMinutes: 0 };

  let activeWorks = 0;
  let runningWorks = 0;
  let remainingNormMinutes = 0;

  for (const order of orders) {
    if (order.status === "готово" || order.status === "выдан") continue;

    for (const work of order.works) {
      if (work.executor !== mechanicName) continue;
      const status = effectiveWorkStatus(work);
      if (status === "done") continue;

      activeWorks += 1;
      if (status === "in_progress") runningWorks += 1;
      remainingNormMinutes += Math.max(0, (work.normMinutes ?? 0) * Math.max(1, work.qty));
    }
  }

  return { activeWorks, runningWorks, remainingNormMinutes };
}

export function mechanicWorkloadLabel(load: MechanicWorkload) {
  if (load.activeWorks === 0) return "свободен";
  if (load.runningWorks > 0) {
    return `${load.activeWorks} активн. · ${load.runningWorks} сейчас`;
  }
  return `${load.activeWorks} активн.`;
}


/** Только сотрудники с явной ролью механика могут получать ремонтные работы. */
export function isMechanicEmployee(employee: Employee) {
  return employee.role.toLocaleLowerCase("ru-RU").includes("механик");
}

/**
 * Кандидаты на работу: только механики, сначала наименее загруженные.
 * keepName сохраняет текущего исполнителя в списке при редактировании старых данных.
 */
export function mechanicCandidates(employees: Employee[], orders: Order[], keepName?: string) {
  return employees
    .filter((employee) => isMechanicEmployee(employee) || employee.name === keepName)
    .map((employee) => ({ employee, load: mechanicWorkload(orders, employee.name) }))
    .sort((a, b) => {
      if (a.load.runningWorks !== b.load.runningWorks) return a.load.runningWorks - b.load.runningWorks;
      if (a.load.activeWorks !== b.load.activeWorks) return a.load.activeWorks - b.load.activeWorks;
      if (a.load.remainingNormMinutes !== b.load.remainingNormMinutes) return a.load.remainingNormMinutes - b.load.remainingNormMinutes;
      return a.employee.name.localeCompare(b.employee.name, "ru");
    });
}
