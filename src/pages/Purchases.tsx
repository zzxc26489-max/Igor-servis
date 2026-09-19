import { useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconPackageImport,
  IconShoppingCart,
  IconStack2,
  IconTruck,
  IconX,
} from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Button, Card, EmptyState, Metric, Page, TopBar } from "../components/ui";
import { formatMoney } from "../lib/format";
import { incomingStockItems, needsPurchaseItems, remainingPurchaseQty, toBuyQty } from "../lib/lowStock";
import { reservedByItem } from "../lib/stock";
import { nowISO, todayISO, toISODate } from "../lib/date";
import { createId } from "../lib/id";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Confirm";
import StockReceive from "./StockReceive";
import { canManageStock } from "../lib/access";
import type { StockItem } from "../types";

function defaultExpectedDate() {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  return toISODate(date);
}

export default function Purchases() {
  const {
    stock,
    orders,
    employees,
    cloud,
    updateStockItem,
    addStockMovement,
  } = useAppStore();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const writable = !cloud.role || canManageStock(cloud.role);
  const [receiveFor, setReceiveFor] = useState<string | null>(null);

  const reserved = useMemo(() => reservedByItem(orders, stock), [orders, stock]);
  const toOrder = useMemo(() => needsPurchaseItems(stock, orders), [orders, stock]);
  const incoming = useMemo(() => incomingStockItems(stock), [stock]);

  const totalNeed = toOrder.reduce((sum, item) => {
    const qty = remainingPurchaseQty(item, reserved.get(item.id) ?? 0);
    return sum + qty * item.purchasePrice;
  }, 0);
  const incomingValue = incoming.reduce(
    (sum, item) => sum + (item.onOrderQty ?? 0) * (item.lastPurchasePrice ?? item.purchasePrice),
    0,
  );

  function movement(item: StockItem, operation: "Заказ поставщику" | "В пути" | "Отмена заказа", note?: string) {
    addStockMovement({
      id: createId("mv"),
      date: nowISO(),
      itemId: item.id,
      operation,
      qty: item.onOrderQty ?? 0,
      employee: cloud.displayName || employees[0]?.name || "—",
      note,
    });
  }

  async function markOrdered(item: StockItem) {
    const inReserve = reserved.get(item.id) ?? 0;
    const qty = item.onOrderQty ?? toBuyQty(item, inReserve);
    const ok = await confirm({
      title: "Заказать у поставщика",
      question: "Позиция исчезнет из списка «Нужно заказать» и появится в ожидаемых поставках.",
      summary: [
        { label: "Запчасть", value: `${item.name} · ${item.sku}` },
        { label: "Количество", value: `${qty} ${item.unit}` },
        { label: "Поставщик", value: item.supplier || "не указан" },
        { label: "Ориентировочно", value: formatMoney(qty * item.purchasePrice), total: true },
      ],
      confirmLabel: "Заказали",
    });
    if (!ok) return;

    updateStockItem(item.id, {
      onOrderQty: qty,
      supplyStatus: "ordered",
      orderedAt: nowISO(),
      expectedAt: item.expectedAt || defaultExpectedDate(),
    });
    addStockMovement({
      id: createId("mv"),
      date: nowISO(),
      itemId: item.id,
      operation: "Заказ поставщику",
      qty,
      employee: cloud.displayName || employees[0]?.name || "—",
      note: item.supplier ? `Поставщик: ${item.supplier}` : undefined,
    });
    showToast(`${item.name}: заказано ${qty} ${item.unit}`);
  }

  function markTransit(item: StockItem) {
    updateStockItem(item.id, { supplyStatus: "in_transit" });
    movement(item, "В пути", item.expectedAt ? `Ожидаем ${item.expectedAt}` : undefined);
    showToast(`${item.name}: отмечено «в пути»`);
  }

  async function cancelSupply(item: StockItem) {
    const ok = await confirm({
      title: "Отменить заказ поставщику",
      question: "Позиция снова вернётся в список того, что нужно заказать.",
      summary: [
        { label: "Запчасть", value: item.name },
        { label: "Было заказано", value: `${item.onOrderQty ?? 0} ${item.unit}` },
      ],
      confirmLabel: "Отменить заказ",
      danger: true,
    });
    if (!ok) return;

    movement(item, "Отмена заказа");
    updateStockItem(item.id, {
      onOrderQty: undefined,
      supplyStatus: undefined,
      orderedAt: undefined,
      expectedAt: undefined,
    });
    showToast("Заказ поставщику отменён");
  }

  function updateExpected(item: StockItem, value: string) {
    updateStockItem(item.id, { expectedAt: value || undefined });
  }

  return (
    <>
      <TopBar title="Закупки" subtitle="Что заказать, что уже заказано и что едет" />
      <Page>
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={<IconAlertTriangle size={18} />} tone="warning" label="Нужно заказать" value={String(toOrder.length)} hint="дефицит ещё не закрыт" />
          <Metric icon={<IconTruck size={18} />} tone="blue" label="Ожидаем поставку" value={String(incoming.length)} hint="заказано или в пути" />
          <Metric icon={<IconShoppingCart size={18} />} label="Нужно докупить" value={formatMoney(totalNeed)} hint="ориентировочно" />
          <Metric icon={<IconStack2 size={18} />} tone="violet" label="В поставках" value={formatMoney(incomingValue)} hint="ориентировочно" />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="overflow-hidden p-0">
            <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
              <h2 className="panel-title">Нужно заказать</h2>
              <p className="muted mt-1 text-xs">Резерв клиентов уже учтён. Позиции с оформленной поставкой сюда не попадают.</p>
            </div>

            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {toOrder.map((item) => {
                const inReserve = reserved.get(item.id) ?? 0;
                const free = item.qty - inReserve;
                const toBuy = remainingPurchaseQty(item, inReserve);
                return (
                  <div key={item.id} className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <b className="block">{item.name}</b>
                        <span className="muted block text-sm">{item.brand ? `${item.brand} · ` : ""}{item.sku}</span>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                          <span>Свободно <b style={{ color: "var(--danger)" }}>{free} {item.unit}</b></span>
                          <span>Минимум <b>{item.minQty}</b></span>
                          <span>Заказать <b>{toBuy} {item.unit}</b></span>
                        </div>
                        <div className="muted mt-1 text-xs">
                          {item.supplier ? `Поставщик: ${item.supplier}` : "Поставщик не указан"} · примерно {formatMoney(toBuy * item.purchasePrice)}
                        </div>
                      </div>
                      {writable && (
                        <Button size="sm" onClick={() => void markOrdered(item)}>
                          <IconShoppingCart size={16} /> Заказали
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {toOrder.length === 0 && (
                <EmptyState icon={<IconCheck size={22} />} title="Неоформленного дефицита нет" hint="Всё есть на складе или уже заказано у поставщиков" />
              )}
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
              <h2 className="panel-title">Ожидаемые поставки</h2>
              <p className="muted mt-1 text-xs">После приёмки количество здесь уменьшается автоматически.</p>
            </div>

            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {incoming.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{item.name}</b>
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{
                            background: item.supplyStatus === "in_transit" ? "#edf4ff" : "#fdf3e0",
                            color: item.supplyStatus === "in_transit" ? "#3978c9" : "var(--warning)",
                          }}
                        >
                          {item.supplyStatus === "in_transit" ? "В пути" : "Заказано"}
                        </span>
                      </div>
                      <span className="muted block text-sm">{item.sku} · ожидаем <b>{item.onOrderQty} {item.unit}</b></span>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <label className="muted">Ожидаемая дата</label>
                        <input
                          type="date"
                          value={item.expectedAt ?? ""}
                          min={todayISO()}
                          onChange={(event) => updateExpected(item, event.target.value)}
                          disabled={!writable}
                          className="rounded-lg border bg-white px-2 py-1.5 text-sm disabled:bg-transparent"
                          style={{ borderColor: "var(--border)" }}
                        />
                      </div>
                      <p className="muted mt-1 text-xs">
                        {item.supplier ? `Поставщик: ${item.supplier}` : "Поставщик не указан"}
                        {item.orderedAt ? ` · заказ от ${item.orderedAt.slice(0, 10)}` : ""}
                      </p>
                    </div>

                    {writable && (
                      <div className="flex flex-wrap gap-2">
                        {item.supplyStatus !== "in_transit" && (
                          <Button size="sm" variant="secondary" onClick={() => markTransit(item)}>
                            <IconTruck size={16} /> В пути
                          </Button>
                        )}
                        <Button size="sm" onClick={() => setReceiveFor(item.id)}>
                          <IconPackageImport size={16} /> Принять
                        </Button>
                        <Button size="icon" variant="secondary" onClick={() => void cancelSupply(item)} aria-label="Отменить заказ поставщику" title="Отменить заказ">
                          <IconX size={16} />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {incoming.length === 0 && (
                <EmptyState icon={<IconTruck size={22} />} title="Поставок в ожидании нет" hint="Заказанные запчасти появятся здесь" />
              )}
            </div>
          </Card>
        </div>
      </Page>

      {writable && receiveFor && (
        <StockReceive
          presetItemId={receiveFor}
          onClose={() => setReceiveFor(null)}
        />
      )}
    </>
  );
}
