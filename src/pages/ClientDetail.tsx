import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  IconArrowLeft, IconBrandWhatsapp, IconCake, IconCar, IconCheck, IconClipboardList,
  IconCoin, IconDiscount2, IconEdit, IconMail, IconMapPin, IconNotes, IconPhone,
  IconPlus, IconStar, IconStarFilled, IconTool, IconTrash, IconUser, IconX,
} from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { createId } from "../lib/id";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Confirm";
import { Field, PhoneField, PlateField } from "../components/fields";
import {
  FOREIGN_PLATE_HINT, RU_PLATE_HINT, VIN_HINT, formatPhone, isValidBirthday, isValidEmail,
  isValidMileage, isValidPhone, isValidPlate, isValidVin, isValidYear, looksRussian,
  normalizePlate, normalizeVin, type PlateKind,
} from "../lib/formats";
import { Button, Card, EmptyState, ListCard, Metric, Page, StatusBadge, TopBar } from "../components/ui";
import { formatDate, formatDateTime, formatMoney, plural } from "../lib/format";
import { orderTotals } from "../lib/order";
import { issuedVehicleOrders, vehicleOrders, vehicleServiceStats } from "../lib/serviceBook";
import type { Vehicle } from "../types";
import { todayISO } from "../lib/date";

const SOURCES = ["Сарафанное радио", "Яндекс Карты", "2ГИС", "Авито", "Telegram", "Проезжал мимо", "Другое"];

function digitsOnly(phone: string) {
  return phone.replace(/\D/g, "");
}

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function whatsappHref(phone: string) {
  const digits = digitsOnly(phone);
  return `https://wa.me/${digits.startsWith("8") ? `7${digits.slice(1)}` : digits}`;
}

function formatBirthday(iso: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
}

function formatMonthYear(iso: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);
}

type ServiceAlert = { label: string; tone: "danger" | "warning" | "muted" } | null;

function serviceAlert(vehicle: Vehicle): ServiceAlert {
  const parts: string[] = [];
  let overdue = false;
  let soon = false;

  if (vehicle.nextServiceDate) {
    const days = Math.round((new Date(vehicle.nextServiceDate).getTime() - Date.now()) / 86_400_000);
    parts.push(formatDate(vehicle.nextServiceDate));
    if (days < 0) overdue = true;
    else if (days <= 30) soon = true;
  }
  if (vehicle.nextServiceMileage) {
    parts.push(`${vehicle.nextServiceMileage.toLocaleString("ru-RU")} км`);
    if (vehicle.mileage) {
      const left = vehicle.nextServiceMileage - vehicle.mileage;
      if (left <= 0) overdue = true;
      else if (left <= 1000) soon = true;
    }
  }
  if (parts.length === 0) return null;

  const tone = overdue ? "danger" : soon ? "warning" : "muted";
  const prefix = overdue ? "ТО просрочено" : soon ? "ТО скоро" : "Следующее ТО";
  return { label: `${prefix}: ${parts.join(" · ")}`, tone };
}

