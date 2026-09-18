import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  Client,
  AppSettings,
  CashShift,
  CompanyInfo,
  Employee,
  Expense,
  Invoice,
  Lift,
  Payment,
  PaymentMethod,
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
import { ensureLegacyPayments } from "../lib/payments";
import {
  createCloudBackup,
  listCloudAudit,
  listCloudBackups,
  loadCloudState,
  restoreCloudBackup,
  saveCloudState,
  type CloudAuditInfo,
  type CloudBackupInfo,
  type CloudRole,
} from "../lib/cloud";
import { mergeConcurrentState } from "../lib/stateMerge";
import { useAuth } from "../auth/AuthContext";
import { LOCAL_DB_KEY, readCloudBase, writeCloudBase } from "../lib/cloudCache";
import { isValidQuantity, normalizeQuantity } from "../lib/quantity";
import { activeCashShift, cashShiftSummary } from "../lib/cashShift";

const STORAGE_KEY = LOCAL_DB_KEY;

export const CODE_PREFIX = {
  client: "К",
  vehicle: "А",
  stock: "С",
  expense: "Р",
  order: "№АИ",
} as const;

export interface DB {
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
  payments: Payment[];
  cashShifts: CashShift[];
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
    payments: seed.payments,
    cashShifts: [],
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

  const orders = db.orders.map((order) => ({
    ...order,
    timeline: order.timeline?.length ? order.timeline : backfillTimeline(order),
    issuedAt: order.status === "выдан"
      ? (order.issuedAt ?? order.completedAt ?? (order.plannedAt ? `${order.plannedAt}T12:00:00` : order.createdAt))
      : order.issuedAt,
    issuedAtEstimated: order.status === "выдан" && !order.issuedAt ? true : order.issuedAtEstimated,
    workDayStart: order.workDayStart ?? hours.start,
    workDayEnd: order.workDayEnd ?? hours.end,
    workDayEstimated: order.workDayStart && order.workDayEnd ? order.workDayEstimated : true,
    parts: order.parts.map((part) => {
      const stockItem = db.stock.find((item) => item.sku === part.sku);
      const withUnit = part.unit ? part : { ...part, unit: stockItem?.unit };
      if (withUnit.purchasePrice !== undefined) {
        return { ...withUnit, purchasePriceEstimated: withUnit.purchasePriceEstimated ?? true };
      }
      return stockItem
        ? { ...withUnit, purchasePrice: stockItem.purchasePrice, purchasePriceEstimated: true }
        : withUnit;
    }),
  }));

  const payments = ensureLegacyPayments(Array.isArray(db.payments) ? db.payments : [], orders);

