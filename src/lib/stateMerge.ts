function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function keyedArray(value: unknown): value is Array<{ id: string | number; [key: string]: unknown }> {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object" && "id" in item);
}

export interface MergeConflict {
  path: string;
  base: unknown;
  local: unknown;
  remote: unknown;
}

export interface MergeResult<T> {
  value: T;
  conflicts: MergeConflict[];
}

function mergeValue(
  base: unknown,
  local: unknown,
  remote: unknown,
  path: string,
  conflicts: MergeConflict[],
): unknown {
  const localChanged = !same(base, local);
  const remoteChanged = !same(base, remote);

  if (!localChanged) return remote;
  if (!remoteChanged) return local;
  if (same(local, remote)) return local;

  if (keyedArray(base) && keyedArray(local) && keyedArray(remote)) {
    return mergeKeyedArray(base, local, remote, path, conflicts);
  }

  if (record(base) && record(local) && record(remote)) {
    return mergeObject(base, local, remote, path, conflicts);
  }

  // Оба устройства изменили одно и то же скалярное поле по-разному.
  // Сервер — источник истины для уже подтверждённой ревизии.
  conflicts.push({ path, base, local, remote });
  return remote;
}

function mergeObject(
  base: Record<string, unknown>,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
  path: string,
  conflicts: MergeConflict[],
) {
  const next: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);

  for (const key of keys) {
    const childPath = path ? `${path}.${key}` : key;
    const baseHas = Object.prototype.hasOwnProperty.call(base, key);
    const localHas = Object.prototype.hasOwnProperty.call(local, key);
    const remoteHas = Object.prototype.hasOwnProperty.call(remote, key);

    const baseValue = baseHas ? base[key] : undefined;
    const localValue = localHas ? local[key] : undefined;
    const remoteValue = remoteHas ? remote[key] : undefined;

    const merged = mergeValue(baseValue, localValue, remoteValue, childPath, conflicts);
    if (merged !== undefined || localHas || remoteHas) {
      if (merged !== undefined) next[key] = merged;
    }
  }

  return next;
}

function mergeKeyedArray(
  base: Array<{ id: string | number; [key: string]: unknown }>,
  local: Array<{ id: string | number; [key: string]: unknown }>,
  remote: Array<{ id: string | number; [key: string]: unknown }>,
  path: string,
  conflicts: MergeConflict[],
) {
  const baseMap = new Map(base.map((item) => [item.id, item]));
  const localMap = new Map(local.map((item) => [item.id, item]));
  const remoteMap = new Map(remote.map((item) => [item.id, item]));
  const ids = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  const mergedMap = new Map<string | number, { id: string | number; [key: string]: unknown }>();

  for (const id of ids) {
    const baseItem = baseMap.get(id);
    const localItem = localMap.get(id);
    const remoteItem = remoteMap.get(id);
    const itemPath = `${path}[${String(id)}]`;

    // Новая сущность только локально.
    if (!baseItem && localItem && !remoteItem) {
      mergedMap.set(id, localItem);
      continue;
    }
    // Новая сущность только на сервере.
    if (!baseItem && !localItem && remoteItem) {
      mergedMap.set(id, remoteItem);
      continue;
    }
    // Один и тот же id появился одновременно с разными данными.
    if (!baseItem && localItem && remoteItem) {
      const merged = mergeObject({}, localItem, remoteItem, itemPath, conflicts);
      mergedMap.set(id, merged as { id: string | number; [key: string]: unknown });
      continue;
    }

    if (!baseItem) continue;

    // Локальное удаление безопасно только если сервер эту сущность не менял.
    if (!localItem) {
      if (!remoteItem) continue;
      if (same(baseItem, remoteItem)) continue;
      conflicts.push({ path: itemPath, base: baseItem, local: undefined, remote: remoteItem });
      mergedMap.set(id, remoteItem);
      continue;
    }

    // Серверное удаление имеет приоритет над неподтверждённым локальным редактированием.
    if (!remoteItem) {
      if (!same(baseItem, localItem)) {
        conflicts.push({ path: itemPath, base: baseItem, local: localItem, remote: undefined });
      }
      continue;
    }

    const merged = mergeValue(baseItem, localItem, remoteItem, itemPath, conflicts);
    if (merged && typeof merged === "object") {
      mergedMap.set(id, merged as { id: string | number; [key: string]: unknown });
    }
  }

  // Сохраняем привычный локальный порядок и добавляем серверные новинки в конце.
  const order = [
    ...local.map((item) => item.id),
    ...remote.map((item) => item.id).filter((id) => !localMap.has(id)),
  ];

  return order
    .map((id) => mergedMap.get(id))
    .filter((item): item is { id: string | number; [key: string]: unknown } => Boolean(item));
}

/**
 * Трёхстороннее слияние:
 * base   — последняя версия, которую это устройство точно видело на сервере;
 * local  — текущие локальные изменения;
 * remote — свежая подтверждённая серверная ревизия.
 *
 * Разные поля и разные сущности объединяются. Если оба устройства изменили
 * одно и то же поле по-разному, подтверждённое серверное значение побеждает,
 * а конфликт возвращается отдельно и не затирается молча.
 */
export function mergeConcurrentStateDetailed<T extends Record<string, unknown>>(
  base: T,
  local: T,
  remote: T,
): MergeResult<T> {
  const conflicts: MergeConflict[] = [];
  const value = mergeObject(base, local, remote, "", conflicts) as T;
  return { value, conflicts };
}

export function mergeConcurrentState<T extends Record<string, unknown>>(base: T, local: T, remote: T): T {
  return mergeConcurrentStateDetailed(base, local, remote).value;
}
