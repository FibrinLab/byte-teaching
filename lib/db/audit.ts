import { getServiceDb } from './client'
import { toDbError } from './errors'

/**
 * Audit / aggregation reads. Everything here uses the service-role client
 * because audit surfaces read across user/department boundaries. Authorization
 * is the caller's responsibility (see `getAuditPageData`, which gates on
 * `isOrgAdmin` / `isSuperAdmin` / moderated departments before reaching the
 * DAL).
 *
 * We intentionally return flat shapes instead of leaking Supabase's embedded
 * join syntax — swapping drivers later means rewriting these queries, not
 * the callers that consume them.
 */

export interface AuditSessionMeta {
  id: string
  title: string
  date_start: string
  status: string
  department_id: string
  attendance_locked: boolean
  department_name: string
}

export interface AuditCertificateRaw {
  id: string
  recipient_name: string | null
  certificate_role: string
  certificate_code: string
  issued_at: string
  user_id: string | null
  session_title: string
  department_name: string
}

// -----------------------------------------------------------------------------
// Session list queries
// -----------------------------------------------------------------------------

export async function listPublishedSessionIds(
  orgId: string,
  departmentIds: string[]
): Promise<string[]> {
  if (departmentIds.length === 0) return []
  const db = await getServiceDb()
  const { data, error } = await db
    .from('sessions')
    .select('id')
    .in('department_id', departmentIds)
    .eq('org_id', orgId)
    .eq('status', 'PUBLISHED')

  if (error) throw toDbError('Failed to list published session ids', error)
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id)
}

export async function listRecentPublishedSessions(
  orgId: string,
  departmentIds: string[],
  limit = 15
): Promise<AuditSessionMeta[]> {
  if (departmentIds.length === 0) return []
  const db = await getServiceDb()
  const { data, error } = await db
    .from('sessions')
    .select(
      'id, title, date_start, status, department_id, attendance_locked, departments:department_id (name)'
    )
    .in('department_id', departmentIds)
    .eq('org_id', orgId)
    .eq('status', 'PUBLISHED')
    .order('date_start', { ascending: false })
    .limit(limit)

  if (error) throw toDbError('Failed to list recent sessions', error)

  type Row = {
    id: string
    title: string
    date_start: string
    status: string
    department_id: string
    attendance_locked: boolean | null
    departments: { name: string } | { name: string }[] | null
  }

  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    date_start: row.date_start,
    status: row.status,
    department_id: row.department_id,
    attendance_locked: row.attendance_locked ?? false,
    department_name: (() => {
      if (!row.departments) return 'Unknown'
      if (Array.isArray(row.departments)) return row.departments[0]?.name ?? 'Unknown'
      return row.departments.name ?? 'Unknown'
    })(),
  }))
}

// -----------------------------------------------------------------------------
// Counting / aggregating
// -----------------------------------------------------------------------------

export async function listAttendanceStatusesForSessions(
  sessionIds: string[]
): Promise<{ session_id: string; status: string }[]> {
  if (sessionIds.length === 0) return []
  const db = await getServiceDb()
  const { data, error } = await db
    .from('attendance')
    .select('session_id, status')
    .in('session_id', sessionIds)

  if (error) throw toDbError('Failed to list attendance statuses', error)
  return (data as { session_id: string; status: string }[] | null) ?? []
}

export async function listFeedbackRatingsForSessions(
  sessionIds: string[]
): Promise<{ session_id: string; rating: number | null }[]> {
  if (sessionIds.length === 0) return []
  const db = await getServiceDb()
  const { data, error } = await db
    .from('session_feedback')
    .select('session_id, rating')
    .in('session_id', sessionIds)

  if (error) throw toDbError('Failed to list feedback ratings', error)
  return (data as { session_id: string; rating: number | null }[] | null) ?? []
}

export async function listCertificateSessionIds(
  sessionIds: string[]
): Promise<{ session_id: string }[]> {
  if (sessionIds.length === 0) return []
  const db = await getServiceDb()
  const { data, error } = await db
    .from('certificates')
    .select('session_id')
    .in('session_id', sessionIds)

  if (error) throw toDbError('Failed to list certificate session ids', error)
  return (data as { session_id: string }[] | null) ?? []
}

export async function countCertificatesForDepartments(
  departmentIds: string[]
): Promise<number> {
  if (departmentIds.length === 0) return 0
  const db = await getServiceDb()
  const { count, error } = await db
    .from('certificates')
    .select('id', { count: 'exact', head: true })
    .in('department_id', departmentIds)

  if (error) throw toDbError('Failed to count certificates', error)
  return count ?? 0
}

// -----------------------------------------------------------------------------
// Certificate list
// -----------------------------------------------------------------------------

export async function listCertificatesForDepartments(
  departmentIds: string[]
): Promise<AuditCertificateRaw[]> {
  if (departmentIds.length === 0) return []
  const db = await getServiceDb()
  const { data, error } = await db
    .from('certificates')
    .select(
      'id, recipient_name, certificate_role, certificate_code, issued_at, user_id, sessions:session_id (title), departments:department_id (name)'
    )
    .in('department_id', departmentIds)
    .order('issued_at', { ascending: false })

  if (error) throw toDbError('Failed to list audit certificates', error)

  type Row = {
    id: string
    recipient_name: string | null
    certificate_role: string
    certificate_code: string
    issued_at: string
    user_id: string | null
    sessions: { title: string } | { title: string }[] | null
    departments: { name: string } | { name: string }[] | null
  }

  const pickName = (embed: { name: string } | { name: string }[] | null) => {
    if (!embed) return 'Unknown'
    if (Array.isArray(embed)) return embed[0]?.name ?? 'Unknown'
    return embed.name ?? 'Unknown'
  }
  const pickTitle = (embed: { title: string } | { title: string }[] | null) => {
    if (!embed) return 'Unknown'
    if (Array.isArray(embed)) return embed[0]?.title ?? 'Unknown'
    return embed.title ?? 'Unknown'
  }

  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id,
    recipient_name: row.recipient_name,
    certificate_role: row.certificate_role,
    certificate_code: row.certificate_code,
    issued_at: row.issued_at,
    user_id: row.user_id,
    session_title: pickTitle(row.sessions),
    department_name: pickName(row.departments),
  }))
}

// -----------------------------------------------------------------------------
// Members / join requests
// -----------------------------------------------------------------------------

export async function listDepartmentMemberRoles(
  departmentIds: string[]
): Promise<{ role: string }[]> {
  if (departmentIds.length === 0) return []
  const db = await getServiceDb()
  const { data, error } = await db
    .from('department_members')
    .select('role')
    .in('department_id', departmentIds)

  if (error) throw toDbError('Failed to list department member roles', error)
  return (data as { role: string }[] | null) ?? []
}

export async function countPendingJoinRequestsForDepartments(
  departmentIds: string[]
): Promise<number> {
  if (departmentIds.length === 0) return 0
  const db = await getServiceDb()
  const { count, error } = await db
    .from('department_join_requests')
    .select('id', { count: 'exact', head: true })
    .in('department_id', departmentIds)
    .eq('status', 'PENDING')

  if (error) throw toDbError('Failed to count pending join requests', error)
  return count ?? 0
}
