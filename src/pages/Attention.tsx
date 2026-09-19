import {
  IconAlertTriangle,
  IconBell,
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconCoin,
  IconPackage,
  IconStar,
  IconTool,
  IconUserExclamation,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { Card, EmptyState, Metric, Page, TopBar } from "../components/ui";
import { useAppStore } from "../store/AppStore";
import { buildAttentionItems, type AttentionKind, type AttentionPriority } from "../lib/attention";

const PRIORITY_LABEL: Record<AttentionPriority, string> = {
  critical: "Срочно",
  high: "Важно",
  normal: "Не забыть",
};

const iconByKind: Record<AttentionKind, typeof IconBell> = {
  deadline: IconClock,
  ready: IconCheck,
  review: IconStar,
  approval: IconUserExclamation,
  parts: IconPackage,
  assignment: IconTool,
  appointment: IconCalendarEvent,
  service: IconTool,
  deferred: IconClock,
  debt: IconCoin,
  stock: IconPackage,
};

export default function Attention() {
  const { orders, clients, vehicles, stock } = useAppStore();
  const items = buildAttentionItems({ orders, clients, vehicles, stock });
  const critical = items.filter((item) => item.priority === "critical");
  const high = items.filter((item) => item.priority === "high");
  const normal = items.filter((item) => item.priority === "normal");

  return (
    <>
      <TopBar
        title="Фокус внимания"
        subtitle="То, что нельзя потерять: CRM собирает задачи автоматически из текущих данных"
      />
      <Page>
        <div className="mb-3 grid grid-cols-3 gap-2 sm:gap-3">
          <Metric icon={<IconAlertTriangle size={18} />} tone="danger" label="Срочно" value={String(critical.length)} />
          <Metric icon={<IconBell size={18} />} tone="warning" label="Важно" value={String(high.length)} />
          <Metric icon={<IconClock size={18} />} tone="blue" label="Не забыть" value={String(normal.length)} />
        </div>

        {items.length === 0 ? (
          <Card>
            <EmptyState icon={<IconCheck size={22} />} title="Срочных дел нет" hint="Фокус внимания очистится автоматически, когда задачи закрыты" />
          </Card>
        ) : (
          <div className="space-y-3">
            {([
              ["critical", "Срочно", critical],
              ["high", "Важно сегодня", high],
              ["normal", "Не забыть", normal],
            ] as const).map(([priority, title, group]) => group.length > 0 && (
              <Card key={priority} className="overflow-hidden p-0">
                <div className="border-b px-3 py-2.5 sm:px-4" style={{ borderColor: "var(--border)" }}>
                  <h2 className="panel-title">{title}</h2>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {group.map((item) => {
                    const Icon = iconByKind[item.kind];
                    return (
                      <Link
                        key={item.id}
                        to={item.to}
                        className="flex min-h-[58px] items-center gap-3 px-3 py-2.5 transition hover:bg-[#f7f9f7] sm:px-4"
                      >
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                          style={{
                            background: item.priority === "critical" ? "#fbe9e9" : item.priority === "high" ? "#fdf3e0" : "#eaf1fb",
                            color: item.priority === "critical" ? "var(--danger)" : item.priority === "high" ? "var(--warning)" : "#3978c9",
                          }}
                        >
                          <Icon size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{item.title}</span>
                          <span className="muted mt-0.5 block text-xs">{item.detail}</span>
                        </span>
                        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ borderColor: "var(--border)" }}>
                          {PRIORITY_LABEL[item.priority]}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}
      </Page>
    </>
  );
}
