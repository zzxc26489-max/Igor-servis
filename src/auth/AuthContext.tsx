import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  cloudConfigured,
  refreshCloudSession,
  signInWithPassword,
  signOutCloud,
  type CloudSession,
} from "../lib/cloud";
import { clearCloudDeviceData } from "../lib/cloudCache";

const SESSION_KEY = "igor-servis-cloud-session-v1";

function saveSession(session: CloudSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  // Старые версии держали refresh-token в localStorage. После первого запуска
  // на новой версии удаляем долговременную копию.
  localStorage.removeItem(SESSION_KEY);
}

function clearStoredSession() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}

interface AuthContextValue {
  configured: boolean;
  ready: boolean;
  session: CloudSession | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readSession(): CloudSession | null {
  try {
    const current = sessionStorage.getItem(SESSION_KEY);
    if (current) return JSON.parse(current) as CloudSession;

    // Однократная миграция с прежнего долговременного хранения.
    const legacy = localStorage.getItem(SESSION_KEY);
    if (!legacy) return null;
    const session = JSON.parse(legacy) as CloudSession;
    saveSession(session);
    return session;
  } catch {
    clearStoredSession();
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CloudSession | null>(() => cloudConfigured ? readSession() : null);
  const [ready, setReady] = useState(!cloudConfigured);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!cloudConfigured) {
      setReady(true);
      return;
    }
    let cancelled = false;
    const current = readSession();
    if (!current) {
      setReady(true);
      return;
    }
    const secondsLeft = current.expires_at - Math.floor(Date.now() / 1000);
    if (secondsLeft > 90) {
      setSession(current);
      setReady(true);
      return;
    }
    refreshCloudSession(current.refresh_token)
      .then((next) => {
        if (cancelled) return;
        saveSession(next);
        setSession(next);
      })
      .catch(() => {
        clearStoredSession();
        if (!cancelled) setSession(null);
      })
      .finally(() => !cancelled && setReady(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!cloudConfigured || !session) return;
    if (timer.current) window.clearTimeout(timer.current);
    const delay = Math.max(30_000, (session.expires_at * 1000) - Date.now() - 120_000);
    timer.current = window.setTimeout(async () => {
      try {
        const next = await refreshCloudSession(session.refresh_token);
        saveSession(next);
        setSession(next);
      } catch {
        clearStoredSession();
        setSession(null);
      }
    }, delay);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [session]);

  const value = useMemo<AuthContextValue>(() => ({
    configured: cloudConfigured,
    ready,
    session,
    signIn: async (email, password) => {
      const next = await signInWithPassword(email.trim(), password);
      saveSession(next);
      setSession(next);
      setReady(true);
    },
    signOut: async () => {
      const current = session;
      clearStoredSession();
      clearCloudDeviceData();
      setSession(null);
      if (current) await signOutCloud(current).catch(() => undefined);
    },
  }), [ready, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
