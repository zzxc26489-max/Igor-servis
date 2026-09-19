import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { Button, Modal } from "./ui";

export interface ConfirmRow {
  label: string;
  value: ReactNode;
  /** Итоговая строка выделяется жирным и отделяется чертой. */
  total?: boolean;
  tone?: "accent" | "danger";
}

export interface ConfirmRequest {
  title: string;
  /** Одна строка о том, что произойдёт. */
  question: string;
  /** Выжимка по изменениям: что именно запишется в базу. */
  summary?: ConfirmRow[];
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type Resolver = (value: boolean) => void;

const ConfirmContext = createContext<((request: ConfirmRequest) => Promise<boolean>) | null>(null);

/**
 * Подтверждение важных операций: деньги, склад, удаление.
 * Перед записью в базу показываем короткую выжимку изменений.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<Resolver | null>(null);

  const confirm = useCallback((next: ConfirmRequest) => {
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function finish(value: boolean) {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
  }

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {request && (
        <Modal title={request.title} onClose={() => finish(false)}>
          <div className="space-y-2.5 p-3.5 sm:space-y-3 sm:p-4">
            <p className="text-sm">{request.question}</p>

            {request.summary && request.summary.length > 0 && (
              <div className="rounded-xl border" style={{ borderColor: "var(--border)" }}>
                {request.summary.map((row, index) => (
                  <div
                    key={`${row.label}-${index}`}
                    className={`flex items-baseline justify-between gap-3 px-3 py-2 text-sm ${row.total ? "border-t font-semibold" : ""}`}
                    style={row.total ? { borderColor: "var(--border)" } : undefined}
                  >
                    <span className="muted">{row.label}</span>
                    <span
                      className="text-right tabular-nums"
                      style={{ color: row.tone === "danger" ? "var(--danger)" : row.tone === "accent" ? "var(--accent)" : undefined }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {request.note && (
              <p className="flex items-start gap-2 rounded-lg p-2.5 text-xs" style={{ background: "var(--bg)", color: "var(--text-muted)" }}>
                <IconAlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>{request.note}</span>
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:flex-wrap sm:justify-end">
              <Button variant="secondary" className="w-full sm:w-auto" onClick={() => finish(false)}>
                {request.cancelLabel ?? "Отмена"}
              </Button>
              <Button variant={request.danger ? "danger" : "primary"} className="w-full sm:w-auto" onClick={() => finish(true)}>
                <IconCheck size={18} /> {request.confirmLabel ?? "Подтверждаю"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
