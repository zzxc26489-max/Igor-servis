import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { IconCheck, IconInfoCircle, IconX } from "@tabler/icons-react";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { border: string; bg: string }> = {
  success: { border: "#b9dfc8", bg: "var(--accent)" },
  error: { border: "#f1c2c2", bg: "var(--danger)" },
  info: { border: "#c7dcf5", bg: "var(--info)" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 sm:bottom-6 sm:right-6 print:hidden">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm shadow-lg animate-[toast-in_0.2s_ease-out]"
            style={{ borderColor: TONE_STYLES[t.tone].border }}
            role="status"
          >
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white"
              style={{ background: TONE_STYLES[t.tone].bg }}
            >
              {t.tone === "success" && <IconCheck size={14} />}
              {t.tone === "error" && <IconX size={14} />}
              {t.tone === "info" && <IconInfoCircle size={14} />}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
