import type { MessageKey } from '../i18n'

export type ApiErrorCode =
  | 'unavailable'
  | 'invalid-response'
  | 'unauthenticated'
  | 'permission-denied'
  | 'unsupported'
  | 'offline'
  | 'timeout'
  | 'rate-limited'
  | 'commit-uncertain'
  | 'incompatible'
  | 'context-changed'
  | 'conflict'

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiProblem {
  code: ApiErrorCode
  titleKey: MessageKey
  descriptionKey: MessageKey
  action: 'read' | 'reconcile' | 'none'
  actionLabelKey?: MessageKey
}

const problems: Record<ApiErrorCode, Omit<ApiProblem, 'code'>> = {
  conflict: {
    titleKey: 'errorConflictTitle',
    descriptionKey: 'errorConflictHint',
    action: 'read',
    actionLabelKey: 'queryStatus',
  },
  incompatible: {
    titleKey: 'errorVersionTitle',
    descriptionKey: 'errorVersionHint',
    action: 'read',
    actionLabelKey: 'checkAgain',
  },
  'context-changed': {
    titleKey: 'errorContextTitle',
    descriptionKey: 'errorContextHint',
    action: 'read',
    actionLabelKey: 'checkAgain',
  },
  unavailable: {
    titleKey: 'errorUnavailableTitle',
    descriptionKey: 'errorUnavailableHint',
    action: 'read',
    actionLabelKey: 'checkAgain',
  },
  'invalid-response': {
    titleKey: 'errorInvalidTitle',
    descriptionKey: 'errorInvalidHint',
    action: 'none',
  },
  unauthenticated: {
    titleKey: 'errorAuthTitle',
    descriptionKey: 'errorAuthHint',
    action: 'none',
  },
  'permission-denied': {
    titleKey: 'errorPermissionTitle',
    descriptionKey: 'errorPermissionHint',
    action: 'none',
  },
  unsupported: {
    titleKey: 'errorUnsupportedTitle',
    descriptionKey: 'errorUnsupportedHint',
    action: 'none',
  },
  offline: {
    titleKey: 'errorOfflineTitle',
    descriptionKey: 'errorOfflineHint',
    action: 'read',
    actionLabelKey: 'reconnect',
  },
  timeout: {
    titleKey: 'errorTimeoutTitle',
    descriptionKey: 'errorTimeoutHint',
    action: 'read',
    actionLabelKey: 'queryAgain',
  },
  'rate-limited': {
    titleKey: 'errorRateLimitTitle',
    descriptionKey: 'errorRateLimitHint',
    action: 'read',
    actionLabelKey: 'queryAgain',
  },
  'commit-uncertain': {
    titleKey: 'errorUncertainTitle',
    descriptionKey: 'errorUncertainHint',
    action: 'reconcile',
    actionLabelKey: 'queryStatus',
  },
}

export function describeApiError(cause: unknown): ApiProblem {
  const code = cause instanceof ApiError ? cause.code : 'unavailable'
  return { code, ...problems[code] }
}
