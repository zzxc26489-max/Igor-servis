import { useAppStore } from "../store/AppStore";
import { Card, Page, TopBar } from "../components/ui";
import { formatDateTime, formatMoney } from "../lib/format";

export default function Stock() {
  const { stock, stockMovements } = useAppStore();
  const critical = stock.filter((i) => i.qty <= i.minQty);

  return (
    <>
      <TopBar title="Склад" subtitle={`${stock.length} позиций · ${critical.length} требуют заказа`} />
      <Page>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <Card className="lg:col-span-2 p-0 overflow-hidden">
            <div className="p-4 pb-0">
              <h2 className="font-semibold mb-3">Остатки на складе</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  <th className="px-4 py-2 font-medium">Наименование</th>
                  <th className="px-4 py-2 font-medium">Артикул</th>
                  <th className="px-4 py-2 font-medium">Ячейка</th>
                  <th className="px-4 py-2 font-medium text-right">Остаток</th>
                  <th className="px-4 py-2 font-medium text-right">Цена</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((item) => (
                  <tr key={item.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2">
                      {item.name}
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {item.brand}
                      </div>
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>
                      {item.sku}
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>
                      {item.cell}
                    </td>
                    <td className="px-4 py-2 text-right" style={{ color: item.qty <= item.minQty ? "var(--danger)" : undefined }}>
                      {item.qty} {item.unit}
                    </td>
                    <td className="px-4 py-2 text-right">{formatMoney(item.purchasePrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card>
            <h2 className="font-semibold mb-3">Критические остатки</h2>
            <ul className="flex flex-col gap-2 text-sm">
              {critical.map((item) => (
                <li key={item.id} className="flex justify-between">
                  <span>{item.name}</span>
                  <span style={{ color: "var(--danger)" }}>
                    {item.qty} / мин. {item.minQty}
                  </span>
                </li>
              ))}
              {critical.length === 0 && <li style={{ color: "var(--text-muted)" }}>Все позиции в норме</li>}
            </ul>
          </Card>
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="p-4 pb-0">
            <h2 className="font-semibold mb-3">Последние движения по складу</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="px-4 py-2 font-medium">Дата</th>
                <th className="px-4 py-2 font-medium">Запчасть</th>
                <th className="px-4 py-2 font-medium">Операция</th>
                <th className="px-4 py-2 font-medium text-right">Кол-во</th>
                <th className="px-4 py-2 font-medium">Сотрудник</th>
              </tr>
            </thead>
            <tbody>
              {stockMovements.map((m) => {
                const item = stock.find((s) => s.id === m.itemId);
                return (
                  <tr key={m.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>
                      {formatDateTime(m.date)}
                    </td>
                    <td className="px-4 py-2">{item?.name}</td>
                    <td className="px-4 py-2">{m.operation}</td>
                    <td className="px-4 py-2 text-right">{m.qty}</td>
                    <td className="px-4 py-2">{m.employee}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </Page>
    </>
  );
}
