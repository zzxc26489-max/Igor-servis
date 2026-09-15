import { useAppStore } from "../store/AppStore";
import { Card, Page, TopBar } from "../components/ui";
import { formatMoney } from "../lib/format";

export default function Services() {
  const { services } = useAppStore();
  const categories = Array.from(new Set(services.map((s) => s.category)));

  return (
    <>
      <TopBar title="Услуги" subtitle="Прайс-лист (уточняется, добавим позже)" />
      <Page>
        <div className="flex flex-col gap-4">
          {categories.map((cat) => (
            <Card key={cat}>
              <h2 className="font-semibold mb-3">{cat}</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {services
                  .filter((s) => s.category === cat)
                  .map((s) => (
                    <li key={s.id} className="flex justify-between border-b last:border-0 py-1" style={{ borderColor: "var(--border)" }}>
                      <span>{s.name}</span>
                      <span className="font-medium">{formatMoney(s.price)}</span>
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
