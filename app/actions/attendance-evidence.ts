'use server'

import { revalidatePath } from 'next/cache'
import {
  requireAuth,
  requireOrg,
  getCurrentUserId,
  requireDepartmentModerator,
} from '@/lib/auth'
import * as sessionsDb from '@/lib/db/sessions'
import * as attendanceDb from '@/lib/db/attendance'
import type { EvidenceSource, EvidenceMetadata } from '@/lib/db/attendance'
import { DbNotFoundError } from '@/lib/db'

// Re-export so existing `import type { EvidenceSource } from './attendance-evidence'`
// callers stay working after the DAL move.
export type { EvidenceSource, EvidenceMetadata }

/**
 * Add evidence to the attendance system.
 */
export async function addEvidence(
  sessionId: string,
  source: EvidenceSource,
  payload: {
    userId?: string | null
    externalEmail?: string | null
    metadata?: EvidenceMetadata
  }
) {
  const userId = await getCurrentUserId()
  const orgId = await requireOrg()

  const session = await sessionsDb.findSessionById(sessionId)
  if (!session) {
    throw new DbNotFoundError('Session not found')
  }

  // Validate permissions based on source
  switch (source) {
    case 'SELF_CHECKIN':
      if (!userId || payload.userId !== userId) {
        throw new Error('Unauthorized: can only check in yourself')
      }
      break
    case 'GROUP_CODE':
      if (!userId) {
        throw new Error('Authentication required for group code check-in')
      }
      if (!session.group_code_enabled) {
        throw new Error('Group code is not enabled for this session')
      }
      if (session.group_code_version === null || session.group_code_version === 0) {
        throw new Error('No active group code for this session')
      }
      if (payload.metadata?.code_version !== undefined) {
        if (session.group_code_version !== payload.metadata.code_version) {
          throw new Error('Invalid or expired group code version')
        }
      }
      if (
        session.group_code_expires_at &&
        new Date() > new Date(session.group_code_expires_at)
      ) {
        throw new Error('Group code has expired')
      }
      if (!payload.metadata) {
        payload.metadata = {}
      }
      payload.metadata.code_version = session.group_code_version ?? undefined
      break
    case 'FEEDBACK':
      if (payload.userId && payload.userId !== userId) {
        throw new Error('Unauthorized')
      }
      break
    case 'TEACHER':
      await requireDepartmentModerator(session.department_id)
      break
    case 'TEAMS':
      await requireDepartmentModerator(session.department_id)
      break
  }

  // Validate time windows
  const now = new Date()
  const checkInStart = new Date(
    new Date(session.date_start).getTime() -
      (session.checkin_open_mins_before || 15) * 60 * 1000
  )
  const checkInEnd = new Date(
    new Date(session.date_start).getTime() +
      (session.checkin_close_mins_after || 45) * 60 * 1000
  )
  const feedbackEnd = new Date(
    new Date(session.date_end).getTime() +
      (session.feedback_valid_mins_after_end || 120) * 60 * 1000
  )

  let isValidTime = false
  switch (source) {
    case 'SELF_CHECKIN':
    case 'GROUP_CODE':
      isValidTime = now >= checkInStart && now <= checkInEnd
      break
    case 'FEEDBACK':
      isValidTime = now >= checkInStart && now <= feedbackEnd
      break
    case 'TEACHER':
    case 'TEAMS':
      isValidTime = true
      break
  }

  if (!isValidTime) {
    throw new Error(`Time window closed for ${source} evidence`)
  }

  const metadata: EvidenceMetadata = {
    ...payload.metadata,
    actor_user_id: userId || undefined,
  }

  const evidence = await attendanceDb.insertAttendanceEvidence({
    orgId,
    sessionId,
    departmentId: session.department_id,
    userId: payload.userId || null,
    externalEmail: payload.externalEmail || null,
    source,
    observedAt: now.toISOString(),
    metadata,
    createdBy: userId || null,
  })

  // Recompute attendance if not locked
  if (!session.attendance_locked) {
    const targetUserId = payload.userId || null
    const targetEmail = payload.externalEmail || null
    await recomputeAttendance(sessionId, targetUserId, targetEmail)
  }

  revalidatePath(`/sessions/${sessionId}`)
  revalidatePath(`/sessions/${sessionId}/manage`)
  return evidence
}

/**
 * Recompute attendance for a user based on evidence.
 */
