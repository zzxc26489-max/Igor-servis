import { IconAlertTriangle, IconCheck, IconShoppingCart, IconStack2 } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Card, EmptyState, Page, TopBar } from "../components/ui";
import { formatMoney } from "../lib/format";

export default function Purchases() {
  const { stock } = useAppStore();
  const toOrder = stock.filter((i) => i.qty <= i.minQty);
  const totalSum = toOrder.reduce((s, item) => s + (item.minQty * 2 - item.qty) * item.purchasePrice, 0);

  return (
    <>
      <TopBar title="Закупки" subtitle="Позиции склада, которые пора пополнить" />
      <Page>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fdf3e0] text-[var(--warning)]">
              <IconAlertTriangle size={22} />
            </div>
            <div>
              <p className="muted text-sm">К заказу</p>
              <p className="mt-1 text-2xl font-semibold">{toOrder.length}</p>
              <p className="mt-1 text-xs muted">позиций ниже минимума</p>
            </div>
          </Card>
          <Card className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#edf4ff] text-[#3978c9]">
              <IconStack2 size={22} />
            </div>
            <div>
              <p className="muted text-sm">Всего позиций на складе</p>
              <p className="mt-1 text-2xl font-semibold">{stock.length}</p>
            </div>
          </Card>
          <Card className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e9f5ed] text-[var(--accent)]">
              <IconShoppingCart size={22} />
            </div>
            <div>
              <p className="muted text-sm">Ориентировочная сумма закупки</p>
              <p className="mt-1 text-2xl font-semibold">{formatMoney(totalSum)}</p>
            </div>
          </Card>
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="panel-title">Список к закупке</h2>
          </div>
          <div className="table-scroll">
            <table className="app-table min-w-[680px]">
              <thead>
                <tr>
                  <th>Наименование</th>
                  <th>Артикул</th>
                  <th className="text-right">Остаток</th>
                  <th className="text-right">Мин. остаток</th>
                  <th className="text-right">К закупке</th>
                  <th className="text-right">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {toOrder.map((item) => {
                  const toBuy = item.minQty * 2 - item.qty;
                  return (
                    <tr key={item.id}>
                      <td className="font-medium">{item.name}</td>
                      <td className="muted">{item.sku}</td>
                      <td className="text-right" style={{ color: "var(--danger)" }}>
                        {item.qty} {item.unit}
                      </td>
                      <td className="text-right">{item.minQty}</td>
                      <td className="text-right font-medium">
                        {toBuy} {item.unit}
                      </td>
                      <td className="text-right">{formatMoney(toBuy * item.purchasePrice)}</td>
                    </tr>
                  );
                })}
                {toOrder.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState icon={<IconCheck size={22} />} title="Все запчасти в наличии" hint="Закупка не требуется" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </Page>
    </>
  );
}
