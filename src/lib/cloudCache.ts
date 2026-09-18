export const LOCAL_DB_KEY = "igor-servis-db-v1";
export const CLOUD_BASE_KEY = "igor-servis-cloud-base-v1";

export interface CloudBaseCache<T> {
  userId: string;
  revision: number;
  base: T;
  savedAt: string;
}

export function readCloudBase<T>(userId: string): CloudBaseCache<T> | null {
  try {
    const raw = localStorage.getItem(CLOUD_BASE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CloudBaseCache<T>;
    if (parsed.userId !== userId || !parsed.base || !Number.isFinite(parsed.revision)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCloudBase<T>(userId: string, revision: number, base: T) {
  const payload: CloudBaseCache<T> = {
    userId,
    revision,
    base,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(CLOUD_BASE_KEY, JSON.stringify(payload));
}

export function clearCloudDeviceData() {
  localStorage.removeItem(LOCAL_DB_KEY);
  localStorage.removeItem(CLOUD_BASE_KEY);
}
