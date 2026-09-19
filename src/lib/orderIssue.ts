import type { Order, OrderLineWork, StockItem } from "../types.ts";
import { effectiveWorkStatus, transitionWorkSessions } from "./workSessions.ts";

export function completeWorksForReady(works: OrderLineWork[], at: string) {
  return works.map((work) => ({
    ...work,
    ...transitionWorkSessions(work, "done", at),
  }));
}

export function orderedParts(order: Order) {
  return order.parts.filter((part) => part.availability === "ordered");
}

export function issueBlockers(order: Order, stock: StockItem[]) {
  const blockers: string[] = [];

  if (order.status !== "готово") {
    blockers.push("Сначала завершите работы и переведите заказ в статус «готово».");
  }

  const unfinished = order.works.filter((work) => effectiveWorkStatus(work) !== "done");
  if (unfinished.length > 0) {
    blockers.push(
      unfinished.length === 1
        ? `Не завершена работа «${unfinished[0].name}».`
        : `Не завершено работ: ${unfinished.length}.`,
    );
  }

  const pendingParts = orderedParts(order);
  if (pendingParts.length > 0) {
    blockers.push(
      pendingParts.length === 1
        ? `Запчасть «${pendingParts[0].name}» ещё отмечена как заказанная.`
        : `Ещё заказано запчастей: ${pendingParts.length}.`,
    );
  }

  for (const part of order.parts.filter((item) => item.availability === "reserved")) {
    if (!part.sku) {
      blockers.push(`У резервной запчасти «${part.name}» нет артикула склада.`);
      continue;
    }
    const item = stock.find((entry) => entry.sku === part.sku);
    if (!item) {
      blockers.push(`Резервная запчасть «${part.name}» больше не найдена на складе.`);
      continue;
    }
    if (part.qty > item.qty + 0.0001) {
      blockers.push(
        `Недостаточно «${item.name}»: на складе ${item.qty} ${item.unit}, в заказе ${part.qty} ${part.unit ?? item.unit}.`,
      );
    }
  }

  return blockers;
}
