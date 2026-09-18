import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconDots } from "@tabler/icons-react";

export interface RowAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * Меню действий у строки таблицы. Кнопка видна всегда: на телефоне
 * наведения нет, и спрятанные действия просто невозможно найти.
 */
export default function RowMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative inline-block text-left print:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        className="grid h-9 w-9 place-items-center rounded-lg border transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
      >
        <IconDots size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[210px] overflow-hidden rounded-lg border bg-white shadow-lg"
          style={{ borderColor: "var(--border)" }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
              style={{ color: action.danger ? "var(--danger)" : "var(--text)" }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
