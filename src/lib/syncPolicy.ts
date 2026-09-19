export const SERVER_POLL_MS = 45_000;

/**
 * Серверная ревизия на устройстве может только расти.
 * Запоздавший ответ опроса с меньшей ревизией нельзя применять к UI/локальной базе.
 */
export function shouldApplyServerRevision(currentRevision: number, incomingRevision: number) {
  return Number.isFinite(incomingRevision) && incomingRevision >= currentRevision;
}

/** Есть ли локальные изменения относительно последней подтверждённой серверной базы. */
export function hasLocalChanges<T>(base: T | null, local: T) {
  return Boolean(base && JSON.stringify(base) !== JSON.stringify(local));
}
