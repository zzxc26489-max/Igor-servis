import { useEffect, useRef, useState, type FormEvent } from "react";
import { IconAdjustments, IconAlertTriangle, IconBuildingStore, IconCheck, IconCloud, IconDatabase, IconDownload, IconHistory, IconInfoCircle, IconRefresh, IconRestore, IconUpload } from "@tabler/icons-react";
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
import { isValidTime, timeToMinutes } from "../lib/workday";
import { backupCounts, inspectBackupJson } from "../lib/backup";
import defaultLogo from "../assets/logo.jpg";
import { compressImageToDataUrl } from "../lib/imageCompression";
import { useAuth } from "../auth/AuthContext";
import { loadCloudServerCapabilities } from "../lib/cloud";

export default function Settings() {
  const {
    company, settings, updateCompany, updateSettings, resetToSeed, exportDB, importDB,
    orders, clients, vehicles, stock, expenses, services, employees, demo, cloud, uploadLocalToCloud, refreshFromCloud, backupCloud,
    listBackups, listAudit, restoreBackup,
  } = useAppStore();
  const { showToast } = useToast();
  const { session } = useAuth();
  const confirm = useConfirm();
  const [shortName, setShortName] = useState(company.shortName);
  const [address, setAddress] = useState(company.address);
  const [phone, setPhone] = useState(formatPhone(company.phone));
  const [phoneLabel, setPhoneLabel] = useState(company.phoneLabel ?? "Игорь");
  const [phone2, setPhone2] = useState(company.phone2 ? formatPhone(company.phone2) : "");
  const [phone2Label, setPhone2Label] = useState(company.phone2Label ?? "Юра");
  const [logoDataUrl, setLogoDataUrl] = useState(company.logoDataUrl ?? "");
  const [touched, setTouched] = useState(false);
  const [openTime, setOpenTime] = useState(company.openTime);
  const [closeTime, setCloseTime] = useState(company.closeTime);
  const [inn, setInn] = useState(company.inn);
  const [responsible, setResponsible] = useState(company.responsible);
  const [cloudBackups, setCloudBackups] = useState<Awaited<ReturnType<typeof listBackups>>>([]);
  const [cloudAudit, setCloudAudit] = useState<Awaited<ReturnType<typeof listAudit>>>([]);
  const [cloudAdminLoading, setCloudAdminLoading] = useState(false);
  const [serverMigration, setServerMigration] = useState<number | null>(null);
  const [serverMigrationChecked, setServerMigrationChecked] = useState(false);

  const readiness = [
    {
      label: "Телефон сервиса",
      ok: Boolean(company.phone && isValidPhone(company.phone)),
      detail: company.phone ? formatPhone(company.phone) : "Не заполнен",
    },
    {
      label: "Прайс-лист услуг",
      ok: services.length >= 10,
      detail: `${services.length} услуг · ${services.length < 10 ? "проверьте полноту прайса" : "база заполнена"}`,
    },
    {
      label: "Имена механиков",
      ok: !employees.some((employee) => /^Механик\s+\d+$/i.test(employee.name)),
      detail: employees.filter((employee) => /механик/i.test(employee.role)).map((employee) => employee.name).join(", ") || "Механики не заведены",
    },
    {
      label: "Реальные рабочие данные",
      ok: !demo,
      detail: demo ? "Сейчас используется демонстрационная база" : `${clients.length} клиентов · ${vehicles.length} авто · ${orders.length} заказов`,
    },
    {
      label: "Общая серверная база",
      ok: cloud.configured && cloud.status !== "needs_upload" && cloud.status !== "error",
      detail: cloud.configured ? (cloud.status === "ready" ? "Синхронизация включена" : `Статус: ${cloud.status}`) : "Supabase не подключён",
    },
    {
      label: "Серверные миграции",
      ok: !cloud.configured || !serverMigrationChecked || (serverMigration ?? 0) >= 15,
      detail: !cloud.configured
        ? "Проверка не нужна без Supabase"
        : !serverMigrationChecked
          ? "Проверяем версию серверной схемы…"
          : serverMigration !== null
            ? `Версия ${serverMigration} · актуально`
            : "Схема устарела: выполните миграции 007–015 по порядку",
    },
    {
      label: "Резервная копия",
      ok: !cloud.configured || cloudBackups.length > 0,
      detail: cloud.configured ? (cloudBackups.length ? `${cloudBackups.length} серверных копий доступно` : "Создайте первую серверную копию") : "Доступен ручной JSON-экспорт",
    },
  ];

  useEffect(() => {
    if (!cloud.configured || cloud.status === "needs_upload") return;
    let cancelled = false;
    setCloudAdminLoading(true);
    Promise.all([listBackups(), listAudit()])
      .then(([backups, audit]) => {
        if (cancelled) return;
        setCloudBackups(backups);
        setCloudAudit(audit);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setCloudAdminLoading(false));
    return () => { cancelled = true; };
  }, [cloud.configured, cloud.revision, cloud.status, listAudit, listBackups]);

  useEffect(() => {
    if (!cloud.configured || cloud.status === "needs_upload" || !session) return;
    let cancelled = false;
    void loadCloudServerCapabilities(session)
      .then((capabilities) => {
        if (cancelled) return;
        setServerMigration(capabilities.latestMigration);
        setServerMigrationChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setServerMigration(null);
        setServerMigrationChecked(true);
      });
    return () => { cancelled = true; };
  }, [cloud.configured, cloud.revision, cloud.status, session]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (phone.replace(/\D/g, "") && !isValidPhone(phone)) {
      showToast("Первый номер телефона неполный: нужен +7 и 10 цифр", "error");
      return;
    }
    if (phone2.replace(/\D/g, "") && !isValidPhone(phone2)) {
      showToast("Второй номер телефона неполный: нужен +7 и 10 цифр", "error");
      return;
    }
    if (!isValidTime(openTime) || !isValidTime(closeTime) || timeToMinutes(closeTime) - timeToMinutes(openTime) < 60) {
      showToast("Часы работы: закрытие должно быть хотя бы на час позже открытия", "error");
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
      phoneLabel: phoneLabel.trim() || undefined,
      phone2: phone2.trim() || undefined,
      phone2Label: phone2Label.trim() || undefined,
      logoDataUrl: logoDataUrl || undefined,
      openTime,
      closeTime,
      inn: inn.trim(),
      responsible: responsible.trim(),
    });
    showToast("Данные компании сохранены");
  }

  const fileRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);

  async function handleLogoFile(file: File) {
    if (!file.type.startsWith("image/")) {
      showToast("Выберите изображение PNG, JPG или WEBP", "error");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast("Файл логотипа слишком большой. Максимум 8 МБ", "error");
      return;
    }

    try {
      const compressed = await compressImageToDataUrl(file, { maxSide: 420, quality: 0.82 });
      setLogoDataUrl(compressed);
      showToast("Логотип подготовлен. Нажмите «Сохранить»");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось подготовить логотип", "error");
    }
  }

  function handleBackup() {
    const blob = new Blob([exportDB()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }).replace(":", "-");
    link.href = url;
    link.download = `igor-servis-backup-${todayISO()}-${stamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Резервная копия сохранена");
  }

  async function handleRestore(file: File) {
    const text = await file.text();
    const inspected = inspectBackupJson(text);
    if (!inspected) {
      showToast("Файл повреждён, неполный или не является резервной копией CRM", "error");
      return;
    }
    const counts = backupCounts(inspected.data);
    const backupInfo = inspected.meta
      ? `Создана ${new Date(inspected.meta.exportedAt).toLocaleString("ru-RU")}${inspected.meta.appVersion ? ` · CRM v${inspected.meta.appVersion}` : ""}${inspected.meta.dbVersion ? ` · база ${inspected.meta.dbVersion}` : ""}`
      : "Старая резервная копия без метаданных — структура проверена";

    const ok = await confirm({
      title: "Восстановить из резервной копии",
      question: "Текущие данные в этом браузере будут полностью заменены содержимым файла.",
      summary: [
        { label: "Файл", value: file.name },
        { label: "Копия", value: backupInfo },
        { label: "Заказ-наряды", value: `${orders.length} → ${counts.orders}` },
        { label: "Клиенты", value: `${clients.length} → ${counts.clients}` },
        { label: "Автомобили", value: `${vehicles.length} → ${counts.vehicles}` },
        { label: "Позиции склада", value: `${stock.length} → ${counts.stock}` },
        { label: "Расходы", value: `${expenses.length} → ${counts.expenses}` },
      ],
      note: "Перед восстановлением лучше скачать копию текущих данных. Неполные и повреждённые файлы CRM больше не принимает.",
      confirmLabel: "Восстановить",
      danger: true,
    });
    if (!ok) return;
    if (importDB(text)) {
      showToast("Данные восстановлены из копии");
    } else {
      showToast("Не удалось восстановить резервную копию", "error");
    }
  }

  async function handleUploadCloud() {
    const ok = await confirm({
      title: "Перенести базу на сервер",
      question: "Текущие данные этого браузера станут общей базой сервиса для всех пользователей.",
      summary: [
        { label: "Заказ-наряды", value: orders.length },
        { label: "Клиенты", value: clients.length },
        { label: "Позиции склада", value: stock.length },
        { label: "Расходы", value: expenses.length },
      ],
      note: "Делайте это только на устройстве, где сейчас находится актуальная рабочая база.",
      confirmLabel: "Перенести на сервер",
    });
    if (!ok) return;
    const error = await uploadLocalToCloud();
    showToast(error ?? "Общая база создана и синхронизация включена", error ? "error" : undefined);
  }

  async function handleCloudBackup() {
    const error = await backupCloud();
    showToast(error ?? "Серверная резервная копия создана", error ? "error" : undefined);
  }

  async function handleRestoreCloudBackup(id: string, revision: number) {
    const ok = await confirm({
      title: "Восстановить серверную копию",
      question: `Текущая общая база будет заменена данными из ревизии ${revision}.`,
      note: "Перед восстановлением сервер автоматически сохранит ещё одну копию текущего состояния.",
      confirmLabel: "Восстановить",
      danger: true,
    });
    if (!ok) return;
    const error = await restoreBackup(id);
    showToast(error ?? "Серверная копия восстановлена", error ? "error" : undefined);
  }

  async function handleRefreshCloud() {
    const error = await refreshFromCloud();
    showToast(error ?? "Загружена свежая версия общей базы", error ? "error" : undefined);
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
                <div className="space-y-2">
                  <label className="block text-sm">
                    <span className="mb-1 block muted">Подпись телефона 1</span>
                    <div className="field-control">
                      <input value={phoneLabel} onChange={(e) => setPhoneLabel(e.target.value)} placeholder="Игорь" />
                    </div>
                  </label>
                  <PhoneField label="Телефон 1" value={phone} onChange={setPhone} touched={touched} />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm">
                    <span className="mb-1 block muted">Подпись телефона 2</span>
                    <div className="field-control">
                      <input value={phone2Label} onChange={(e) => setPhone2Label(e.target.value)} placeholder="Юра" />
                    </div>
                  </label>
                  <PhoneField label="Телефон 2" value={phone2} onChange={setPhone2} touched={touched} hint="Например, второй номер совладельца" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="block text-sm">
                  <span className="mb-1 block muted">Часы работы</span>
                  <div className="flex items-center gap-2">
                    <div className="field-control flex-1">
                      <input type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} aria-label="Открытие" step={900} />
                    </div>
                    <span className="muted">—</span>
                    <div className="field-control flex-1">
                      <input type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} aria-label="Закрытие" step={900} />
                    </div>
                  </div>
                  <span className="mt-1 block text-xs muted">По этим часам строится расписание, свободные окна и загрузка подъёмников</span>
                </div>

                <div className="block text-sm">
                  <span className="mb-1 block muted">Логотип в документах</span>
                  <div className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                    <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--bg)]">
                      <img src={logoDataUrl || defaultLogo} alt="Логотип сервиса" className="h-full w-full object-contain" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs muted">Печатается в заказ-наряде. По умолчанию используется текущий логотип CRM; можно загрузить свой PNG/JPG/WEBP.</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="secondary" onClick={() => logoFileRef.current?.click()}>
                          Выбрать файл
                        </Button>
                        {logoDataUrl && (
                          <Button type="button" size="sm" variant="secondary" onClick={() => setLogoDataUrl("")}>
                            Вернуть стандартный
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <input
                    ref={logoFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleLogoFile(file);
                      event.target.value = "";
                    }}
                  />
                </div>
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
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#edf4ff] text-[#3978c9]">
                {cloud.configured ? <IconCloud size={22} /> : <IconDatabase size={22} />}
              </div>
              <div className="min-w-0">
                <h2 className="panel-title">Общая база и резервные копии</h2>
                <p className="muted text-sm">
                  {!cloud.configured && "Локальный режим — данные только в этом браузере"}
                  {cloud.configured && cloud.status === "loading" && "Подключаем общую базу…"}
                  {cloud.configured && cloud.status === "needs_upload" && "Сервер подключён, но общая база ещё пустая"}
                  {cloud.configured && cloud.status === "saving" && "Сохраняем изменения на сервер…"}
                  {cloud.configured && cloud.status === "ready" && `${cloud.workshopName || "Общая база"} · синхронизация включена`}
                  {cloud.configured && cloud.status === "error" && "Есть проблема с синхронизацией"}
                </p>
              </div>
            </div>

            {cloud.configured && (
              <div className="mb-4 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                <div className="flex justify-between gap-3"><span className="muted">Пользователь</span><b>{cloud.displayName || "—"}</b></div>
                <div className="mt-1 flex justify-between gap-3"><span className="muted">Ревизия базы</span><span>{cloud.revision ?? 0}</span></div>
                {cloud.lastSyncedAt && (
                  <div className="mt-1 flex justify-between gap-3"><span className="muted">Последняя синхронизация</span><span>{new Date(cloud.lastSyncedAt).toLocaleString("ru-RU")}</span></div>
                )}
                {(cloud.conflictCount ?? 0) > 0 && (
                  <div className="mt-1 flex justify-between gap-3">
                    <span className="muted">Конфликты синхронизации</span>
                    <span>{cloud.conflictCount}{cloud.lastConflictAt ? ` · ${new Date(cloud.lastConflictAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
                  </div>
                )}
                {cloud.error && <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>{cloud.error}</p>}
              </div>
            )}

            {!cloud.configured && (
              <p className="mb-4 text-sm muted">
                Сейчас каждый телефон и компьютер хранит свою копию. После подключения Supabase здесь появятся общая база,
                вход пользователей и автоматическое сохранение на сервер.
              </p>
            )}

            {cloud.status === "needs_upload" && (
              <div className="mb-4 rounded-xl border p-3" style={{ borderColor: "var(--warning)", background: "#fff9ed" }}>
                <b className="block text-sm">Нужен первый перенос</b>
                <p className="muted mt-1 text-xs">Откройте устройство с актуальными данными и перенесите именно эту базу на сервер.</p>
                <Button className="mt-3" onClick={() => void handleUploadCloud()}>
                  <IconUpload size={18} /> Перенести текущую базу на сервер
                </Button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleBackup}>
                <IconDownload size={18} /> Скачать JSON-копию
              </Button>
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                <IconUpload size={18} /> Восстановить из файла
              </Button>
              {cloud.configured && cloud.status !== "needs_upload" && (
                <>
                  <Button variant="secondary" onClick={() => void handleRefreshCloud()}>
                    <IconRefresh size={18} /> Обновить с сервера
                  </Button>
                  <Button variant="secondary" onClick={() => void handleCloudBackup()}>
                    <IconCloud size={18} /> Серверная копия
                  </Button>
                </>
              )}
              {!cloud.configured && (
                <Button variant="secondary" onClick={handleReset}>
                  Сбросить к демонстрационным
                </Button>
              )}
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

          {cloud.configured && cloud.status !== "needs_upload" && (
            <Card>
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#edf4ff] text-[#3978c9]"><IconHistory size={22} /></div>
                <div>
                  <h2 className="panel-title">История сервера</h2>
                  <p className="muted text-sm">Резервные копии и последние изменения общей базы</p>
                </div>
              </div>

              {cloudAdminLoading ? (
                <p className="muted text-sm">Загружаем историю…</p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Резервные копии</h3>
                    <div className="space-y-2">
                      {cloudBackups.slice(0, 8).map((backup) => (
                        <div key={backup.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                          <div className="min-w-0">
                            <b className="block">Ревизия {backup.revision}</b>
                            <span className="muted block text-xs">{new Date(backup.createdAt).toLocaleString("ru-RU")} · {backup.createdBy} · {backup.reason}</span>
                          </div>
                          <Button variant="secondary" size="sm" onClick={() => void handleRestoreCloudBackup(backup.id, backup.revision)}>
                            <IconRestore size={16} /> Восстановить
                          </Button>
                        </div>
                      ))}
                      {cloudBackups.length === 0 && <p className="muted text-sm">Серверных копий пока нет.</p>}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Последние действия</h3>
                    <div className="space-y-2">
                      {cloudAudit.slice(0, 12).map((entry) => (
                        <div key={entry.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                          <div className="flex items-center justify-between gap-2">
                            <b>{entry.actorName}</b>
                            <span className="muted text-xs">{new Date(entry.createdAt).toLocaleString("ru-RU")}</span>
                          </div>
                          <p className="mt-1">{entry.action === "backup_restored" ? "Восстановил резервную копию" : entry.action === "database_initialized" ? "Создал общую базу" : "Сохранил изменения"}</p>
                          {entry.changedSections?.length > 0 && <p className="muted mt-1 text-xs">Разделы: {entry.changedSections.join(", ")}</p>}
                        </div>
                      ))}
                      {cloudAudit.length === 0 && <p className="muted text-sm">Записей пока нет.</p>}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}

          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fdf3e0] text-[var(--warning)]">
                <IconCheck size={22} />
              </div>
              <div>
                <h2 className="panel-title">Готовность к реальной работе</h2>
                <p className="muted text-sm">Что ещё нужно заполнить или проверить перед отказом от демо-данных</p>
              </div>
            </div>
            <div className="space-y-2">
              {readiness.map((item) => (
                <div key={item.label} className="flex items-start gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                  <span
                    className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full"
                    style={{
                      background: item.ok ? "var(--accent-soft)" : "#fdf3e0",
                      color: item.ok ? "var(--accent)" : "var(--warning)",
                    }}
                  >
                    {item.ok ? <IconCheck size={14} /> : <IconAlertTriangle size={14} />}
                  </span>
                  <span className="min-w-0">
                    <b className="block text-sm">{item.label}</b>
                    <span className="muted block text-xs">{item.detail}</span>
                  </span>
                </div>
              ))}
            </div>
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
