import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { IconAlertCircle, IconCalendarEvent, IconCar, IconUser } from "@tabler/icons-react";
import { Button, Card, Page, TopBar } from "../components/ui";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Confirm";
import { Field, PhoneField, PlateField } from "../components/fields";
import {
  FOREIGN_PLATE_HINT, RU_PLATE_HINT, formatPhone, isValidMileage, isValidPhone,
  isValidPlate, looksRussian, normalizePlate, type PlateKind,
} from "../lib/formats";
import { CODE_PREFIX, useAppStore } from "../store/AppStore";
import { createId, nextCode } from "../lib/id";
import { todayISO } from "../lib/date";
import { SLOT_MINUTES, fromMinutes, isSlotFree, liftState, toMinutes } from "../lib/lift";

const today = todayISO();



export default function NewOrder() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { clients, vehicles, lifts, orders, setDB } = useAppStore();
  const [searchParams] = useSearchParams();
  const presetClient = clients.find((item) => item.id === searchParams.get("clientId"));
  const presetVehicle = vehicles.find(
    (item) => item.id === searchParams.get("vehicleId") && item.clientId === presetClient?.id,
  );

  const [existingClientId, setExistingClientId] = useState(presetClient?.id ?? "");
  const [existingVehicleId, setExistingVehicleId] = useState(presetVehicle?.id ?? "");
  const [clientName, setClientName] = useState(presetClient?.name ?? "");
  const [phone, setPhone] = useState(formatPhone(presetClient?.phone ?? ""));
  const [make, setMake] = useState(presetVehicle?.make ?? "");
  const [model, setModel] = useState(presetVehicle?.model ?? "");
  const [plate, setPlate] = useState(presetVehicle?.plate ?? "");
  // Российский формат по умолчанию; для машин на иностранных номерах — переключатель.
  const [plateKind, setPlateKind] = useState<PlateKind>(
    presetVehicle?.plate && !looksRussian(presetVehicle.plate) ? "foreign" : "ru",
  );
  const [touched, setTouched] = useState(false);
  const [mileage, setMileage] = useState(presetVehicle?.mileage ? String(presetVehicle.mileage) : "");
  // Подъёмник, дату и время можно передать ссылкой из расписания и с главной.
  const presetDate = searchParams.get("date");
  const presetTime = searchParams.get("time");
  const presetLift = searchParams.get("lift");
  const [date, setDate] = useState(presetDate && /^\d{4}-\d{2}-\d{2}$/.test(presetDate) ? presetDate : today);
  const [time, setTime] = useState(presetTime && /^\d{2}:\d{2}$/.test(presetTime) ? presetTime : "10:00");
  const [liftId, setLiftId] = useState(presetLift && lifts.some((lift) => String(lift.id) === presetLift) ? presetLift : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const selectedClientVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.clientId === existingClientId),
    [existingClientId, vehicles],
  );

  function selectExistingClient(clientId: string) {
    setExistingClientId(clientId);
    setExistingVehicleId("");
    const client = clients.find((item) => item.id === clientId);
    setClientName(client?.name ?? "");
    setPhone(client?.phone ?? "");
  }

  function selectExistingVehicle(vehicleId: string) {
    setExistingVehicleId(vehicleId);
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    setMake(vehicle?.make ?? "");
    setModel(vehicle?.model ?? "");
    setPlate(vehicle?.plate ?? "");
    setMileage(vehicle?.mileage ? String(vehicle.mileage) : "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setTouched(true);
    if (!clientName.trim() || !phone.trim() || !make.trim() || !model.trim() || !plate.trim()) {
      setError("Заполните клиента, телефон и данные автомобиля.");
      return;
    }
    if (!isValidPhone(phone)) {
      setError("Номер телефона неполный: нужен +7 и 10 цифр.");
      return;
    }
    if (!isValidPlate(plate, plateKind)) {
      setError(plateKind === "ru" ? `Проверьте госномер. ${RU_PLATE_HINT}` : `Проверьте госномер. ${FOREIGN_PLATE_HINT}`);
      return;
    }
    if (!isValidMileage(mileage)) {
      setError("Пробег должен быть больше нуля и меньше 2 000 000 км.");
      return;
    }
    // Один госномер — один автомобиль в базе, иначе история машины раздвоится.
    const normalizedPlate = normalizePlate(plate, plateKind);
    const duplicate = !existingVehicleId
      && vehicles.find((item) => normalizePlate(item.plate, looksRussian(item.plate) ? "ru" : "foreign") === normalizedPlate);
    if (duplicate) {
      const owner = clients.find((item) => item.id === duplicate.clientId);
      setError(`Автомобиль с номером ${duplicate.plate} уже есть в базе${owner ? ` — владелец ${owner.name}` : ""}. Выберите его из истории клиента.`);
      return;
    }

    const chosenLift = liftId ? Number(liftId) : undefined;
    const endTime = fromMinutes(toMinutes(time) + SLOT_MINUTES);

    // Проверяем весь интервал записи, а не только её начало.
    if (chosenLift && !isSlotFree(orders, chosenLift, date, time, endTime)) {
      const lift = lifts.find((item) => item.id === chosenLift);
      const free = lift ? liftState(orders, lift, date).suggestedStart : null;
      setError(
        free
          ? `Подъёмник занят с ${time} до ${endTime}. Ближайшее свободное окно — с ${free}.`
          : "Подъёмник занят весь день. Выберите другой подъёмник или другую дату.",
      );
      return;
    }

    const samePhone = !existingClientId && clients.find((item) => item.phone.replace(/\D/g, "") === phone.replace(/\D/g, ""));
    if (samePhone) {
      setError(`Клиент с таким телефоном уже есть: ${samePhone.name}. Выберите его в списке выше.`);
      return;
    }

    const clientId = existingClientId || createId("client");
    const vehicleId = existingVehicleId || createId("vehicle");
    const orderId = createId("order");
    const lastNumber = orders.reduce((max, item) => {
      const digits = Number(item.number.replace(/\D/g, ""));
      return Number.isNaN(digits) ? max : Math.max(max, digits);
    }, 0);
    const orderNumber = `№АИ-${String(lastNumber + 1).padStart(4, "0")}`;

    const ok = await confirm({
      title: "Создать заказ-наряд",
      question: "Запись появится в расписании и в списке заказ-нарядов.",
      summary: [
        { label: "Номер", value: orderNumber },
        { label: "Клиент", value: `${clientName.trim()}${existingClientId ? "" : " (новый)"}` },
        { label: "Телефон", value: phone.trim() },
        { label: "Автомобиль", value: `${make.trim()} ${model.trim()} · ${plate.trim().toUpperCase()}${existingVehicleId ? "" : " (новый)"}` },
        { label: "Дата и время", value: `${date}, ${time}–${endTime}` },
        { label: "Подъёмник", value: chosenLift ? `Подъёмник ${chosenLift}` : "не назначен" },
      ],
      note: existingClientId ? undefined : "Клиент и автомобиль будут заведены в справочник.",
      confirmLabel: "Создать",
    });
    if (!ok) return;

    setDB((previous) => ({
      ...previous,
      clients: existingClientId ? previous.clients : [...previous.clients, {
        id: clientId,
        code: nextCode(CODE_PREFIX.client, previous.clients.map((item) => item.code)),
        name: clientName.trim(),
        phone: phone.trim(),
        createdAt: todayISO(),
      }],
      vehicles: existingVehicleId ? previous.vehicles : [...previous.vehicles, {
        id: vehicleId,
        code: nextCode(CODE_PREFIX.vehicle, previous.vehicles.map((item) => item.code)),
        clientId,
        make: make.trim(),
        model: model.trim(),
        plate: normalizePlate(plate, plateKind),
        mileage: mileage ? Number(mileage) : undefined,
      }],
      orders: [...previous.orders, {
        id: orderId,
        number: orderNumber,
        clientId,
        vehicleId,
        liftId: chosenLift,
        status: "запись",
        createdAt: new Date().toISOString(),
        plannedAt: date,
        works: [],
        parts: [],
        paid: 0,
        notes: note.trim() || undefined,
        scheduledStart: time,
        scheduledEnd: endTime,
      }],
    }));
    showToast(`Заказ-наряд ${orderNumber} создан`);
    navigate(`/orders/${orderId}`);
  }

  return (
    <>
      <TopBar title="Новая запись" subtitle="Клиент, автомобиль и время визита" />
      <Page>
        <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-4">
          <Card>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e9f5ed] text-[var(--accent)]">
                  <IconUser size={22} />
                </div>
                <div>
                  <h2 className="panel-title">Клиент</h2>
                  <p className="muted text-sm">Выберите из базы или внесите нового.</p>
                </div>
              </div>
              <label className="text-sm">
                <span className="mb-1 block muted">Найти в базе</span>
                <select value={existingClientId} onChange={(event) => selectExistingClient(event.target.value)} className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                  <option value="">Новый клиент</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{client.name} · {client.phone}</option>)}
                </select>
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Имя клиента *"><input value={clientName} onChange={(event) => setClientName(event.target.value)} required /></Field>
              <PhoneField label="Телефон *" value={phone} onChange={setPhone} required touched={touched} />
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#edf4ff] text-[#3978c9]">
                <IconCar size={22} />
              </div>
              <h2 className="panel-title">Автомобиль</h2>
            </div>
            {existingClientId && selectedClientVehicles.length > 0 && (
              <label className="mb-4 block text-sm">
                <span className="mb-1 block muted">Автомобиль из истории</span>
                <select value={existingVehicleId} onChange={(event) => selectExistingVehicle(event.target.value)} className="w-full rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                  <option value="">Новый автомобиль</option>
                  {selectedClientVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} · {vehicle.plate}</option>)}
                </select>
              </label>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Марка *"><input value={make} onChange={(event) => setMake(event.target.value)} required /></Field>
              <Field label="Модель *"><input value={model} onChange={(event) => setModel(event.target.value)} required /></Field>
              <PlateField
                className="sm:col-span-2"
                value={plate}
                kind={plateKind}
                onChange={setPlate}
                onKindChange={setPlateKind}
                touched={touched}
              />
              <Field
                label="Пробег, км"
                error={touched && !isValidMileage(mileage) ? "От 1 до 2 000 000 км" : undefined}
              >
                <input value={mileage} onChange={(event) => setMileage(event.target.value.replace(/\D/g, "").slice(0, 7))} inputMode="numeric" placeholder="82000" />
              </Field>
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fdf3e0] text-[var(--warning)]">
                <IconCalendarEvent size={22} />
              </div>
              <h2 className="panel-title">Время и подъёмник</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Дата"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
              <Field label="Время"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></Field>
              <Field label="Подъёмник"><select value={liftId} onChange={(event) => setLiftId(event.target.value)}><option value="">Без назначения</option>{lifts.map((lift) => <option key={lift.id} value={lift.id}>{lift.name}</option>)}</select></Field>
            </div>
            <Field label="Комментарий" className="mt-4"><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Причина обращения, пожелания клиента" /></Field>
          </Card>

          {error && (
            <div
              className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm"
              style={{ borderColor: "#f1c2c2", color: "var(--danger)", background: "#fff7f7" }}
            >
              <IconAlertCircle size={18} className="shrink-0" />
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3 pb-4">
            <Button variant="secondary" onClick={() => navigate(-1)}>Отмена</Button>
            <Button type="submit">Создать заказ-наряд</Button>
          </div>
        </form>
      </Page>
    </>
  );
}
