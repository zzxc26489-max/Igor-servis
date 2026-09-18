import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  Client,
  AppSettings,
  CompanyInfo,
  Employee,
  Expense,
  Invoice,
  Lift,
  Order,
  OrderStatus,
  Service,
  StockItem,
  StockMovement,
  Vehicle,
} from "../types";
import * as seed from "../data/seed";
import { company as companySeed } from "../data/company";
import { createId, nextCode } from "../lib/id";
import { orderTotals } from "../lib/order";
import { reservedByItem } from "../lib/stock";
import { formatPhone, formatPlate, isValidPhone, looksRussian } from "../lib/formats";
import { nowISO } from "../lib/date";
import { backfillTimeline } from "../lib/worktime";
import { normalizeWorkDay, parseWorkHours, setWorkDay } from "../lib/workday";

const STORAGE_KEY = "igor-servis-db-v1";

export const CODE_PREFIX = {
  client: "К",
  vehicle: "А",
  stock: "С",
  expense: "Р",
  order: "№АИ",
} as const;

interface DB {
  /** База ещё не тронута руками — показываем метку «Демо-данные». */
  demo?: boolean;
  company: CompanyInfo;
  settings: AppSettings;
  lifts: Lift[];
  employees: Employee[];
  clients: Client[];
  vehicles: Vehicle[];
  services: Service[];
  stock: StockItem[];
  stockMovements: StockMovement[];
  orders: Order[];
  expenses: Expense[];
  invoices: Invoice[];
}

const defaultSettings: AppSettings = {
  autoPriceAdjustment: true,
  partMarkupPercent: 40,
};

function seedDB(): DB {
  return {
    demo: true,
    company: companySeed,
    settings: defaultSettings,
    lifts: seed.lifts,
    employees: seed.employees,
    clients: seed.clients,
    vehicles: seed.vehicles,
    services: seed.services,
    stock: seed.stock,
    stockMovements: seed.stockMovements,
    orders: seed.orders,
    expenses: seed.expenses,
    invoices: seed.invoices,
  };
}

/** Записи, заведённые до появления сквозной нумерации, получают номера при первой загрузке. */
function withCodes<T extends { code?: string }>(items: T[], prefix: string): T[] {
  let next = items.reduce((max, item) => {
    const digits = Number((item.code ?? "").replace(/\D/g, ""));
    return Number.isNaN(digits) ? max : Math.max(max, digits);
  }, 0);
  return items.map((item) =>
    item.code ? item : { ...item, code: `${prefix}-${String(++next).padStart(4, "0")}` },
  );
}

function migrate(db: DB): DB {
  // Часы работы раньше хранились строкой «Ежедневно, 10:00–20:00» — достаём из неё время.
  const legacyHours = parseWorkHours((db.company as unknown as { workHours?: string }).workHours);
  const hours = normalizeWorkDay(
    db.company.openTime && db.company.closeTime
      ? { start: db.company.openTime, end: db.company.closeTime }
      : legacyHours ?? undefined,
  );

  return {
    ...db,
    company: {
      ...db.company,
      // Старая маска-заглушка «+7 (___) ___-__-__» не проходила проверку и
      // не давала сохранить настройки — такой номер считаем незаполненным.
      phone: isValidPhone(db.company.phone) ? formatPhone(db.company.phone) : "",
      openTime: hours.start,
      closeTime: hours.end,
    },
    // Телефоны и номера приводим к единому виду: старые записи хранились как придётся.
    clients: withCodes(db.clients, CODE_PREFIX.client).map((client) => ({
      ...client,
      phone: formatPhone(client.phone) || client.phone,
      phone2: client.phone2 ? formatPhone(client.phone2) || client.phone2 : undefined,
    })),
    // Старым заказам восстанавливаем историю статусов, иначе их фактическое
    // время после ближайшей смены статуса оказалось бы нулевым.
    orders: db.orders.map((order) => (order.timeline?.length ? order : { ...order, timeline: backfillTimeline(order) })),
    vehicles: withCodes(db.vehicles, CODE_PREFIX.vehicle).map((vehicle) => ({
      ...vehicle,
      plate: looksRussian(vehicle.plate) ? formatPlate(vehicle.plate) : vehicle.plate.trim().toUpperCase(),
    })),
    stock: withCodes(db.stock, CODE_PREFIX.stock),
    expenses: withCodes(db.expenses, CODE_PREFIX.expense),
  };
}

