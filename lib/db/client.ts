import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createSupabaseClient as createSupabaseServerClient,
  createSupabaseServiceClient,
} from '@/lib/supabase/server'

/**
 * Internal DB client type for the data-access layer.
 *
 * Intentionally typed as an opaque `Db` and only consumed by files in this
 * directory — entity modules (`lib/db/departments.ts`, etc.) are the only
 * code that should touch the underlying driver. Everything else imports
 * entity functions that return plain domain types from `lib/types.ts`.
 *
 * Why this matters: the whole point of this layer is that swapping Supabase
 * for (e.g.) drizzle + pg later only touches files under `lib/db/`. If a
 * server action or component ever imports `Db` or a Supabase client, the
 * abstraction has leaked and the migration cost grows.
 */
export type Db = SupabaseClient

/**
 * Request-scoped database client. Honours RLS and the signed-in user's
 * session. Use this for anything a user is allowed to do themselves.
 */
export async function getDb(): Promise<Db> {
  return (await createSupabaseServerClient()) as unknown as Db
}

/**
 * Elevated database client that bypasses RLS. Use only for:
 *   - aggregation/audit queries that span user boundaries
 *   - admin mutations that deliberately sidestep policies
 *   - back-end jobs where there is no user session
 *
 * Any caller must have already performed its own authorization check
 * (e.g. `requireDepartmentModerator`, `isOrgAdmin`) before reaching the DAL.
 */
export async function getServiceDb(): Promise<Db> {
  return (await createSupabaseServiceClient()) as unknown as Db
}
