/**
 * Domain-level errors for the data-access layer.
 *
 * Entity modules should never leak driver-specific error objects (Supabase
 * PostgrestError, pg error codes, etc.) to callers. Instead, convert raw
 * errors via `toDbError` and throw one of the subclasses below. This is
 * the single point in the codebase that knows about driver error shapes.
 */

export class DbError extends Error {
  readonly code: string | undefined

  constructor(message: string, options: { code?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause })
    this.name = 'DbError'
    this.code = options.code
  }
}

export class DbNotFoundError extends DbError {
  constructor(message: string, cause?: unknown) {
    super(message, { code: 'NOT_FOUND', cause })
    this.name = 'DbNotFoundError'
  }
}

export class DbConflictError extends DbError {
  constructor(message: string, cause?: unknown) {
    super(message, { code: 'CONFLICT', cause })
    this.name = 'DbConflictError'
  }
}

/**
 * Normalise a driver error into a DbError. Call this at every throw site in
 * an entity module so that swapping drivers later only requires updating the
 * mappings here.
 *
 * Known codes:
 *   - PGRST116 : PostgREST "no rows" from .single() / maybeSingle()
 *   - 23505    : Postgres unique_violation
 *   - 23503    : Postgres foreign_key_violation
 *   - 23514    : Postgres check_violation
 */
export function toDbError(message: string, error: unknown): DbError {
  if (!error || typeof error !== 'object') {
    return new DbError(message, { cause: error })
  }

  const raw = error as { code?: string; message?: string; details?: string }
  const driverMessage = raw.message || raw.details
  const detail = driverMessage ? `${message}: ${driverMessage}` : message

  switch (raw.code) {
    case 'PGRST116':
      return new DbNotFoundError(detail, error)
    case '23505':
      return new DbConflictError(detail, error)
    default:
      return new DbError(detail, { code: raw.code, cause: error })
  }
}