  return {
    ...db,
    cashShifts: Array.isArray(db.cashShifts) ? db.cashShifts : [],
    company: {
      ...db.company,
      // Старая маска-заглушка «+7 (___) ___-__-__» не проходила проверку и
      // не давала сохранить настройки — такой номер считаем незаполненным.
      phone: isValidPhone(db.company.phone) ? formatPhone(db.company.phone) : "",
      phone2: db.company.phone2 && isValidPhone(db.company.phone2) ? formatPhone(db.company.phone2) : undefined,
      logoDataUrl: typeof db.company.logoDataUrl === "string" && db.company.logoDataUrl.startsWith("data:image/")
        ? db.company.logoDataUrl
        : undefined,
      openTime: hours.start,
      closeTime: hours.end,
    },
    // Телефоны и номера приводим к единому виду: старые записи хранились как придётся.
    clients: withCodes(db.clients, CODE_PREFIX.client).map((client) => ({
      ...client,
      phone: formatPhone(client.phone) || client.phone,
      phone2: client.phone2 ? formatPhone(client.phone2) || client.phone2 : undefined,
    })),
    orders,
    payments,
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
  expenseMethod?: PaymentMethod;
}

export type CloudSyncStatus = "local" | "loading" | "needs_upload" | "ready" | "saving" | "error";

export interface CloudSyncInfo {
  configured: boolean;
  status: CloudSyncStatus;
  workshopName?: string;
  role?: CloudRole;
  displayName?: string;
  revision?: number;
  lastSyncedAt?: string;
  error?: string;
}

interface AppStoreValue extends DB {
  cloud: CloudSyncInfo;
  uploadLocalToCloud: () => Promise<string | null>;
  refreshFromCloud: () => Promise<string | null>;
  backupCloud: () => Promise<string | null>;
  listBackups: () => Promise<CloudBackupInfo[]>;
  listAudit: () => Promise<CloudAuditInfo[]>;
  restoreBackup: (backupId: string) => Promise<string | null>;
  setDB: React.Dispatch<React.SetStateAction<DB>>;
  updateOrder: (id: string, patch: Partial<Order>) => void;
  deleteOrder: (id: string) => string | null;
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
  setOrderStatus: (id: string, status: OrderStatus) => string | null;
  /** Добавить запчасть со склада в заказ (резерв, без списания остатка). */
  reservePart: (orderId: string, itemId: string, qty: number, price: number) => string | null;
  /** Убрать запчасть из заказа и снять резерв. Выданный заказ менять нельзя. */
  releasePart: (orderId: string, partId: string) => string | null;
  /** Принять одну или несколько частей оплаты; суммарно не больше долга. */
  acceptPayment: (
    orderId: string,
    parts: Array<{ amount: number; method: PaymentMethod }>,
    employee?: string,
  ) => string | null;
  /** Вернуть клиенту ранее принятую оплату. */
  refundPayment: (
    orderId: string,
    amount: number,
    method: PaymentMethod,
    employee?: string,
  ) => string | null;
  /** Возврат запчасти поставщику: списывает со склада и заводит ожидание денег. */
  returnToSupplier: (input: ReturnToSupplierInput) => void;
  /** Деньги от поставщика пришли — возврат идёт в расчёты. */
  confirmRefund: (expenseId: string, method: PaymentMethod) => void;
  /** Выплата зарплаты сотруднику. */
  payEmployee: (employeeId: string, amount: number, note?: string, method?: PaymentMethod) => void;
  /** Открыть кассовую смену. */
  openCashShift: (openingCash: number, openedBy: string) => string | null;
  /** Закрыть кассовую смену после пересчёта наличных. */
  closeCashShift: (shiftId: string, countedCash: number, closedBy: string, comment?: string) => string | null;
  resetToSeed: () => void;
  /** Резервная копия: весь справочник одним JSON. */
  exportDB: () => string;
  /** Восстановление из резервной копии; возвращает false, если файл не подошёл. */
  importDB: (json: string) => boolean;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const { configured: cloudConfigured, session } = useAuth();
  const [db, rawSetDB] = useState<DB>(loadInitial);
  const dbRef = useRef(db);
  const cloudBaseRef = useRef<DB | null>(null);
  const cloudRevisionRef = useRef(0);
  const cloudSaveTimerRef = useRef<number | null>(null);
  const cloudRetryTimerRef = useRef<number | null>(null);
  const cloudLoadingKeyRef = useRef<string | null>(null);
  const [cloud, setCloud] = useState<CloudSyncInfo>({
    configured: cloudConfigured,
    status: cloudConfigured ? "loading" : "local",
  });

  /**
   * Рабочие часы из настроек — единственный источник для расписания, поиска
   * свободных окон и учёта времени. Применяем до отрисовки дочерних страниц,
   * чтобы смена часов в настройках сразу меняла расписание.
   */
  setWorkDay({ start: db.company.openTime, end: db.company.closeTime });

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

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

  const applyCloudSnapshot = useCallback((snapshot: Awaited<ReturnType<typeof loadCloudState>>) => {
    if (!session) return;
    cloudRevisionRef.current = snapshot.revision;
    const meta = {
      configured: true,
      workshopName: snapshot.workshopName,
      role: snapshot.role,
      displayName: snapshot.displayName,
      revision: snapshot.revision,
    } satisfies Partial<CloudSyncInfo>;

    if (snapshot.empty) {
      cloudBaseRef.current = migrate(dbRef.current);
      setCloud({ ...meta, status: "needs_upload" } as CloudSyncInfo);
      return;
    }

    const remote = migrate(snapshot.data as DB);
    const cached = readCloudBase<DB>(session.user.id);
    const base = cloudBaseRef.current ?? (cached ? migrate(cached.base) : null);
    const local = migrate(dbRef.current);
    const hasUnsavedLocal = Boolean(base && JSON.stringify(local) !== JSON.stringify(base));
    const next = hasUnsavedLocal && base
      ? migrate(
          mergeConcurrentState(
            base as unknown as Record<string, unknown>,
            local as unknown as Record<string, unknown>,
            remote as unknown as Record<string, unknown>,
          ) as unknown as DB,
        )
      : remote;

    cloudBaseRef.current = remote;
    writeCloudBase(session.user.id, snapshot.revision, remote);
    rawSetDB(next);
    setCloud({ ...meta, status: "ready", lastSyncedAt: new Date().toISOString() } as CloudSyncInfo);
  }, [session]);

