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
  PayrollComponent,
  Order,
  OrderStatus,
  WorkLineStatus,
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
  addCloudExpense,
  applyCloudOrderPayment,
  closeCloudCashShift,
  createCloudBackup,
  deleteCloudVehicle,
  confirmCloudSupplierRefund,
  createCloudOrder,
  deleteCloudOrder,
  listCloudAudit,
  listCloudBackups,
  loadCloudState,
  openCloudCashShift,
  payCloudEmployee,
  receiveCloudStock,
  releaseCloudOrderPart,
  restoreCloudBackup,
  returnCloudStockSupplier,
  reserveCloudStockPart,
  saveCloudService,
  saveCloudState,
  saveCloudVehicle,
  setCloudOrderStatus,
  updateCloudClient,
  type CloudAuditInfo,
  type CloudBackupInfo,
  type CloudRole,
} from "../lib/cloud";
import { mergeConcurrentStateDetailed } from "../lib/stateMerge";
import { hasLocalChanges, SERVER_POLL_MS, shouldApplyServerRevision, shouldSurfaceServerLoadError } from "../lib/serverSyncPolicy";
import { changedPatch, rebasePatch } from "../lib/entityPatch";
import { useAuth } from "../auth/AuthContext";
import { LOCAL_DB_KEY, readCloudBase, writeCloudBase } from "../lib/cloudCache";
import { isValidQuantity, normalizeQuantity } from "../lib/quantity";
import { activeCashShift, cashShiftSummary } from "../lib/cashShift";
import { transitionWorkSessions } from "../lib/workSessions";
import { completeWorksForReady, issueBlockers, orderedParts } from "../lib/orderIssue";
import { createBackupJson, inspectBackupJson } from "../lib/backup";
import { employeeWorkPercent } from "../lib/payroll";
import { APP_VERSION, DB_VERSION } from "../data/version";

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
    works: order.works.map((work) =>
      (order.status === "готово" || order.status === "выдан") && !work.workStatus
        ? { ...work, workStatus: "done" as const }
        : work,
    ),
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
      phone: db.company.phone && isValidPhone(db.company.phone) ? formatPhone(db.company.phone) : "",
      phoneLabel: db.company.phoneLabel?.trim() || "",
      phone2: db.company.phone2 && isValidPhone(db.company.phone2)
        ? formatPhone(db.company.phone2)
        : undefined,
      phone2Label: db.company.phone2Label?.trim() || undefined,
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
        company: {
          ...companySeed,
          ...parsed.company,
          phone: parsed.company?.phone ?? "",
          phoneLabel: parsed.company?.phoneLabel ?? "",
          phone2: parsed.company?.phone2,
          phone2Label: parsed.company?.phone2Label,
        },
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
  barcode?: string;
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

export interface CreateOrderEntryInput {
  client: Client;
  vehicle: Vehicle;
  order: Order;
  existingClientId?: string;
  existingVehicleId?: string;
}

export interface CreateOrderEntryResult {
  error: string | null;
  orderId: string;
  orderNumber?: string;
}

export type CloudSyncStatus = "local" | "loading" | "needs_upload" | "ready" | "saving" | "error";

