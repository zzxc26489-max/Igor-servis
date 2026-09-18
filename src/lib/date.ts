/**
 * Даты считаем в местном времени. `toISOString()` переводит в UTC, и ночью
 * в Москве (с 00:00 до 03:00) вчерашний день считался бы сегодняшним.
 */
export function toISODate(value: Date | string = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Сегодняшняя дата в формате YYYY-MM-DD по местному времени. */
export function todayISO() {
  return toISODate(new Date());
}

/** Сдвиг дня на N суток, тоже в местном времени. */
export function shiftISODate(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + delta);
  return toISODate(date);
}

/** Момент времени в формате YYYY-MM-DDTHH:MM:SS по местному времени. */
export function toLocalISO(date: Date) {
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
  return `${toISODate(date)}T${time}`;
}

export function nowISO() {
  return toLocalISO(new Date());
}

/** Момент времени, сдвинутый на N минут, в том же формате. */
export function shiftISOTime(at: string, minutes: number) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  date.setMinutes(date.getMinutes() + minutes);
  return toLocalISO(date);
}
