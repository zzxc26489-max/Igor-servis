import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  IconAlertCircle,
  IconCalendarEvent,
  IconCar,
  IconSearch,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { Button, Card, Page, TopBar } from "../components/ui";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Confirm";
import { Field, PhoneField, PlateField } from "../components/fields";
import {
  FOREIGN_PLATE_HINT,
  RU_PLATE_HINT,
  formatPhone,
  isValidMileage,
  isValidPhone,
  isValidPlate,
  looksRussian,
  normalizePlate,
  type PlateKind,
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
  const { clients, vehicles, lifts, orders, company, setDB } = useAppStore();
  const [searchParams] = useSearchParams();
  const presetClient = clients.find((item) => item.id === searchParams.get("clientId"));
  const presetVehicle = vehicles.find(
    (item) => item.id === searchParams.get("vehicleId") && item.clientId === presetClient?.id,
  );

  const [existingClientId, setExistingClientId] = useState(presetClient?.id ?? "");
  const [existingVehicleId, setExistingVehicleId] = useState(presetVehicle?.id ?? "");
  const [clientQuery, setClientQuery] = useState("");
  const [clientName, setClientName] = useState(presetClient?.name ?? "");
  const [phone, setPhone] = useState(formatPhone(presetClient?.phone ?? ""));
  const [make, setMake] = useState(presetVehicle?.make ?? "");
  const [model, setModel] = useState(presetVehicle?.model ?? "");
  const [plate, setPlate] = useState(presetVehicle?.plate ?? "");
  const [plateKind, setPlateKind] = useState<PlateKind>(
    presetVehicle?.plate && !looksRussian(presetVehicle.plate) ? "foreign" : "ru",
  );
  const [touched, setTouched] = useState(false);
  const [mileage, setMileage] = useState(presetVehicle?.mileage ? String(presetVehicle.mileage) : "");
  const presetDate = searchParams.get("date");
  const presetTime = searchParams.get("time");
  const presetLift = searchParams.get("lift");
  const [date, setDate] = useState(presetDate && /^\d{4}-\d{2}-\d{2}$/.test(presetDate) ? presetDate : today);
  const [time, setTime] = useState(presetTime && /^\d{2}:\d{2}$/.test(presetTime) ? presetTime : "10:00");
  const [liftId, setLiftId] = useState(presetLift && lifts.some((lift) => String(lift.id) === presetLift) ? presetLift : "");
  const [complaint, setComplaint] = useState("");
  const [error, setError] = useState("");

  const selectedClient = clients.find((client) => client.id === existingClientId);
  const selectedClientVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.clientId === existingClientId),
    [existingClientId, vehicles],
  );

  const matchingClients = useMemo(() => {
    const term = clientQuery.trim().toLocaleLowerCase("ru-RU");
    const compact = term.replace(/[\s-]/g, "");
    const digits = clientQuery.replace(/\D/g, "");
    if (term.length < 2) return [];

    return clients.filter((client) => {
      const clientText = `${client.code ?? ""} ${client.name} ${client.phone} ${client.phone2 ?? ""}`.toLocaleLowerCase("ru-RU");
      if (clientText.includes(term)) return true;
      if (digits.length >= 3 && clientText.replace(/\D/g, "").includes(digits)) return true;

      return vehicles.some((vehicle) => {
        if (vehicle.clientId !== client.id) return false;
        const vehicleText = `${vehicle.make} ${vehicle.model} ${vehicle.plate} ${vehicle.vin ?? ""}`.toLocaleLowerCase("ru-RU");
        return vehicleText.includes(term) || vehicleText.replace(/[\s-]/g, "").includes(compact);
      });
    }).slice(0, 6);
  }, [clientQuery, clients, vehicles]);

  const chosenLift = liftId ? Number(liftId) : undefined;
  const selectedLift = chosenLift ? lifts.find((lift) => lift.id === chosenLift) : undefined;
  const endTime = fromMinutes(toMinutes(time) + SLOT_MINUTES);
  const slotFree = !chosenLift || isSlotFree(orders, chosenLift, date, time, endTime);
  const suggestedStart = chosenLift && !slotFree && selectedLift ? liftState(orders, selectedLift, date).suggestedStart : null;

  function fillVehicle(vehicleId: string) {
    setExistingVehicleId(vehicleId);
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    setMake(vehicle?.make ?? "");
    setModel(vehicle?.model ?? "");
    setPlate(vehicle?.plate ?? "");
    setMileage(vehicle?.mileage ? String(vehicle.mileage) : "");
    setPlateKind(vehicle?.plate && !looksRussian(vehicle.plate) ? "foreign" : "ru");
  }

  function selectExistingClient(clientId: string) {
    const client = clients.find((item) => item.id === clientId);
    const ownedVehicles = vehicles.filter((vehicle) => vehicle.clientId === clientId);

    setExistingClientId(clientId);
    setClientQuery("");
    setClientName(client?.name ?? "");
    setPhone(formatPhone(client?.phone ?? ""));

    if (ownedVehicles.length === 1) {
      fillVehicle(ownedVehicles[0].id);
    } else {
      setExistingVehicleId("");
      setMake("");
      setModel("");
      setPlate("");
      setMileage("");
      setPlateKind("ru");
    }
  }

  function startNewClient() {
    setExistingClientId("");
    setExistingVehicleId("");
    setClientQuery("");
    setClientName("");
    setPhone("");
    setMake("");
    setModel("");
    setPlate("");
    setMileage("");
    setPlateKind("ru");
    setError("");
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

    const normalizedPlate = normalizePlate(plate, plateKind);
    const duplicate = !existingVehicleId
      && vehicles.find((item) => normalizePlate(item.plate, looksRussian(item.plate) ? "ru" : "foreign") === normalizedPlate);
    if (duplicate) {
      const owner = clients.find((item) => item.id === duplicate.clientId);
      setError(`Автомобиль с номером ${duplicate.plate} уже есть в базе${owner ? ` — владелец ${owner.name}` : ""}. Найдите клиента по госномеру выше.`);
      return;
    }

    if (chosenLift && !slotFree) {
      setError(
        suggestedStart
          ? `Подъёмник занят с ${time} до ${endTime}. Ближайшее свободное окно — с ${suggestedStart}.`
          : "Подъёмник занят весь день. Выберите другой подъёмник или другую дату.",
      );
      return;
    }

    const samePhone = !existingClientId && clients.find((item) => item.phone.replace(/\D/g, "") === phone.replace(/\D/g, ""));
    if (samePhone) {
      setError(`Клиент с таким телефоном уже есть: ${samePhone.name}. Найдите его через поиск выше.`);
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
        { label: "Автомобиль", value: `${make.trim()} ${model.trim()} · ${normalizedPlate}${existingVehicleId ? "" : " (новый)"}` },
        { label: "Дата и время", value: `${date}, ${time}–${endTime}` },
        { label: "Подъёмник", value: selectedLift?.name ?? "не назначен" },
      ],
      note: existingClientId ? "Изменённые контактные данные клиента и данные автомобиля сохранятся в карточке." : "Клиент и автомобиль будут заведены в справочник.",
      confirmLabel: "Создать",
    });
    if (!ok) return;

    setDB((previous) => ({
      ...previous,
      clients: existingClientId
        ? previous.clients.map((client) => client.id === clientId ? {
            ...client,
            name: clientName.trim(),
            phone: phone.trim(),
          } : client)
        : [...previous.clients, {
            id: clientId,
            code: nextCode(CODE_PREFIX.client, previous.clients.map((item) => item.code)),
            name: clientName.trim(),
            phone: phone.trim(),
            createdAt: todayISO(),
          }],
      vehicles: existingVehicleId
        ? previous.vehicles.map((vehicle) => vehicle.id === vehicleId ? {
            ...vehicle,
            make: make.trim(),
            model: model.trim(),
            plate: normalizedPlate,
            mileage: mileage ? Number(mileage) : vehicle.mileage,
          } : vehicle)
        : [...previous.vehicles, {
            id: vehicleId,
            code: nextCode(CODE_PREFIX.vehicle, previous.vehicles.map((item) => item.code)),
            clientId,
            make: make.trim(),
            model: model.trim(),
            plate: normalizedPlate,
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
        complaint: complaint.trim() || undefined,
        scheduledStart: time,
        scheduledEnd: endTime,
        workDayStart: company.openTime,
        workDayEnd: company.closeTime,
        workDayEstimated: false,
      }],
    }));

    showToast(`Заказ-наряд ${orderNumber} создан`);
    navigate(`/orders/${orderId}`);
  }

  return (
    <>
      <TopBar title="Новая запись" subtitle="Клиент, автомобиль и время визита" />
      <Page>
        <form onSubmit={handleSubmit} className="mx-auto max-w-6xl">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)] lg:items-start">
            <div className="space-y-4">
              <Card>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e9f5ed] text-[var(--accent)]">
                      <IconUser size={22} />
                    </div>
                    <div>
                      <h2 className="panel-title">Клиент</h2>
                      <p className="muted text-sm">Сначала найдите по имени, телефону или госномеру.</p>
                    </div>
                  </div>
                  {existingClientId && (
                    <Button variant="secondary" size="sm" onClick={startNewClient}>Новый клиент</Button>
                  )}
                </div>

                {!existingClientId ? (
                  <div className="mb-4">
                    <div className="relative">
                      <IconSearch className="pointer-events-none absolute left-3 top-2.5" size={18} color="var(--text-muted)" />
                      <input
                        value={clientQuery}
                        onChange={(event) => setClientQuery(event.target.value)}
                        placeholder="Имя, телефон или госномер"
                        className="w-full rounded-lg border bg-white py-2.5 pl-10 pr-10 text-sm outline-none focus:border-[var(--accent)]"
                        style={{ borderColor: "var(--border)" }}
                        aria-label="Поиск клиента"
                      />
                      {clientQuery && (
                        <button
                          type="button"
                          onClick={() => setClientQuery("")}
                          className="absolute right-2 top-1.5 rounded-md p-1.5 hover:bg-gray-100"
                          aria-label="Очистить поиск"
                        >
                          <IconX size={17} />
                        </button>
                      )}
                    </div>

                    {clientQuery.trim().length >= 2 && (
                      <div className="mt-2 overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
                        {matchingClients.length > 0 ? matchingClients.map((client) => {
                          const ownedVehicles = vehicles.filter((vehicle) => vehicle.clientId === client.id);
                          return (
                            <button
                              key={client.id}
                              type="button"
                              onClick={() => selectExistingClient(client.id)}
                              className="flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-gray-50"
                              style={{ borderColor: "var(--border)" }}
                            >
                              <span className="min-w-0">
                                <b className="block truncate text-sm">{client.name}</b>
                                <span className="muted block truncate text-xs">{client.phone}</span>
                              </span>
                              <span className="muted shrink-0 text-xs">{ownedVehicles.length ? `${ownedVehicles.length} авто` : "без авто"}</span>
                            </button>
                          );
                        }) : (
                          <div className="px-3 py-3 text-sm">
                            <b>В базе не найдено.</b>
                            <span className="muted ml-1">Заполните данные ниже — будет создан новый клиент.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border)", background: "var(--accent-soft)" }}>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-[.06em]" style={{ color: "var(--accent-strong)" }}>Клиент из базы</div>
                      <div className="truncate text-sm font-semibold">{selectedClient?.name}</div>
                    </div>
                    <button type="button" onClick={startNewClient} className="shrink-0 text-sm font-semibold" style={{ color: "var(--accent)" }}>
                      Сменить
                    </button>
                  </div>
                )}

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
                  <div>
                    <h2 className="panel-title">Автомобиль</h2>
                    <p className="muted text-sm">{existingClientId ? "Выберите машину клиента или добавьте новую." : "Данные нового автомобиля."}</p>
                  </div>
                </div>

                {existingClientId && selectedClientVehicles.length > 0 && (
                  <label className="mb-4 block text-sm">
                    <span className="mb-1 block muted">Автомобиль из истории</span>
                    <select
                      value={existingVehicleId}
                      onChange={(event) => {
                        if (event.target.value) fillVehicle(event.target.value);
                        else {
                          setExistingVehicleId("");
                          setMake("");
                          setModel("");
                          setPlate("");
                          setMileage("");
                          setPlateKind("ru");
                        }
                      }}
                      className="w-full rounded-lg border px-3 py-2"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <option value="">Новый автомобиль</option>
                      {selectedClientVehicles.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} · {vehicle.plate}</option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
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
            </div>

            <div className="space-y-4 lg:sticky lg:top-20">
              <Card>
                <div className="mb-4 flex items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fdf3e0] text-[var(--warning)]">
                    <IconCalendarEvent size={22} />
                  </div>
                  <div>
                    <h2 className="panel-title">Визит</h2>
                    <p className="muted text-sm">Дата, время и подъёмник.</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                  <Field label="Дата"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
                  <Field label="Время"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></Field>
                  <Field label="Подъёмник">
                    <select value={liftId} onChange={(event) => setLiftId(event.target.value)}>
                      <option value="">Без назначения</option>
                      {lifts.map((lift) => <option key={lift.id} value={lift.id}>{lift.name}</option>)}
                    </select>
                  </Field>
                </div>

                <div className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: slotFree ? "var(--bg)" : "#fff7f7", color: slotFree ? "var(--text-muted)" : "var(--danger)" }}>
                  {slotFree
                    ? `Окно визита: ${time}–${endTime}${selectedLift ? ` · ${selectedLift.name}` : ""}`
                    : suggestedStart
                      ? `Это время занято. Ближайшее свободное — с ${suggestedStart}.`
                      : "Этот подъёмник занят весь день."}
                </div>

                <Field label="Причина обращения" className="mt-4">
                  <textarea value={complaint} onChange={(event) => setComplaint(event.target.value)} rows={4} placeholder="Что беспокоит клиента, симптомы, пожелания" />
                </Field>
              </Card>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "#f1c2c2", color: "var(--danger)", background: "#fff7f7" }}>
                  <IconAlertCircle size={18} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3 pb-4">
                <Button variant="secondary" className="flex-1" onClick={() => navigate(-1)}>Отмена</Button>
                <Button type="submit" className="flex-[1.4]">Создать заказ-наряд</Button>
              </div>
            </div>
          </div>
        </form>
      </Page>
    </>
  );
}
