let counter = 0;

/** Внутренний идентификатор. Счётчик защищает от совпадений при создании нескольких записей подряд. */
export function createId(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Следующий свободный номер вида «К-0007»: считается от максимального, а не от количества записей. */
export function nextCode(prefix: string, existing: (string | undefined)[], width = 4) {
  const max = existing.reduce((result, code) => {
    if (!code) return result;
    const digits = Number(code.replace(/\D/g, ""));
    return Number.isNaN(digits) ? result : Math.max(result, digits);
  }, 0);
  return `${prefix}-${String(max + 1).padStart(width, "0")}`;
}
