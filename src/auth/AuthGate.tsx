import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import Login from "../pages/Login";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { configured, ready, session } = useAuth();
  if (!ready) {
    return <div className="grid min-h-screen place-items-center bg-[var(--bg)] text-sm text-[var(--text-muted)]">Подключаем базу…</div>;
  }
  if (configured && !session) return <Login />;
  return children;
}
