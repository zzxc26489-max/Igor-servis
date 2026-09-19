import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { IconArrowLeft, IconPrinter } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { Button, Page, TopBar } from "../components/ui";
import ClientOrderDocument from "../components/ClientOrderDocument";

export default function OrderPrint() {
  const { orderId } = useParams();
  const { orders, clients, vehicles, company, payments } = useAppStore();
  const order = orders.find((item) => item.id === orderId);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = "@media print { @page { size: A4 portrait; margin: 10mm; } }";
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
        title={`Заказ-наряд ${order.number}`}
        subtitle="Клиентская версия без внутренних данных сервиса"
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
        <ClientOrderDocument order={order} client={client} vehicle={vehicle} company={company} payments={payments} />
      </Page>
    </>
  );
}
