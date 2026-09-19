export interface CompanyInfo {
  name: string;
  shortName: string;
  address: string;
  phone: string;
  /** Подпись первого контактного номера в клиентских документах. */
  phoneLabel?: string;
  /** Второй контактный номер сервиса, например телефон второго совладельца. */
  phone2?: string;
  /** Подпись второго контактного номера в клиентских документах. */
  phone2Label?: string;
  /** Пользовательский логотип для печатных документов. Храним компактным data URL. */
  logoDataUrl?: string;
  /** Часы работы, «ЧЧ:ММ». По ним строится расписание и считается загрузка. */
  openTime: string;
  closeTime: string;
  inn: string;
  responsible: string;
}

export interface AppSettings {
  autoPriceAdjustment: boolean;
  /** Наценка на запчасти по умолчанию, проценты от цены закупки. */
  partMarkupPercent: number;
}

export type LiftStatus = "free" | "busy";

export interface Lift {
  id: number;
  name: string;
  status: LiftStatus;
}

export type PayrollComponent = "piecework" | "salary";

export interface Employee {
  id: string;
  name: string;
  role: string;
  payType: "percent" | "salary+percent" | "salary";
  /** Старое поле: для percent — процент, для salary — оклад. Оставлено для совместимости старых баз. */
  payValue: number;
  /** Процент сотрудника от выполненных работ. Для новых данных используется вместо payValue. */
  workPercent?: number;
  /** Месячный оклад. Для старых salary-записей берётся из payValue. */
  salaryAmount?: number;
  accrued: number;
  paid: number;
  lastPaidAt?: string;
}

export interface Client {
  id: string;
  code?: string;
  name: string;
  phone: string;
  phone2?: string;
  email?: string;
  birthday?: string;
  source?: string;
  discountPercent?: number;
  createdAt?: string;
  notes?: string;
  isRegular?: boolean;
}

export interface Vehicle {
  id: string;
  code?: string;
  clientId: string;
  make: string;
  model: string;
  year?: number;
  plate: string;
  vin?: string;
  mileage?: number;
  color?: string;
  engine?: string;
  transmission?: string;
  nextServiceDate?: string;
  nextServiceMileage?: number;
}

export type OrderStatus =
  | "запись"
  | "диагностика"
  | "в работе"
  | "ожидает запчасти"
  | "готово"
  | "выдан";

export type WorkLineStatus = "planned" | "in_progress" | "paused" | "done";

export interface WorkSession {
  startedAt: string;
  endedAt?: string;
  /** Механик, которому принадлежит именно эта сессия. Нужен при переназначении работы. */
  executor?: string;
}

export interface WorkAssignmentEvent {
  from?: string;
  to?: string;
  at: string;
  /** Кто выполнил переназначение. */
  actor?: string;
  reason?: string;
}

export interface OrderLineWork {
  id: string;
  name: string;
  qty: number;
  price: number;
  executor?: string;
  /** Норматив времени на единицу работы, минут. Берётся из прайса при добавлении. */
  normMinutes?: number;
  /** Личный статус конкретной работы механика, отдельно от статуса всего заказ-наряда. */
  workStatus?: WorkLineStatus;
  /** Реальные сессии работы: старт / пауза / продолжение. */
  workSessions?: WorkSession[];
  /** История назначений и смен механика по этой работе. */
  assignmentHistory?: WorkAssignmentEvent[];
  /** Процент зарплаты, зафиксированный для этой работы. Не меняется при последующей смене ставки сотрудника. */
  payrollPercent?: number;
}

/** Отметка смены статуса — из них считается фактическое время на подъёмнике. */
export interface StatusEvent {
  status: OrderStatus;
  at: string;
  /** Кто выполнил переход статуса. Для старых записей может отсутствовать. */
  actor?: string;
  /** Отметка восстановлена по плану старого заказа, а не замерена. */
  estimated?: boolean;
}

export interface OrderLinePart {
  id: string;
  name: string;
  sku?: string;
  qty: number;
  unit?: string;
  price: number;
  /** Закупочная цена на момент добавления в заказ. */
  purchasePrice?: number;
  /** true — цену восстановили из текущего склада, а не знаем точно на дату продажи. */
  purchasePriceEstimated?: boolean;
  availability: "in_stock" | "reserved" | "ordered";
}

export interface OrderConsumable {
  id: string;
  key: string;
  label: string;
  /** Внутренняя сумма, распределённая по работам. Клиенту отдельной строкой не показывается. */
  amount: number;
  appliedAt: string;
}

export type OrderMediaKind = "intake" | "diagnostic" | "repair" | "result";

export interface OrderMedia {
  id: string;
  kind: OrderMediaKind;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: string;
  note?: string;
  /** Путь в приватном Supabase Storage bucket order-media. */
  storagePath?: string;
  /** Локальный запасной вариант для фото, когда Supabase не подключён. */
  localDataUrl?: string;
}

