'use server'

import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { requireAuth, requireOrg, isOrgAdmin, isSuperAdmin } from '@/lib/auth'
import { getMyModeratedDepartments, getDepartments } from './departments'

export interface AuditSummaryStats {
  totalSessions: number
  averageAttendanceRate: number
  averageFeedbackRating: number
  certificatesIssued: number
}

export interface AuditSessionRow {
  id: string
  title: string
  dateStart: string
  status: string
  departmentName: string
  attendancePresent: number
  attendanceTotal: number
  feedbackCount: number
  averageRating: number | null
  certificatesIssued: number
  attendanceLocked: boolean
}

export interface AuditCertificateRow {
  id: string
  recipientName: string | null
  recipientEmail: string | null
  sessionTitle: string
  departmentName: string
  certificateRole: string
  certificateCode: string
  issuedAt: string
}

export interface AuditMemberSummary {
  totalMembers: number
  admins: number
  faculty: number
  trainees: number
  pendingJoinRequests: number
}

export interface AuditPageData {
  stats: AuditSummaryStats
  recentSessions: AuditSessionRow[]
  certificates: AuditCertificateRow[]
  memberSummary: AuditMemberSummary
  departmentNames: { id: string; name: string }[]
}

export async function getAuditPageData(): Promise<AuditPageData> {
  await requireAuth()
  const orgId = await requireOrg()

  // Determine which departments the user can audit
  const orgAdmin = await isOrgAdmin()
  const superAdmin = await isSuperAdmin()

  let departmentIds: string[] = []
  let departmentNames: { id: string; name: string }[] = []

  if (orgAdmin || superAdmin) {
    const allDepts = await getDepartments()
    departmentIds = allDepts.map(d => d.id)
    departmentNames = allDepts.map(d => ({ id: d.id, name: d.name }))
  } else {
    const moderatedDepts = await getMyModeratedDepartments()
    if (moderatedDepts.length === 0) {
      throw new Error('No audit access')
    }
    departmentIds = moderatedDepts.map(d => d.id)
    departmentNames = moderatedDepts
  }

  const supabase = await createSupabaseServiceClient()

  // Run all queries in parallel
  const [
    statsResult,
    sessionsResult,
    certificatesResult,
    membersResult,
    joinRequestsResult,
  ] = await Promise.all([
    // Stats queries
    getStats(supabase, departmentIds, orgId),
    // Recent sessions
    getRecentSessions(supabase, departmentIds, orgId),
    // Certificate registry
    getCertificates(supabase, departmentIds),
    // Member counts
    getMemberCounts(supabase, departmentIds),
    // Pending join requests
    getPendingJoinRequests(supabase, departmentIds),
  ])

  return {
    stats: statsResult,
    recentSessions: sessionsResult,
    certificates: certificatesResult,
    memberSummary: {
      ...membersResult,
      pendingJoinRequests: joinRequestsResult,
    },
    departmentNames,
  }
}

async function getStats(
  supabase: any,
  departmentIds: string[],
  orgId: string
): Promise<AuditSummaryStats> {
  // Get session IDs for these departments
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id')
    .in('department_id', departmentIds)
    .eq('org_id', orgId)
    .eq('status', 'PUBLISHED')

  const sessionIds = (sessions || []).map((s: any) => s.id)
  const totalSessions = sessionIds.length

  if (sessionIds.length === 0) {
    return {
      totalSessions: 0,
      averageAttendanceRate: 0,
      averageFeedbackRating: 0,
      certificatesIssued: 0,
    }
  }

  // Parallel: attendance rate, avg feedback, certificate count
  const [attendanceData, feedbackData, certCount] = await Promise.all([
    supabase
      .from('attendance')
      .select('status')
      .in('session_id', sessionIds),
    supabase
      .from('session_feedback')
      .select('rating')
      .in('session_id', sessionIds),
    supabase
      .from('certificates')
      .select('id', { count: 'exact', head: true })
      .in('department_id', departmentIds),
  ])

  const attendanceRecords = attendanceData.data || []
  const presentCount = attendanceRecords.filter(
    (a: any) => a.status === 'PRESENT' || a.status === 'LATE'
  ).length
  const attendanceRate =
    attendanceRecords.length > 0
      ? Math.round((presentCount / attendanceRecords.length) * 100)
      : 0

  const feedbackRecords = feedbackData.data || []
  const avgRating =
    feedbackRecords.length > 0
      ? Math.round(
          (feedbackRecords.reduce((sum: number, f: any) => sum + f.rating, 0) /
            feedbackRecords.length) *
            10
        ) / 10
      : 0

  return {
    totalSessions,
    averageAttendanceRate: attendanceRate,
    averageFeedbackRating: avgRating,
    certificatesIssued: certCount.count || 0,
  }
}

