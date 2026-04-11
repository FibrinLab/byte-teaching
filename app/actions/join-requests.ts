'use server'

import { revalidatePath } from 'next/cache'
import {
  requireAuth,
  getCurrentUser,
  isSuperAdmin,
  isDepartmentModerator,
} from '@/lib/auth'
import type { UserRole } from '@/lib/types'
import * as joinRequestsDb from '@/lib/db/join-requests'
import * as onboardingDb from '@/lib/db/onboarding'
import { DbNotFoundError } from '@/lib/db'

export async function createDepartmentJoinRequest(
  orgId: string,
  departmentId: string,
  requestedRole: UserRole = 'trainee'
) {
  const userId = await requireAuth()
  const user = await getCurrentUser()

  const request = await joinRequestsDb.insertDepartmentJoinRequest({
    orgId,
    departmentId,
    userId,
    userEmail: user?.email || '',
    requestedRole,
  })

  revalidatePath('/admin')
  return request
}

export async function getPendingDepartmentJoinRequests() {
  return joinRequestsDb.listPendingJoinRequests()
}

export async function getAllPendingDepartmentJoinRequests() {
  return joinRequestsDb.listPendingJoinRequests({ service: true })
}

export async function approveDepartmentJoinRequest(
  requestId: string,
  role: UserRole = 'trainee'
) {
  const userId = await requireAuth()

  const request = await joinRequestsDb.findJoinRequest(requestId)
  if (!request) {
    throw new DbNotFoundError('Join request not found')
  }

  if (request.status !== 'PENDING') {
    throw new Error('Join request already processed')
  }

  const allowed =
    (await isSuperAdmin()) || (await isDepartmentModerator(request.department_id))
  if (!allowed) {
    throw new Error('Not authorized to approve this request')
  }

  await joinRequestsDb.updateJoinRequestStatus({
    id: requestId,
    status: 'APPROVED',
    decidedBy: userId,
  })

  const resolvedRole = role || request.requested_role || 'trainee'

  // Clean up prior cross-org memberships so approving a request moves the
  // user into the target org rather than leaving them straddling two.
  await onboardingDb.deleteMembershipsInOtherOrgs(request.user_id, request.org_id)

  await onboardingDb.upsertOrganizationMember({
    orgId: request.org_id,
    userId: request.user_id,
    role: resolvedRole,
  })

  await onboardingDb.upsertDepartmentMember({
    orgId: request.org_id,
    departmentId: request.department_id,
    userId: request.user_id,
    role: resolvedRole,
  })

  revalidatePath('/admin')
  return { success: true }
}

export async function rejectDepartmentJoinRequest(requestId: string) {
  const userId = await requireAuth()

  const request = await joinRequestsDb.findJoinRequest(requestId)
  if (!request) {
    throw new DbNotFoundError('Join request not found')
  }

  if (request.status !== 'PENDING') {
    throw new Error('Join request already processed')
  }

  const allowed =
    (await isSuperAdmin()) || (await isDepartmentModerator(request.department_id))
  if (!allowed) {
    throw new Error('Not authorized to reject this request')
  }

  await joinRequestsDb.updateJoinRequestStatus({
    id: requestId,
    status: 'REJECTED',
    decidedBy: userId,
  })

  revalidatePath('/admin')
  return { success: true }
}

export async function getOrganizationsForJoin() {
  return joinRequestsDb.listOrganizationsForJoin()
}

export async function getDepartmentsForOrg(orgId: string) {
  return joinRequestsDb.listDepartmentsForJoin(orgId)
}