  const loadFromCloud = useCallback(async (showLoading = true) => {
    if (!cloudConfigured || !session) return "Серверная база не подключена";
    try {
      if (showLoading) {
        setCloud((prev) => ({ ...prev, configured: true, status: "loading", error: undefined }));
      }
      const snapshot = await loadCloudState(session);
      applyCloudSnapshot(snapshot);
      return null;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Не удалось загрузить общую базу";
      setCloud((prev) => ({ ...prev, configured: true, status: "error", error: message }));
      return message;
    }
  }, [applyCloudSnapshot, cloudConfigured, session]);

  useEffect(() => {
    if (!cloudConfigured || !session) {
      cloudLoadingKeyRef.current = null;
      cloudBaseRef.current = null;
      cloudRevisionRef.current = 0;
      setCloud({ configured: cloudConfigured, status: cloudConfigured ? "loading" : "local" });
      return;
    }
    const key = session.user.id;
    if (cloudLoadingKeyRef.current === key) return;
    cloudLoadingKeyRef.current = key;
    void loadFromCloud(true);
  }, [cloudConfigured, loadFromCloud, session]);

  const pushCloudState = useCallback(async (candidate: DB, attempt = 0): Promise<string | null> => {
    if (!cloudConfigured || !session) return "Серверная база не подключена";
    try {
      if (cloudRetryTimerRef.current) {
        window.clearTimeout(cloudRetryTimerRef.current);
        cloudRetryTimerRef.current = null;
      }
      setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
      const result = await saveCloudState(session, cloudRevisionRef.current, candidate);
      if (result.ok) {
        cloudRevisionRef.current = result.revision;
        cloudBaseRef.current = candidate;
        writeCloudBase(session.user.id, result.revision, candidate);
        setCloud((prev) => ({
          ...prev,
          status: "ready",
          revision: result.revision,
          lastSyncedAt: result.updatedAt ?? new Date().toISOString(),
          error: undefined,
        }));
        return null;
      }

      const remote = migrate(result.data as DB);
      const base = cloudBaseRef.current ?? remote;
      const merged = migrate(
        mergeConcurrentState(
          base as unknown as Record<string, unknown>,
          candidate as unknown as Record<string, unknown>,
          remote as unknown as Record<string, unknown>,
        ) as unknown as DB,
      );
      cloudRevisionRef.current = result.revision;
      cloudBaseRef.current = remote;
      writeCloudBase(session.user.id, result.revision, remote);
      rawSetDB(merged);

      if (attempt >= 2) {
        const message = "Одновременно изменились одни и те же данные. Обновите страницу и проверьте последние изменения.";
        setCloud((prev) => ({ ...prev, status: "error", revision: result.revision, error: message }));
        return message;
      }
      return pushCloudState(merged, attempt + 1);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Не удалось сохранить данные на сервер";
      setCloud((prev) => ({ ...prev, status: "error", error: `${message}. Изменения сохранены на устройстве, повторим автоматически.` }));
      if (attempt < 6) {
        const delay = Math.min(30_000, 1_000 * (2 ** attempt));
        cloudRetryTimerRef.current = window.setTimeout(() => {
          void pushCloudState(dbRef.current, attempt + 1);
        }, delay);
      }
      return message;
    }
  }, [cloudConfigured, session]);

  useEffect(() => {
    if (!cloudConfigured || !session || !cloudBaseRef.current) return;
    if (cloud.status === "loading" || cloud.status === "needs_upload" || cloud.status === "saving") return;
    if (JSON.stringify(db) === JSON.stringify(cloudBaseRef.current)) return;

    if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
    const candidate = db;
    cloudSaveTimerRef.current = window.setTimeout(() => {
      void pushCloudState(candidate);
    }, cloud.status === "error" ? 1_500 : 650);

    return () => {
      if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
    };
  }, [cloud.status, cloudConfigured, db, pushCloudState, session]);

