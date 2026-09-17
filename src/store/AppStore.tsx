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

const STORAGE_KEY = "igor-servis-db-v1";

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

function loadInitial(): DB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      return {
        ...seedDB(),
        ...parsed,
        company: { ...companySeed, ...parsed.company },
        settings: { ...defaultSettings, ...parsed.settings },
      };
    }
  } catch {
    // ignore corrupted storage and fall back to seed data
  }
  return seedDB();
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
      addClient: (client) => setDB((prev) => ({ ...prev, clients: [...prev.clients, client] })),
      updateClient: (id, patch) =>
        setDB((prev) => ({
          ...prev,
          clients: prev.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      addVehicle: (vehicle) => setDB((prev) => ({ ...prev, vehicles: [...prev.vehicles, vehicle] })),
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
      addExpense: (e) => setDB((prev) => ({ ...prev, expenses: [e, ...prev.expenses] })),
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
