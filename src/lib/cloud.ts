export type CloudRole = "owner" | "partner" | "advisor" | "parts" | "mechanic" | "accountant";

export interface CloudUser {
  id: string;
  email?: string;
}

export interface CloudSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  user: CloudUser;
}

export interface CloudSnapshot {
  ok: boolean;
  workshopId: string;
  workshopName: string;
  role: CloudRole;
  displayName: string;
  revision: number;
  empty: boolean;
  data: unknown;
}

export interface CloudBackupInfo {
  id: string;
  revision: number;
  createdAt: string;
  createdBy: string;
  reason: "automatic" | "manual" | "before_restore" | string;
}

export interface CloudAuditInfo {
  id: number;
  actorName: string;
  action: string;
  revision?: number;
  changedSections: string[];
  createdAt: string;
}

export type CloudSaveResult =
  | { ok: true; revision: number; updatedAt?: string }
  | { ok: false; conflict: true; revision: number; data: unknown };

const rawUrl = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const cloudConfigured = Boolean(rawUrl && anonKey);

async function request(path: string, init: RequestInit = {}, accessToken?: string) {
  if (!cloudConfigured) throw new Error("Серверная база не настроена");
  const headers = new Headers(init.headers);
  headers.set("apikey", anonKey);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${rawUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { msg?: string; message?: string; error_description?: string } | null;
    throw new Error(body?.msg || body?.message || body?.error_description || `Ошибка сервера: ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function normalizeSession(payload: Record<string, unknown>): CloudSession {
  const expiresIn = Number(payload.expires_in ?? 3600);
  const expiresAt = Number(payload.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn);
  return {
    access_token: String(payload.access_token ?? ""),
    refresh_token: String(payload.refresh_token ?? ""),
    expires_at: expiresAt,
    token_type: String(payload.token_type ?? "bearer"),
    user: (payload.user ?? {}) as CloudUser,
  };
}

export async function signInWithPassword(email: string, password: string): Promise<CloudSession> {
  const payload = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }) as Record<string, unknown>;
  return normalizeSession(payload);
}

export async function refreshCloudSession(refreshToken: string): Promise<CloudSession> {
  const payload = await request("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  }) as Record<string, unknown>;
  return normalizeSession(payload);
}

export async function signOutCloud(session: CloudSession) {
  await request("/auth/v1/logout", { method: "POST", body: "{}" }, session.access_token);
}

export async function loadCloudState(session: CloudSession): Promise<CloudSnapshot> {
  return request(
    "/rest/v1/rpc/crm_load_state",
    { method: "POST", body: "{}" },
    session.access_token,
  ) as Promise<CloudSnapshot>;
}

export async function saveCloudState(
  session: CloudSession,
  expectedRevision: number,
  data: unknown,
): Promise<CloudSaveResult> {
  return request(
    "/rest/v1/rpc/crm_save_state",
    {
      method: "POST",
      body: JSON.stringify({ p_expected_revision: expectedRevision, p_data: data }),
    },
    session.access_token,
  ) as Promise<CloudSaveResult>;
}

export async function createCloudBackup(session: CloudSession): Promise<{ ok: true; createdAt: string }> {
  return request(
    "/rest/v1/rpc/crm_backup_now",
    { method: "POST", body: "{}" },
    session.access_token,
  ) as Promise<{ ok: true; createdAt: string }>;
}


export async function listCloudBackups(session: CloudSession, limit = 20): Promise<CloudBackupInfo[]> {
  return request(
    "/rest/v1/rpc/crm_list_backups",
    { method: "POST", body: JSON.stringify({ p_limit: limit }) },
    session.access_token,
  ) as Promise<CloudBackupInfo[]>;
}

export async function listCloudAudit(session: CloudSession, limit = 50): Promise<CloudAuditInfo[]> {
  return request(
    "/rest/v1/rpc/crm_list_audit",
    { method: "POST", body: JSON.stringify({ p_limit: limit }) },
    session.access_token,
  ) as Promise<CloudAuditInfo[]>;
}

export async function restoreCloudBackup(
  session: CloudSession,
  backupId: string,
): Promise<{ ok: true; revision: number; updatedAt?: string }> {
  return request(
    "/rest/v1/rpc/crm_restore_backup",
    { method: "POST", body: JSON.stringify({ p_backup_id: backupId }) },
    session.access_token,
  ) as Promise<{ ok: true; revision: number; updatedAt?: string }>;
}
