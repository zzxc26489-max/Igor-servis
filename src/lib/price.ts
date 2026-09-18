/** Цена для клиента из цены закупки и наценки, округлённая до 10 ₽. */
export function clientPrice(purchasePrice: number, markupPercent: number) {
  if (purchasePrice <= 0) return 0;
  return Math.max(10, Math.round((purchasePrice * (1 + markupPercent / 100)) / 10) * 10);
}

/** Наценка в рублях и процентах: сколько сервис заработает на запчасти. */
export function margin(purchasePrice: number, price: number, qty = 1) {
  const rub = (price - purchasePrice) * qty;
  const percent = purchasePrice > 0 ? Math.round(((price - purchasePrice) / purchasePrice) * 100) : null;
  return { rub, percent };
}
