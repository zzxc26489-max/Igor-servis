import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  IconArrowLeft, IconCar, IconCheck, IconClipboardList, IconCoin, IconEdit,
  IconPhone, IconPlus, IconStar, IconStarFilled, IconUser, IconX,
} from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { useToast } from "../components/Toast";
import { Button, Card, EmptyState, Page, StatusBadge, TopBar } from "../components/ui";
import { formatDateTime, formatMoney, plural } from "../lib/format";
import { orderTotals } from "../lib/order";

function telHref(phone: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  return `tel:${digits}`;
}

export default function ClientDetail() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { clients, vehicles, orders, updateClient, addVehicle, updateVehicle } = useAppStore();
  const client = clients.find((item) => item.id === clientId);

  const [editingClient, setEditingClient] = useState(false);
  const [name, setName] = useState(client?.name ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [notes, setNotes] = useState(client?.notes ?? "");

  const [vehicleFormOpen, setVehicleFormOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [year, setYear] = useState("");
  const [mileage, setMileage] = useState("");

  const clientVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.clientId === clientId),
    [clientId, vehicles],
  );
  const clientOrders = useMemo(
    () => orders.filter((order) => order.clientId === clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [clientId, orders],
  );
  const stats = useMemo(() => {
    return clientOrders.reduce(
      (acc, order) => {
        const { due, debt } = orderTotals(order);
        acc.spent += due;
        acc.debt += Math.max(0, debt);
        return acc;
      },
      { spent: 0, debt: 0 },
    );
  }, [clientOrders]);

  if (!client) {
    return (
      <Page>
        <p>Клиент не найден.</p>
        <Link to="/clients" className="text-[var(--accent)]">Вернуться к списку клиентов</Link>
      </Page>
    );
  }

  function startEditClient() {
    if (!client) return;
    setName(client.name);
    setPhone(client.phone);
    setNotes(client.notes ?? "");
    setEditingClient(true);
  }

  function handleClientSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    if (!cleanName || cleanPhone.replace(/\D/g, "").length < 10) {
      showToast("Укажите имя и телефон не менее 10 цифр", "error");
      return;
    }
    updateClient(client.id, { name: cleanName, phone: cleanPhone, notes: notes.trim() || undefined });
    setEditingClient(false);
    showToast("Данные клиента обновлены");
  }

  function resetVehicleForm() {
    setVehicleFormOpen(false);
    setEditingVehicleId(null);
    setMake("");
    setModel("");
    setPlate("");
    setVin("");
    setYear("");
    setMileage("");
  }

  function startEditVehicle(id: string) {
    const vehicle = vehicles.find((item) => item.id === id);
    if (!vehicle) return;
    setEditingVehicleId(id);
    setMake(vehicle.make);
    setModel(vehicle.model);
    setPlate(vehicle.plate);
    setVin(vehicle.vin ?? "");
    setYear(vehicle.year ? String(vehicle.year) : "");
    setMileage(vehicle.mileage ? String(vehicle.mileage) : "");
    setVehicleFormOpen(true);
  }

  function handleVehicleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    if (!make.trim() || !model.trim() || !plate.trim()) {
      showToast("Заполните марку, модель и госномер", "error");
      return;
    }
    const patch = {
      make: make.trim(),
      model: model.trim(),
      plate: plate.trim().toUpperCase(),
      vin: vin.trim() || undefined,
      year: year ? Number(year) : undefined,
      mileage: mileage ? Number(mileage) : undefined,
    };
    if (editingVehicleId) {
      updateVehicle(editingVehicleId, patch);
      showToast("Автомобиль обновлён");
    } else {
      addVehicle({ id: `vehicle-${Date.now()}`, clientId: client.id, ...patch });
      showToast("Автомобиль добавлен");
    }
    resetVehicleForm();
  }

  function toggleRegular() {
    if (!client) return;
    updateClient(client.id, { isRegular: !client.isRegular });
    showToast(client.isRegular ? "Отметка «постоянный» снята" : "Клиент отмечен как постоянный");
  }

  return (
    <>
      <TopBar
        title={client.name}
        subtitle={`${clientOrders.length} ${plural(clientOrders.length, "заказ-наряд", "заказ-наряда", "заказ-нарядов")} · ${clientVehicles.length} авто`}
        hideNewRecordOnMobile
        actions={
          <>
            <a href={telHref(client.phone)} aria-label="Позвонить клиенту" title="Позвонить">
              <Button size="sm"><IconPhone size={18} /><span className="hidden sm:inline">Позвонить</span></Button>
            </a>
            <Link to="/clients" aria-label="К списку клиентов" title="К клиентам">
              <Button size="sm" variant="secondary"><IconArrowLeft size={18} /><span className="hidden sm:inline">К клиентам</span></Button>
            </Link>
          </>
        }
      />
      <Page>
        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<IconClipboardList size={20} />} tone="#e9f5ed" color="var(--accent)" label="Заказ-нарядов" value={String(clientOrders.length)} />
          <Stat icon={<IconCoin size={20} />} tone="#edf4ff" color="#3978c9" label="Потрачено" value={formatMoney(stats.spent)} />
          <Stat icon={<IconCoin size={20} />} tone="#fbe9e9" color="var(--danger)" label="Долг" value={formatMoney(stats.debt)} />
          <Stat icon={<IconCar size={20} />} tone="#f5f0ff" color="#6656b8" label="Автомобилей" value={String(clientVehicles.length)} />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="panel-title flex items-center gap-2"><IconUser size={18} /> Контакты</h2>
              {!editingClient && (
                <Button size="sm" variant="secondary" onClick={startEditClient}>
                  <IconEdit size={16} /><span className="hidden sm:inline">Изменить</span>
                </Button>
              )}
            </div>

            {editingClient ? (
              <form onSubmit={handleClientSubmit} className="space-y-3">
                <label className="block text-sm">
                  <span className="mb-1 block muted">Имя</span>
                  <div className="field-control"><input value={name} onChange={(event) => setName(event.target.value)} /></div>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block muted">Телефон</span>
                  <div className="field-control"><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" /></div>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block muted">Заметка</span>
                  <div className="field-control"><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Особенности, договорённости" /></div>
                </label>
                <div className="flex gap-2">
                  <Button type="submit" size="sm"><IconCheck size={16} /> Сохранить</Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditingClient(false)}><IconX size={16} /> Отмена</Button>
                </div>
              </form>
            ) : (
              <div className="space-y-3 text-sm">
                <a href={telHref(client.phone)} className="flex items-center gap-2 font-semibold text-[var(--accent)] hover:underline">
                  <IconPhone size={18} /> {client.phone}
                </a>
                <button
                  onClick={toggleRegular}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition hover:bg-gray-50"
                  style={{ borderColor: "var(--border)" }}
                >
                  {client.isRegular
                    ? <><IconStarFilled size={16} className="text-[var(--warning)]" /> Постоянный клиент</>
                    : <><IconStar size={16} className="muted" /> Отметить постоянным</>}
                </button>
                {client.notes && <p className="muted">{client.notes}</p>}
              </div>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="panel-title flex items-center gap-2"><IconCar size={18} /> Автомобили</h2>
              {!vehicleFormOpen && (
                <Button size="sm" variant="secondary" onClick={() => setVehicleFormOpen(true)}>
                  <IconPlus size={16} /><span className="hidden sm:inline">Добавить авто</span>
                </Button>
              )}
            </div>

            {vehicleFormOpen && (
              <form onSubmit={handleVehicleSubmit} className="mb-4 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Марка *"><input value={make} onChange={(event) => setMake(event.target.value)} /></Field>
                  <Field label="Модель *"><input value={model} onChange={(event) => setModel(event.target.value)} /></Field>
                  <Field label="Госномер *"><input value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="А123ВС 797" /></Field>
                  <Field label="VIN"><input value={vin} onChange={(event) => setVin(event.target.value)} /></Field>
                  <Field label="Год"><input value={year} onChange={(event) => setYear(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" /></Field>
                  <Field label="Пробег, км"><input value={mileage} onChange={(event) => setMileage(event.target.value.replace(/\D/g, ""))} inputMode="numeric" /></Field>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button type="submit" size="sm"><IconCheck size={16} /> {editingVehicleId ? "Сохранить" : "Добавить"}</Button>
                  <Button variant="secondary" size="sm" onClick={resetVehicleForm}><IconX size={16} /> Отмена</Button>
                </div>
              </form>
            )}

            {clientVehicles.length === 0 ? (
              <EmptyState icon={<IconCar size={22} />} title="Автомобилей нет" hint="Добавьте авто, чтобы оформлять заказ-наряды быстрее" />
            ) : (
              <div className="space-y-2">
                {clientVehicles.map((vehicle) => (
                  <div
                    key={vehicle.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {vehicle.make} {vehicle.model} {vehicle.year ? `· ${vehicle.year}` : ""}
                      </div>
                      <div className="muted truncate text-xs">
                        {vehicle.plate}
                        {vehicle.mileage ? ` · ${vehicle.mileage.toLocaleString("ru-RU")} км` : ""}
                        {vehicle.vin ? ` · VIN ${vehicle.vin}` : ""}
                      </div>
                    </div>
                    <Button size="icon" variant="secondary" onClick={() => startEditVehicle(vehicle.id)} className="shrink-0">
                      <IconEdit size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="mt-3 overflow-hidden p-0">
          <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
            <h2 className="panel-title flex items-center gap-2"><IconClipboardList size={18} /> История обслуживания</h2>
          </div>
          <div className="table-scroll">
            <table className="app-table min-w-[620px]">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Дата</th>
                  <th>Автомобиль</th>
                  <th>Статус</th>
                  <th className="text-right">Сумма</th>
                  <th className="text-right">Долг</th>
                </tr>
              </thead>
              <tbody>
                {clientOrders.map((order) => {
                  const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                  const { due, debt } = orderTotals(order);
                  return (
                    <tr
                      key={order.id}
                      onClick={() => navigate(`/orders/${order.id}`)}
                      className="cursor-pointer"
                    >
                      <td><span className="font-semibold text-[var(--accent)]">{order.number}</span></td>
                      <td className="muted">{formatDateTime(order.createdAt)}</td>
                      <td>{vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}</td>
                      <td><StatusBadge status={order.status} /></td>
                      <td className="text-right font-medium">{formatMoney(due)}</td>
                      <td className="text-right" style={{ color: debt > 0 ? "var(--danger)" : undefined }}>
                        {debt > 0 ? formatMoney(debt) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {clientOrders.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState icon={<IconClipboardList size={22} />} title="Заказ-нарядов пока нет" hint="Создайте первую запись для этого клиента" />
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

function Stat({ icon, tone, color, label, value }: { icon: React.ReactNode; tone: string; color: string; label: string; value: string }) {
  return (
    <Card className="flex items-start gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: tone, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="muted text-xs">{label}</p>
        <p className="mt-0.5 truncate text-lg font-semibold">{value}</p>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block muted">{label}</span>
      <div className="field-control">{children}</div>
    </label>
  );
}
