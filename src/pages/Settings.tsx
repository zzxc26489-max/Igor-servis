import { useRef, useState, type FormEvent } from "react";
import { IconAdjustments, IconBuildingStore, IconDatabase, IconDownload, IconInfoCircle, IconUpload } from "@tabler/icons-react";
import { useAppStore } from "../store/AppStore";
import { useToast } from "../components/Toast";
import { useConfirm } from "../components/Confirm";
import { PhoneField } from "../components/fields";
import { formatPhone, isValidInn, isValidPhone } from "../lib/formats";
import { clientPrice } from "../lib/price";
import { Button, Card, Page, TopBar } from "../components/ui";
import { formatMoney } from "../lib/format";
import { APP_BUILD_DATE, APP_VERSION, DB_VERSION } from "../data/version";
import { todayISO } from "../lib/date";

export default function Settings() {
  const { company, settings, updateCompany, updateSettings, resetToSeed, exportDB, importDB, orders, clients, stock, expenses } = useAppStore();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [shortName, setShortName] = useState(company.shortName);
  const [address, setAddress] = useState(company.address);
  const [phone, setPhone] = useState(formatPhone(company.phone));
  const [touched, setTouched] = useState(false);
  const [workHours, setWorkHours] = useState(company.workHours);
  const [inn, setInn] = useState(company.inn);
  const [responsible, setResponsible] = useState(company.responsible);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (phone.replace(/\D/g, "") && !isValidPhone(phone)) {
      showToast("Номер телефона неполный: нужен +7 и 10 цифр", "error");
      return;
    }
    if (!isValidInn(inn)) {
      showToast("ИНН должен быть из 10 или 12 цифр", "error");
      return;
    }
    updateCompany({
      shortName: shortName.trim(),
      address: address.trim(),
      phone: phone.trim(),
      workHours: workHours.trim(),
      inn: inn.trim(),
      responsible: responsible.trim(),
    });
    showToast("Данные компании сохранены");
  }

  const fileRef = useRef<HTMLInputElement>(null);

  function handleBackup() {
    const blob = new Blob([exportDB()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `igor-servis-backup-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Резервная копия сохранена");
  }

  async function handleRestore(file: File) {
    const text = await file.text();
    let incoming: { orders?: unknown[]; clients?: unknown[]; stock?: unknown[]; expenses?: unknown[] } = {};
    try {
      incoming = JSON.parse(text);
    } catch {
      showToast("Файл не похож на резервную копию CRM", "error");
      return;
    }
    const ok = await confirm({
      title: "Восстановить из резервной копии",
      question: "Текущие данные в этом браузере будут полностью заменены содержимым файла.",
      summary: [
        { label: "Заказ-наряды", value: `${orders.length} → ${incoming.orders?.length ?? 0}` },
        { label: "Клиенты", value: `${clients.length} → ${incoming.clients?.length ?? 0}` },
        { label: "Позиции склада", value: `${stock.length} → ${incoming.stock?.length ?? 0}` },
        { label: "Расходы", value: `${expenses.length} → ${incoming.expenses?.length ?? 0}` },
      ],
      note: "Сначала скачайте копию текущих данных, если они ещё нужны.",
      confirmLabel: "Восстановить",
      danger: true,
    });
    if (!ok) return;
    if (importDB(text)) {
      showToast("Данные восстановлены из копии");
    } else {
      showToast("Файл не похож на резервную копию CRM", "error");
    }
  }

  async function handleReset() {
    const ok = await confirm({
      title: "Сбросить к демонстрационным данным",
      question: "Все внесённые заказ-наряды, клиенты, движения склада и финансы в этом браузере будут заменены демо-данными.",
      summary: [
        { label: "Заказ-наряды", value: orders.length },
        { label: "Клиенты", value: clients.length },
        { label: "Позиции склада", value: stock.length },
        { label: "Расходы", value: expenses.length },
      ],
      note: "Отменить сброс нельзя. Скачайте резервную копию, если данные ещё нужны.",
      confirmLabel: "Сбросить",
      danger: true,
    });
    if (!ok) return;
    resetToSeed();
    showToast("Данные сброшены к демонстрационным");
  }

  return (
    <>
      <TopBar title="Настройки" subtitle="Данные компании и управление демо-данными" />
      <Page>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e9f5ed] text-[var(--accent)]">
                <IconBuildingStore size={22} />
              </div>
              <div>
                <h2 className="panel-title">Данные компании</h2>
                <p className="muted text-sm">Отображаются в шапке и на печатных документах</p>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm">
                <span className="mb-1 block muted">Название</span>
                <div className="field-control">
                  <input value={shortName} onChange={(e) => setShortName(e.target.value)} required />
                </div>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block muted">Адрес</span>
                <div className="field-control">
                  <input value={address} onChange={(e) => setAddress(e.target.value)} required />
                </div>
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <PhoneField label="Телефон" value={phone} onChange={setPhone} touched={touched} />
                <label className="block text-sm">
                  <span className="mb-1 block muted">Часы работы</span>
                  <div className="field-control">
                    <input value={workHours} onChange={(e) => setWorkHours(e.target.value)} placeholder="Ежедневно, 10:00–20:00" />
                  </div>
                </label>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block muted">ИНН</span>
                  <div className="field-control"><input value={inn} onChange={(e) => setInn(e.target.value.replace(/\D/g, "").slice(0, 12))} inputMode="numeric" placeholder="10 или 12 цифр" /></div>
                  {touched && !isValidInn(inn) && (
                    <span className="mt-1 block text-xs" style={{ color: "var(--danger)" }}>ИНН — 10 цифр у организации или 12 у ИП</span>
                  )}
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block muted">Ответственный в документах</span>
                  <div className="field-control"><input value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Игорь" /></div>
                </label>
              </div>
              <div className="flex justify-end">
                <Button type="submit">Сохранить</Button>
              </div>
            </form>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#edf4ff] text-[#3978c9]"><IconAdjustments size={22} /></div>
              <div><h2 className="panel-title">Расчёт цен</h2><p className="muted text-sm">Настройки заказ-нарядов</p></div>
            </div>
            <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
              <span><b className="block text-sm">Автоматически подгонять цены услуг</b><span className="muted mt-1 block text-xs">CRM пропорционально пересчитает работы под согласованную сумму заказа. Цены округляются до десятков, запчасти не меняются.</span></span>
              <input
                type="checkbox"
                checked={settings.autoPriceAdjustment}
                onChange={(event) => {
                  updateSettings({ autoPriceAdjustment: event.target.checked });
                  showToast(event.target.checked ? "Автоподгонка цен включена" : "Автоподгонка цен выключена");
                }}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
              />
            </label>

            <label className="mt-3 block rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
              <b className="block text-sm">Наценка на запчасти по умолчанию</b>
              <span className="muted mt-1 block text-xs">
                Подставляется в цену для клиента при добавлении запчасти в заказ. Цену всегда можно поправить вручную.
              </span>
              <div className="mt-2 flex items-center gap-2">
                <div className="field-control w-28">
                  <input
                    inputMode="numeric"
                    aria-label="Наценка на запчасти, проценты"
                    value={String(settings.partMarkupPercent)}
                    onChange={(event) => {
                      const value = Math.min(500, Number(event.target.value.replace(/\D/g, "").slice(0, 3)) || 0);
                      updateSettings({ partMarkupPercent: value });
                    }}
                  />
                </div>
                <span className="muted text-sm">%</span>
                <span className="muted ml-auto text-sm">
                  Закупка 500 ₽ → клиенту {formatMoney(clientPrice(500, settings.partMarkupPercent))}
                </span>
              </div>
            </label>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fbe9e9] text-[var(--danger)]">
                <IconDatabase size={22} />
              </div>
              <div>
                <h2 className="panel-title">Данные и резервные копии</h2>
                <p className="muted text-sm">CRM сейчас хранит данные локально в этом браузере</p>
              </div>
            </div>
            <p className="mb-4 text-sm muted">
              Все заказ-наряды, клиенты, склад и финансы сохраняются только на этом устройстве. Делайте резервную
              копию и открывайте её на другом компьютере или телефоне, пока CRM не переехала на общий сервер.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleBackup}>
                <IconDownload size={18} /> Скачать копию
              </Button>
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                <IconUpload size={18} /> Загрузить копию
              </Button>
              <Button variant="secondary" onClick={handleReset}>
                Сбросить к демонстрационным
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="Файл резервной копии"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleRestore(file);
                event.target.value = "";
              }}
            />
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f2f3f2] text-[var(--text-muted)]"><IconInfoCircle size={22} /></div>
              <div><h2 className="panel-title">О приложении</h2><p className="muted text-sm">CRM автосервиса Игоря</p></div>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="muted">Версия приложения</dt><dd className="font-semibold">v{APP_VERSION}</dd></div>
              <div className="flex justify-between gap-4"><dt className="muted">Дата сборки</dt><dd>{APP_BUILD_DATE}</dd></div>
              <div className="flex justify-between gap-4"><dt className="muted">Версия базы данных</dt><dd>{DB_VERSION}</dd></div>
            </dl>
          </Card>
        </div>
      </Page>
    </>
  );
}
