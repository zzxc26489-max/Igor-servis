import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconDots } from "@tabler/icons-react";

export interface RowAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * Меню действий у строки таблицы. Кнопка видна всегда: на телефоне наведения
 * нет, и спрятанные действия просто невозможно найти. Само меню рисуем
 * порталом в body — внутри карточки с overflow-hidden оно обрезалось.
 */
export default function RowMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = 220;
    const height = actions.length * 44 + 8;
    // Если снизу не помещается — раскрываем вверх.
    const below = window.innerHeight - rect.bottom;
    setPosition({
      top: below < height ? Math.max(8, rect.top - height - 4) : rect.bottom + 4,
      left: Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8),
    });
  }, [actions.length, open]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (menu.current?.contains(target) || trigger.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function close() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        className="grid h-11 w-11 place-items-center rounded-lg border transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:h-9 sm:w-9 print:hidden"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
      >
        <IconDots size={18} />
      </button>
      {open && createPortal(
        <div
          ref={menu}
          role="menu"
          className="fixed z-[60] w-[220px] overflow-hidden rounded-lg border bg-white shadow-lg print:hidden"
          style={{ top: position.top, left: position.left, borderColor: "var(--border)" }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
              className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
              style={{ color: action.danger ? "var(--danger)" : "var(--text)" }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
