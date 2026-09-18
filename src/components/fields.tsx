import { type ReactNode } from "react";
import {
  FOREIGN_PLATE_HINT, PHONE_HINT, RU_PLATE_HINT, formatPhone, isValidPhone,
  isValidPlate, normalizePlate, type PlateKind,
} from "../lib/formats";

/** Поле формы с подписью, подсказкой и текстом ошибки под ним. */
export function Field({
  label, children, hint, error, className = "",
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="muted mb-1 block">{label}</span>
      <div className="field-control" style={error ? { ["--border" as string]: "var(--danger)" } : undefined}>
        {children}
      </div>
      {error ? (
        <span className="mt-1 block text-xs" style={{ color: "var(--danger)" }}>{error}</span>
      ) : hint ? (
        <span className="muted mt-1 block text-xs">{hint}</span>
      ) : null}
    </label>
  );
}

/** Телефон с маской +7 (916) 000-00-00: лишние цифры просто не вводятся. */
export function PhoneField({
  label, value, onChange, required = false, touched = false, hint = PHONE_HINT, placeholder = "+7 (900) 000-00-00",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  touched?: boolean;
  hint?: string;
  placeholder?: string;
}) {
  const empty = !value.replace(/\D/g, "");
  const invalid = touched && !empty && !isValidPhone(value);
  const missing = touched && required && empty;
  return (
    <Field
      label={label}
      hint={hint}
      error={missing ? "Укажите телефон" : invalid ? "Номер неполный: нужно +7 и 10 цифр" : undefined}
    >
      <input
        value={value}
        onChange={(event) => onChange(formatPhone(event.target.value))}
        inputMode="tel"
        autoComplete="tel"
        placeholder={placeholder}
        aria-label={label}
      />
    </Field>
  );
}

/** Госномер: российский формат по умолчанию, с переключением на иностранный. */
export function PlateField({
  label = "Госномер *", value, kind, onChange, onKindChange, touched = false, className = "",
}: {
  label?: string;
  value: string;
  kind: PlateKind;
  onChange: (value: string) => void;
  onKindChange: (kind: PlateKind) => void;
  touched?: boolean;
  className?: string;
}) {
  const empty = !value.trim();
  const invalid = touched && !empty && !isValidPlate(value, kind);
  const hint = kind === "ru" ? RU_PLATE_HINT : FOREIGN_PLATE_HINT;

  return (
    <div className={`text-sm ${className}`}>
      <span className="muted mb-1 block">{label}</span>
      <div className="field-control">
        <input
          value={value}
          onChange={(event) => onChange(normalizePlate(event.target.value, kind))}
          placeholder={kind === "ru" ? "А123ВС797" : "AB-123-CD"}
          aria-label={label}
          className="uppercase"
        />
      </div>
      {/* Переключатель под полем: в узкой колонке он не наезжает на соседние подписи. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: "var(--bg)" }}>
          {(["ru", "foreign"] as PlateKind[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                onKindChange(item);
                onChange(normalizePlate(value, item));
              }}
              className="rounded-md px-2 py-0.5 text-[11px] font-semibold transition"
              style={{
                background: kind === item ? "white" : "transparent",
                color: kind === item ? "var(--text)" : "var(--text-muted)",
                boxShadow: kind === item ? "0 1px 2px rgba(23,34,30,.12)" : undefined,
              }}
            >
              {item === "ru" ? "Россия" : "Иностранный"}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: invalid ? "var(--danger)" : "var(--text-muted)" }}>{hint}</span>
      </div>
    </div>
  );
}