function loadInitial(): DB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      return migrate({
        ...seedDB(),
        ...parsed,
        company: { ...companySeed, ...parsed.company },
        settings: { ...defaultSettings, ...parsed.settings },
      });
    }
  } catch {
    // ignore corrupted storage and fall back to seed data
  }
  return migrate(seedDB());
}

export interface ReturnToSupplierInput {
  itemId: string;
  qty: number;
  unitPrice: number;
  supplier: string;
  employee: string;
  reason: string;
}

export interface ReceiveStockInput {
  itemId?: string;
  name: string;
  sku: string;
  brand?: string;
  category: string;
  unit: string;
  minQty: number;
  qty: number;
  unitPrice: number;
  cell: string;
  supplier?: string;
  employee: string;
  note?: string;
  createExpense: boolean;
}

interface AppStoreValue extends DB {
  setDB: React.Dispatch<React.SetStateAction<DB>>;
  updateOrder: (id: string, patch: Partial<Order>) => void;
  deleteOrder: (id: string) => void;
  addClient: (client: Client) => void;
  updateClient: (id: string, patch: Partial<Client>) => void;
  addVehicle: (vehicle: Vehicle) => void;
  updateVehicle: (id: string, patch: Partial<Vehicle>) => void;
  deleteVehicle: (id: string) => void;
  addStockMovement: (m: StockMovement) => void;
  updateStockItem: (id: string, patch: Partial<StockItem>) => void;
  receiveStock: (input: ReceiveStockInput) => void;
  addExpense: (e: Expense) => void;
  updateCompany: (patch: Partial<CompanyInfo>) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  addService: (service: Service) => void;
  updateService: (id: string, patch: Partial<Service>) => void;
  deleteService: (id: string) => void;
  /** Смена статуса заказа: при выдаче списывает запчасти, при откате возвращает. */
  setOrderStatus: (id: string, status: OrderStatus) => void;
  /** Добавить запчасть со склада в заказ (резерв, без списания остатка). */
  reservePart: (orderId: string, itemId: string, qty: number, price: number) => string | null;
  /** Убрать запчасть из заказа и снять резерв. */
  releasePart: (orderId: string, partId: string) => void;
  /** Принять оплату от клиента; больше долга принять нельзя. */
  acceptPayment: (orderId: string, amount: number) => void;
  /** Возврат запчасти поставщику: списывает со склада и заводит ожидание денег. */
  returnToSupplier: (input: ReturnToSupplierInput) => void;
  /** Деньги от поставщика пришли — возврат идёт в расчёты. */
  confirmRefund: (expenseId: string) => void;
  /** Выплата зарплаты сотруднику. */
  payEmployee: (employeeId: string, amount: number, note?: string) => void;
  resetToSeed: () => void;
  /** Резервная копия: весь справочник одним JSON. */
  exportDB: () => string;
  /** Восстановление из резервной копии; возвращает false, если файл не подошёл. */
  importDB: (json: string) => boolean;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [db, rawSetDB] = useState<DB>(loadInitial);

  /**
   * Рабочие часы из настроек — единственный источник для расписания, поиска
   * свободных окон и учёта времени. Применяем до отрисовки дочерних страниц,
   * чтобы смена часов в настройках сразу меняла расписание.
   */
  setWorkDay({ start: db.company.openTime, end: db.company.closeTime });

