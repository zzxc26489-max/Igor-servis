import type { Order } from "../types.ts";
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
