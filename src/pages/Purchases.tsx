import { IconAlertTriangle, IconCheck, IconShoppingCart, IconStack2 } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Card, EmptyState, ListCard, Metric, Page, TopBar } from "../components/ui";
import { formatMoney } from "../lib/format";
import { lowStockItems, toBuyQty } from "../lib/lowStock";
import { reservedByItem } from "../lib/stock";

export default function Purchases() {
  const { stock, orders } = useAppStore();
  // Резерв уже обещан клиентам, поэтому в закупку он не считается свободным остатком.
  const reserved = reservedByItem(orders, stock);
  const toOrder = lowStockItems(stock, orders);
  const totalSum = toOrder.reduce(
    (sum, item) => sum + toBuyQty(item, reserved.get(item.id) ?? 0) * item.purchasePrice,
    0,
  );

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
              const inReserve = reserved.get(item.id) ?? 0;
              const free = item.qty - inReserve;
              const toBuy = toBuyQty(item, inReserve);
              return (
                <ListCard
                  key={item.id}
                  title={item.name}
                  amount={formatMoney(toBuy * item.purchasePrice)}
                  lines={[
                    item.sku,
                    <>
                      Свободно <span style={{ color: "var(--danger)" }}>{free} {item.unit}</span>
                      {inReserve > 0 ? ` (в резерве ${inReserve})` : ""} · минимум {item.minQty} · купить <b>{toBuy} {item.unit}</b>
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
                  <th className="text-right">Свободно</th>
                  <th className="text-right">Резерв</th>
                  <th className="text-right">Минимум</th>
                  <th className="text-right">К закупке</th>
                  <th className="text-right">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {toOrder.map((item) => {
                  const inReserve = reserved.get(item.id) ?? 0;
                  const toBuy = toBuyQty(item, inReserve);
                  return (
                    <tr key={item.id}>
                      <td className="font-medium">{item.name}</td>
                      <td className="muted">{item.sku}</td>
                      <td className="text-right" style={{ color: "var(--danger)" }}>
                        {item.qty - inReserve} {item.unit}
                      </td>
                      <td className="muted text-right">{inReserve || "—"}</td>
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
                    <td colSpan={7}>
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
