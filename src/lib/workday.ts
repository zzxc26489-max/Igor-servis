/**
 * Рабочие часы мастерской. Раньше они были захардкожены в трёх местах и не
 * совпадали с реальными: в шапке было «Ежедневно, 10:00–20:00», а расписание
 * и расчёт загрузки считали с 08:00. Теперь значение одно, берётся из
 * настроек и применяется везде: шкала расписания, поиск свободных окон,
 * обрезка времени на подъёмнике и ёмкость подъёмников в отчётах.
 */
export interface WorkDay {
  /** Открытие, «ЧЧ:ММ». */
  start: string;
  /** Закрытие, «ЧЧ:ММ». */
  end: string;
}

export const DEFAULT_WORK_DAY: WorkDay = { start: "10:00", end: "20:00" };

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: string) {
  return TIME.test(value.trim());
}

export function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

export function minutesToTime(minutes: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/** Корректные часы или значение по умолчанию: кривые настройки не должны ломать расписание. */
export function normalizeWorkDay(work: Partial<WorkDay> | undefined): WorkDay {
  const start = work?.start?.trim() ?? "";
  const end = work?.end?.trim() ?? "";
  if (!isValidTime(start) || !isValidTime(end)) return DEFAULT_WORK_DAY;
  if (timeToMinutes(end) - timeToMinutes(start) < 60) return DEFAULT_WORK_DAY;
  return { start, end };
}

let current: WorkDay = DEFAULT_WORK_DAY;

/** Применяет часы из настроек. Вызывается один раз при загрузке базы и при её изменении. */
export function setWorkDay(work: Partial<WorkDay> | undefined) {
  current = normalizeWorkDay(work);
  return current;
}

export function workDay(): WorkDay {
  return current;
}

export function workDayMinutes(work: WorkDay = current) {
  return timeToMinutes(work.end) - timeToMinutes(work.start);
}

/** Часы для шкалы расписания: 10:00, 11:00 … до закрытия. */
export function workHourScale(work: WorkDay = current) {
  const from = timeToMinutes(work.start);
  const to = timeToMinutes(work.end);
  const hours: string[] = [];
  for (let minutes = from; minutes < to; minutes += 60) hours.push(minutesToTime(minutes));
  return hours;
}

/** Текст для документов и шапки: «Ежедневно, 10:00–20:00». */
export function formatWorkHours(work: WorkDay = current) {
  return `Ежедневно, ${work.start}–${work.end}`;
}

/** Часы из старой текстовой настройки вида «Ежедневно, 10:00–20:00». */
export function parseWorkHours(text: string | undefined): WorkDay | null {
  const match = (text ?? "").match(/([01]?\d|2[0-3]):([0-5]\d)\s*[–—-]\s*([01]?\d|2[0-3]):([0-5]\d)/);
  if (!match) return null;
  const start = `${match[1].padStart(2, "0")}:${match[2]}`;
  const end = `${match[3].padStart(2, "0")}:${match[4]}`;
  return normalizeWorkDay({ start, end });
}
