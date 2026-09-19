import { formatDateTime, formatMoney } from "../lib/format";
import { recordedForOrder } from "../lib/payments";
import defaultLogo from "../assets/logo.jpg";
import type { Client, CompanyInfo, Order, Payment, Vehicle } from "../types";

export default function ServiceActDocument({
  order,
  client,
  vehicle,
  company,
  payments,
}: {
  order: Order;
  client?: Client;
  vehicle?: Vehicle;
  company: CompanyInfo;
  payments: Payment[];
}) {
  const worksTotal = order.works.reduce((sum, work) => sum + work.price * work.qty, 0);
  const partsTotal = order.parts.reduce((sum, part) => sum + part.price * part.qty, 0);
  const discount = Math.max(0, order.discount ?? 0);
  const total = Math.max(0, worksTotal + partsTotal - discount);
  const paid = Math.max(0, recordedForOrder(payments, order.id));
  const debt = Math.max(0, total - paid);
  const number = order.number.replace("№", "");

  return (
    <article className="service-act work-act mx-auto max-w-[980px] rounded-xl border bg-white p-5 shadow-sm sm:p-8 print:max-w-none print:border-0 print:p-0 print:shadow-none" style={{ borderColor: "var(--border)" }}>
      <header className="flex items-start justify-between gap-5 border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <div className="flex min-w-0 items-start gap-3">
          <img src={company.logoDataUrl || defaultLogo} alt="" className="document-logo h-14 w-14 shrink-0 rounded-xl object-contain" />
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{company.name}</h2>
            {company.address && <p className="mt-1 text-sm">{company.address}</p>}
            {(company.phone || company.phone2) && <p className="text-sm">Тел.: {[company.phone, company.phone2].filter(Boolean).join(" · ")}</p>}
            {company.inn && <p className="text-sm">ИНН: {company.inn}</p>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <h1 className="text-xl font-bold">Акт выполненных работ</h1>
          <p className="mt-1 text-sm">к заказ-наряду № {number}</p>
          <p className="text-sm">от {formatDateTime(order.issuedAt ?? order.completedAt ?? order.createdAt)}</p>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div>
          <div className="client-order-label">Заказчик</div>
          <b>{client?.name || "—"}</b>
          {client?.phone && <div>{client.phone}</div>}
        </div>
        <div>
          <div className="client-order-label">Автомобиль</div>
          <b>{vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}</b>
          <div>
            {vehicle?.plate ? `Госномер: ${vehicle.plate}` : ""}
            {vehicle?.year ? ` · ${vehicle.year} г.` : ""}
          </div>
          {vehicle?.vin && <div>VIN: {vehicle.vin}</div>}
          {vehicle?.mileage ? <div>Пробег: {vehicle.mileage.toLocaleString("ru-RU")} км</div> : null}
        </div>
      </section>

      <div className="act-tables mt-5">
        <section>
          <h2 className="mb-2 font-bold">Выполненные работы</h2>
          <table className="client-order-table act-table">
            <thead>
              <tr><th>№</th><th>Наименование</th><th className="text-right">Кол-во</th><th className="text-right">Сумма</th></tr>
            </thead>
            <tbody>
              {order.works.map((work, index) => (
                <tr key={work.id}>
                  <td>{index + 1}</td>
                  <td>{work.name}</td>
                  <td className="text-right">{work.qty}</td>
                  <td className="text-right">{formatMoney(work.price * work.qty)}</td>
                </tr>
              ))}
              {order.works.length === 0 && <tr><td colSpan={4} className="text-center muted">Работы не указаны</td></tr>}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="mb-2 font-bold">Запчасти и материалы</h2>
          <table className="client-order-table act-table">
            <thead>
              <tr><th>№</th><th>Наименование</th><th className="text-right">Кол-во</th><th className="text-right">Сумма</th></tr>
            </thead>
            <tbody>
              {order.parts.map((part, index) => (
                <tr key={part.id}>
                  <td>{index + 1}</td>
                  <td>{part.name}{part.sku ? <div className="text-xs">арт. {part.sku}</div> : null}</td>
                  <td className="text-right">{part.qty} {part.unit || ""}</td>
                  <td className="text-right">{formatMoney(part.price * part.qty)}</td>
                </tr>
              ))}
              {order.parts.length === 0 && <tr><td colSpan={4} className="text-center muted">Запчасти не указаны</td></tr>}
            </tbody>
          </table>
        </section>
      </div>

      <div className="act-bottom mt-5">
        <section className="text-sm">
          <h2 className="mb-2 font-bold">Результат работ</h2>
          {order.diagnosis && <p><b>Диагностика:</b> {order.diagnosis}</p>}
          {order.guaranteeMonths ? <p className="mt-1"><b>Гарантия на выполненные работы:</b> {order.guaranteeMonths} мес.</p> : null}
          <p className="mt-3">Работы выполнены в полном объёме. Заказчик результат осмотрел, претензий к объёму выполненных работ на момент подписания акта не имеет.</p>
        </section>

        <section className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span>Работы</span><b>{formatMoney(worksTotal)}</b></div>
          <div className="flex justify-between"><span>Запчасти</span><b>{formatMoney(partsTotal)}</b></div>
          {discount > 0 && <div className="flex justify-between"><span>Скидка</span><b>−{formatMoney(discount)}</b></div>}
          <div className="flex justify-between border-t pt-2 text-base" style={{ borderColor: "var(--border)" }}><b>Итого</b><b>{formatMoney(total)}</b></div>
          <div className="flex justify-between"><span>Оплачено</span><b>{formatMoney(paid)}</b></div>
          <div className="flex justify-between"><span>Осталось</span><b>{formatMoney(debt)}</b></div>
        </section>
      </div>

      <footer className="client-order-signs mt-10 grid grid-cols-2 gap-10 text-sm">
        <div>
          <p>Исполнитель</p>
          <div className="mt-8 border-b" style={{ borderColor: "var(--text)" }} />
          <p className="mt-1 text-xs">{company.responsible || "Подпись / ФИО"}</p>
        </div>
        <div>
          <p>Заказчик</p>
          <div className="mt-8 border-b" style={{ borderColor: "var(--text)" }} />
          <p className="mt-1 text-xs">{client?.name || "Подпись / ФИО"}</p>
        </div>
      </footer>
    </article>
  );
}