export async function recomputeAttendance(
  sessionId: string,
  userId: string | null,
  externalEmail: string | null
) {
  if (!userId && !externalEmail) {
    throw new Error('Either userId or externalEmail required')
  }

  const orgId = await requireOrg()

  const session = await sessionsDb.findSession(sessionId, orgId)
  if (!session) {
    throw new DbNotFoundError('Session not found')
  }

  const allEvidence = await attendanceDb.listEvidenceForAttendee({
    orgId,
    sessionId,
    userId,
    externalEmail,
  })

  // Filter to valid evidence based on time windows
  const validEvidence = allEvidence.filter((ev) => {
    const observedAt = new Date(ev.observed_at)
    const checkInStart = new Date(
      new Date(session.date_start).getTime() -
        (session.checkin_open_mins_before || 15) * 60 * 1000
    )
    const checkInEnd = new Date(
      new Date(session.date_start).getTime() +
        (session.checkin_close_mins_after || 45) * 60 * 1000
    )
    const feedbackEnd = new Date(
      new Date(session.date_end).getTime() +
        (session.feedback_valid_mins_after_end || 120) * 60 * 1000
    )

    switch (ev.source) {
      case 'SELF_CHECKIN':
      case 'GROUP_CODE':
        return observedAt >= checkInStart && observedAt <= checkInEnd
      case 'FEEDBACK':
        return observedAt >= checkInStart && observedAt <= feedbackEnd
      case 'TEACHER':
      case 'TEAMS':
        return true
      default:
        return false
    }
  })

  if (validEvidence.length === 0) {
    // No valid evidence = ABSENT
    return attendanceDb.upsertAttendance({
      orgId,
      sessionId,
      departmentId: session.department_id,
      userId,
      externalEmail,
      status: 'ABSENT',
      primarySource: null,
      firstEvidenceAt: null,
    })
  }

  // Priority: TEACHER > TEAMS > FEEDBACK > GROUP_CODE > SELF_CHECKIN
  const priority: Record<EvidenceSource, number> = {
    TEACHER: 5,
    TEAMS: 4,
    FEEDBACK: 3,
    GROUP_CODE: 2,
    SELF_CHECKIN: 1,
  }

  const sortedEvidence = validEvidence.sort((a, b) => {
    const priorityDiff = priority[b.source] - priority[a.source]
    if (priorityDiff !== 0) return priorityDiff
    return new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime()
  })

  const primaryEvidence = sortedEvidence[0]
  const firstEvidenceAt = new Date(primaryEvidence.observed_at)
  const sessionStart = new Date(session.date_start)
  const lateAfterMins = session.late_after_mins || 10

  const isLate = firstEvidenceAt > new Date(sessionStart.getTime() + lateAfterMins * 60 * 1000)
  const status = isLate ? 'LATE' : 'PRESENT'

  const statusOverride = primaryEvidence.metadata?.status_override
  const finalStatus = statusOverride || status

  return attendanceDb.upsertAttendance({
    orgId,
    sessionId,
    departmentId: session.department_id,
    userId,
    externalEmail,
    status: finalStatus,
    primarySource: primaryEvidence.source,
    firstEvidenceAt: firstEvidenceAt.toISOString(),
  })
}

/**
 * Lock attendance for a session.
 */
export async function lockAttendance(sessionId: string) {
  const userId = await requireAuth()
  const orgId = await requireOrg()

  const session = await sessionsDb.findSessionScope(sessionId, orgId)
  if (!session) {
    throw new DbNotFoundError('Session not found')
  }

  await requireDepartmentModerator(session.department_id)

  await attendanceDb.setSessionAttendanceLock({
    sessionId,
    locked: true,
    lockedBy: userId,
  })

  await attendanceDb.setAttendanceRowsLock({
    orgId,
    sessionId,
    locked: true,
    lockedBy: userId,
  })

  revalidatePath(`/sessions/${sessionId}`)
  revalidatePath(`/sessions/${sessionId}/manage`)
  return { success: true }
}

/**
 * Unlock attendance for a session.
 */
export async function unlockAttendance(sessionId: string) {
  await requireAuth()
  const orgId = await requireOrg()

  const session = await sessionsDb.findSessionScope(sessionId, orgId)
  if (!session) {
    throw new DbNotFoundError('Session not found')
  }

  await requireDepartmentModerator(session.department_id)

  await attendanceDb.setSessionAttendanceLock({
    sessionId,
    locked: false,
    lockedBy: null,
  })

  await attendanceDb.setAttendanceRowsLock({
    orgId,
    sessionId,
    locked: false,
    lockedBy: null,
  })

  revalidatePath(`/sessions/${sessionId}`)
  revalidatePath(`/sessions/${sessionId}/manage`)
  return { success: true }
}

/**
 * Generate or regenerate group code for a session.
 */
export async function generateGroupCode(sessionId: string) {
  await requireAuth()
  const orgId = await requireOrg()

  const session = await sessionsDb.findSession(sessionId, orgId)
  if (!session) {
    throw new DbNotFoundError('Session not found')
  }

  await requireDepartmentModerator(session.department_id)

  const expiresAt = new Date(
    new Date(session.date_end).getTime() +
      (session.checkin_close_mins_after || 45) * 60 * 1000
  )

  const newVersion = (session.group_code_version || 0) + 1

  const updated = await attendanceDb.updateSessionGroupCode({
    sessionId,
    version: newVersion,
    expiresAt: expiresAt.toISOString(),
  })

  let code = await attendanceDb.callGenerateGroupCode(sessionId, newVersion)
  if (!code) {
    // Fallback to client-side generation if RPC fails
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let fallback = ''
    for (let i = 0; i < 6; i++) {
      fallback += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    code = fallback
  }

  revalidatePath(`/sessions/${sessionId}`)
  revalidatePath(`/sessions/${sessionId}/manage`)

  return {
    code,
    version: newVersion,
    expiresAt: updated.group_code_expires_at,
  }
}

/**
 * Get all evidence for a session (moderators only).
 */
export async function getSessionEvidence(sessionId: string) {
  const orgId = await requireOrg()

  const session = await sessionsDb.findSessionScope(sessionId, orgId)
  if (!session) {
    throw new DbNotFoundError('Session not found')
  }

  await requireDepartmentModerator(session.department_id)

  return attendanceDb.listSessionEvidence(orgId, sessionId)
}
