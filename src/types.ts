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
  payValue: number;
  accrued: number;
  paid: number;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  notes?: string;
  isRegular?: boolean;
}

export interface Vehicle {
  id: string;
  clientId: string;
  make: string;
  model: string;
  year?: number;
  plate: string;
  vin?: string;
  mileage?: number;
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
  plannedAt?: string;
  advisor?: string;
  works: OrderLineWork[];
  parts: OrderLinePart[];
  discount?: number;
  paid?: number;
  notes?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  price: number;
}

export interface StockItem {
  id: string;
  name: string;
  sku: string;
  brand?: string;
  category: string;
  qty: number;
  minQty: number;
  purchasePrice: number;
  cell?: string;
  unit: string;
}

export interface StockMovement {
  id: string;
  date: string;
  itemId: string;
  operation: "Приёмка" | "Списание" | "Перемещение" | "Резерв" | "Возврат";
  qty: number;
  from?: string;
  to?: string;
  employee: string;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  counterparty: string;
  status: "Оплачено" | "Ожидает";
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
