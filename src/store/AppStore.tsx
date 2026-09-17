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
