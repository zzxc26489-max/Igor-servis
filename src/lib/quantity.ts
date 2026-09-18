export function normalizeQuantity(value: number, precision = 3) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function parseQuantity(value: string) {
  const normalized = value.replace(",", ".").replace(/[^0-9.]/g, "");
  const firstDot = normalized.indexOf(".");
  const clean = firstDot < 0
    ? normalized
    : normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, "");
  return clean.slice(0, 10);
}

export function isValidQuantity(value: number) {
  return Number.isFinite(value) && value > 0 && value <= 1_000_000;
}

export function formatQuantity(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(normalizeQuantity(value));
}
