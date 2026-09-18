import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  Client,
  AppSettings,
  CompanyInfo,
  Employee,
  Expense,
  Invoice,
  Lift,
  Order,
  Service,
  StockItem,
  StockMovement,
  Vehicle,
} from "../types";
import * as seed from "../data/seed";
import { company as companySeed } from "../data/company";
import { nextCode } from "../lib/id";

const STORAGE_KEY = "igor-servis-db-v1";

export const CODE_PREFIX = {
  client: "К",
  vehicle: "А",
  stock: "С",
  expense: "Р",
  order: "№АИ",
} as const;

interface DB {
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
};

function seedDB(): DB {
  return {
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
  return {
    ...db,
    clients: withCodes(db.clients, CODE_PREFIX.client),
    vehicles: withCodes(db.vehicles, CODE_PREFIX.vehicle),
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
  resetToSeed: () => void;
  /** Резервная копия: весь справочник одним JSON. */
  exportDB: () => string;
  /** Восстановление из резервной копии; возвращает false, если файл не подошёл. */
  importDB: (json: string) => boolean;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [db, setDB] = useState<DB>(loadInitial);

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
                  date: now,
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
      resetToSeed: () => setDB(seedDB()),
      exportDB: () => JSON.stringify(db, null, 2),
      importDB: (json) => {
        try {
          const parsed = JSON.parse(json) as Partial<DB>;
          if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.clients)) return false;
          setDB(migrate({
            ...seedDB(),
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
    [db],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
