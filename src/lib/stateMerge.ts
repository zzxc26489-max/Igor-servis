function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function keyedArray(value: unknown): value is Array<{ id: string | number; [key: string]: unknown }> {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object" && "id" in item);
}

function mergeKeyedArray(
  base: Array<{ id: string | number; [key: string]: unknown }>,
  local: Array<{ id: string | number; [key: string]: unknown }>,
  remote: Array<{ id: string | number; [key: string]: unknown }>,
) {
  const baseMap = new Map(base.map((item) => [item.id, item]));
  const localMap = new Map(local.map((item) => [item.id, item]));
  const remoteMap = new Map(remote.map((item) => [item.id, item]));

  for (const [id, baseItem] of baseMap) {
    if (!localMap.has(id)) {
      remoteMap.delete(id);
      continue;
    }
    const localItem = localMap.get(id)!;
    if (!same(baseItem, localItem)) remoteMap.set(id, localItem);
  }
  for (const [id, localItem] of localMap) {
    if (!baseMap.has(id)) remoteMap.set(id, localItem);
  }

  const localOrder = local.map((item) => item.id);
  const remoteOnly = remote.filter((item) => !localOrder.includes(item.id)).map((item) => item.id);
  return [...localOrder, ...remoteOnly]
    .map((id) => remoteMap.get(id))
    .filter(Boolean);
}

function mergeObject(base: Record<string, unknown>, local: Record<string, unknown>, remote: Record<string, unknown>) {
  const next = { ...remote };
  for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
    if (!same(base[key], local[key])) {
      if (local[key] === undefined) delete next[key];
      else next[key] = local[key];
    }
  }
  return next;
}

/**
 * При конфликте ревизий переносим только локально изменённые сущности
 * поверх свежего состояния сервера. Это не даёт двум пользователям
 * затирать изменения друг друга в разных заказах/клиентах/складских позициях.
 */
export function mergeConcurrentState<T extends Record<string, unknown>>(base: T, local: T, remote: T): T {
  const next: Record<string, unknown> = { ...remote };
  for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
    const baseValue = base[key];
    const localValue = local[key];
    if (same(baseValue, localValue)) continue;

    const remoteValue = remote[key];
    if (keyedArray(baseValue) && keyedArray(localValue) && keyedArray(remoteValue)) {
      next[key] = mergeKeyedArray(baseValue, localValue, remoteValue);
      continue;
    }
    if (
      baseValue && localValue && remoteValue
      && typeof baseValue === "object" && typeof localValue === "object" && typeof remoteValue === "object"
      && !Array.isArray(baseValue) && !Array.isArray(localValue) && !Array.isArray(remoteValue)
    ) {
      next[key] = mergeObject(
        baseValue as Record<string, unknown>,
        localValue as Record<string, unknown>,
        remoteValue as Record<string, unknown>,
      );
      continue;
    }
    next[key] = localValue;
  }
  return next as T;
}
