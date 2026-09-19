import type { StockItem } from "../types.ts";

export interface ParsedScannedCode {
  raw: string;
  kind: "plain" | "json" | "url" | "labelled";
  candidates: string[];
  barcode?: string;
  sku?: string;
}

const KEY_ALIASES = new Set([
  "barcode", "bar_code", "ean", "ean13", "ean8", "upc", "upca", "upce",
  "sku", "article", "art", "part", "partnumber", "part_number", "code",
  "артикул", "штрихкод", "код",
]);

function normalize(value: string) {
  return value.trim().replace(/^["']|["']$/g, "");
}

function pushUnique(target: string[], value: unknown) {
  if (typeof value !== "string") return;
  const clean = normalize(value);
  if (!clean || clean.length > 256) return;
  if (!target.some((item) => item.toLocaleLowerCase("ru-RU") === clean.toLocaleLowerCase("ru-RU"))) {
    target.push(clean);
  }
}

function looksBarcode(value: string) {
  return /^[0-9]{6,32}$/.test(value);
}

function readObject(obj: Record<string, unknown>, candidates: string[]) {
  let barcode: string | undefined;
  let sku: string | undefined;

  for (const [rawKey, rawValue] of Object.entries(obj)) {
    if (typeof rawValue !== "string") continue;
    const key = rawKey.toLocaleLowerCase("ru-RU").replace(/[\s-]/g, "_");
    const compact = key.replace(/_/g, "");
    if (!KEY_ALIASES.has(key) && !KEY_ALIASES.has(compact)) continue;

    const value = normalize(rawValue);
    pushUnique(candidates, value);
    if (!barcode && /barcode|ean|upc|штрихкод/.test(key)) barcode = value;
    if (!sku && /sku|article|art|part|артикул|код/.test(key)) sku = value;
  }

  return { barcode, sku };
}

export function parseScannedCode(input: string): ParsedScannedCode {
  const raw = input.trim().slice(0, 4096);
  const candidates: string[] = [];
  let kind: ParsedScannedCode["kind"] = "plain";
  let barcode: string | undefined;
  let sku: string | undefined;

  if (!raw) return { raw: "", kind, candidates };

  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        kind = "json";
        const found = readObject(parsed as Record<string, unknown>, candidates);
        barcode = found.barcode;
        sku = found.sku;
      }
    } catch {
      // Не JSON — разберём как обычный текст.
    }
  }

  if (kind === "plain" && /^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      kind = "url";
      const params: Record<string, unknown> = {};
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });
      const found = readObject(params, candidates);
      barcode = found.barcode;
      sku = found.sku;

      const lastPath = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
      if (/^[\p{L}\p{N}._/-]{3,128}$/u.test(lastPath)) pushUnique(candidates, lastPath);
    } catch {
      kind = "plain";
    }
  }

  const labelled = raw.matchAll(
    /(?:^|[\s;|,])(?:sku|article|art|part(?:[_\s-]?number)?|barcode|ean(?:13|8)?|upc|артикул|штрихкод|код)\s*[:=]\s*([^\s;|,]+)/giu,
  );
  for (const match of labelled) {
    kind = kind === "plain" ? "labelled" : kind;
    pushUnique(candidates, match[1]);
  }

  if (candidates.length === 0 && raw.length <= 256) pushUnique(candidates, raw);

  if (!barcode) {
    const numeric = candidates.find(looksBarcode);
    if (numeric) barcode = numeric;
  }
  if (!sku) {
    const nonNumeric = candidates.find((value) => !looksBarcode(value));
    if (nonNumeric) sku = nonNumeric;
  }

  return { raw, kind, candidates, barcode, sku };
}

function exact(value: string | undefined, candidates: string[]) {
  if (!value) return false;
  const normalized = value.trim().toLocaleLowerCase("ru-RU");
  return candidates.some((candidate) => candidate.trim().toLocaleLowerCase("ru-RU") === normalized);
}

export function findStockItemByScannedCode(stock: StockItem[], input: string) {
  const parsed = parseScannedCode(input);
  const candidates = parsed.candidates;

  const item =
    stock.find((entry) => exact(entry.barcode, candidates))
    ?? stock.find((entry) => exact(entry.sku, candidates))
    ?? stock.find((entry) => exact(entry.code, candidates))
    ?? stock.find((entry) => (entry.oeNumbers ?? []).some((value) => exact(value, candidates)))
    ?? stock.find((entry) => (entry.crossNumbers ?? []).some((value) => exact(value, candidates)));

  return { parsed, item };
}

export function preferredScannedValue(input: string) {
  const parsed = parseScannedCode(input);
  return parsed.barcode ?? parsed.sku ?? parsed.candidates[0] ?? parsed.raw;
}