  /**
   * Любое изменение данных снимает метку «Демо-данные»: как только в базе
   * появились настоящие записи, называть её демонстрационной нечестно.
   */
  const setDB = useCallback<React.Dispatch<React.SetStateAction<DB>>>((value) => {
    rawSetDB((prev) => {
      const next = typeof value === "function" ? (value as (state: DB) => DB)(prev) : value;
      return next.demo ? { ...next, demo: false } : next;
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }, [db]);

  const value = useMemo<AppStoreValue>(
    () => ({
      ...db,
      setDB,
      updateOrder: (id, patch) =>
        setDB((prev) => ({
          ...prev,
          orders: prev.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)),
        })),
      deleteOrder: (id) => setDB((prev) => ({ ...prev, orders: prev.orders.filter((o) => o.id !== id) })),
      addClient: (client) =>
        setDB((prev) => ({
          ...prev,
          clients: [...prev.clients, { ...client, code: client.code ?? nextCode(CODE_PREFIX.client, prev.clients.map((item) => item.code)) }],
        })),
      updateClient: (id, patch) =>
        setDB((prev) => ({
          ...prev,
          clients: prev.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      addVehicle: (vehicle) =>
        setDB((prev) => ({
          ...prev,
          vehicles: [...prev.vehicles, { ...vehicle, code: vehicle.code ?? nextCode(CODE_PREFIX.vehicle, prev.vehicles.map((item) => item.code)) }],
        })),
      updateVehicle: (id, patch) =>
        setDB((prev) => ({
          ...prev,
          vehicles: prev.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v)),
        })),
      deleteVehicle: (id) => setDB((prev) => ({ ...prev, vehicles: prev.vehicles.filter((v) => v.id !== id) })),
      addStockMovement: (m) =>
        setDB((prev) => ({ ...prev, stockMovements: [m, ...prev.stockMovements] })),
      updateStockItem: (id, patch) =>
        setDB((prev) => ({
          ...prev,
          stock: prev.stock.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        })),
      addExpense: (e) =>
        setDB((prev) => ({
          ...prev,
          expenses: [{ ...e, code: e.code ?? nextCode(CODE_PREFIX.expense, prev.expenses.map((item) => item.code)) }, ...prev.expenses],
        })),
      receiveStock: (input) =>
        setDB((prev) => {
          const stamp = Date.now();
          const now = new Date().toISOString();
          const total = Math.round(input.qty * input.unitPrice);
          const existing = input.itemId ? prev.stock.find((item) => item.id === input.itemId) : undefined;
          const itemId = existing?.id ?? `st-${stamp}`;

          // Средневзвешенная закупочная цена: старый остаток по старой цене плюс новый приход.
          const nextStock = existing
            ? prev.stock.map((item) => {
                if (item.id !== existing.id) return item;
                const qty = item.qty + input.qty;
                const purchasePrice = input.unitPrice > 0 && qty > 0
                  ? Math.round((item.qty * item.purchasePrice + total) / qty)
                  : item.purchasePrice;
                return {
                  ...item,
                  qty,
                  purchasePrice,
                  cell: input.cell || item.cell,
                  minQty: input.minQty || item.minQty,
                  supplier: input.supplier || item.supplier,
                  lastPurchasePrice: input.unitPrice > 0 ? input.unitPrice : item.lastPurchasePrice,
                  lastPurchaseAt: input.unitPrice > 0 ? now : item.lastPurchaseAt,
                };
              })
            : [
                ...prev.stock,
                {
                  id: itemId,
                  code: nextCode(CODE_PREFIX.stock, prev.stock.map((item) => item.code)),
                  name: input.name,
                  sku: input.sku,
                  brand: input.brand,
                  category: input.category,
                  qty: input.qty,
                  minQty: input.minQty,
                  purchasePrice: input.unitPrice,
                  cell: input.cell,
                  unit: input.unit,
                  supplier: input.supplier,
                  lastPurchasePrice: input.unitPrice,
                  lastPurchaseAt: now,
                },
              ];

          const movement: StockMovement = {
            id: `mv-${stamp}`,
            date: now,
            itemId,
            operation: "Приёмка",
            qty: input.qty,
            to: input.cell,
            employee: input.employee,
            unitPrice: input.unitPrice,
            amount: total,
            note: input.note,
          };

          const expenses = input.createExpense && total > 0
            ? [
                {
                  id: `exp-${stamp}`,
                  code: nextCode(CODE_PREFIX.expense, prev.expenses.map((item) => item.code)),
                  date: now.slice(0, 10),
                  category: "Закупка запчастей",
                  description: `Приёмка: ${input.name} — ${input.qty} ${input.unit}`,
                  amount: total,
                  counterparty: input.supplier || "Поставщик",
                  status: "Оплачено" as const,
                  source: "stock_purchase" as const,
                  itemId,
                },
                ...prev.expenses,
              ]
            : prev.expenses;

          return { ...prev, stock: nextStock, stockMovements: [movement, ...prev.stockMovements], expenses };
        }),
      updateCompany: (patch) => setDB((prev) => ({ ...prev, company: { ...prev.company, ...patch } })),
      updateSettings: (patch) => setDB((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } })),
      addService: (service) => setDB((prev) => ({ ...prev, services: [...prev.services, service] })),
      updateService: (id, patch) =>
        setDB((prev) => ({
          ...prev,
          services: prev.services.map((service) => (service.id === id ? { ...service, ...patch } : service)),
        })),
      deleteService: (id) => setDB((prev) => ({ ...prev, services: prev.services.filter((service) => service.id !== id) })),
      setOrderStatus: (id, status) =>
        setDB((prev) => {
          const order = prev.orders.find((item) => item.id === id);
          if (!order || order.status === status) return prev;

          const wasIssued = order.status === "выдан";
          const willIssue = status === "выдан";
          const now = nowISO();

          // Пишем историю статусов: из неё считается фактическое время на подъёмнике.
          const history = order.timeline?.length ? order.timeline : backfillTimeline(order);
          const last = history[history.length - 1];
          // Если текущего статуса в истории нет, дописываем его: иначе отрезок
          // «на подъёмнике» не откроется и время потеряется.
          const timeline = last?.status === order.status
            ? [...history, { status, at: now }]
            : [...history, { status: order.status, at: last?.at ?? order.createdAt }, { status, at: now }];
          const patch: Partial<Order> = { status, timeline };
          if (status === "готово" && !order.completedAt) patch.completedAt = now;
          if (status !== "готово" && status !== "выдан") patch.completedAt = undefined;

          const orders = prev.orders.map((item) => (item.id === id ? { ...item, ...patch } : item));

          // Запчасти уходят со склада в момент выдачи и возвращаются, если выдачу откатили.
          if (wasIssued === willIssue) return { ...prev, orders };

          const sign = willIssue ? -1 : 1;
          const stock = [...prev.stock];
          const movements: StockMovement[] = [];
          for (const part of order.parts) {
            const index = stock.findIndex((item) => item.sku === part.sku);
            if (index < 0) continue;
            const item = stock[index];
            stock[index] = { ...item, qty: Math.max(0, item.qty + sign * part.qty) };
            movements.push({
              id: createId("mv"),
              date: now,
              itemId: item.id,
              operation: willIssue ? "Списание" : "Возврат",
              qty: part.qty,
              from: willIssue ? item.cell : undefined,
              to: willIssue ? undefined : item.cell,
              employee: order.advisor || "—",
              note: `Заказ-наряд ${order.number}`,
            });
          }
          return { ...prev, orders, stock, stockMovements: [...movements, ...prev.stockMovements] };
        }),
      reservePart: (orderId, itemId, qty, price) => {
        let error: string | null = null;
        setDB((prev) => {
          const order = prev.orders.find((item) => item.id === orderId);
          const item = prev.stock.find((entry) => entry.id === itemId);
          if (!order || !item) {
            error = "Позиция не найдена";
            return prev;
          }
          const reserved = reservedByItem(prev.orders, prev.stock).get(item.id) ?? 0;
          const available = item.qty - reserved;
          if (qty <= 0) {
            error = "Количество должно быть больше нуля";
            return prev;
          }
          if (qty > available) {
            error = `Свободно только ${available} ${item.unit}: ${reserved} уже в резерве`;
            return prev;
          }
          const part = { id: createId("part"), name: item.name, sku: item.sku, qty, price, availability: "reserved" as const };
          return {
            ...prev,
            orders: prev.orders.map((entry) => (entry.id === orderId ? { ...entry, parts: [...entry.parts, part] } : entry)),
            stockMovements: [
              {
                id: createId("mv"),
                date: new Date().toISOString(),
                itemId: item.id,
                operation: "Резерв" as const,
                qty,
                from: item.cell,
                employee: order.advisor || "—",
                note: `Заказ-наряд ${order.number}`,
              },
              ...prev.stockMovements,
            ],
          };
        });
        return error;
      },
      releasePart: (orderId, partId) =>
        setDB((prev) => {
          const order = prev.orders.find((item) => item.id === orderId);
          const part = order?.parts.find((item) => item.id === partId);
          if (!order || !part) return prev;
          const item = prev.stock.find((entry) => entry.sku === part.sku);
          // Если заказ уже выдан, запчасть была списана — возвращаем её на полку.
          const stock = order.status === "выдан" && item
            ? prev.stock.map((entry) => (entry.id === item.id ? { ...entry, qty: entry.qty + part.qty } : entry))
            : prev.stock;
          const movements = item
            ? [{
                id: createId("mv"),
                date: new Date().toISOString(),
                itemId: item.id,
                operation: "Возврат" as const,
                qty: part.qty,
                to: item.cell,
                employee: order.advisor || "—",
                note: `Снят резерв по заказу ${order.number}`,
              }, ...prev.stockMovements]
            : prev.stockMovements;
          return {
            ...prev,
            stock,
            stockMovements: movements,
            orders: prev.orders.map((entry) =>
              entry.id === orderId ? { ...entry, parts: entry.parts.filter((item) => item.id !== partId) } : entry,
            ),
          };
        }),
      acceptPayment: (orderId, amount) =>
        setDB((prev) => {
          const order = prev.orders.find((item) => item.id === orderId);
          if (!order || amount <= 0) return prev;
          // Переплату не принимаем: иначе «долг» уходит в минус и портит статистику.
          const debt = Math.max(0, orderTotals(order).debt);
          const accepted = Math.min(amount, debt);
          if (accepted <= 0) return prev;
          return {
            ...prev,
            orders: prev.orders.map((item) =>
              item.id === orderId ? { ...item, paid: (item.paid ?? 0) + accepted } : item,
            ),
          };
        }),
      returnToSupplier: (input) =>
        setDB((prev) => {
          const item = prev.stock.find((entry) => entry.id === input.itemId);
          if (!item || input.qty <= 0) return prev;
          const reserved = reservedByItem(prev.orders, prev.stock).get(item.id) ?? 0;
          const qty = Math.min(input.qty, item.qty - reserved);
          if (qty <= 0) return prev;
          const now = new Date().toISOString();
          const amount = Math.round(qty * input.unitPrice);
          return {
            ...prev,
            stock: prev.stock.map((entry) => (entry.id === item.id ? { ...entry, qty: entry.qty - qty } : entry)),
            stockMovements: [
              {
                id: createId("mv"),
                date: now,
                itemId: item.id,
                operation: "Возврат поставщику" as const,
                qty,
                from: item.cell,
                employee: input.employee,
                unitPrice: input.unitPrice,
                amount,
                note: input.reason,
              },
              ...prev.stockMovements,
            ],
            expenses: [
              {
                id: createId("exp"),
                code: nextCode(CODE_PREFIX.expense, prev.expenses.map((entry) => entry.code)),
                date: now.slice(0, 10),
                category: "Возврат поставщику",
                description: `Возврат: ${item.name} — ${qty} ${item.unit}`,
                amount,
                counterparty: input.supplier || item.supplier || "Поставщик",
                status: "Ждём возврат" as const,
                source: "supplier_refund" as const,
                itemId: item.id,
                comment: input.reason,
              },
              ...prev.expenses,
            ],
          };
        }),
      confirmRefund: (expenseId) =>
        setDB((prev) => ({
          ...prev,
          expenses: prev.expenses.map((expense) =>
            expense.id === expenseId && expense.source === "supplier_refund" && expense.status !== "Возвращено"
              ? { ...expense, status: "Возвращено" as const, refundConfirmedAt: new Date().toISOString() }
              : expense,
          ),
        })),
      payEmployee: (employeeId, amount, note) =>
        setDB((prev) => {
          const employee = prev.employees.find((item) => item.id === employeeId);
          if (!employee || amount <= 0) return prev;
          const now = new Date().toISOString();
          const sdelnaya = employee.payType !== "salary";
          return {
            ...prev,
            employees: prev.employees.map((item) =>
              item.id === employeeId ? { ...item, paid: item.paid + amount, lastPaidAt: now } : item,
            ),
            expenses: [
              {
                id: createId("exp"),
                code: nextCode(CODE_PREFIX.expense, prev.expenses.map((entry) => entry.code)),
                date: now.slice(0, 10),
                category: "Зарплата",
                description: `Выплата: ${employee.name}`,
                amount,
                counterparty: employee.name,
                status: "Оплачено" as const,
                // Сдельная часть уже сидит в начислении, повторно в расходы не идёт.
                source: sdelnaya ? ("payroll" as const) : undefined,
                employeeId,
                comment: note,
              },
              ...prev.expenses,
            ],
          };
        }),
      resetToSeed: () => rawSetDB(migrate(seedDB())),
      exportDB: () => JSON.stringify(db, null, 2),
      importDB: (json) => {
        try {
          const parsed = JSON.parse(json) as Partial<DB>;
          if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.clients)) return false;
          rawSetDB(migrate({
            ...seedDB(),
            demo: false,
            ...parsed,
            company: { ...companySeed, ...parsed.company },
            settings: { ...defaultSettings, ...parsed.settings },
          }));
          return true;
        } catch {
          return false;
        }
      },
    }),
    [db, setDB],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
