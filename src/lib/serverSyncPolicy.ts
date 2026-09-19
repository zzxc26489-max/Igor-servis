export interface ServerRevisionDecisionInput {
  currentRevision: number;
  incomingRevision: number;
  requestId?: number;
  latestRequestId?: number;
}

/**
 * Серверное состояние можно применять только вперёд по ревизии.
 * Старый параллельный запрос с уже известной/старой ревизией игнорируется.
 */
export function shouldApplyServerRevision(input: ServerRevisionDecisionInput) {
  if (!Number.isFinite(input.incomingRevision)) return false;
  if (input.incomingRevision < input.currentRevision) return false;
  if (
    input.requestId !== undefined
    && input.latestRequestId !== undefined
    && input.requestId < input.latestRequestId
    && input.incomingRevision <= input.currentRevision
  ) {
    return false;
  }
  return true;
}

/** Ошибку показываем только от самого свежего запроса опроса. */
export function shouldSurfaceServerLoadError(requestId: number, latestRequestId: number) {
  return requestId === latestRequestId;
}


export const SERVER_POLL_MS = 45_000;

/** Есть ли локальные изменения относительно последней подтверждённой серверной базы. */
export function hasLocalChanges<T>(base: T | null, local: T) {
  return Boolean(base && JSON.stringify(base) !== JSON.stringify(local));
}