async function getRecentSessions(
  supabase: any,
  departmentIds: string[],
  orgId: string
): Promise<AuditSessionRow[]> {
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, title, date_start, status, department_id, attendance_locked, departments:department_id (name)')
    .in('department_id', departmentIds)
    .eq('org_id', orgId)
    .eq('status', 'PUBLISHED')
    .order('date_start', { ascending: false })
    .limit(15)

  if (!sessions || sessions.length === 0) return []

  const sessionIds = sessions.map((s: any) => s.id)

  // Batch fetch attendance, feedback, and certificate counts
  const [attendanceData, feedbackData, certData] = await Promise.all([
    supabase
      .from('attendance')
      .select('session_id, status')
      .in('session_id', sessionIds),
    supabase
      .from('session_feedback')
      .select('session_id, rating')
      .in('session_id', sessionIds),
    supabase
      .from('certificates')
      .select('session_id')
      .in('session_id', sessionIds),
  ])

  // Group by session_id
  const attendanceBySession = groupBy(attendanceData.data || [], 'session_id')
  const feedbackBySession = groupBy(feedbackData.data || [], 'session_id')
  const certsBySession = groupBy(certData.data || [], 'session_id')

  return sessions.map((s: any) => {
    const att = attendanceBySession[s.id] || []
    const fb = feedbackBySession[s.id] || []
    const certs = certsBySession[s.id] || []

    const presentCount = att.filter(
      (a: any) => a.status === 'PRESENT' || a.status === 'LATE'
    ).length

    const avgRating =
      fb.length > 0
        ? Math.round(
            (fb.reduce((sum: number, f: any) => sum + f.rating, 0) / fb.length) * 10
          ) / 10
        : null

    return {
      id: s.id,
      title: s.title,
      dateStart: s.date_start,
      status: s.status,
      departmentName: s.departments?.name || 'Unknown',
      attendancePresent: presentCount,
      attendanceTotal: att.length,
      feedbackCount: fb.length,
      averageRating: avgRating,
      certificatesIssued: certs.length,
      attendanceLocked: s.attendance_locked || false,
    }
  })
}

async function getCertificates(
  supabase: any,
  departmentIds: string[]
): Promise<AuditCertificateRow[]> {
  const { data } = await supabase
    .from('certificates')
    .select(
      'id, recipient_name, certificate_role, certificate_code, issued_at, user_id, sessions:session_id (title), departments:department_id (name)'
    )
    .in('department_id', departmentIds)
    .order('issued_at', { ascending: false })

  if (!data) return []

  // For certificates with user_id but no recipient_name, try to get email
  const userIds = data
    .filter((c: any) => c.user_id && !c.recipient_name)
    .map((c: any) => c.user_id)

  let userEmails: Record<string, string> = {}
  if (userIds.length > 0) {
    const uniqueUserIds = [...new Set(userIds)] as string[]
    const results = await Promise.all(
      uniqueUserIds.map(async (uid: string) => {
        const { data: userData } = await supabase.auth.admin.getUserById(uid)
        return { id: uid, email: userData?.user?.email || null }
      })
    )
    userEmails = results.reduce((acc: Record<string, string>, u) => {
      if (u.email) acc[u.id] = u.email
      return acc
    }, {})
  }

  return data.map((c: any) => ({
    id: c.id,
    recipientName: c.recipient_name || null,
    recipientEmail: c.user_id ? (userEmails[c.user_id] || null) : null,
    sessionTitle: c.sessions?.title || 'Unknown',
    departmentName: c.departments?.name || 'Unknown',
    certificateRole: c.certificate_role,
    certificateCode: c.certificate_code,
    issuedAt: c.issued_at,
  }))
}

async function getMemberCounts(
  supabase: any,
  departmentIds: string[]
): Promise<Omit<AuditMemberSummary, 'pendingJoinRequests'>> {
  const { data } = await supabase
    .from('department_members')
    .select('role')
    .in('department_id', departmentIds)

  const members = data || []
  return {
    totalMembers: members.length,
    admins: members.filter((m: any) => m.role === 'department_admin' || m.role === 'org_admin').length,
    faculty: members.filter((m: any) => m.role === 'faculty').length,
    trainees: members.filter((m: any) => m.role === 'trainee').length,
  }
}

async function getPendingJoinRequests(
  supabase: any,
  departmentIds: string[]
): Promise<number> {
  const { count } = await supabase
    .from('department_join_requests')
    .select('id', { count: 'exact', head: true })
    .in('department_id', departmentIds)
    .eq('status', 'PENDING')

  return count || 0
}

function groupBy<T extends Record<string, any>>(arr: T[], key: string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = item[key]
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {} as Record<string, T[]>)
}
