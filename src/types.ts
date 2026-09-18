export interface CompanyInfo {
  name: string;
  shortName: string;
  address: string;
  phone: string;
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

export interface Employee {
  id: string;
  name: string;
  role: string;
  payType: "percent" | "salary+percent" | "salary";
  /** Для percent — доля от работ в процентах, для оклада — сумма в месяц. */
  payValue: number;
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

export interface OrderLineWork {
  id: string;
  name: string;
  qty: number;
  price: number;
  executor?: string;
  /** Норматив времени на единицу работы, минут. Берётся из прайса при добавлении. */
  normMinutes?: number;
}

/** Отметка смены статуса — из них считается фактическое время на подъёмнике. */
export interface StatusEvent {
  status: OrderStatus;
  at: string;
  /** Отметка восстановлена по плану старого заказа, а не замерена. */
  estimated?: boolean;
}

export interface OrderLinePart {
  id: string;
  name: string;
  sku?: string;
  qty: number;
  price: number;
  /** Закупочная цена на момент добавления в заказ. */
  purchasePrice?: number;
  /** true — цену восстановили из текущего склада, а не знаем точно на дату продажи. */
  purchasePriceEstimated?: boolean;
  availability: "in_stock" | "reserved" | "ordered";
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
  discount?: number;
  paid?: number;
  notes?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  complaint?: string;
  /** Внутренний комментарий мастера. Клиенту и в акт не выводится. */
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
  brand?: string;
  category: string;
  qty: number;
  minQty: number;
  purchasePrice: number;
  cell?: string;
  unit: string;
  lastPurchasePrice?: number;
  lastPurchaseAt?: string;
  supplier?: string;
}

export interface StockMovement {
  id: string;
  date: string;
  itemId: string;
  operation: "Приёмка" | "Списание" | "Перемещение" | "Резерв" | "Снят резерв" | "Возврат" | "Возврат поставщику";
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
