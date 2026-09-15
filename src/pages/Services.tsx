import { IconTool } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Card, Page, TopBar } from "../components/ui";
import { formatMoney } from "../lib/format";

export default function Services() {
  const { services } = useAppStore();
  const categories = Array.from(new Set(services.map((s) => s.category)));

  return (
    <>
      <TopBar title="Услуги" subtitle={`${services.length} позиций в прайс-листе · уточняется, добавим позже`} />
      <Page>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {categories.map((cat) => (
            <Card key={cat} className="p-0 overflow-hidden">
              <div className="flex items-center gap-3 border-b p-4" style={{ borderColor: "var(--border)" }}>
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#e9f5ed] text-[var(--accent)]">
                  <IconTool size={18} />
                </div>
                <h2 className="panel-title">{cat}</h2>
              </div>
              <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                {services
                  .filter((s) => s.category === cat)
                  .map((s) => (
                    <li key={s.id} className="flex justify-between px-4 py-3 text-sm">
                      <span>{s.name}</span>
                      <span className="font-semibold">{formatMoney(s.price)}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          ))}
        </div>
      </Page>
    </>
  );
}
