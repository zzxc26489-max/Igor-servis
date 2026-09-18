export interface CompanyInfo {
  name: string;
  shortName: string;
  address: string;
  phone: string;
  workHours: string;
  inn: string;
  responsible: string;
}

export interface AppSettings {
  autoPriceAdjustment: boolean;
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
}

export interface OrderLinePart {
  id: string;
  name: string;
  sku?: string;
  qty: number;
  price: number;
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
  advisor?: string;
  works: OrderLineWork[];
  parts: OrderLinePart[];
  discount?: number;
  paid?: number;
  notes?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  complaint?: string;
  diagnosis?: string;
  defects?: string;
  guaranteeMonths?: number;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  price: number;
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
  operation: "Приёмка" | "Списание" | "Перемещение" | "Резерв" | "Возврат" | "Возврат поставщику";
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
  itemId?: string;
  employeeId?: string;
  /** Для возврата поставщику: пока деньги не пришли, в расчёт не идёт. */
  refundConfirmedAt?: string;
}

export type ExpenseStatus = "Оплачено" | "Ожидает" | "Ждём возврат" | "Возвращено";

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
