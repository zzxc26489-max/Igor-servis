import type { PartReference } from "../types";

/**
 * Стартовый мини-справочник. Применяемость берём только из проверяемых каталогов;
 * перед заказом деталь всё равно нужно подтвердить по VIN/двигателю.
 */
export const partReferences: PartReference[] = [
  {
    id: "ref-hyundai-kia-26300-35505",
    name: "Фильтр масляный двигателя",
    sku: "26300-35505",
    brand: "Hyundai / Kia OE",
    category: "Фильтры",
    unit: "шт.",
    crossNumbers: [
      "26300-35500",
      "26300-35501",
      "26300-35502",
      "26300-35503",
      "26300-35504",
      "26300-35054",
      "26300-3E010",
      "26300-21010",
      "26300-21A00",
    ],
    oeNumbers: ["26300-35505"],
    fitments: [
      "Hyundai Accent / Elantra / Sonata / Tucson / Santa Fe — зависит от двигателя и года",
      "Kia Rio / Forte / Optima / Seltos — зависит от двигателя и года",
    ],
    sourceName: "Hyundai / Kia OEM catalog",
    sourceUrl: "https://parts.kia.com/p/121404691/2630035505.html",
    note: "Один OE-артикул встречается у Hyundai и Kia; перед заказом проверять VIN.",
  },
  {
    id: "ref-mann-cuk2939-1",
    name: "Фильтр салонный угольный",
    sku: "CUK 2939/1",
    brand: "MANN-FILTER",
    category: "Фильтры",
    unit: "шт.",
    oeNumbers: ["1K2 819 653", "1K2 819 653 A", "1K2 819 653 B"],
    fitments: [
      "Audi A3 / Cabriolet (8P)",
      "SEAT Leon II",
      "VW Golf V / Golf VI / Golf Plus",
      "VW Passat B6 / B7",
      "VW Tiguan I",
    ],
    sourceName: "MANN-FILTER catalog",
    sourceUrl: "https://www.mann-filter.com/en/catalog/search-results/product.html/cuk2939/1_mann-filter.html",
    note: "Каталог MANN указывает конкретные модификации и годы; проверять по VIN/двигателю.",
  },
];

export function findPartReferences(query: string) {
  const term = query.trim().toLocaleLowerCase("ru-RU");
  if (!term) return partReferences;
  return partReferences.filter((item) =>
    [
      item.name,
      item.sku,
      item.brand,
      item.category,
      ...(item.crossNumbers ?? []),
      ...(item.oeNumbers ?? []),
      ...item.fitments,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("ru-RU")
      .includes(term),
  );
}