export interface Order {
  id: string;
  number: string;
  clientId: string;
  vehicleId: string;
  liftId?: number;
  status: OrderStatus;
  createdAt: string;
  completedAt?: string;
  plannedAt?: string;
  /** Момент фактической выдачи автомобиля. */
  issuedAt?: string;
  /** true — дата выдачи восстановлена для старого заказа. */
  issuedAtEstimated?: boolean;
  advisor?: string;
  works: OrderLineWork[];
  parts: OrderLinePart[];
  /** Внутренние расходники: смазки, очистители и аэрозоли. Не выводятся клиенту отдельной строкой. */
  consumables?: OrderConsumable[];
  /** Фото и видео приёмки, диагностики, ремонта и результата. */
  media?: OrderMedia[];
  discount?: number;
  paid?: number;
  notes?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  /**
   * true — интервал подъёмника задан вручную и не должен автоматически
   * пересчитываться по нормативам добавленных/удалённых работ.
   */
  liftScheduleManual?: boolean;
  /** Внутренний срок, когда пообещали клиенту готовность. В печатный заказ-наряд не выводится. */
  promisedAt?: string;
  complaint?: string;
  /** Пробег на момент приёмки. Нужен для истории и печати старых заказ-нарядов. */
  mileageAtIntake?: number;
  /** Внутренний комментарий мастера. Клиенту и в печатную версию не выводится. */
  mechanicComment?: string;
  /** История статусов: когда машина встала на подъёмник и когда сошла. */
  timeline?: StatusEvent[];
  /** Рабочие часы, действовавшие для этого заказа. */
  workDayStart?: string;
  workDayEnd?: string;
  /** true — часы восстановлены для старого заказа. */
  workDayEstimated?: boolean;
  diagnosis?: string;
  defects?: string;
  /** Рекомендации клиенту после диагностики или ремонта. Показываются в заказ-наряде и истории авто. */
  recommendations?: string;
  guaranteeMonths?: number;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  price: number;
  /** Нормативное время работы, минут. */
  normMinutes?: number;
}

export interface StockItem {
  id: string;
  code?: string;
  name: string;
  sku: string;
  /** Штрихкод EAN/UPC/Code128, если он есть на упаковке. */
  barcode?: string;
  brand?: string;
  category: string;
  qty: number;
  minQty: number;
  purchasePrice: number;
  /** Ячейка необязательна: быстрые расходники и детали под текущий ремонт могут лежать без адресного хранения. */
  cell?: string;
  unit: string;
  /** Кросс-номера и аналоги для поиска одной детали по разным артикулам. */
  crossNumbers?: string[];
  /** OE-номера производителя автомобиля. */
  oeNumbers?: string[];
  /** Короткие подсказки применяемости. Финальная проверка — по VIN/каталогу. */
  fitments?: string[];
  catalogRefId?: string;
  lastPurchasePrice?: number;
  lastPurchaseAt?: string;
  supplier?: string;
  /** Количество, уже заказанное у поставщика, но ещё не принятое на склад. */
  onOrderQty?: number;
  /** Состояние текущего пополнения. */
  supplyStatus?: "ordered" | "in_transit";
  /** Когда заказали текущее пополнение. */
  orderedAt?: string;
  /** Ожидаемая дата поставки. */
  expectedAt?: string;
}

export interface PartReference {
  id: string;
  name: string;
  sku: string;
  brand?: string;
  category: string;
  unit: string;
  crossNumbers?: string[];
  oeNumbers?: string[];
  fitments: string[];
  sourceName?: string;
  sourceUrl?: string;
  note?: string;
}

export interface StockMovement {
  id: string;
  date: string;
  itemId: string;
  operation: "Приёмка" | "Списание" | "Перемещение" | "Резерв" | "Снят резерв" | "Возврат" | "Возврат поставщику" | "Заказ поставщику" | "В пути" | "Отмена заказа";
  qty: number;
  from?: string;
  to?: string;
  employee: string;
  unitPrice?: number;
  amount?: number;
  note?: string;
}

export interface Expense {
  id: string;
  code?: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  counterparty: string;
  status: ExpenseStatus;
  comment?: string;
  /**
   * stock_purchase — закупка запчастей со склада;
   * payroll — выплата уже начисленной сдельной зарплаты (движение денег, не новый расход);
   * supplier_refund — возврат денег от поставщика, уменьшает расходы периода.
   */
  source?: "stock_purchase" | "payroll" | "supplier_refund";
  /** Как реально ушли деньги. Для кассы считаем только явно указанные наличные. */
  paymentMethod?: PaymentMethod;
  /** Кассовая смена, в которой произошло движение денег. */
  shiftId?: string;
  itemId?: string;
  employeeId?: string;
  /** Для возврата поставщику: пока деньги не пришли, в расчёт не идёт. */
  refundConfirmedAt?: string;
}

export type ExpenseStatus = "Оплачено" | "Ожидает" | "Ждём возврат" | "Возвращено";

export type PaymentMethod = "cash" | "terminal" | "transfer";
export type PaymentKind = "payment" | "refund";

export interface Payment {
  id: string;
  orderId: string;
  /** Реальный момент движения денег. */
  at: string;
  /** Сумма хранится положительной, направление задаёт kind. */
  amount: number;
  /** payment — клиент заплатил; refund — деньги вернули клиенту. */
  kind?: PaymentKind;
  /** Способ оплаты. У старых мигрированных платежей может быть неизвестен. */
  method?: PaymentMethod;
  /** Кто принял оплату или оформил возврат. */
  employee?: string;
  /** Кассовая смена, открытая в момент платежа. */
  shiftId?: string;
  /** Старые оплаты без истории получают приблизительную дату при миграции. */
  estimated?: boolean;
}

export interface CashShift {
  id: string;
  openedAt: string;
  openedBy: string;
  openingCash: number;
  closedAt?: string;
  closedBy?: string;
  countedCash?: number;
  comment?: string;
}

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  orderId?: string;
  amount: number;
  status: "Оплачен" | "Выставлен" | "Просрочен";
  issuedAt: string;
  dueAt?: string;
}
