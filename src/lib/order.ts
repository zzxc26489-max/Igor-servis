interface TotalsInput {
  works: { price: number; qty: number }[];
  parts: { price: number; qty: number }[];
  discount?: number;
  paid?: number;
}

export function orderTotals(order: TotalsInput) {
  const works = order.works.reduce((sum, work) => sum + work.price * work.qty, 0);
  const parts = order.parts.reduce((sum, part) => sum + part.price * part.qty, 0);
  const due = works + parts - (order.discount ?? 0);
  const debt = due - (order.paid ?? 0);
  return { works, parts, due, debt };
}