export default function ClientDetail() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { clients, vehicles, orders, updateClient, addVehicle, updateVehicle, deleteVehicle } = useAppStore();
  const client = clients.find((item) => item.id === clientId);

  const [editingClient, setEditingClient] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", phone2: "", email: "", birthday: "", source: "", discountPercent: "", notes: "",
  });

  const [clientTouched, setClientTouched] = useState(false);
  const [vehicleTouched, setVehicleTouched] = useState(false);
  const [plateKind, setPlateKind] = useState<PlateKind>("ru");
  const [vehicleFormOpen, setVehicleFormOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [serviceBookVehicleId, setServiceBookVehicleId] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState({
    make: "", model: "", plate: "", vin: "", year: "", mileage: "",
    color: "", engine: "", transmission: "", nextServiceDate: "", nextServiceMileage: "",
  });

  const clientVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.clientId === clientId),
    [clientId, vehicles],
  );
  const clientOrders = useMemo(
    () => orders.filter((order) => order.clientId === clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [clientId, orders],
  );
  const stats = useMemo(() => {
    const issued = clientOrders.filter((order) => order.status === "выдан");
    const spent = issued.reduce((sum, order) => sum + orderTotals(order).due, 0);
    const debt = clientOrders
      .filter((order) => order.status !== "запись")
      .reduce((sum, order) => sum + Math.max(0, orderTotals(order).debt), 0);
    const paidOrders = issued.filter((order) => orderTotals(order).due > 0);
    return {
      spent,
      debt,
      average: paidOrders.length ? Math.round(spent / paidOrders.length) : 0,
      lastVisit: issued[0]?.issuedAt ?? issued[0]?.completedAt ?? issued[0]?.createdAt,
    };
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
    setClientTouched(false);
    setForm({
      name: client.name,
      phone: formatPhone(client.phone),
      phone2: client.phone2 ? formatPhone(client.phone2) : "",
      email: client.email ?? "",
      birthday: client.birthday ?? "",
      source: client.source ?? "",
      discountPercent: client.discountPercent ? String(client.discountPercent) : "",
      notes: client.notes ?? "",
    });
    setEditingClient(true);
  }

  function handleClientSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    setClientTouched(true);
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (!name) {
      showToast("Укажите имя клиента", "error");
      return;
    }
    if (!isValidPhone(phone)) {
      showToast("Номер телефона неполный: нужен +7 и 10 цифр", "error");
      return;
    }
    if (form.phone2.trim() && !isValidPhone(form.phone2)) {
      showToast("Дополнительный номер неполный", "error");
      return;
    }
    if (!isValidEmail(form.email)) {
      showToast("Проверьте email", "error");
      return;
    }
    if (!isValidBirthday(form.birthday)) {
      showToast("Дата рождения не может быть в будущем", "error");
      return;
    }
    const discount = Number(form.discountPercent);
    if (form.discountPercent && (Number.isNaN(discount) || discount < 0 || discount > 100)) {
      showToast("Скидка должна быть от 0 до 100%", "error");
      return;
    }
    updateClient(client.id, {
      name,
      phone,
      phone2: form.phone2.trim() || undefined,
      email: form.email.trim() || undefined,
      birthday: form.birthday || undefined,
      source: form.source.trim() || undefined,
      discountPercent: form.discountPercent ? discount : undefined,
      notes: form.notes.trim() || undefined,
    });
    setEditingClient(false);
    showToast("Данные клиента обновлены");
  }

  function resetVehicleForm() {
    setVehicleFormOpen(false);
    setEditingVehicleId(null);
    setVehicleTouched(false);
    setPlateKind("ru");
    setVehicleForm({
      make: "", model: "", plate: "", vin: "", year: "", mileage: "",
      color: "", engine: "", transmission: "", nextServiceDate: "", nextServiceMileage: "",
    });
  }

  function startEditVehicle(id: string) {
    const vehicle = vehicles.find((item) => item.id === id);
    if (!vehicle) return;
    setEditingVehicleId(id);
    setVehicleTouched(false);
    // Тип номера определяем по самому номеру: иностранный не пройдёт российскую проверку.
    setPlateKind(looksRussian(vehicle.plate) ? "ru" : "foreign");
    setVehicleForm({
      make: vehicle.make,
      model: vehicle.model,
      plate: vehicle.plate,
      vin: vehicle.vin ?? "",
      year: vehicle.year ? String(vehicle.year) : "",
      mileage: vehicle.mileage ? String(vehicle.mileage) : "",
      color: vehicle.color ?? "",
      engine: vehicle.engine ?? "",
      transmission: vehicle.transmission ?? "",
      nextServiceDate: vehicle.nextServiceDate ?? "",
      nextServiceMileage: vehicle.nextServiceMileage ? String(vehicle.nextServiceMileage) : "",
    });
    setVehicleFormOpen(true);
  }

  function handleVehicleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    setVehicleTouched(true);
    if (!vehicleForm.make.trim() || !vehicleForm.model.trim() || !vehicleForm.plate.trim()) {
      showToast("Заполните марку, модель и госномер", "error");
      return;
    }
    if (!isValidPlate(vehicleForm.plate, plateKind)) {
      showToast(plateKind === "ru" ? RU_PLATE_HINT : FOREIGN_PLATE_HINT, "error");
      return;
    }
    if (vehicleForm.vin.trim() && !isValidVin(vehicleForm.vin)) {
      showToast(`VIN указан неверно: ${VIN_HINT}`, "error");
      return;
    }
    if (!isValidYear(vehicleForm.year)) {
      showToast("Проверьте год выпуска", "error");
      return;
    }
    if (!isValidMileage(vehicleForm.mileage) || !isValidMileage(vehicleForm.nextServiceMileage)) {
      showToast("Пробег должен быть от 1 до 2 000 000 км", "error");
      return;
    }
    const normalizedPlate = normalizePlate(vehicleForm.plate, plateKind);
    const duplicate = vehicles.find(
      (item) => item.id !== editingVehicleId
        && normalizePlate(item.plate, looksRussian(item.plate) ? "ru" : "foreign") === normalizedPlate,
    );
    if (duplicate) {
      showToast(`Автомобиль с номером ${duplicate.plate} уже заведён`, "error");
      return;
    }
    const patch = {
      make: vehicleForm.make.trim(),
      model: vehicleForm.model.trim(),
      plate: normalizePlate(vehicleForm.plate, plateKind),
      vin: normalizeVin(vehicleForm.vin) || undefined,
      year: vehicleForm.year ? Number(vehicleForm.year) : undefined,
      mileage: vehicleForm.mileage ? Number(vehicleForm.mileage) : undefined,
      color: vehicleForm.color.trim() || undefined,
      engine: vehicleForm.engine.trim() || undefined,
      transmission: vehicleForm.transmission.trim() || undefined,
      nextServiceDate: vehicleForm.nextServiceDate || undefined,
      nextServiceMileage: vehicleForm.nextServiceMileage ? Number(vehicleForm.nextServiceMileage) : undefined,
    };
    if (editingVehicleId) {
      updateVehicle(editingVehicleId, patch);
      showToast("Автомобиль обновлён");
    } else {
      addVehicle({ id: createId("vehicle"), clientId: client.id, ...patch });
      showToast("Автомобиль добавлен");
    }
    resetVehicleForm();
  }

  async function handleDeleteVehicle(vehicle: Vehicle) {
    const used = orders.some((order) => order.vehicleId === vehicle.id);
    if (used) {
      showToast("По этому авто есть заказ-наряды, удалить нельзя", "error");
      return;
    }
    const ok = await confirm({
      title: "Удалить автомобиль",
      question: "Автомобиль исчезнет из карточки клиента. Отменить это нельзя.",
      summary: [
        { label: "Клиент", value: client?.name ?? "—" },
        { label: "Автомобиль", value: `${vehicle.make} ${vehicle.model}` },
        { label: "Госномер", value: vehicle.plate },
      ],
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    deleteVehicle(vehicle.id);
    if (editingVehicleId === vehicle.id) resetVehicleForm();
    showToast("Автомобиль удалён", "error");
  }

  function toggleRegular() {
    if (!client) return;
    updateClient(client.id, { isRegular: !client.isRegular });
    showToast(client.isRegular ? "Отметка «постоянный» снята" : "Клиент отмечен как постоянный");
  }

  const subtitleParts = [
    client.code ?? "",
    `${clientOrders.length} ${plural(clientOrders.length, "заказ-наряд", "заказ-наряда", "заказ-нарядов")}`,
    `${clientVehicles.length} ${plural(clientVehicles.length, "авто", "авто", "авто")}`,
  ];
  if (client.isRegular) subtitleParts.push("постоянный");
  if (client.discountPercent) subtitleParts.push(`скидка ${client.discountPercent}%`);
  const subtitle = subtitleParts.filter(Boolean).join(" · ");

  return (
    <>
      <TopBar
        title={client.name}
        subtitle={subtitle}
        hideNewRecordOnMobile
        actions={
          <>
            <a href={telHref(client.phone)} aria-label="Позвонить клиенту" title="Позвонить">
              <Button size="sm"><IconPhone size={18} /><span className="hidden sm:inline">Позвонить</span></Button>
            </a>
            <Link to={`/orders/new?clientId=${client.id}`} aria-label="Создать заказ-наряд" title="Новая запись">
              <Button size="sm" variant="secondary"><IconPlus size={18} /><span className="hidden lg:inline">Новая запись</span></Button>
            </Link>
            <Link to="/clients" aria-label="К списку клиентов" title="К клиентам">
              <Button size="sm" variant="secondary"><IconArrowLeft size={18} /><span className="hidden lg:inline">К клиентам</span></Button>
            </Link>
          </>
        }
      />
      <Page>
        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={<IconClipboardList size={18} />} label="Заказов" value={String(clientOrders.length)} />
          <Metric icon={<IconCoin size={18} />} tone="blue" label="Потрачено" value={formatMoney(stats.spent)} />
          <Metric icon={<IconCoin size={18} />} tone="violet" label="Средний чек" value={formatMoney(stats.average)} />
          <Metric icon={<IconCoin size={18} />} tone="danger" label="Долг" value={formatMoney(stats.debt)} />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="panel-title flex items-center gap-2"><IconUser size={18} /> Клиент</h2>
              {!editingClient && (
                <Button size="sm" variant="secondary" onClick={startEditClient} aria-label="Изменить данные клиента" title="Изменить">
                  <IconEdit size={16} /><span className="hidden sm:inline">Изменить</span>
                </Button>
              )}
            </div>

            {editingClient ? (
              <form onSubmit={handleClientSubmit} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Имя *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                  <PhoneField label="Телефон *" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} required touched={clientTouched} />
                  <PhoneField label="Доп. телефон" value={form.phone2} onChange={(value) => setForm({ ...form, phone2: value })} touched={clientTouched} hint="Жена, водитель и т.п." />
                  <Field label="Email" error={clientTouched && !isValidEmail(form.email) ? "Проверьте адрес: нужен вид имя@домен.ru" : undefined}>
                    <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} inputMode="email" autoComplete="email" placeholder="client@example.ru" />
                  </Field>
                  <Field label="День рождения" error={clientTouched && !isValidBirthday(form.birthday) ? "Дата не может быть в будущем" : undefined}>
                    <input type="date" max={todayISO()} value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
                  </Field>
                  <Field label="Скидка, %"><input value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value.replace(/\D/g, "").slice(0, 3) })} inputMode="numeric" placeholder="0" /></Field>
                  <Field label="Откуда пришёл">
                    <input list="client-sources" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Авито, карты, сарафан" />
                  </Field>
                </div>
                <datalist id="client-sources">{SOURCES.map((item) => <option key={item} value={item} />)}</datalist>
                <Field label="Заметка">
                  <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Особенности, договорённости" />
                </Field>
                <div className="flex gap-2">
                  <Button type="submit" size="sm"><IconCheck size={16} /> Сохранить</Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditingClient(false)}><IconX size={16} /> Отмена</Button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <a href={telHref(client.phone)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-[var(--accent)] transition hover:bg-[#e9f5ed]" style={{ borderColor: "var(--border)" }}>
                    <IconPhone size={16} /> {client.phone}
                  </a>
                  <a href={whatsappHref(client.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition hover:bg-[#e9f5ed]" style={{ borderColor: "var(--border)" }}>
                    <IconBrandWhatsapp size={16} className="text-[#25D366]" /> WhatsApp
                  </a>
                </div>

                <dl className="space-y-2 text-sm">
                  {client.phone2 && (
                    <InfoRow icon={<IconPhone size={15} />} label="Доп. телефон">
                      <a href={telHref(client.phone2)} className="hover:text-[var(--accent)]">{client.phone2}</a>
                    </InfoRow>
                  )}
                  {client.email && (
                    <InfoRow icon={<IconMail size={15} />} label="Email">
                      <a href={`mailto:${client.email}`} className="hover:text-[var(--accent)]">{client.email}</a>
                    </InfoRow>
                  )}
                  {client.birthday && (
                    <InfoRow icon={<IconCake size={15} />} label="День рождения">{formatBirthday(client.birthday)}</InfoRow>
                  )}
                  {client.discountPercent ? (
                    <InfoRow icon={<IconDiscount2 size={15} />} label="Скидка">
                      <b className="text-[var(--accent)]">{client.discountPercent}%</b>
                    </InfoRow>
                  ) : null}
                  {client.source && <InfoRow icon={<IconMapPin size={15} />} label="Откуда пришёл">{client.source}</InfoRow>}
                  {client.createdAt && <InfoRow icon={<IconUser size={15} />} label="Клиент с">{formatMonthYear(client.createdAt)}</InfoRow>}
                  {stats.lastVisit && <InfoRow icon={<IconTool size={15} />} label="Последний визит">{formatDate(stats.lastVisit)}</InfoRow>}
                </dl>

                {client.notes && (
                  <div className="rounded-lg p-3 text-sm" style={{ background: "var(--bg)" }}>
                    <div className="muted mb-1 flex items-center gap-1.5 text-xs"><IconNotes size={14} /> Заметка</div>
                    {client.notes}
                  </div>
                )}

                <button
                  onClick={toggleRegular}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition hover:bg-gray-50"
                  style={{ borderColor: "var(--border)" }}
                >
                  {client.isRegular
                    ? <><IconStarFilled size={16} className="text-[var(--warning)]" /> Постоянный клиент</>
                    : <><IconStar size={16} className="muted" /> Отметить постоянным</>}
                </button>
              </div>
            )}
          </Card>

          <Card className="lg:col-span-3">
            <div className="mb-3 flex items-start justify-between gap-2">
              <h2 className="panel-title flex items-center gap-2"><IconCar size={18} /> Автомобили</h2>
              {!vehicleFormOpen && (
                <Button size="sm" variant="secondary" onClick={() => setVehicleFormOpen(true)} aria-label="Добавить автомобиль" title="Добавить авто">
                  <IconPlus size={16} /><span className="hidden sm:inline">Добавить авто</span>
                </Button>
              )}
            </div>

            {vehicleFormOpen && (
              <form onSubmit={handleVehicleSubmit} className="mb-4 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Марка *"><input value={vehicleForm.make} onChange={(e) => setVehicleForm({ ...vehicleForm, make: e.target.value })} /></Field>
                  <Field label="Модель *"><input value={vehicleForm.model} onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })} /></Field>
                  <PlateField
                    className="sm:col-span-2"
                    value={vehicleForm.plate}
                    kind={plateKind}
                    onChange={(value) => setVehicleForm({ ...vehicleForm, plate: value })}
                    onKindChange={setPlateKind}
                    touched={vehicleTouched}
                  />
                  <Field label="Год" error={vehicleTouched && !isValidYear(vehicleForm.year) ? `С 1950 по ${new Date().getFullYear() + 1}` : undefined}>
                    <input value={vehicleForm.year} onChange={(e) => setVehicleForm({ ...vehicleForm, year: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" placeholder="2019" />
                  </Field>
                  <Field label="Цвет"><input value={vehicleForm.color} onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })} /></Field>
                  <Field label="Пробег, км" error={vehicleTouched && !isValidMileage(vehicleForm.mileage) ? "От 1 до 2 000 000 км" : undefined}>
                    <input value={vehicleForm.mileage} onChange={(e) => setVehicleForm({ ...vehicleForm, mileage: e.target.value.replace(/\D/g, "").slice(0, 7) })} inputMode="numeric" placeholder="82000" />
                  </Field>
                  <Field label="Двигатель"><input value={vehicleForm.engine} onChange={(e) => setVehicleForm({ ...vehicleForm, engine: e.target.value })} placeholder="2.0 бензин" /></Field>
                  <Field label="Коробка"><input value={vehicleForm.transmission} onChange={(e) => setVehicleForm({ ...vehicleForm, transmission: e.target.value })} placeholder="АКПП / МКПП" /></Field>
                  <Field
                    label="VIN"
                    hint={VIN_HINT}
                    error={vehicleTouched && vehicleForm.vin.trim() && !isValidVin(vehicleForm.vin) ? `Введено ${normalizeVin(vehicleForm.vin).length} из 17 знаков` : undefined}
                  >
                    <input value={vehicleForm.vin} onChange={(e) => setVehicleForm({ ...vehicleForm, vin: normalizeVin(e.target.value) })} className="uppercase" placeholder="XWEPH81ADMN123456" />
                  </Field>
                  <Field label="Следующее ТО, дата"><input type="date" value={vehicleForm.nextServiceDate} onChange={(e) => setVehicleForm({ ...vehicleForm, nextServiceDate: e.target.value })} /></Field>
                  <Field label="Следующее ТО, км" error={vehicleTouched && !isValidMileage(vehicleForm.nextServiceMileage) ? "От 1 до 2 000 000 км" : undefined}>
                    <input value={vehicleForm.nextServiceMileage} onChange={(e) => setVehicleForm({ ...vehicleForm, nextServiceMileage: e.target.value.replace(/\D/g, "").slice(0, 7) })} inputMode="numeric" />
                  </Field>
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
                {clientVehicles.map((vehicle) => {
                  const alert = serviceAlert(vehicle);
                  return (
                    <div key={vehicle.id} className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">
                            {vehicle.make} {vehicle.model}
                            {vehicle.year ? <span className="muted font-normal"> · {vehicle.year}</span> : null}
                            {vehicle.color ? <span className="muted font-normal"> · {vehicle.color}</span> : null}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs muted">
                            <span className="font-semibold text-[var(--text)]">{vehicle.plate}</span>
                            {vehicle.code ? <span>{vehicle.code}</span> : null}
                            {vehicle.mileage ? <span>{vehicle.mileage.toLocaleString("ru-RU")} км</span> : null}
                            {vehicle.engine ? <span>{vehicle.engine}</span> : null}
                            {vehicle.transmission ? <span>{vehicle.transmission}</span> : null}
                            {vehicle.vin ? <span>VIN {vehicle.vin}</span> : null}
                          </div>
                          {alert && (
                            <div
                              className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
                              style={{
                                background: alert.tone === "danger" ? "#fbe9e9" : alert.tone === "warning" ? "#fdf3e0" : "var(--bg)",
                                color: alert.tone === "danger" ? "var(--danger)" : alert.tone === "warning" ? "var(--warning)" : "var(--text-muted)",
                              }}
                            >
                              <IconTool size={13} /> {alert.label}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <Link to={`/orders/new?clientId=${client.id}&vehicleId=${vehicle.id}`} aria-label={`Записать ${vehicle.make} ${vehicle.model}`} title="Записать на ремонт">
                            <Button size="icon" variant="secondary"><IconPlus size={16} /></Button>
                          </Link>
                          <Button
                            size="icon"
                            variant="secondary"
                            onClick={() => setServiceBookVehicleId((current) => current === vehicle.id ? null : vehicle.id)}
                            aria-label={`Сервисная книжка ${vehicle.make} ${vehicle.model}`}
                            title="Сервисная книжка"
                          >
                            <IconClipboardList size={16} />
                          </Button>
                          <Button size="icon" variant="secondary" onClick={() => startEditVehicle(vehicle.id)} aria-label={`Изменить ${vehicle.make} ${vehicle.model}`} title="Изменить">
                            <IconEdit size={16} />
                          </Button>
                          <Button size="icon" variant="secondary" onClick={() => handleDeleteVehicle(vehicle)} aria-label={`Удалить ${vehicle.make} ${vehicle.model}`} title="Удалить" className="text-[var(--danger)]">
                            <IconTrash size={16} />
                          </Button>
                        </div>
                      </div>
                      {serviceBookVehicleId === vehicle.id && (() => {
                        const history = issuedVehicleOrders(orders, vehicle.id);
                        const active = vehicleOrders(orders, vehicle.id).filter((entry) => entry.status !== "выдан");
                        const serviceStats = vehicleServiceStats(orders, vehicle.id);
                        return (
                          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <div className="rounded-lg bg-[var(--bg)] p-2 text-xs"><span className="muted block">Визитов</span><b>{serviceStats.issuedOrders}</b></div>
                              <div className="rounded-lg bg-[var(--bg)] p-2 text-xs"><span className="muted block">Работ</span><b>{serviceStats.works}</b></div>
                              <div className="rounded-lg bg-[var(--bg)] p-2 text-xs"><span className="muted block">Запчастей</span><b>{serviceStats.parts}</b></div>
                              <div className="rounded-lg bg-[var(--bg)] p-2 text-xs"><span className="muted block">За всё время</span><b>{formatMoney(serviceStats.spent)}</b></div>
                            </div>
                            {active.length > 0 && (
                              <div className="mb-3 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                                <div className="mb-1 font-semibold">Сейчас в работе / запланировано</div>
                                {active.map((entry) => (
                                  <button
                                    key={entry.id}
                                    type="button"
                                    onClick={() => navigate(`/orders/${entry.id}`)}
                                    className="flex w-full items-center justify-between gap-3 py-1 text-left"
                                  >
                                    <span className="min-w-0 truncate">{entry.number} · {entry.works[0]?.name ?? entry.complaint ?? "Без описания"}</span>
                                    <StatusBadge status={entry.status} />
                                  </button>
                                ))}
                              </div>
                            )}
                            <h3 className="mb-2 text-sm font-semibold">Завершённая история автомобиля</h3>
                            <div className="space-y-2">
                              {history.map((historyOrder) => {
                                const { due } = orderTotals(historyOrder);
                                return (
                                  <button
                                    type="button"
                                    key={historyOrder.id}
                                    onClick={() => navigate(`/orders/${historyOrder.id}`)}
                                    className="w-full rounded-lg border p-3 text-left transition hover:bg-[var(--bg)]"
                                    style={{ borderColor: "var(--border)" }}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-semibold">{historyOrder.number}</span>
                                      <span className="text-sm font-semibold">{formatMoney(due)}</span>
                                    </div>
                                    <div className="muted mt-1 text-xs">
                                      {formatDateTime(historyOrder.issuedAt ?? historyOrder.completedAt ?? historyOrder.createdAt)}
                                      {" · "}
                                      {historyOrder.works.map((work) => work.name).join(", ") || "работы не указаны"}
                                    </div>
                                    {historyOrder.parts.length > 0 && (
                                      <div className="muted mt-1 text-xs">
                                        Запчасти: {historyOrder.parts.map((part) => `${part.name} × ${part.qty}`).join(", ")}
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                              {history.length === 0 && <p className="muted text-xs">Завершённых визитов по этой машине ещё нет.</p>}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <Card className="mt-3 overflow-hidden p-0">
          <div className="border-b p-4" style={{ borderColor: "var(--border)" }}>
            <h2 className="panel-title flex items-center gap-2"><IconClipboardList size={18} /> История обслуживания</h2>
          </div>
          <div className="space-y-2 p-3 lg:hidden">
            {clientOrders.map((order) => {
              const vehicle = vehicles.find((item) => item.id === order.vehicleId);
              const { due, debt } = orderTotals(order);
              return (
                <ListCard
                  key={order.id}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  accent
                  title={order.number}
                  amount={formatMoney(due)}
                  lines={[
                    vehicle ? `${vehicle.make} ${vehicle.model}` : null,
                    order.works.map((work) => work.name).join(", ") || null,
                    debt > 0 ? <span style={{ color: "var(--danger)" }}>Долг {formatMoney(debt)}</span> : null,
                  ]}
                  badge={<StatusBadge status={order.status} />}
                  meta={formatDateTime(order.createdAt)}
                />
              );
            })}
            {clientOrders.length === 0 && (
              <EmptyState icon={<IconClipboardList size={22} />} title="Заказ-нарядов пока нет" hint="Создайте первую запись для этого клиента" />
            )}
          </div>

          <div className="table-scroll hidden lg:block">
            <table className="app-table min-w-[720px]">
              <thead>
                <tr>
                  <th>№</th>
                  <th>Дата</th>
                  <th>Автомобиль</th>
                  <th>Работы</th>
                  <th>Статус</th>
                  <th className="text-right">Сумма</th>
                  <th className="text-right">Долг</th>
                </tr>
              </thead>
              <tbody>
                {clientOrders.map((order) => {
                  const vehicle = vehicles.find((item) => item.id === order.vehicleId);
                  const { due, debt } = orderTotals(order);
                  const works = order.works.map((work) => work.name).join(", ");
                  return (
                    <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)} className="cursor-pointer">
                      <td><span className="font-semibold text-[var(--accent)]">{order.number}</span></td>
                      <td className="muted whitespace-nowrap">{formatDateTime(order.createdAt)}</td>
                      <td>{vehicle ? `${vehicle.make} ${vehicle.model}` : "—"}</td>
                      <td className="muted max-w-[220px] truncate" title={works}>{works || "—"}</td>
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
                    <td colSpan={7}>
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


function InfoRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="muted flex items-center gap-1.5 text-xs">{icon} {label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