export interface CloudSyncInfo {
  configured: boolean;
  status: CloudSyncStatus;
  workshopId?: string;
  workshopName?: string;
  role?: CloudRole;
  displayName?: string;
  revision?: number;
  lastSyncedAt?: string;
  error?: string;
  conflictCount?: number;
  lastConflictAt?: string;
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
  createOrderEntry: (input: CreateOrderEntryInput) => Promise<CreateOrderEntryResult>;
  updateOrder: (id: string, patch: Partial<Order>) => void;
  deleteOrder: (id: string) => Promise<string | null>;
  addClient: (client: Client) => void;
  updateClient: (id: string, patch: Partial<Client>) => Promise<string | null>;
  addVehicle: (vehicle: Vehicle) => Promise<string | null>;
  updateVehicle: (id: string, patch: Partial<Vehicle>) => Promise<string | null>;
  deleteVehicle: (id: string) => Promise<string | null>;
  addStockMovement: (m: StockMovement) => void;
  updateStockItem: (id: string, patch: Partial<StockItem>) => void;
  receiveStock: (input: ReceiveStockInput) => Promise<string | null>;
  addExpense: (e: Expense) => Promise<string | null>;
  updateCompany: (patch: Partial<CompanyInfo>) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  updateEmployee: (id: string, patch: Partial<Employee>) => void;
  addService: (service: Service) => Promise<string | null>;
  updateService: (id: string, patch: Partial<Service>) => Promise<string | null>;
  deleteService: (id: string) => Promise<string | null>;
  /** Смена статуса заказа: при выдаче списывает запчасти, при откате возвращает. */
  setOrderStatus: (id: string, status: OrderStatus, operationId?: string) => Promise<string | null>;
  /** Старт/пауза/завершение конкретной работы механика. */
  setWorkLineStatus: (orderId: string, workId: string, status: WorkLineStatus) => string | null;
  /** Добавить запчасть со склада в заказ (резерв, без списания остатка). */
  reservePart: (orderId: string, itemId: string, qty: number, price: number) => Promise<string | null>;
  /** Убрать запчасть из заказа и снять резерв. Выданный заказ менять нельзя. */
  releasePart: (orderId: string, partId: string) => Promise<string | null>;
  /** Принять одну или несколько частей оплаты; суммарно не больше долга. */
  acceptPayment: (
    orderId: string,
    parts: Array<{ amount: number; method: PaymentMethod }>,
    employee?: string,
  ) => Promise<string | null>;
  /** Вернуть клиенту ранее принятую оплату. */
  refundPayment: (
    orderId: string,
    amount: number,
    method: PaymentMethod,
    employee?: string,
  ) => Promise<string | null>;
  /** Возврат запчасти поставщику: списывает со склада и заводит ожидание денег. */
  returnToSupplier: (input: ReturnToSupplierInput) => Promise<string | null>;
  /** Деньги от поставщика пришли — возврат идёт в расчёты. */
  confirmRefund: (expenseId: string, method: PaymentMethod, operationId?: string) => Promise<string | null>;
  /** Выплата зарплаты сотруднику. */
  payEmployee: (employeeId: string, amount: number, note?: string, method?: PaymentMethod, component?: PayrollComponent, operationId?: string) => Promise<string | null>;
  /** Открыть кассовую смену. */
  openCashShift: (openingCash: number, openedBy: string) => Promise<string | null>;
  /** Закрыть кассовую смену после пересчёта наличных. */
  closeCashShift: (shiftId: string, countedCash: number, closedBy: string, comment?: string) => Promise<string | null>;
  resetToSeed: () => void;
  /** Резервная копия: весь справочник одним JSON. */
  exportDB: () => string;
  /** Восстановление из резервной копии; возвращает false, если файл не подошёл. */
  importDB: (json: string) => boolean;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const { configured: cloudConfigured, session } = useAuth();
  const [db, rawSetDB] = useState<DB>(() => {
    if (cloudConfigured && session) {
      const cached = readCloudBase<DB>(session.user.id);
      return cached ? migrate(cached.base) : loadInitial();
    }
    return loadInitial();
  });
  const dbRef = useRef(db);
  const cloudBaseRef = useRef<DB | null>(null);
  const cloudRevisionRef = useRef(0);
  const cloudSaveTimerRef = useRef<number | null>(null);
  const cloudRetryTimerRef = useRef<number | null>(null);
  const cloudLoadingKeyRef = useRef<string | null>(null);
  const cloudLoadRequestRef = useRef(0);
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
      const normalized = next.demo ? { ...next, demo: false } : next;
      dbRef.current = normalized;
      return normalized;
    });
  }, []);

  useEffect(() => {
    // До успешной инициализации облака не удаляем локальную базу:
    // она может быть единственной реальной копией, которую нужно загрузить в пустой Supabase.
    if (cloudConfigured) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }, [cloudConfigured, db]);

  const applyCloudSnapshot = useCallback((snapshot: Awaited<ReturnType<typeof loadCloudState>>) => {
    if (!session) return false;

    // Главное правило опроса: ревизия на устройстве никогда не движется назад.
    // Поздний ответ старого запроса просто игнорируем.
    if (!shouldApplyServerRevision({
      currentRevision: cloudRevisionRef.current,
      incomingRevision: snapshot.revision,
    })) return false;

    const meta = {
      configured: true,
      workshopId: snapshot.workshopId,
      workshopName: snapshot.workshopName,
      role: snapshot.role,
      displayName: snapshot.displayName,
      revision: snapshot.revision,
    } satisfies Partial<CloudSyncInfo>;

    if (snapshot.empty) {
      // Пустой сервер допустим только до первой серверной ревизии.
      if (cloudRevisionRef.current > 0) return false;
      cloudRevisionRef.current = snapshot.revision;
      cloudBaseRef.current = migrate(dbRef.current);
      setCloud((prev) => ({ ...prev, ...meta, status: "needs_upload", error: undefined } as CloudSyncInfo));
      return true;
    }

    const remote = migrate(snapshot.data as DB);
    const cached = readCloudBase<DB>(session.user.id);
    const base = cloudBaseRef.current ?? (cached ? migrate(cached.base) : null);
    const local = migrate(dbRef.current);
    const hasUnsavedLocal = hasLocalChanges(base, local);

    let next = remote;
    let conflicts = 0;
    if (hasUnsavedLocal && base) {
      const merged = mergeConcurrentStateDetailed(
        base as unknown as Record<string, unknown>,
        local as unknown as Record<string, unknown>,
        remote as unknown as Record<string, unknown>,
      );
      next = migrate(merged.value as unknown as DB);
      conflicts = merged.conflicts.length;
    }

    cloudRevisionRef.current = snapshot.revision;
    cloudBaseRef.current = remote;
    writeCloudBase(session.user.id, snapshot.revision, remote);
    localStorage.removeItem(STORAGE_KEY);
    rawSetDB(next);
    setCloud((prev) => ({
      ...prev,
      ...meta,
      status: "ready",
      lastSyncedAt: new Date().toISOString(),
      error: undefined,
      conflictCount: conflicts || prev.conflictCount,
      lastConflictAt: conflicts ? new Date().toISOString() : prev.lastConflictAt,
    } as CloudSyncInfo));
    return true;
  }, [session]);

  const applyConfirmedServerState = useCallback((
    result: { revision: number; data: unknown; updatedAt?: string },
  ) => {
    if (!session) return false;
    if (!shouldApplyServerRevision({
      currentRevision: cloudRevisionRef.current,
      incomingRevision: result.revision,
    })) return false;

    const remote = migrate(result.data as DB);
    const base = cloudBaseRef.current;
    const local = migrate(dbRef.current);

    let next = remote;
    let conflicts = 0;
    if (base && JSON.stringify(local) !== JSON.stringify(base)) {
      const merged = mergeConcurrentStateDetailed(
        base as unknown as Record<string, unknown>,
        local as unknown as Record<string, unknown>,
        remote as unknown as Record<string, unknown>,
      );
      next = migrate(merged.value as unknown as DB);
      conflicts = merged.conflicts.length;
    }

    cloudRevisionRef.current = result.revision;
    cloudBaseRef.current = remote;
    writeCloudBase(session.user.id, result.revision, remote);
    rawSetDB(next);
    setCloud((prev) => ({
      ...prev,
      status: "ready",
      revision: result.revision,
      lastSyncedAt: result.updatedAt ?? new Date().toISOString(),
      error: undefined,
      conflictCount: conflicts ? (prev.conflictCount ?? 0) + conflicts : prev.conflictCount,
      lastConflictAt: conflicts ? new Date().toISOString() : prev.lastConflictAt,
    }));
    return true;
  }, [session]);

  const loadFromCloud = useCallback(async (showLoading = true) => {
    if (!cloudConfigured || !session) return "Серверная база не подключена";
    const requestId = ++cloudLoadRequestRef.current;
    try {
      if (showLoading) {
        setCloud((prev) => ({ ...prev, configured: true, status: "loading", error: undefined }));
      }
      const snapshot = await loadCloudState(session);
      // Более старый запрос не должен менять интерфейс после более нового ответа.
      if (!shouldApplyServerRevision({
        currentRevision: cloudRevisionRef.current,
        incomingRevision: snapshot.revision,
        requestId,
        latestRequestId: cloudLoadRequestRef.current,
      })) return null;
      applyCloudSnapshot(snapshot);
      return null;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Не удалось загрузить общую базу";
      // Ошибка старого запроса не должна перекрыть состояние более свежей синхронизации.
      if (shouldSurfaceServerLoadError(requestId, cloudLoadRequestRef.current)) {
        setCloud((prev) => ({ ...prev, configured: true, status: "error", error: message }));
      }
      return message;
    }
  }, [applyCloudSnapshot, cloudConfigured, session]);

  useEffect(() => {
    if (!cloudConfigured || !session) {
      cloudLoadingKeyRef.current = null;
      cloudLoadRequestRef.current += 1;
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

  const pushCloudState = useCallback((candidate: DB, attempt = 0): Promise<string | null> => {
    async function push(nextCandidate: DB, nextAttempt: number): Promise<string | null> {
      if (!cloudConfigured || !session) return "Серверная база не подключена";
      try {
        if (cloudRetryTimerRef.current) {
          window.clearTimeout(cloudRetryTimerRef.current);
          cloudRetryTimerRef.current = null;
        }
        setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
        const result = await saveCloudState(session, cloudRevisionRef.current, nextCandidate);
        if (result.ok) {
          if (!shouldApplyServerRevision({
            currentRevision: cloudRevisionRef.current,
            incomingRevision: result.revision,
          })) return null;
          cloudRevisionRef.current = result.revision;
          cloudBaseRef.current = nextCandidate;
          writeCloudBase(session.user.id, result.revision, nextCandidate);
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
        const mergeResult = mergeConcurrentStateDetailed(
          base as unknown as Record<string, unknown>,
          nextCandidate as unknown as Record<string, unknown>,
          remote as unknown as Record<string, unknown>,
        );
        const merged = migrate(mergeResult.value as unknown as DB);
        cloudRevisionRef.current = Math.max(cloudRevisionRef.current, result.revision);
        cloudBaseRef.current = remote;
        writeCloudBase(session.user.id, result.revision, remote);
        rawSetDB(merged);
        if (mergeResult.conflicts.length) {
          setCloud((prev) => ({
            ...prev,
            conflictCount: (prev.conflictCount ?? 0) + mergeResult.conflicts.length,
            lastConflictAt: new Date().toISOString(),
          }));
        }

        if (nextAttempt >= 2) {
          const message = "Не удалось автоматически подтвердить все изменения после нескольких серверных ревизий. Обновите данные перед повторной правкой.";
          setCloud((prev) => ({ ...prev, status: "error", revision: result.revision, error: message }));
          return message;
        }
        return push(merged, nextAttempt + 1);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Не удалось сохранить данные на сервер";
        setCloud((prev) => ({
          ...prev,
          status: "error",
          error: `${message}. Изменения сохранены на устройстве, повторим автоматически.`,
        }));
        if (nextAttempt < 6) {
          const delay = Math.min(30_000, 1_000 * (2 ** nextAttempt));
          cloudRetryTimerRef.current = window.setTimeout(() => {
            void push(dbRef.current, nextAttempt + 1);
          }, delay);
        }
        return message;
      }
    }

    return push(candidate, attempt);
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
    }, SERVER_POLL_MS);
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
      localStorage.removeItem(STORAGE_KEY);
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
      createOrderEntry: async (input) => {
        const current = dbRef.current;
        const clientId = input.existingClientId || input.client.id;
        const vehicleId = input.existingVehicleId || input.vehicle.id;
        const orderId = input.order.id;

        if (cloudConfigured && session) {
          if (!navigator.onLine) {
            return {
              error: "Нет связи с сервером. Новую запись нужно создать онлайн, чтобы исключить дубли номеров и подъёмников.",
              orderId,
            };
          }

          const syncError = await pushCloudState(dbRef.current);
          if (syncError) {
            return { error: `Не удалось подтвердить актуальную базу: ${syncError}`, orderId };
          }

          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await createCloudOrder(session, {
              client: input.client,
              vehicle: input.vehicle,
              order: input.order,
              existingClientId: input.existingClientId,
              existingVehicleId: input.existingVehicleId,
            });

            applyConfirmedServerState(result);

            return result.ok
              ? { error: null, orderId: result.orderId, orderNumber: result.orderNumber }
              : { error: result.message, orderId };
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось создать заказ-наряд";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return { error: `Запись не создана: ${message}`, orderId };
          }
        }

        const lastOrderNumber = current.orders.reduce((max, item) => {
          const digits = Number(item.number.replace(/\D/g, ""));
          return Number.isNaN(digits) ? max : Math.max(max, digits);
        }, 0);
        const orderNumber = `№АИ-${String(lastOrderNumber + 1).padStart(4, "0")}`;
        const nextClient = input.existingClientId
          ? { ...current.clients.find((item) => item.id === clientId), ...input.client, id: clientId }
          : { ...input.client, id: clientId, code: nextCode(CODE_PREFIX.client, current.clients.map((item) => item.code)) };
        const nextVehicle = input.existingVehicleId
          ? { ...current.vehicles.find((item) => item.id === vehicleId), ...input.vehicle, id: vehicleId, clientId }
          : { ...input.vehicle, id: vehicleId, clientId, code: nextCode(CODE_PREFIX.vehicle, current.vehicles.map((item) => item.code)) };
        const nextOrder = { ...input.order, id: orderId, number: orderNumber, clientId, vehicleId };

        setDB((prev) => ({
          ...prev,
          clients: input.existingClientId
            ? prev.clients.map((item) => item.id === clientId ? nextClient as Client : item)
            : [...prev.clients, nextClient as Client],
          vehicles: input.existingVehicleId
            ? prev.vehicles.map((item) => item.id === vehicleId ? nextVehicle as Vehicle : item)
            : [...prev.vehicles, nextVehicle as Vehicle],
          orders: [...prev.orders, nextOrder],
        }));
        return { error: null, orderId, orderNumber };
      },
      updateOrder: (id, patch) =>
        setDB((prev) => ({
          ...prev,
          orders: prev.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)),
        })),
      deleteOrder: async (id) => {
        const current = dbRef.current.orders.find((item) => item.id === id);
        if (!current) return null;

        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Удаление заказа нужно подтвердить онлайн.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальный заказ: ${syncError}`;
          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await deleteCloudOrder(session, id);
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось удалить заказ";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return message;
          }
        }

        let error: string | null = null;
        setDB((prev) => {
          const order = prev.orders.find((item) => item.id === id);
          if (!order) return prev;
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
                  id: `delete-order:${id}:${part.id}`,
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
            stockMovements: [
              ...released.filter((movement) => !prev.stockMovements.some((item) => item.id === movement.id)),
              ...prev.stockMovements,
            ],
          };
        });
        return error;
      },
      addClient: (client) =>
        setDB((prev) => ({
          ...prev,
          clients: [...prev.clients, { ...client, code: client.code ?? nextCode(CODE_PREFIX.client, prev.clients.map((item) => item.code)) }],
        })),
      updateClient: async (id, patch) => {
        const current = dbRef.current.clients.find((item) => item.id === id);
        if (!current) return "Клиент не найден";
        const delta = changedPatch(current, patch);

        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Изменение клиента нужно подтвердить онлайн.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальную базу: ${syncError}`;
          const fresh = dbRef.current.clients.find((item) => item.id === id);
          if (!fresh) return "Клиент уже удалён на другом устройстве";
          const client = rebasePatch(fresh, delta);
          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await updateCloudClient(session, client);
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось сохранить клиента";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return message;
          }
        }

        const client = rebasePatch(current, delta);
        const phoneDigits = client.phone.replace(/\D/g, "");
        const duplicate = dbRef.current.clients.find(
          (item) => item.id !== id && item.phone.replace(/\D/g, "") === phoneDigits,
        );
        if (duplicate) return `Такой телефон уже указан у клиента ${duplicate.name}`;
        setDB((prev) => ({
          ...prev,
          clients: prev.clients.map((item) => item.id === id ? client : item),
        }));
        return null;
      },
      addVehicle: async (vehicle) => {
        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Автомобиль нужно сохранить онлайн, чтобы исключить дубли госномера/VIN.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальную базу: ${syncError}`;
          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await saveCloudVehicle(session, vehicle, true);
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось сохранить автомобиль";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return message;
          }
        }

        const plateKey = vehicle.plate.replace(/[\s-]/g, "").toUpperCase();
        const vinKey = vehicle.vin?.replace(/[\s-]/g, "").toUpperCase();
        const duplicate = dbRef.current.vehicles.find((item) =>
          item.plate.replace(/[\s-]/g, "").toUpperCase() === plateKey
          || (vinKey && item.vin?.replace(/[\s-]/g, "").toUpperCase() === vinKey)
        );
        if (duplicate) return `Автомобиль ${duplicate.plate} уже есть в базе`;

        setDB((prev) => ({
          ...prev,
          vehicles: [...prev.vehicles, { ...vehicle, code: vehicle.code ?? nextCode(CODE_PREFIX.vehicle, prev.vehicles.map((item) => item.code)) }],
        }));
        return null;
      },
      updateVehicle: async (id, patch) => {
        const current = dbRef.current.vehicles.find((item) => item.id === id);
        if (!current) return "Автомобиль не найден";
        const delta = changedPatch(current, patch);

        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Изменение автомобиля нужно подтвердить онлайн.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальную базу: ${syncError}`;
          const fresh = dbRef.current.vehicles.find((item) => item.id === id);
          if (!fresh) return "Автомобиль уже удалён на другом устройстве";
          const vehicle = { ...rebasePatch(fresh, delta), id, clientId: fresh.clientId };
          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await saveCloudVehicle(session, vehicle, false);
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось обновить автомобиль";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return message;
          }
        }

        const vehicle = { ...rebasePatch(current, delta), id, clientId: current.clientId };
        const plateKey = vehicle.plate.replace(/[\s-]/g, "").toUpperCase();
        const vinKey = vehicle.vin?.replace(/[\s-]/g, "").toUpperCase();
        const duplicate = dbRef.current.vehicles.find((item) =>
          item.id !== id && (
            item.plate.replace(/[\s-]/g, "").toUpperCase() === plateKey
            || (vinKey && item.vin?.replace(/[\s-]/g, "").toUpperCase() === vinKey)
          )
        );
        if (duplicate) return `Автомобиль ${duplicate.plate} уже есть в базе`;

        setDB((prev) => ({
          ...prev,
          vehicles: prev.vehicles.map((item) => item.id === id ? vehicle : item),
        }));
        return null;
      },
      deleteVehicle: async (id) => {
        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Удаление автомобиля нужно подтвердить онлайн.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальную базу: ${syncError}`;
          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await deleteCloudVehicle(session, id);
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось удалить автомобиль";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return message;
          }
        }

        if (dbRef.current.orders.some((order) => order.vehicleId === id)) {
          return "По этому автомобилю уже есть заказ-наряды, удалить его нельзя";
        }
        setDB((prev) => ({ ...prev, vehicles: prev.vehicles.filter((item) => item.id !== id) }));
        return null;
      },
      addStockMovement: (m) =>
        setDB((prev) => ({ ...prev, stockMovements: [m, ...prev.stockMovements] })),
      updateStockItem: (id, patch) =>
        setDB((prev) => ({
          ...prev,
          stock: prev.stock.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        })),
      addExpense: async (e) => {
        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Расход нужно подтвердить онлайн.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальные финансы: ${syncError}`;

          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await addCloudExpense(session, e);
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось добавить расход";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return message;
          }
        }

        let error: string | null = null;
        setDB((prev) => {
          if (prev.expenses.some((item) => item.id === e.id)) return prev;
          const shift = activeCashShift(prev.cashShifts);
          if (e.paymentMethod === "cash" && !shift) {
            error = "Для расхода наличными сначала откройте кассовую смену";
            return prev;
          }
          const expense = {
            ...e,
            code: e.code ?? nextCode(CODE_PREFIX.expense, prev.expenses.map((item) => item.code)),
            shiftId: e.shiftId ?? (e.paymentMethod && shift ? shift.id : undefined),
          };
          return { ...prev, expenses: [expense, ...prev.expenses] };
        });
        return error;
      },
      receiveStock: async (input) => {
        const receivedQty = normalizeQuantity(input.qty);
        if (!isValidQuantity(receivedQty)) return "Количество должно быть больше нуля";
        if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0 || input.unitPrice > 10_000_000) {
          return "Цена должна быть от 0 до 10 млн ₽";
        }

        const current = dbRef.current;
        const existing = input.itemId
          ? current.stock.find((item) => item.id === input.itemId)
          : current.stock.find((item) => item.sku.toLocaleLowerCase() === input.sku.toLocaleLowerCase());
        const itemId = existing?.id ?? createId("st");
        const itemCode = existing?.code ?? nextCode(CODE_PREFIX.stock, current.stock.map((item) => item.code));
        const movementId = createId("mv");
        const total = Math.round(receivedQty * input.unitPrice);
        const createExpense = input.createExpense && total > 0;
        const expenseId = createExpense ? createId("exp") : undefined;
        const expenseCode = createExpense
          ? nextCode(CODE_PREFIX.expense, current.expenses.map((item) => item.code))
          : undefined;

        if (cloudConfigured && session) {
          if (!navigator.onLine) {
            return "Нет связи с сервером. Приёмку склада нужно подтвердить онлайн.";
          }
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальный склад: ${syncError}`;

          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await receiveCloudStock(session, {
              item: {
                id: itemId,
                code: itemCode,
                name: input.name,
                sku: input.sku,
                barcode: input.barcode,
                brand: input.brand,
                category: input.category,
                unit: input.unit,
                minQty: input.minQty,
                cell: input.cell,
                supplier: input.supplier,
              },
              qty: receivedQty,
              unitPrice: input.unitPrice,
              movementId,
              expenseId,
              expenseCode,
              createExpense,
              expenseMethod: input.expenseMethod,
              employee: input.employee,
              note: input.note,
            });

            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось подтвердить приёмку";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return `Приёмка не проведена: ${message}`;
          }
        }

        let error: string | null = null;
        setDB((prev) => {
          const shift = activeCashShift(prev.cashShifts);
          if (createExpense && input.expenseMethod === "cash" && !shift) {
            error = "Для оплаты поставки наличными сначала откройте кассовую смену";
            return prev;
          }

          const localExisting = prev.stock.find((item) => item.id === itemId)
            ?? prev.stock.find((item) => item.sku.toLocaleLowerCase() === input.sku.toLocaleLowerCase());
          const occupied = input.cell
            ? prev.stock.find((item) => item.cell === input.cell && item.id !== localExisting?.id)
            : undefined;
          if (occupied) {
            error = `Ячейка ${input.cell} уже занята: ${occupied.name}`;
            return prev;
          }

          const now = nowISO();
          const localItemId = localExisting?.id ?? itemId;
          const nextStock = localExisting
            ? prev.stock.map((item) => {
                if (item.id !== localExisting.id) return item;
                const qty = normalizeQuantity(item.qty + receivedQty);
                const purchasePrice = input.unitPrice > 0 && qty > 0
                  ? Math.round((item.qty * item.purchasePrice + total) / qty)
                  : item.purchasePrice;
                const remainingOnOrder = Math.max(0, (item.onOrderQty ?? 0) - receivedQty);
                return {
                  ...item,
                  qty,
                  purchasePrice,
                  barcode: input.barcode || item.barcode,
                  brand: input.brand || item.brand,
                  category: input.category || item.category,
                  unit: input.unit || item.unit,
                  cell: input.cell || item.cell,
                  minQty: input.minQty,
                  supplier: input.supplier || item.supplier,
                  lastPurchasePrice: input.unitPrice > 0 ? input.unitPrice : item.lastPurchasePrice,
                  lastPurchaseAt: input.unitPrice > 0 ? now : item.lastPurchaseAt,
                  onOrderQty: remainingOnOrder > 0 ? remainingOnOrder : undefined,
                  supplyStatus: remainingOnOrder > 0 ? item.supplyStatus : undefined,
                  orderedAt: remainingOnOrder > 0 ? item.orderedAt : undefined,
                  expectedAt: remainingOnOrder > 0 ? item.expectedAt : undefined,
                };
              })
            : [
                ...prev.stock,
                {
                  id: localItemId,
                  code: itemCode,
                  name: input.name,
                  sku: input.sku,
                  barcode: input.barcode,
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
            id: movementId,
            date: now,
            itemId: localItemId,
            operation: "Приёмка",
            qty: receivedQty,
            to: input.cell,
            employee: input.employee,
            unitPrice: input.unitPrice,
            amount: total,
            note: input.note,
          };

          const expenses = createExpense && expenseId
            ? [
                {
                  id: expenseId,
                  code: expenseCode,
                  date: now.slice(0, 10),
                  category: "Закупка запчастей",
                  description: `Приёмка: ${input.name} — ${receivedQty} ${input.unit}`,
                  amount: total,
                  counterparty: input.supplier || "Поставщик",
                  status: "Оплачено" as const,
                  source: "stock_purchase" as const,
                  paymentMethod: input.expenseMethod,
                  shiftId: input.expenseMethod === "cash" ? shift?.id : undefined,
                  itemId: localItemId,
                },
                ...prev.expenses,
              ]
            : prev.expenses;

          return {
            ...prev,
            stock: nextStock,
            stockMovements: [movement, ...prev.stockMovements],
            expenses,
          };
        });
        return error;
      },
      updateCompany: (patch) => setDB((prev) => ({ ...prev, company: { ...prev.company, ...patch } })),
      updateSettings: (patch) => setDB((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } })),
      updateEmployee: (id, patch) =>
        setDB((prev) => ({
          ...prev,
          employees: prev.employees.map((employee) =>
            employee.id === id ? { ...employee, ...patch } : employee,
          ),
        })),
      addService: async (service) => {
        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Услугу нужно сохранить онлайн.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальный прайс: ${syncError}`;
          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await saveCloudService(session, service);
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось добавить услугу";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return message;
          }
        }
        const duplicate = dbRef.current.services.find(
          (item) =>
            item.name.trim().toLocaleLowerCase("ru-RU") === service.name.trim().toLocaleLowerCase("ru-RU")
            && item.category.trim().toLocaleLowerCase("ru-RU") === service.category.trim().toLocaleLowerCase("ru-RU"),
        );
        if (duplicate) return "Такая услуга уже есть в этой категории";
        setDB((prev) => ({ ...prev, services: [...prev.services, service] }));
        return null;
      },
      updateService: async (id, patch) => {
        const current = dbRef.current.services.find((item) => item.id === id);
        if (!current) return "Услуга уже удалена или не найдена";
        const delta = changedPatch(current, patch);

        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Изменение услуги нужно подтвердить онлайн.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальный прайс: ${syncError}`;
          const fresh = dbRef.current.services.find((item) => item.id === id);
          if (!fresh) return "Услуга уже удалена на другом устройстве";
          const service = { ...rebasePatch(fresh, delta), id };
          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await saveCloudService(session, service);
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось обновить услугу";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return message;
          }
        }

        const service = { ...rebasePatch(current, delta), id };
        const duplicate = dbRef.current.services.find(
          (item) =>
            item.id !== id
            && item.name.trim().toLocaleLowerCase("ru-RU") === service.name.trim().toLocaleLowerCase("ru-RU")
            && item.category.trim().toLocaleLowerCase("ru-RU") === service.category.trim().toLocaleLowerCase("ru-RU"),
        );
        if (duplicate) return "Такая услуга уже есть в этой категории";
        setDB((prev) => ({
          ...prev,
          services: prev.services.map((item) => item.id === id ? service : item),
        }));
        return null;
      },
      deleteService: async (id) => {
        const current = dbRef.current.services.find((item) => item.id === id);
        if (!current) return null;

        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Удаление услуги нужно подтвердить онлайн.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальный прайс: ${syncError}`;
          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await saveCloudService(session, current, true);
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось удалить услугу";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return message;
          }
        }

        setDB((prev) => ({ ...prev, services: prev.services.filter((item) => item.id !== id) }));
        return null;
      },
      setWorkLineStatus: (orderId, workId, status) => {
        let error: string | null = null;
        setDB((prev) => {
          const order = prev.orders.find((item) => item.id === orderId);
          if (!order) {
            error = "Заказ-наряд не найден";
            return prev;
          }
          if (order.status === "выдан") {
            error = "Выданный заказ менять нельзя";
            return prev;
          }
          const work = order.works.find((item) => item.id === workId);
          if (!work) {
            error = "Работа не найдена";
            return prev;
          }
          if (cloud.role === "mechanic" && work.executor !== cloud.displayName) {
            error = "Эта работа назначена другому механику";
            return prev;
          }

          const now = nowISO();
          const transition = transitionWorkSessions(work, status, now);
          const works = order.works.map((item) =>
            item.id === workId ? { ...item, ...transition } : item,
          );
          const nextOrderStatus =
            status === "in_progress" && (order.status === "запись" || order.status === "диагностика")
              ? "в работе"
              : order.status;

          let timeline = order.timeline?.length ? [...order.timeline] : backfillTimeline(order);
          if (nextOrderStatus !== order.status) {
            const last = timeline[timeline.length - 1];
            if (last?.status !== order.status) {
              timeline.push({
                status: order.status,
                at: last?.at ?? order.createdAt,
                actor: cloud.displayName || order.advisor || undefined,
              });
            }
            timeline.push({
              status: nextOrderStatus,
              at: now,
              actor: cloud.displayName || work.executor || order.advisor || undefined,
            });
          }

          return {
            ...prev,
            orders: prev.orders.map((item) =>
              item.id === orderId ? { ...item, works, status: nextOrderStatus, timeline } : item,
            ),
          };
        });
        return error;
      },
      setOrderStatus: async (id, status, operationId) => {
        const currentOrder = dbRef.current.orders.find((item) => item.id === id);
        if (!currentOrder) return "Заказ-наряд не найден";
        if (currentOrder.status === status) return null;

        if (cloudConfigured && session) {
          if (!navigator.onLine) {
            return "Нет связи с сервером. Смену статуса нужно подтвердить онлайн, чтобы исключить двойное списание склада.";
          }

          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальный заказ: ${syncError}`;

          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await setCloudOrderStatus(
              session,
              id,
              status,
              operationId ?? `status-${createId("op")}`,
            );
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось изменить статус";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return message;
          }
        }

        let error: string | null = null;
        setDB((prev) => {
          const order = prev.orders.find((item) => item.id === id);
          if (!order || order.status === status) return prev;

          const wasIssued = order.status === "выдан";
          const willIssue = status === "выдан";
          const now = nowISO();

          if (status === "готово") {
            const pending = orderedParts(order);
            if (pending.length > 0) {
              error = pending.length === 1
                ? `Нельзя завершить заказ: запчасть «${pending[0].name}» ещё заказана`
                : `Нельзя завершить заказ: ещё заказано запчастей — ${pending.length}`;
              return prev;
            }
          }

          if (willIssue) {
            const blockers = issueBlockers(order, prev.stock);
            if (blockers.length > 0) {
              error = blockers[0];
              return prev;
            }
          }

          // Пишем историю статусов: из неё считается фактическое время на подъёмнике.
          const history = order.timeline?.length ? order.timeline : backfillTimeline(order);
          const last = history[history.length - 1];
          // Если текущего статуса в истории нет, дописываем его: иначе отрезок
          // «на подъёмнике» не откроется и время потеряется.
          const actor = cloud.displayName || order.advisor || undefined;
          const timeline = last?.status === order.status
            ? [...history, { status, at: now, actor }]
            : [
                ...history,
                { status: order.status, at: last?.at ?? order.createdAt, actor },
                { status, at: now, actor },
              ];
          const patch: Partial<Order> = { status, timeline };
          if (status === "готово") {
            if (!order.completedAt) patch.completedAt = now;
            patch.works = completeWorksForReady(order.works, now);
          }
          if (status !== "готово" && status !== "выдан") patch.completedAt = undefined;
          if (willIssue) {
            patch.issuedAt = now;
            patch.issuedAtEstimated = false;
            patch.works = order.works.map((work) => {
              if (!work.executor || Number.isFinite(work.payrollPercent)) return work;
              const employee = prev.employees.find((item) => item.name === work.executor);
              return employee ? { ...work, payrollPercent: employeeWorkPercent(employee) } : work;
            });
          } else if (wasIssued) {
            patch.issuedAt = undefined;
            patch.issuedAtEstimated = undefined;
            patch.works = order.works.map(({ payrollPercent: _payrollPercent, ...work }) => work);
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
      reservePart: async (orderId, itemId, qty, price) => {
        const current = dbRef.current;
        const order = current.orders.find((entry) => entry.id === orderId);
        const item = current.stock.find((entry) => entry.id === itemId);
        if (!order || !item) return "Позиция не найдена";
        if (order.status === "выдан") {
          return "Выданный заказ нельзя изменять. Сначала верните автомобиль в работу.";
        }

        const normalizedQty = normalizeQuantity(qty);
        if (!isValidQuantity(normalizedQty)) return "Количество должно быть больше нуля";
        if (!Number.isFinite(price) || price <= 0 || price > 10_000_000) {
          return "Цена должна быть больше нуля и не более 10 млн ₽";
        }

        const reserved = reservedByItem(current.orders, current.stock).get(item.id) ?? 0;
        const available = item.qty - reserved;
        if (normalizedQty > available + 0.0001) {
          return `Свободно только ${available} ${item.unit}: ${reserved} уже в резерве`;
        }

        const partId = createId("part");
        const movementId = createId("mv");

        if (cloudConfigured && session) {
          if (!navigator.onLine) {
            return "Нет связи с сервером. Для резерва запчасти нужно подключение к интернету, чтобы исключить двойной резерв.";
          }

          // Сначала отправляем накопившиеся изменения, чтобы атомарный резерв
          // применялся к самой свежей версии общей базы.
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальный склад: ${syncError}`;

          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await reserveCloudStockPart(session, {
              orderId,
              itemId,
              qty: normalizedQty,
              price,
              partId,
              movementId,
            });

            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось подтвердить резерв на сервере";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return `Резерв не создан: ${message}`;
          }
        }

        // Локальный режим без Supabase сохраняет прежнее поведение.
        setDB((prev) => {
          const currentOrder = prev.orders.find((entry) => entry.id === orderId);
          const currentItem = prev.stock.find((entry) => entry.id === itemId);
          if (!currentOrder || !currentItem) return prev;

          const currentReserved = reservedByItem(prev.orders, prev.stock).get(currentItem.id) ?? 0;
          if (normalizedQty > currentItem.qty - currentReserved + 0.0001) return prev;

          const part = {
            id: partId,
            name: currentItem.name,
            sku: currentItem.sku,
            qty: normalizedQty,
            unit: currentItem.unit,
            price,
            purchasePrice: currentItem.purchasePrice,
            purchasePriceEstimated: false,
            availability: "reserved" as const,
          };
          return {
            ...prev,
            orders: prev.orders.map((entry) =>
              entry.id === orderId ? { ...entry, parts: [...entry.parts, part] } : entry,
            ),
            stockMovements: [
              {
                id: movementId,
                date: nowISO(),
                itemId: currentItem.id,
                operation: "Резерв" as const,
                qty: normalizedQty,
                from: currentItem.cell,
                employee: currentOrder.advisor || "—",
                note: `Заказ-наряд ${currentOrder.number}`,
              },
              ...prev.stockMovements,
            ],
          };
        });
        return null;
      },
      releasePart: async (orderId, partId) => {
        const currentOrder = dbRef.current.orders.find((item) => item.id === orderId);
        if (!currentOrder) return "Заказ-наряд не найден";
        const currentPart = currentOrder.parts.find((item) => item.id === partId);
        if (!currentPart) return null;

        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Снятие резерва нужно подтвердить онлайн.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальный заказ: ${syncError}`;
          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await releaseCloudOrderPart(session, orderId, partId);
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось снять резерв";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return message;
          }
        }

        let error: string | null = null;
        setDB((prev) => {
          const order = prev.orders.find((item) => item.id === orderId);
          const part = order?.parts.find((item) => item.id === partId);
          if (!order) {
            error = "Заказ-наряд не найден";
            return prev;
          }
          if (!part) return prev;
          if (order.status === "выдан") {
            error = "Выданный заказ нельзя изменять. Сначала верните автомобиль в работу.";
            return prev;
          }
          const item = prev.stock.find((entry) => entry.sku === part.sku);
          const movementId = `release-part:${orderId}:${partId}`;
          const movements = item && !prev.stockMovements.some((entry) => entry.id === movementId)
            ? [{
                id: movementId,
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
      acceptPayment: async (orderId, parts, employee) => {
        const current = dbRef.current;
        const order = current.orders.find((item) => item.id === orderId);
        if (!order) return "Заказ-наряд не найден";
        const normalized = parts
          .filter((part) => Number.isFinite(part.amount) && part.amount > 0)
          .map((part) => ({ ...part, amount: Math.round(part.amount), id: createId("pay") }));
        const total = normalized.reduce((sum, part) => sum + part.amount, 0);
        if (total <= 0) return "Укажите сумму хотя бы для одного способа оплаты";
        const debt = Math.max(0, orderTotals(order).debt);
        if (total > debt) return `Сумма оплаты больше долга на ${total - debt} ₽`;

        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Оплату нужно подтвердить онлайн, чтобы исключить двойное списание долга.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальный долг: ${syncError}`;
          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await applyCloudOrderPayment(session, orderId, "payment", normalized, employee);
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось подтвердить оплату";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return `Оплата не проведена: ${message}`;
          }
        }

        let error: string | null = null;
        setDB((prev) => {
          const localOrder = prev.orders.find((item) => item.id === orderId);
          if (!localOrder) { error = "Заказ-наряд не найден"; return prev; }
          const shift = activeCashShift(prev.cashShifts);
          if (normalized.some((part) => part.method === "cash") && !shift) {
            error = "Для оплаты наличными сначала откройте кассовую смену в Финансах → Касса";
            return prev;
          }
          const currentDebt = Math.max(0, orderTotals(localOrder).debt);
          if (total > currentDebt) { error = `Сумма оплаты больше долга на ${total - currentDebt} ₽`; return prev; }
          const at = nowISO();
          return {
            ...prev,
            orders: prev.orders.map((item) => item.id === orderId ? { ...item, paid: (item.paid ?? 0) + total } : item),
            payments: [
              ...normalized.map((part) => ({
                id: part.id, orderId, at, amount: part.amount, kind: "payment" as const, method: part.method,
                employee: employee?.trim() || localOrder.advisor || undefined, shiftId: shift?.id,
              })),
              ...prev.payments,
            ],
          };
        });
        return error;
      },
      refundPayment: async (orderId, amount, method, employee) => {
        const current = dbRef.current;
        const order = current.orders.find((item) => item.id === orderId);
        if (!order) return "Заказ-наряд не найден";
        const accepted = Math.round(amount);
        if (!Number.isFinite(accepted) || accepted <= 0) return "Сумма возврата должна быть больше нуля";
        const paid = Math.max(0, order.paid ?? 0);
        if (accepted > paid) return `Вернуть можно не больше уже оплаченных ${paid} ₽`;
        const entry = [{ id: createId("pay"), amount: accepted, method }];

        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Возврат нужно подтвердить онлайн.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальную оплату: ${syncError}`;
          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await applyCloudOrderPayment(session, orderId, "refund", entry, employee);
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось подтвердить возврат";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return `Возврат не проведён: ${message}`;
          }
        }

        let error: string | null = null;
        setDB((prev) => {
          const localOrder = prev.orders.find((item) => item.id === orderId);
          if (!localOrder) { error = "Заказ-наряд не найден"; return prev; }
          const shift = activeCashShift(prev.cashShifts);
          if (method === "cash" && !shift) { error = "Для возврата наличными сначала откройте кассовую смену в Финансах → Касса"; return prev; }
          const localPaid = Math.max(0, localOrder.paid ?? 0);
          if (accepted > localPaid) { error = `Вернуть можно не больше уже оплаченных ${localPaid} ₽`; return prev; }
          const at = nowISO();
          return {
            ...prev,
            orders: prev.orders.map((item) => item.id === orderId ? { ...item, paid: Math.max(0, localPaid - accepted) } : item),
            payments: [{
              id: entry[0].id, orderId, at, amount: accepted, kind: "refund" as const, method,
              employee: employee?.trim() || localOrder.advisor || undefined, shiftId: shift?.id,
            }, ...prev.payments],
          };
        });
        return error;
      },
      returnToSupplier: async (input) => {
        const current = dbRef.current;
        const item = current.stock.find((entry) => entry.id === input.itemId);
        if (!item) return "Складская позиция не найдена";
        const requestedQty = normalizeQuantity(input.qty);
        if (!isValidQuantity(requestedQty)) return "Количество должно быть больше нуля";

        const reserved = reservedByItem(current.orders, current.stock).get(item.id) ?? 0;
        const available = item.qty - reserved;
        if (requestedQty > available + 0.0001) {
          return `Свободно только ${available} ${item.unit}: ${reserved} уже в резерве`;
        }

        const movementId = createId("mv");
        const expenseId = createId("exp");
        const expenseCode = nextCode(CODE_PREFIX.expense, current.expenses.map((entry) => entry.code));

        if (cloudConfigured && session) {
          if (!navigator.onLine) {
            return "Нет связи с сервером. Возврат поставщику нужно подтвердить онлайн.";
          }
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальный склад: ${syncError}`;

          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await returnCloudStockSupplier(session, {
              itemId: item.id,
              qty: requestedQty,
              unitPrice: input.unitPrice,
              supplier: input.supplier,
              employee: input.employee,
              reason: input.reason,
              movementId,
              expenseId,
              expenseCode,
            });

            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось подтвердить возврат поставщику";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return `Возврат не проведён: ${message}`;
          }
        }

        let error: string | null = null;
        setDB((prev) => {
          const localItem = prev.stock.find((entry) => entry.id === input.itemId);
          if (!localItem) {
            error = "Складская позиция не найдена";
            return prev;
          }
          const localReserved = reservedByItem(prev.orders, prev.stock).get(localItem.id) ?? 0;
          const localAvailable = localItem.qty - localReserved;
          if (requestedQty > localAvailable + 0.0001) {
            error = `Свободно только ${localAvailable} ${localItem.unit}: ${localReserved} уже в резерве`;
            return prev;
          }

          const now = nowISO();
          const amount = Math.round(requestedQty * input.unitPrice);
          return {
            ...prev,
            stock: prev.stock.map((entry) =>
              entry.id === localItem.id
                ? { ...entry, qty: normalizeQuantity(entry.qty - requestedQty) }
                : entry,
            ),
            stockMovements: [
              {
                id: movementId,
                date: now,
                itemId: localItem.id,
                operation: "Возврат поставщику" as const,
                qty: requestedQty,
                from: localItem.cell,
                employee: input.employee,
                unitPrice: input.unitPrice,
                amount,
                note: input.reason,
              },
              ...prev.stockMovements,
            ],
            expenses: [
              {
                id: expenseId,
                code: expenseCode,
                date: now.slice(0, 10),
                category: "Возврат поставщику",
                description: `Возврат: ${localItem.name} — ${requestedQty} ${localItem.unit}`,
                amount,
                counterparty: input.supplier || localItem.supplier || "Поставщик",
                status: "Ждём возврат" as const,
                source: "supplier_refund" as const,
                itemId: localItem.id,
                comment: input.reason,
              },
              ...prev.expenses,
            ],
          };
        });
        return error;
      },
      confirmRefund: async (expenseId, method, operationId) => {
        const opId = operationId ?? `supplier-refund-${expenseId}`;

        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Возврат нужно подтвердить онлайн.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальные финансы: ${syncError}`;

          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await confirmCloudSupplierRefund(session, expenseId, method, opId);
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось подтвердить возврат";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return message;
          }
        }

        let error: string | null = null;
        setDB((prev) => {
          const shift = activeCashShift(prev.cashShifts);
          if (method === "cash" && !shift) {
            error = "Для возврата наличными сначала откройте кассовую смену";
            return prev;
          }
          const expense = prev.expenses.find((item) => item.id === expenseId);
          if (!expense || expense.source !== "supplier_refund") {
            error = "Возврат поставщика не найден";
            return prev;
          }
          if (expense.status === "Возвращено") return prev;
          return {
            ...prev,
            expenses: prev.expenses.map((item) =>
              item.id === expenseId
                ? {
                    ...item,
                    status: "Возвращено" as const,
                    refundConfirmedAt: nowISO(),
                    paymentMethod: method,
                    shiftId: method === "cash" ? shift?.id : undefined,
                  }
                : item,
            ),
          };
        });
        return error;
      },
      payEmployee: async (employeeId, amount, note, method, component, operationId) => {
        const currentEmployee = dbRef.current.employees.find((item) => item.id === employeeId);
        if (!currentEmployee) return "Сотрудник не найден";
        if (!method) return "Выберите способ выплаты";
        if (!Number.isFinite(amount) || amount <= 0) return "Сумма выплаты должна быть больше нуля";

        const resolvedComponent: PayrollComponent = component
          ?? (currentEmployee.payType === "salary" ? "salary" : "piecework");
        const expenseId = operationId ?? createId("exp");

        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Выплату нужно подтвердить онлайн.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальные начисления: ${syncError}`;

          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await payCloudEmployee(session, {
              employeeId,
              amount,
              method,
              component: resolvedComponent,
              expenseId,
              note,
            });
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось провести выплату";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return message;
          }
        }

        let error: string | null = null;
        setDB((prev) => {
          if (prev.expenses.some((entry) => entry.id === expenseId)) return prev;
          const shift = activeCashShift(prev.cashShifts);
          if (method === "cash" && !shift) {
            error = "Для выплаты наличными сначала откройте кассовую смену";
            return prev;
          }
          const employee = prev.employees.find((item) => item.id === employeeId);
          if (!employee) {
            error = "Сотрудник не найден";
            return prev;
          }
          const now = nowISO();
          const isPiecework = resolvedComponent === "piecework";
          return {
            ...prev,
            employees: prev.employees.map((item) => {
              if (item.id !== employeeId) return item;
              const nextPaid = isPiecework || item.payType === "salary" ? item.paid + amount : item.paid;
              return { ...item, paid: nextPaid, lastPaidAt: now };
            }),
            expenses: [
              {
                id: expenseId,
                code: nextCode(CODE_PREFIX.expense, prev.expenses.map((entry) => entry.code)),
                date: now.slice(0, 10),
                category: "Зарплата",
                description: isPiecework ? `Выплата %: ${employee.name}` : `Оклад: ${employee.name}`,
                amount,
                counterparty: employee.name,
                status: "Оплачено" as const,
                source: isPiecework ? ("payroll" as const) : undefined,
                paymentMethod: method,
                shiftId: method === "cash" ? shift?.id : undefined,
                employeeId,
                comment: note,
              },
              ...prev.expenses,
            ],
          };
        });
        return error;
      },
      openCashShift: async (openingCash, openedBy) => {
        const amount = Math.round(openingCash);
        if (!Number.isFinite(amount) || amount < 0) return "Начальный остаток не может быть отрицательным";
        const shiftId = createId("shift");

        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Кассовую смену нужно открыть онлайн.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальную кассу: ${syncError}`;
          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await openCloudCashShift(session, shiftId, amount, openedBy);
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось открыть кассовую смену";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return message;
          }
        }

        let error: string | null = null;
        setDB((prev) => {
          if (activeCashShift(prev.cashShifts)) {
            error = "Кассовая смена уже открыта";
            return prev;
          }
          const shift: CashShift = {
            id: shiftId,
            openedAt: nowISO(),
            openedBy: openedBy.trim() || "—",
            openingCash: amount,
          };
          return { ...prev, cashShifts: [shift, ...prev.cashShifts] };
        });
        return error;
      },
      closeCashShift: async (shiftId, countedCash, closedBy, comment) => {
        const counted = Math.round(countedCash);
        if (!Number.isFinite(counted) || counted < 0) return "Фактический остаток не может быть отрицательным";

        if (cloudConfigured && session) {
          if (!navigator.onLine) return "Нет связи с сервером. Кассовую смену нужно закрыть онлайн.";
          const syncError = await pushCloudState(dbRef.current);
          if (syncError) return `Не удалось подтвердить актуальную кассу: ${syncError}`;
          try {
            setCloud((prev) => ({ ...prev, status: "saving", error: undefined }));
            const result = await closeCloudCashShift(session, shiftId, counted, closedBy, comment);
            applyConfirmedServerState(result);
            return result.ok ? null : result.message;
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : "Не удалось закрыть кассовую смену";
            setCloud((prev) => ({ ...prev, status: "error", error: message }));
            return message;
          }
        }

        let error: string | null = null;
        setDB((prev) => {
          const shift = prev.cashShifts.find((item) => item.id === shiftId);
          if (!shift || shift.closedAt) {
            error = "Открытая кассовая смена не найдена";
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
      exportDB: () => createBackupJson(db as unknown as Record<string, unknown>, {
        appVersion: APP_VERSION,
        dbVersion: DB_VERSION,
      }),
      importDB: (json) => {
        const inspected = inspectBackupJson(json);
        if (!inspected) return false;
        try {
          const parsed = inspected.data as Partial<DB>;
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
    [applyConfirmedServerState, backupCloud, cloud, cloudConfigured, db, listAudit, listBackups, loadFromCloud, pushCloudState, restoreBackup, session, setDB, uploadLocalToCloud],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const ctx = useContext(AppStoreContext);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