  useEffect(() => {
    if (!cloudConfigured || !session) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible" || cloud.status === "saving") return;
      void loadFromCloud(false);
    }, 45_000);
    return () => window.clearInterval(interval);
  }, [cloud.status, cloudConfigured, loadFromCloud, session]);

  useEffect(() => {
    if (!cloudConfigured || !session) return;
    const handleOnline = () => {
      const dirty = Boolean(cloudBaseRef.current && JSON.stringify(dbRef.current) !== JSON.stringify(cloudBaseRef.current));
      if (dirty) void pushCloudState(dbRef.current);
      else void loadFromCloud(false);
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [cloudConfigured, loadFromCloud, pushCloudState, session]);

  useEffect(() => {
    if (!cloudConfigured || !session) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const dirty = Boolean(cloudBaseRef.current && JSON.stringify(dbRef.current) !== JSON.stringify(cloudBaseRef.current));
      if (!dirty && cloud.status !== "saving" && cloud.status !== "error") return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [cloud.status, cloudConfigured, session]);

  const uploadLocalToCloud = useCallback(async () => {
    if (!cloudConfigured || !session) return "Серверная база не подключена";
    if (cloud.status !== "needs_upload") return "Серверная база уже инициализирована";
    const error = await pushCloudState(dbRef.current);
    if (!error) {
      cloudBaseRef.current = dbRef.current;
      writeCloudBase(session.user.id, cloudRevisionRef.current, dbRef.current);
      setCloud((prev) => ({ ...prev, status: "ready", lastSyncedAt: new Date().toISOString() }));
    }
    return error;
  }, [cloud.status, cloudConfigured, pushCloudState, session]);

  const backupCloud = useCallback(async () => {
    if (!cloudConfigured || !session) return "Серверная база не подключена";
    try {
      await createCloudBackup(session);
      return null;
    } catch (cause) {
      return cause instanceof Error ? cause.message : "Не удалось создать серверную копию";
    }
  }, [cloudConfigured, session]);

  const listBackups = useCallback(async () => {
    if (!cloudConfigured || !session) return [];
    return listCloudBackups(session);
  }, [cloudConfigured, session]);

  const listAudit = useCallback(async () => {
    if (!cloudConfigured || !session) return [];
    return listCloudAudit(session);
  }, [cloudConfigured, session]);

  const restoreBackup = useCallback(async (backupId: string) => {
    if (!cloudConfigured || !session) return "Серверная база не подключена";
    try {
      await restoreCloudBackup(session, backupId);
      const snapshot = await loadCloudState(session);
      cloudRevisionRef.current = snapshot.revision;
      const remote = migrate(snapshot.data as DB);
      cloudBaseRef.current = remote;
      writeCloudBase(session.user.id, snapshot.revision, remote);
      rawSetDB(remote);
      setCloud((prev) => ({
        ...prev,
        status: "ready",
        revision: snapshot.revision,
        lastSyncedAt: new Date().toISOString(),
        error: undefined,
      }));
      return null;
    } catch (cause) {
      return cause instanceof Error ? cause.message : "Не удалось восстановить резервную копию";
    }
  }, [cloudConfigured, session]);

  const value = useMemo<AppStoreValue>(
    () => ({
      ...db,
      cloud,
      uploadLocalToCloud,
      refreshFromCloud: () => loadFromCloud(true),
      backupCloud,
      listBackups,
      listAudit,
      restoreBackup,
      setDB,
      updateOrder: (id, patch) =>
        setDB((prev) => ({
          ...prev,
          orders: prev.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)),
        })),
      deleteOrder: (id) => {
        let error: string | null = null;
        setDB((prev) => {
          const order = prev.orders.find((item) => item.id === id);
          if (!order) {
            error = "Заказ-наряд не найден";
            return prev;
          }
          if (order.status === "выдан") {
            error = "Выданный заказ нельзя удалить. История склада и денег должна сохраниться.";
            return prev;
          }
          if ((order.paid ?? 0) > 0 || prev.payments.some((payment) => payment.orderId === id)) {
            error = "Заказ с оплатами нельзя удалить — история денег должна сохраниться.";
            return prev;
          }
          const released: StockMovement[] = order.parts.flatMap((part) => {
            const item = prev.stock.find((entry) => entry.sku === part.sku);
            return item
              ? [{
                  id: createId("mv"),
                  date: nowISO(),
                  itemId: item.id,
                  operation: "Снят резерв" as const,
                  qty: part.qty,
                  to: item.cell,
                  employee: order.advisor || "—",
                  note: `Заказ ${order.number} удалён, резерв снят`,
                }]
              : [];
          });
          return {
            ...prev,
            orders: prev.orders.filter((item) => item.id !== id),
            stockMovements: [...released, ...prev.stockMovements],
          };
        });
        return error;
      },
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
        setDB((prev) => {
          const shift = activeCashShift(prev.cashShifts);
          const expense = {
            ...e,
            code: e.code ?? nextCode(CODE_PREFIX.expense, prev.expenses.map((item) => item.code)),
            shiftId: e.shiftId ?? (e.paymentMethod && shift ? shift.id : undefined),
          };
          return { ...prev, expenses: [expense, ...prev.expenses] };
        }),
      receiveStock: (input) =>
        setDB((prev) => {
          const stamp = Date.now();
          const now = nowISO();
          const receivedQty = normalizeQuantity(input.qty);
          if (!isValidQuantity(receivedQty)) return prev;
          const total = Math.round(receivedQty * input.unitPrice);
          const existing = input.itemId ? prev.stock.find((item) => item.id === input.itemId) : undefined;
          const itemId = existing?.id ?? `st-${stamp}`;

          // Средневзвешенная закупочная цена: старый остаток по старой цене плюс новый приход.
          const nextStock = existing
            ? prev.stock.map((item) => {
                if (item.id !== existing.id) return item;
                const qty = normalizeQuantity(item.qty + receivedQty);
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
                  qty: receivedQty,
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
            qty: receivedQty,
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
                  description: `Приёмка: ${input.name} — ${receivedQty} ${input.unit}`,
                  amount: total,
                  counterparty: input.supplier || "Поставщик",
                  status: "Оплачено" as const,
                  source: "stock_purchase" as const,
                  paymentMethod: input.expenseMethod,
                  shiftId: input.expenseMethod && activeCashShift(prev.cashShifts)?.id,
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
      setOrderStatus: (id, status) => {
        let error: string | null = null;
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
          if (willIssue) {
            patch.issuedAt = now;
            patch.issuedAtEstimated = false;
          } else if (wasIssued) {
            patch.issuedAt = undefined;
            patch.issuedAtEstimated = undefined;
          }

          const orders = prev.orders.map((item) => (item.id === id ? { ...item, ...patch } : item));

          // Запчасти уходят со склада в момент выдачи и возвращаются, если выдачу откатили.
          if (wasIssued === willIssue) return { ...prev, orders };

          if (willIssue) {
            for (const part of order.parts) {
              const item = prev.stock.find((entry) => entry.sku === part.sku);
              if (!item) continue;
              if (part.qty > item.qty + 0.0001) {
                error = `Недостаточно «${item.name}»: на складе ${item.qty} ${item.unit}, в заказе ${part.qty} ${part.unit ?? item.unit}`;
                return prev;
              }
            }
          }

          const sign = willIssue ? -1 : 1;
          const stock = [...prev.stock];
          const movements: StockMovement[] = [];
          for (const part of order.parts) {
            const index = stock.findIndex((item) => item.sku === part.sku);
            if (index < 0) continue;
            const item = stock[index];
            stock[index] = { ...item, qty: normalizeQuantity(item.qty + sign * part.qty) };
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
        });
        return error;
      },
      reservePart: (orderId, itemId, qty, price) => {
        let error: string | null = null;
        setDB((prev) => {
          const order = prev.orders.find((item) => item.id === orderId);
          const item = prev.stock.find((entry) => entry.id === itemId);
          if (!order || !item) {
            error = "Позиция не найдена";
            return prev;
          }
          if (order.status === "выдан") {
            error = "Выданный заказ нельзя изменять. Сначала верните автомобиль в работу.";
            return prev;
          }
          const normalizedQty = normalizeQuantity(qty);
          if (!isValidQuantity(normalizedQty)) {
            error = "Количество должно быть больше нуля";
            return prev;
          }
          if (!Number.isFinite(price) || price <= 0 || price > 10_000_000) {
            error = "Цена должна быть больше нуля и не более 10 млн ₽";
            return prev;
          }
          const reserved = reservedByItem(prev.orders, prev.stock).get(item.id) ?? 0;
          const available = item.qty - reserved;
          if (normalizedQty > available + 0.0001) {
            error = `Свободно только ${available} ${item.unit}: ${reserved} уже в резерве`;
            return prev;
          }
          const part = {
            id: createId("part"),
            name: item.name,
            sku: item.sku,
            qty: normalizedQty,
            unit: item.unit,
            price,
            purchasePrice: item.purchasePrice,
            purchasePriceEstimated: false,
            availability: "reserved" as const,
          };
          return {
            ...prev,
            orders: prev.orders.map((entry) => (entry.id === orderId ? { ...entry, parts: [...entry.parts, part] } : entry)),
            stockMovements: [
              {
                id: createId("mv"),
                date: nowISO(),
                itemId: item.id,
                operation: "Резерв" as const,
                qty: normalizedQty,
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
      releasePart: (orderId, partId) => {
        let error: string | null = null;
        setDB((prev) => {
          const order = prev.orders.find((item) => item.id === orderId);
          const part = order?.parts.find((item) => item.id === partId);
          if (!order || !part) {
            error = "Запчасть в заказе не найдена";
            return prev;
          }
          if (order.status === "выдан") {
            error = "Выданный заказ нельзя изменять. Сначала верните автомобиль в работу.";
            return prev;
          }
          const item = prev.stock.find((entry) => entry.sku === part.sku);
          const movements = item
            ? [{
                id: createId("mv"),
                date: nowISO(),
                itemId: item.id,
                operation: "Снят резерв" as const,
                qty: part.qty,
                to: item.cell,
                employee: order.advisor || "—",
                note: `Снят резерв по заказу ${order.number}`,
              }, ...prev.stockMovements]
            : prev.stockMovements;
          return {
            ...prev,
            stockMovements: movements,
            orders: prev.orders.map((entry) =>
              entry.id === orderId ? { ...entry, parts: entry.parts.filter((item) => item.id !== partId) } : entry,
            ),
          };
        });
        return error;
      },
      acceptPayment: (orderId, parts, employee) => {
        let error: string | null = null;
        setDB((prev) => {
          const order = prev.orders.find((item) => item.id === orderId);
          if (!order) {
            error = "Заказ-наряд не найден";
            return prev;
          }
          const normalized = parts
            .filter((part) => Number.isFinite(part.amount) && part.amount > 0)
            .map((part) => ({ ...part, amount: Math.round(part.amount) }));
          const total = normalized.reduce((sum, part) => sum + part.amount, 0);
          const shift = activeCashShift(prev.cashShifts);
          if (normalized.some((part) => part.method === "cash") && !shift) {
            error = "Для оплаты наличными сначала откройте кассовую смену в Финансах → Касса";
            return prev;
          }
          if (total <= 0) {
            error = "Укажите сумму хотя бы для одного способа оплаты";
            return prev;
          }
          const debt = Math.max(0, orderTotals(order).debt);
          if (total > debt) {
            error = `Сумма оплаты больше долга на ${total - debt} ₽`;
            return prev;
          }
          const at = nowISO();
          const shiftId = shift?.id;
          return {
            ...prev,
            orders: prev.orders.map((item) =>
              item.id === orderId ? { ...item, paid: (item.paid ?? 0) + total } : item,
            ),
            payments: [
              ...normalized.map((part) => ({
                id: createId("pay"),
                orderId,
                at,
                amount: part.amount,
                kind: "payment" as const,
                method: part.method,
                employee: employee?.trim() || order.advisor || undefined,
                shiftId,
              })),
              ...prev.payments,
            ],
          };
        });
        return error;
      },
      refundPayment: (orderId, amount, method, employee) => {
        let error: string | null = null;
        setDB((prev) => {
          const order = prev.orders.find((item) => item.id === orderId);
          if (!order) {
            error = "Заказ-наряд не найден";
            return prev;
          }
          const accepted = Math.round(amount);
          const shift = activeCashShift(prev.cashShifts);
          if (method === "cash" && !shift) {
            error = "Для возврата наличными сначала откройте кассовую смену в Финансах → Касса";
            return prev;
          }
          if (!Number.isFinite(accepted) || accepted <= 0) {
            error = "Сумма возврата должна быть больше нуля";
            return prev;
          }
          const paid = Math.max(0, order.paid ?? 0);
          if (accepted > paid) {
            error = `Вернуть можно не больше уже оплаченных ${paid} ₽`;
            return prev;
          }
          const at = nowISO();
          const shiftId = shift?.id;
          return {
            ...prev,
            orders: prev.orders.map((item) =>
              item.id === orderId ? { ...item, paid: Math.max(0, paid - accepted) } : item,
            ),
            payments: [
              {
                id: createId("pay"),
                orderId,
                at,
                amount: accepted,
                kind: "refund" as const,
                method,
                employee: employee?.trim() || order.advisor || undefined,
                shiftId,
              },
              ...prev.payments,
            ],
          };
        });
        return error;
      },
      returnToSupplier: (input) =>
        setDB((prev) => {
          const item = prev.stock.find((entry) => entry.id === input.itemId);
          if (!item || input.qty <= 0) return prev;
          const reserved = reservedByItem(prev.orders, prev.stock).get(item.id) ?? 0;
          const qty = Math.min(input.qty, item.qty - reserved);
          if (qty <= 0) return prev;
          const now = nowISO();
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
      confirmRefund: (expenseId, method) =>
        setDB((prev) => {
          const shift = activeCashShift(prev.cashShifts);
          return {
            ...prev,
            expenses: prev.expenses.map((expense) =>
              expense.id === expenseId && expense.source === "supplier_refund" && expense.status !== "Возвращено"
                ? {
                    ...expense,
                    status: "Возвращено" as const,
                    refundConfirmedAt: nowISO(),
                    paymentMethod: method,
                    shiftId: shift ? shift.id : undefined,
                  }
                : expense,
            ),
          };
        }),
      payEmployee: (employeeId, amount, note, method) =>
        setDB((prev) => {
          const employee = prev.employees.find((item) => item.id === employeeId);
          if (!employee || amount <= 0) return prev;
          const now = nowISO();
          const sdelnaya = employee.payType !== "salary";
          const shift = activeCashShift(prev.cashShifts);
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
                paymentMethod: method,
                shiftId: method && shift ? shift.id : undefined,
                employeeId,
                comment: note,
              },
              ...prev.expenses,
            ],
          };
        }),
      openCashShift: (openingCash, openedBy) => {
        let error: string | null = null;
        setDB((prev) => {
          if (activeCashShift(prev.cashShifts)) {
            error = "Кассовая смена уже открыта";
            return prev;
          }
          const amount = Math.round(openingCash);
          if (!Number.isFinite(amount) || amount < 0) {
            error = "Начальный остаток не может быть отрицательным";
            return prev;
          }
          const shift: CashShift = {
            id: createId("shift"),
            openedAt: nowISO(),
            openedBy: openedBy.trim() || "—",
            openingCash: amount,
          };
          return { ...prev, cashShifts: [shift, ...prev.cashShifts] };
        });
        return error;
      },
      closeCashShift: (shiftId, countedCash, closedBy, comment) => {
        let error: string | null = null;
        setDB((prev) => {
          const shift = prev.cashShifts.find((item) => item.id === shiftId);
          if (!shift || shift.closedAt) {
            error = "Открытая кассовая смена не найдена";
            return prev;
          }
          const counted = Math.round(countedCash);
          if (!Number.isFinite(counted) || counted < 0) {
            error = "Фактический остаток не может быть отрицательным";
            return prev;
          }
          const summary = cashShiftSummary(shift, prev.payments, prev.expenses);
          const difference = counted - summary.expectedCash;
          if (difference !== 0 && !comment?.trim()) {
            error = "При расхождении нужен комментарий";
            return prev;
          }
          return {
            ...prev,
            cashShifts: prev.cashShifts.map((item) =>
              item.id === shiftId
                ? {
                    ...item,
                    closedAt: nowISO(),
                    closedBy: closedBy.trim() || "—",
                    countedCash: counted,
                    comment: comment?.trim() || undefined,
                  }
                : item,
            ),
          };
        });
        return error;
      },
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
    [backupCloud, cloud, db, listAudit, listBackups, loadFromCloud, restoreBackup, setDB, uploadLocalToCloud],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
