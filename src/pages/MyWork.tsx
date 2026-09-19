import { useMemo } from "react";
import { IconCheck, IconPlayerPause, IconPlayerPlay, IconRefresh, IconTool } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Button, Card, EmptyState, Page, StatusBadge, TopBar } from "../components/ui";
import { useToast } from "../components/Toast";
import { effectiveWorkStatus, WORK_STATUS_LABEL, workSessionMinutes } from "../lib/workSessions";
import { formatDuration } from "../lib/worktime";
import { formatDate } from "../lib/format";
import { todayISO } from "../lib/date";
import { orderDay } from "../lib/lift";
import type { OrderLineWork, WorkLineStatus } from "../types";
import OrderMediaPanel from "../components/OrderMediaPanel";

export default function MyWork() {
  const { orders, vehicles, lifts, cloud, setWorkLineStatus } = useAppStore();
  const { showToast } = useToast();
  const mechanicName = cloud.displayName ?? "";
  const today = todayISO();

  const assigned = useMemo(() => {
    return orders
      .filter((order) => {
        const ownWorks = order.works.filter((work) => work.executor === mechanicName);
        if (ownWorks.length === 0 || order.status === "выдан" || order.status === "готово") return false;
        const hasRunningWork = ownWorks.some((work) => {
          const status = effectiveWorkStatus(work);
          return status === "in_progress" || status === "paused";
        });
        const serviceActive = order.status === "в работе" || order.status === "диагностика";
        return orderDay(order) === today || hasRunningWork || serviceActive;
      })
      .sort((a, b) => {
        const aKey = `${a.plannedAt ?? a.createdAt.slice(0, 10)} ${a.scheduledStart ?? ""}`;
        const bKey = `${b.plannedAt ?? b.createdAt.slice(0, 10)} ${b.scheduledStart ?? ""}`;
        return aKey.localeCompare(bKey);
      });
  }, [mechanicName, orders, today]);

  function changeWork(orderId: string, work: OrderLineWork, status: WorkLineStatus) {
    const error = setWorkLineStatus(orderId, work.id, status);
    if (error) {
      showToast(error, "error");
      return;
    }
    showToast(`${work.name}: ${WORK_STATUS_LABEL[status].toLocaleLowerCase("ru-RU")}`);
  }

  const totalWorks = assigned.reduce(
    (sum, order) => sum + order.works.filter((work) => work.executor === mechanicName).length,
    0,
  );
  const doneWorks = assigned.reduce(
    (sum, order) =>
      sum + order.works.filter((work) => work.executor === mechanicName && effectiveWorkStatus(work) === "done").length,
    0,
  );

  return (
    <>
      <TopBar
        title="Мои работы сегодня"
        subtitle={mechanicName ? `${mechanicName} · ${doneWorks} из ${totalWorks} работ выполнено` : "Механик не привязан к сотруднику"}
      />
      <Page>
        {!mechanicName ? (
          <EmptyState
            icon={<IconTool size={22} />}
            title="Не указано имя механика"
            hint="В Supabase у пользователя должно быть display_name точно как имя сотрудника в CRM."
          />
        ) : assigned.length === 0 ? (
          <EmptyState
            icon={<IconCheck size={22} />}
            title="Назначенных работ нет"
            hint="Когда приёмщик назначит работу на вас, машина появится здесь."
          />
        ) : (
          <div className="space-y-3">
            {assigned.map((order) => {
              const vehicle = vehicles.find((item) => item.id === order.vehicleId);
              const lift = lifts.find((item) => item.id === order.liftId);
              const ownWorks = order.works.filter((work) => work.executor === mechanicName);
              return (
                <Card key={order.id} className="overflow-hidden p-0 max-sm:-mx-3 max-sm:rounded-none max-sm:border-x-0 max-sm:shadow-none">
                  <div className="border-b p-4 max-sm:px-3" style={{ borderColor: "var(--border)" }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="panel-title">
                            {vehicle ? `${vehicle.make} ${vehicle.model}` : order.number}
                          </h2>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="muted mt-1 text-sm">
                          {vehicle?.plate ?? order.number}
                          {lift ? ` · ${lift.name}` : ""}
                          {order.scheduledStart ? ` · ${order.scheduledStart}–${order.scheduledEnd ?? "…"}` : ""}
                        </p>
                        <p className="muted mt-1 text-xs">
                          {order.plannedAt ? formatDate(order.plannedAt) : formatDate(order.createdAt)}
                          {order.complaint ? ` · Жалоба: ${order.complaint}` : ""}
                        </p>
                      </div>
                      <span className="text-sm font-semibold">{order.number}</span>
                    </div>
                  </div>

                  <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {ownWorks.map((work) => {
                      const status = effectiveWorkStatus(work);
                      const actual = workSessionMinutes(work);
                      const norm = (work.normMinutes ?? 0) * work.qty;
                      return (
                        <div key={work.id} className="p-4 max-sm:px-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <b className="block text-sm">{work.name}</b>
                              <span className="muted mt-1 block text-xs">
                                {WORK_STATUS_LABEL[status]}
                                {norm > 0 ? ` · норматив ${formatDuration(norm)}` : ""}
                                {actual > 0 ? ` · факт ${formatDuration(actual)}` : ""}
                              </span>
                            </div>
                            <span
                              className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
                              style={{
                                background:
                                  status === "done" ? "var(--accent-soft)"
                                    : status === "in_progress" ? "#fff1d9"
                                      : "var(--bg)",
                                color:
                                  status === "done" ? "var(--accent)"
                                    : status === "in_progress" ? "#9a6a12"
                                      : "var(--text-muted)",
                              }}
                            >
                              {WORK_STATUS_LABEL[status]}
                            </span>
                          </div>

                          {order.status === "ожидает запчасти" && (
                            <div className="mt-3 rounded-lg bg-[#fff8e8] px-3 py-2 text-xs font-medium text-[#9a6a12]">
                              Ожидаем запчасти — запуск работы временно заблокирован
                            </div>
                          )}
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
                            {status === "planned" && (
                              <Button className="justify-center sm:min-w-32" disabled={order.status === "ожидает запчасти"} onClick={() => changeWork(order.id, work, "in_progress")}>
                                <IconPlayerPlay size={18} /> Начать
                              </Button>
                            )}
                            {status === "in_progress" && (
                              <>
                                <Button variant="secondary" className="justify-center sm:min-w-32" onClick={() => changeWork(order.id, work, "paused")}>
                                  <IconPlayerPause size={18} /> Пауза
                                </Button>
                                <Button className="justify-center sm:min-w-32" onClick={() => changeWork(order.id, work, "done")}>
                                  <IconCheck size={18} /> Готово
                                </Button>
                              </>
                            )}
                            {status === "paused" && (
                              <Button className="justify-center sm:min-w-32" disabled={order.status === "ожидает запчасти"} onClick={() => changeWork(order.id, work, "in_progress")}>
                                <IconRefresh size={18} /> Продолжить
                              </Button>
                            )}
                            {status === "done" && (
                              <Button variant="secondary" className="justify-center sm:min-w-32" onClick={() => changeWork(order.id, work, "in_progress")}>
                                <IconRefresh size={18} /> Вернуть в работу
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t p-4 max-sm:px-3" style={{ borderColor: "var(--border)" }}>
                    <OrderMediaPanel order={order} compact defaultKind="repair" />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Page>
    </>
  );
}
