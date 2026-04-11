/**
 * Data-access layer barrel.
 *
 * Prefer namespace imports so call sites read as `departmentsDb.findDepartment(...)`
 * rather than a loose `findDepartment(...)` that could collide with similarly
 * named helpers in other entity modules:
 *
 *   import * as departmentsDb from '@/lib/db/departments'
 *   import * as sessionsDb from '@/lib/db/sessions'
 *
 * This file exists so `import { DbError } from '@/lib/db'` works from action
 * files that only need the error types.
 */
export { DbError, DbNotFoundError, DbConflictError, toDbError } from './errors'
