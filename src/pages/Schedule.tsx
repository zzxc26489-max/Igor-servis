import { useAppStore } from "../store/AppStore";
import { Card, Page, TopBar } from "../components/ui";
import LiftTimeline from "../components/LiftTimeline";

const WORK_HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

export default function Schedule() {
  const { lifts, orders } = useAppStore();
  const busy = lifts.filter((l) => orders.some((o) => o.liftId === l.id && o.status !== "выдан")).length;
  const todayLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <>
      <TopBar title="Расписание" subtitle={`Загрузка подъёмников · ${busy} из ${lifts.length} занято`} />
      <Page>
        <Card className="p-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
            <div>
              <h2 className="panel-title">Подъёмники на сегодня</h2>
              <p className="muted mt-1 text-sm capitalize">{todayLabel}</p>
            </div>
          </div>
          <LiftTimeline hours={WORK_HOURS} />
        </Card>
      </Page>
    </>
  );
}
