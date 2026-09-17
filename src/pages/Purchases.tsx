import { IconAlertTriangle, IconCheck, IconShoppingCart, IconStack2 } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Card, EmptyState, ListCard, Metric, Page, TopBar } from "../components/ui";
import { formatMoney } from "../lib/format";

export default function Purchases() {
  const { stock } = useAppStore();
  const toOrder = stock.filter((i) => i.qty <= i.minQty);
  const totalSum = toOrder.reduce((s, item) => s + (item.minQty * 2 - item.qty) * item.purchasePrice, 0);

  return (
    <>
      <TopBar title="Закупки" subtitle="Позиции склада, которые пора пополнить" />
      <Page>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric icon={<IconAlertTriangle size={18} />} tone="warning" label="К заказу" value={String(toOrder.length)} hint="позиций ниже минимума" />
          <Metric icon={<IconStack2 size={18} />} tone="blue" label="Всего на складе" value={String(stock.length)} hint="позиций в номенклатуре" />
          <Metric icon={<IconShoppingCart size={18} />} label="Сумма закупки" value={formatMoney(totalSum)} hint="ориентировочно" />
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="panel-title">Список к закупке</h2>
          </div>
          <div className="space-y-2 p-3 lg:hidden">
            {toOrder.map((item) => {
              const toBuy = item.minQty * 2 - item.qty;
              return (
                <ListCard
                  key={item.id}
                  title={item.name}
                  amount={formatMoney(toBuy * item.purchasePrice)}
                  lines={[
                    item.sku,
                    <>
                      Остаток <span style={{ color: "var(--danger)" }}>{item.qty} {item.unit}</span> · минимум {item.minQty} · купить <b>{toBuy} {item.unit}</b>
                    </>,
                  ]}
                />
              );
            })}
            {toOrder.length === 0 && (
              <EmptyState icon={<IconCheck size={22} />} title="Все запчасти в наличии" hint="Закупка не требуется" />
            )}
          </div>

          <div className="table-scroll hidden lg:block">
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
