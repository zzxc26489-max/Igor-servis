import { Link, useNavigate, useParams } from "react-router-dom";
import { useAppStore } from "../store/AppStore";
import { Button, Card, Page, StatusBadge, TopBar } from "../components/ui";
import { formatDateTime, formatMoney } from "../lib/format";
import type { OrderStatus } from "../types";

const STATUS_FLOW: OrderStatus[] = ["запись", "диагностика", "в работе", "готово", "выдан"];

export default function OrderDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { orders, clients, vehicles, updateOrder } = useAppStore();
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    return (
      <Page>
        <p>Заказ-наряд не найден.</p>
        <Link to="/orders" style={{ color: "var(--accent)" }}>
          Назад к списку
        </Link>
      </Page>
    );
  }

  const client = clients.find((c) => c.id === order.clientId);
  const vehicle = vehicles.find((v) => v.id === order.vehicleId);

  const worksTotal = order.works.reduce((s, w) => s + w.price * w.qty, 0);
  const partsTotal = order.parts.reduce((s, p) => s + p.price * p.qty, 0);
  const discount = order.discount ?? 0;
  const due = worksTotal + partsTotal - discount;
  const paid = order.paid ?? 0;
  const debt = due - paid;

  const currentStepIndex = STATUS_FLOW.indexOf(order.status);

  return (
    <>
      <TopBar
        title={`Заказ-наряд ${order.number}`}
        subtitle={`Создан ${formatDateTime(order.createdAt)}${order.advisor ? ` · Мастер-приёмщик: ${order.advisor}` : ""}`}
        actions={
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Назад
          </Button>
        }
      />
      <Page>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <Card>
            <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
              Клиент
            </div>
            <div className="font-medium">{client?.name}</div>
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              {client?.phone}
            </div>
          </Card>
          <Card>
            <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
              Автомобиль
            </div>
            <div className="font-medium">
              {vehicle?.make} {vehicle?.model}
            </div>
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              {vehicle?.plate} {vehicle?.mileage ? `· ${vehicle.mileage.toLocaleString("ru-RU")} км` : ""}
            </div>
          </Card>
          <Card>
            <div className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
              Статус
            </div>
            <StatusBadge status={order.status} />
          </Card>
        </div>

        <Card className="mb-4">
          <div className="flex items-center justify-between">
            {STATUS_FLOW.map((step, idx) => (
              <div key={step} className="flex-1 flex flex-col items-center relative">
                {idx > 0 && (
                  <div
                    className="absolute top-3 right-1/2 w-full h-0.5"
                    style={{ background: idx <= currentStepIndex ? "var(--accent)" : "var(--border)" }}
                  />
                )}
                <button
                  onClick={() => updateOrder(order.id, { status: step })}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold relative z-10 text-white"
                  style={{ background: idx <= currentStepIndex ? "var(--accent)" : "#cfd3da" }}
                >
                  {idx <= currentStepIndex ? "✓" : idx + 1}
                </button>
                <div className="text-xs mt-2 capitalize">{step}</div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Card>
            <h2 className="font-semibold mb-3">Работы и услуги</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--text-muted)" }}>
                  <th className="pb-2 font-medium">Наименование</th>
                  <th className="pb-2 font-medium text-right">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {order.works.map((w) => (
                  <tr key={w.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2">
                      {w.name}
                      {w.executor && (
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          Исполнитель: {w.executor}
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-right">{formatMoney(w.price * w.qty)}</td>
                  </tr>
                ))}
                {order.works.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-3 text-center" style={{ color: "var(--text-muted)" }}>
                      Работы не добавлены
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="text-right font-semibold mt-3">Итого за работы: {formatMoney(worksTotal)}</div>
          </Card>

          <Card>
            <h2 className="font-semibold mb-3">Запчасти</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--text-muted)" }}>
                  <th className="pb-2 font-medium">Наименование</th>
                  <th className="pb-2 font-medium text-right">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {order.parts.map((p) => (
                  <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-2">
                      {p.name}
                      {p.sku && (
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          Артикул: {p.sku}
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-right">{formatMoney(p.price * p.qty)}</td>
                  </tr>
                ))}
                {order.parts.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-3 text-center" style={{ color: "var(--text-muted)" }}>
                      Запчасти не добавлены
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="text-right font-semibold mt-3">Итого за запчасти: {formatMoney(partsTotal)}</div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <h2 className="font-semibold mb-2">Заметки</h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {order.notes || "Нет заметок"}
            </p>
          </Card>

          <Card>
            <h2 className="font-semibold mb-3">Итог по заказу</h2>
            <div className="flex justify-between text-sm mb-1">
              <span>Работы</span>
              <span>{formatMoney(worksTotal)}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span>Запчасти</span>
              <span>{formatMoney(partsTotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm mb-1" style={{ color: "var(--danger)" }}>
                <span>Скидка</span>
                <span>-{formatMoney(discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-base border-t pt-2 mt-2" style={{ borderColor: "var(--border)" }}>
              <span>К оплате</span>
              <span>{formatMoney(due)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span>Оплачено</span>
              <span>{formatMoney(paid)}</span>
            </div>
            <div className="flex justify-between text-sm" style={{ color: debt > 0 ? "var(--danger)" : "var(--accent)" }}>
              <span>Долг</span>
              <span>{formatMoney(debt)}</span>
            </div>
            {debt > 0 && (
              <div className="mt-3">
                <Button onClick={() => updateOrder(order.id, { paid: due })}>Принять оплату</Button>
              </div>
            )}
          </Card>
        </div>
      </Page>
    </>
  );
}
