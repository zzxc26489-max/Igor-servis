import { useAppStore } from "../store/AppStore";
import { Card, Page, TopBar } from "../components/ui";
import { formatMoney } from "../lib/format";

export default function Purchases() {
  const { stock } = useAppStore();
  const toOrder = stock.filter((i) => i.qty <= i.minQty);

  return (
    <>
      <TopBar title="Закупки" subtitle={`К заказу: ${toOrder.length} позиций`} />
      <Page>
        <Card className="p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="px-4 py-2 font-medium">Наименование</th>
                <th className="px-4 py-2 font-medium">Артикул</th>
                <th className="px-4 py-2 font-medium text-right">Остаток</th>
                <th className="px-4 py-2 font-medium text-right">Мин. остаток</th>
                <th className="px-4 py-2 font-medium text-right">Ориент. закупка</th>
              </tr>
            </thead>
            <tbody>
              {toOrder.map((item) => (
                <tr key={item.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-2">{item.name}</td>
                  <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>
                    {item.sku}
                  </td>
                  <td className="px-4 py-2 text-right" style={{ color: "var(--danger)" }}>
                    {item.qty} {item.unit}
                  </td>
                  <td className="px-4 py-2 text-right">{item.minQty}</td>
                  <td className="px-4 py-2 text-right">
                    {formatMoney((item.minQty - item.qty + item.minQty) * item.purchasePrice)}
                  </td>
                </tr>
              ))}
              {toOrder.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center" style={{ color: "var(--text-muted)" }}>
                    Все запчасти в наличии
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </Page>
    </>
  );
}
