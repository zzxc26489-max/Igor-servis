import type { OrderLineWork } from "../types.ts";

export function appendWorkOnce(works: OrderLineWork[], work: OrderLineWork) {
  return works.some((item) => item.id === work.id) ? works : [...works, work];
}
