import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { IconArrowLeft, IconPrinter } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Button, Page, TopBar } from "../components/ui";
import ServiceActDocument from "../components/ServiceActDocument";

export default function OrderAct() {
  const { orderId } = useParams();
  const { orders, clients, vehicles, company, payments } = useAppStore();
  const order = orders.find((item) => item.id === orderId);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = "@media print { @page { size: A4 landscape; margin: 10mm; } }";
    document.head.append(style);
    return () => style.remove();
  }, []);

  if (!order) {
    return <Page><p>Заказ-наряд не найден.</p><Link to="/orders" className="text-[var(--accent)]">Вернуться к заказам</Link></Page>;
  }

  const client = clients.find((item) => item.id === order.clientId);
  const vehicle = vehicles.find((item) => item.id === order.vehicleId);

  return (
    <>
      <TopBar
        title={`Акт выполненных работ · ${order.number}`}
        subtitle="Клиентский документ по фактически выполненным работам"
        hideNewRecordOnMobile
        actions={
          <>
            <Button size="sm" onClick={() => window.print()}>
              <IconPrinter size={18} /><span className="hidden sm:inline">Печать / PDF</span>
            </Button>
            <Link to={`/orders/${order.id}`} aria-label="Вернуться к заказу" title="К заказу">
              <Button size="sm" variant="secondary">
                <IconArrowLeft size={18} /><span className="hidden sm:inline">К заказу</span>
              </Button>
            </Link>
          </>
        }
      />
      <Page>
        <ServiceActDocument order={order} client={client} vehicle={vehicle} company={company} payments={payments} />
      </Page>
    </>
  );
}
