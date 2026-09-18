import type { OrderLineWork, WorkLineStatus, WorkSession } from "../types.ts";

export function effectiveWorkStatus(work: OrderLineWork): WorkLineStatus {
  return work.workStatus ?? "planned";
}

export function workSessionMinutes(work: OrderLineWork, now = new Date()) {
  return (work.workSessions ?? []).reduce((sum, session) => {
    const start = new Date(session.startedAt).getTime();
    const end = session.endedAt ? new Date(session.endedAt).getTime() : now.getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return sum;
    return sum + Math.round((end - start) / 60_000);
  }, 0);
}

export function transitionWorkSessions(
  work: OrderLineWork,
  status: WorkLineStatus,
  at: string,
): Pick<OrderLineWork, "workStatus" | "workSessions"> {
  const current = effectiveWorkStatus(work);
  const sessions: WorkSession[] = [...(work.workSessions ?? [])];

  if (current === status) return { workStatus: current, workSessions: sessions };

  if (status === "in_progress") {
    if (!sessions.some((session) => !session.endedAt)) sessions.push({ startedAt: at });
    return { workStatus: status, workSessions: sessions };
  }

  if (current === "in_progress") {
    const openIndex = sessions.findIndex((session) => !session.endedAt);
    if (openIndex >= 0) sessions[openIndex] = { ...sessions[openIndex], endedAt: at };
  }

  return { workStatus: status, workSessions: sessions };
}

export const WORK_STATUS_LABEL: Record<WorkLineStatus, string> = {
  planned: "Не начата",
  in_progress: "В работе",
  paused: "Пауза",
  done: "Выполнена",
};
