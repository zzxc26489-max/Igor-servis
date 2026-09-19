export function changedPatch<T extends object>(
  before: T,
  patch: Partial<T>,
): Partial<T> {
  const changed: Partial<T> = {};

  for (const key of Object.keys(patch) as Array<keyof T>) {
    if (!Object.is(before[key], patch[key])) {
      changed[key] = patch[key];
    }
  }

  return changed;
}

export function rebasePatch<T extends object>(
  fresh: T,
  patch: Partial<T>,
): T {
  return { ...fresh, ...patch };
}
