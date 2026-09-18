import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { IconArrowLeft, IconPrinter } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Button, Page, TopBar } from "../components/ui";
import { formatDateTime, formatMoney } from "../lib/format";
import { amountInWords } from "../lib/numberToWords";
import defaultLogo from "../assets/logo.jpg";

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
function formatActDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} г.`;
}

export default function WorkAct() {
  const { orderId } = useParams();
  const { orders, clients, vehicles, company } = useAppStore();
  const order = orders.find((item) => item.id === orderId);

  // @page нельзя выбрать селектором, поэтому альбомная ориентация живёт в стиле,
  // который существует только пока открыт акт — остальные документы печатаются книжно.
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = "@media print { @page { size: A4 landscape; margin: 8mm; } }";
    document.head.append(style);
    return () => style.remove();
  }, []);

  if (!order) {
    return <Page><p>Заказ-наряд не найден.</p><Link to="/orders" className="text-[var(--accent)]">Вернуться к заказам</Link></Page>;
  }

  const client = clients.find((item) => item.id === order.clientId);
  const vehicle = vehicles.find((item) => item.id === order.vehicleId);
  const worksTotal = order.works.reduce((sum, work) => sum + work.price * work.qty, 0);
  const partsTotal = order.parts.reduce((sum, part) => sum + part.price * part.qty, 0);
  const total = worksTotal + partsTotal - (order.discount ?? 0);
  const actNumber = order.number.replace("№", "");

  return (
    <>
      <TopBar
        title={`Акт выполненных работ ${actNumber}`}
        subtitle="Документ сформирован автоматически из заказ-наряда"
        hideNewRecordOnMobile
        actions={<><Button size="sm" onClick={() => window.print()}><IconPrinter size={18} /><span className="hidden sm:inline">Печать / PDF</span></Button><Link to={`/orders/${order.id}`} aria-label="Вернуться к заказу" title="К заказу"><Button size="sm" variant="secondary"><IconArrowLeft size={18} /><span className="hidden sm:inline">К заказу</span></Button></Link></>}
      />
      <Page>
        <article className="work-act mx-auto max-w-[900px] rounded-xl border bg-white p-5 shadow-sm sm:p-8 print:max-w-none print:border-0 print:p-0 print:shadow-none" style={{ borderColor: "var(--border)" }}>
          <header className="flex flex-col justify-between gap-5 border-b pb-5 sm:flex-row" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-start gap-4">
              <img
                src={company.logoDataUrl || defaultLogo}
                alt=""
                className="document-logo h-16 w-16 shrink-0 rounded-xl object-contain"
              />
              <div>
                <h2 className="text-xl font-bold">{company.name}</h2>
                <p className="mt-1 text-sm">{company.address}</p>
                {(company.phone || company.phone2) && (
                  <p className="text-sm">Тел.: {[company.phone, company.phone2].filter(Boolean).join(" · ")}</p>
                )}
                {company.inn && <p className="text-sm">ИНН: {company.inn}</p>}
              </div>
            </div>
            <div className="sm:text-right">
              <h1 className="text-2xl font-bold">Акт выполненных работ</h1>
              <p className="mt-1 text-sm">№ {actNumber}</p>
              <p className="text-sm">от {formatDateTime(order.createdAt)}</p>
            </div>
          </header>

          <section className="act-parties mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}><p className="muted text-xs">Заказчик</p><p className="mt-1 font-semibold">{client?.name || "—"}</p><p>{client?.phone || "Телефон не указан"}</p></div>
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)" }}><p className="muted text-xs">Автомобиль</p><p className="mt-1 font-semibold">{vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}</p><p>Госномер: {vehicle?.plate || "—"}</p>{vehicle?.vin && <p>VIN: {vehicle.vin}</p>}{vehicle?.mileage && <p>Пробег: {vehicle.mileage.toLocaleString("ru-RU")} км</p>}</div>
          </section>

          {(order.complaint || order.diagnosis || order.defects) && (
            <section className="mt-4 space-y-1 text-sm">
              {order.complaint && <p><b>Жалоба клиента:</b> {order.complaint}</p>}
              {order.diagnosis && <p><b>Результат диагностики:</b> {order.diagnosis}</p>}
              {order.defects && <p><b>Внешние дефекты:</b> {order.defects}</p>}
            </section>
          )}

          <div className="act-tables">
          <section className="mt-6">
            <h2 className="mb-2 font-bold">Выполненные работы</h2>
            <div className="overflow-x-auto"><table className="act-table min-w-[620px]"><thead><tr><th>№</th><th>Наименование</th><th>Исполнитель</th><th className="text-right">Кол-во</th><th className="text-right">Цена</th><th className="text-right">Сумма</th></tr></thead><tbody>{order.works.map((work, index) => <tr key={work.id}><td>{index + 1}</td><td>{work.name}</td><td>{work.executor || "—"}</td><td className="text-right">{work.qty}</td><td className="text-right">{formatMoney(work.price)}</td><td className="text-right">{formatMoney(work.price * work.qty)}</td></tr>)}{order.works.length === 0 && <tr><td colSpan={6} className="text-center muted">Работы не указаны</td></tr>}</tbody></table></div>
          </section>

          {order.parts.length > 0 && <section className="mt-6"><h2 className="mb-2 font-bold">Использованные запчасти и материалы</h2><div className="overflow-x-auto"><table className="act-table min-w-[560px]"><thead><tr><th>№</th><th>Наименование</th><th>Артикул</th><th className="text-right">Кол-во</th><th className="text-right">Цена</th><th className="text-right">Сумма</th></tr></thead><tbody>{order.parts.map((part, index) => <tr key={part.id}><td>{index + 1}</td><td>{part.name}</td><td>{part.sku || "—"}</td><td className="text-right">{part.qty}</td><td className="text-right">{formatMoney(part.price)}</td><td className="text-right">{formatMoney(part.price * part.qty)}</td></tr>)}</tbody></table></div></section>}
          </div>

          <div className="act-bottom">
            <div className="act-totals">
              <section className="ml-auto mt-6 max-w-sm space-y-2 text-sm">
                <div className="flex justify-between"><span>Работы</span><b>{formatMoney(worksTotal)}</b></div>
                <div className="flex justify-between"><span>Запчасти</span><b>{formatMoney(partsTotal)}</b></div>
                {(order.discount ?? 0) > 0 && <div className="flex justify-between"><span>Скидка</span><b>−{formatMoney(order.discount ?? 0)}</b></div>}
                <div className="flex justify-between border-t pt-2 text-lg" style={{ borderColor: "var(--border)" }}><b>Итого</b><b>{formatMoney(total)}</b></div>
              </section>
              <p className="mt-2 text-sm font-semibold">Сумма прописью: {amountInWords(total)}</p>
            </div>

            <div className="act-agreement">
              <h2 className="mt-8 text-center text-base font-bold uppercase">Акт сдачи-приёмки оказанных услуг</h2>
              <p className="text-center text-sm">от «{formatActDate(order.completedAt || order.createdAt)}»</p>
              <section className="mt-3 text-sm leading-relaxed text-justify">
                <p>
                  Мы, нижеподписавшиеся, <b>Исполнитель {company.responsible || company.shortName}</b>{company.inn ? ` (ИНН ${company.inn})` : ""} с одной стороны,
                  и <b>{client?.name || "Заказчик"}</b> с другой стороны, составили настоящий акт о том, что Исполнителем выполнены
                  в полном объёме работы по ремонту и обслуживанию автомобиля, указанного в настоящем акте, гарантия на выполненные
                  работы составляет {order.guaranteeMonths ? `${order.guaranteeMonths} мес` : "не установлена"}.
                  С условиями обслуживания и оплаты Заказчик ознакомлен. К качеству выполненных работ претензий не имеет.
                </p>
                {order.notes && <p className="mt-2"><b>Примечание:</b> {order.notes}</p>}
              </section>
            </div>
          </div>
          <footer className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-2"><div><p className="muted text-xs">Исполнитель</p><div className="mt-8 border-b" style={{ borderColor: "var(--text)" }} /><p className="mt-1 text-xs">{company.responsible || order.advisor || "Подпись / ФИО"}</p></div><div><p className="muted text-xs">Заказчик</p><div className="mt-8 border-b" style={{ borderColor: "var(--text)" }} /><p className="mt-1 text-xs">{client?.name || "Подпись / ФИО"}</p></div></footer>
        </article>
      </Page>
    </>
  );
}
