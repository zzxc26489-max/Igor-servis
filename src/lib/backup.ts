export const BACKUP_FORMAT = "igor-servis-backup";
export const BACKUP_FORMAT_VERSION = 1;

export interface BackupMeta {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  exportedAt: string;
  appVersion?: string;
  dbVersion?: string;
}

export interface BackupInspection {
  data: Record<string, unknown>;
  meta?: BackupMeta;
  legacy: boolean;
}

const CORE_ARRAYS = ["orders", "clients", "vehicles", "stock"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasCoreArrays(data: Record<string, unknown>) {
  return CORE_ARRAYS.every((key) => Array.isArray(data[key]));
}

export function createBackupJson(
  data: Record<string, unknown>,
  meta: Omit<BackupMeta, "format" | "formatVersion" | "exportedAt"> = {},
) {
  return JSON.stringify(
    {
      backup: {
        format: BACKUP_FORMAT,
        formatVersion: BACKUP_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        ...meta,
      },
      data,
    },
    null,
    2,
  );
}

export function inspectBackupJson(json: string): BackupInspection | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  if ("backup" in parsed || "data" in parsed) {
    if (!isRecord(parsed.backup) || !isRecord(parsed.data)) return null;
    if (parsed.backup.format !== BACKUP_FORMAT) return null;
    if (typeof parsed.backup.formatVersion !== "number") return null;
    if (parsed.backup.formatVersion > BACKUP_FORMAT_VERSION) return null;
    if (typeof parsed.backup.exportedAt !== "string") return null;
    if (!hasCoreArrays(parsed.data)) return null;

    return {
      data: parsed.data,
      meta: {
        format: BACKUP_FORMAT,
        formatVersion: parsed.backup.formatVersion,
        exportedAt: parsed.backup.exportedAt,
        appVersion: typeof parsed.backup.appVersion === "string" ? parsed.backup.appVersion : undefined,
        dbVersion: typeof parsed.backup.dbVersion === "string" ? parsed.backup.dbVersion : undefined,
      },
      legacy: false,
    };
  }

  if (!hasCoreArrays(parsed)) return null;
  return { data: parsed, legacy: true };
}

export function backupCounts(data: Record<string, unknown>) {
  const length = (key: string) => Array.isArray(data[key]) ? data[key].length : 0;
  return {
    orders: length("orders"),
    clients: length("clients"),
    vehicles: length("vehicles"),
    stock: length("stock"),
    expenses: length("expenses"),
    payments: length("payments"),
  };
}
