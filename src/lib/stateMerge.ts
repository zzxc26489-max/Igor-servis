function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

type KeyedItem = { id: string | number; [key: string]: unknown };

function keyedArray(value: unknown): value is KeyedItem[] {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object" && "id" in item);
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export interface MergeConflict {
  path: string;
  kind: "same-field" | "delete-vs-change" | "same-id-create";
}

export interface MergeResult<T> {
  value: T;
  conflicts: MergeConflict[];
}

function childPath(parent: string, key: string | number) {
  return parent ? `${parent}.${key}` : String(key);
}

function mergeValue(
  base: unknown,
  local: unknown,
  remote: unknown,
  path: string,
  conflicts: MergeConflict[],
): unknown {
  // Изменения только на одной стороне применяются без конфликта.
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  if (same(local, remote)) return local;

  if (keyedArray(base) && keyedArray(local) && keyedArray(remote)) {
    return mergeKeyedArray(base, local, remote, path, conflicts);
  }

  if (plainObject(base) && plainObject(local) && plainObject(remote)) {
    return mergeObject(base, local, remote, path, conflicts);
  }

  // Обе стороны поменяли одно и то же поле по-разному.
  // Сервер уже зафиксировал свою ревизию, поэтому он является источником истины.
  conflicts.push({ path, kind: "same-field" });
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
    const merged = mergeValue(base[key], local[key], remote[key], childPath(path, key), conflicts);
    if (merged !== undefined) next[key] = merged;
  }
  return next;
}

function mergeKeyedArray(
  base: KeyedItem[],
  local: KeyedItem[],
  remote: KeyedItem[],
  path: string,
  conflicts: MergeConflict[],
) {
  const baseMap = new Map(base.map((item) => [item.id, item]));
  const localMap = new Map(local.map((item) => [item.id, item]));
  const remoteMap = new Map(remote.map((item) => [item.id, item]));
  const allIds = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);
  const mergedMap = new Map<string | number, KeyedItem>();

  for (const id of allIds) {
    const b = baseMap.get(id);
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    const itemPath = `${path}[${String(id)}]`;

    if (!b) {
      if (l && r) {
        if (same(l, r)) mergedMap.set(id, l);
        else {
          conflicts.push({ path: itemPath, kind: "same-id-create" });
          mergedMap.set(id, r);
        }
      } else if (l) mergedMap.set(id, l);
      else if (r) mergedMap.set(id, r);
      continue;
    }

    if (!l && !r) continue;

    if (!l && r) {
      if (same(r, b)) {
        // Локальное удаление, сервер объект не менял.
        continue;
      }
      // Сервер изменил объект, пока локально его удалили: не теряем серверное изменение.
      conflicts.push({ path: itemPath, kind: "delete-vs-change" });
      mergedMap.set(id, r);
      continue;
    }

    if (l && !r) {
      if (same(l, b)) {
        // Серверное удаление, локально объект не меняли.
        continue;
      }
      // Серверное удаление уже зафиксировано; локальная правка не воскрешает объект молча.
      conflicts.push({ path: itemPath, kind: "delete-vs-change" });
      continue;
    }

    mergedMap.set(
      id,
      mergeValue(b, l!, r!, itemPath, conflicts) as KeyedItem,
    );
  }

  // Сохраняем порядок сервера; локальные новые элементы добавляем в конец.
  const remoteOrder = remote.map((item) => item.id);
  const localOnly = local
    .map((item) => item.id)
    .filter((id) => !remoteOrder.includes(id));
  return [...remoteOrder, ...localOnly]
    .map((id) => mergedMap.get(id))
    .filter((item): item is KeyedItem => Boolean(item));
}

/**
 * Трёхстороннее слияние:
 * base — последняя общая подтверждённая версия,
 * local — текущие несохранённые изменения устройства,
 * remote — свежая серверная ревизия.
 *
 * Разные поля одной сущности объединяются. Если одно поле изменено с обеих
 * сторон по-разному, серверное значение имеет приоритет, а конфликт возвращается
 * вызывающему коду для отображения/журнала.
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
