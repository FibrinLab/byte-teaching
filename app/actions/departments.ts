'use server'

import { revalidatePath } from 'next/cache'
import {
  getCurrentOrgId,
  requireAuth,
  requireOrg,
  requireDepartmentModerator,
} from '@/lib/auth'
import { normalizeDepartmentFeedbackFields } from '@/lib/feedback-form'
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import * as departmentsDb from '@/lib/db/departments'
import { getServiceDb } from '@/lib/db/client'
import { DbNotFoundError } from '@/lib/db'
import type { TraineeGrade, UserRole } from '@/lib/types'

export async function createDepartment(name: string) {
  const userId = await requireAuth()
  const orgId = await requireOrg()

  const department = await departmentsDb.insertDepartment({
    orgId,
    name,
    createdBy: userId,
  })

  revalidatePath('/departments')
  revalidatePath('/admin')
  return department
}

export async function getDepartmentsForOrg(orgId: string) {
  return departmentsDb.listDepartmentsByOrg(orgId)
}

export async function getDepartments() {
  const orgId = await requireOrg()
  return departmentsDb.listDepartmentsByOrg(orgId)
}

export async function getDepartment(id: string) {
  const orgId = await requireOrg()
  return departmentsDb.getDepartmentOrThrow(id, orgId)
}

export async function addDepartmentMember(
  departmentId: string,
  userId: string,
  role: string
) {
  const orgId = await requireOrg()

  const member = await departmentsDb.insertDepartmentMember({
    orgId,
    departmentId,
    userId,
    role: role as UserRole,
  })

  revalidatePath(`/departments/${departmentId}`)
  revalidatePath('/admin')
  return member
}

export async function getDepartmentMembers(departmentId: string) {
  const orgId = await requireOrg()
  return departmentsDb.listDepartmentMembers(orgId, departmentId)
}

export async function getDepartmentMemberUsers(departmentId: string) {
  await requireDepartmentModerator(departmentId)

  const userIds = await departmentsDb.listDepartmentMemberUserIds(departmentId)
  if (userIds.length === 0) return []

  // Fetching user emails is an auth-plane concern (GoTrue admin API),
  // not a data-plane one, so it stays on a direct Supabase client until
  // the auth provider itself is swapped out.
  const supabase = await createSupabaseServiceClient()
  const users = await Promise.all(
    userIds.map(async (userId) => {
      const { data, error } = await supabase.auth.admin.getUserById(userId)
      if (error) {
        return { id: userId, email: null }
      }
      return { id: data.user.id, email: data.user.email || null }
    })
  )

  return users
}

export async function getMyModeratedDepartments(orgId?: string) {
  const userId = await requireAuth()
  const resolvedOrgId = orgId || (await getCurrentOrgId())
  if (!resolvedOrgId) return []
  return departmentsDb.listModeratedDepartments(userId, resolvedOrgId)
}

export async function getMyModeratedDepartment(orgId?: string) {
  const departments = await getMyModeratedDepartments(orgId)
  return departments[0] ?? null
}

export async function getDepartmentLeadSettings(departmentId: string) {
  await requireDepartmentModerator(departmentId)
  const orgId = await requireOrg()

  const settings = await departmentsDb.findDepartmentSettings(departmentId, orgId)
  if (!settings) {
    throw new DbNotFoundError(`Department ${departmentId} not found`)
  }

  return {
    leadName: settings.leadName || '',
    feedbackFormFields: normalizeDepartmentFeedbackFields(settings.feedbackFormFields),
  }
}

export async function updateDepartmentLeadSettings(
  departmentId: string,
  leadName: string
) {
  await requireDepartmentModerator(departmentId)
  const orgId = await requireOrg()

  await departmentsDb.updateDepartmentLeadName(
    departmentId,
    orgId,
    leadName.trim() || null
  )

  revalidatePath('/dashboard')
  revalidatePath('/settings')
  revalidatePath(`/departments/${departmentId}`)
}

export async function leaveDepartment(departmentId: string) {
  const userId = await requireAuth()

  const orgId = await departmentsDb.findDepartmentOrgId(departmentId)
  if (!orgId) {
    throw new DbNotFoundError('Department not found')
  }

  await departmentsDb.deleteDepartmentMember(departmentId, userId)
  await departmentsDb.deleteOrgMember(orgId, userId)

  revalidatePath('/dashboard')
  revalidatePath('/departments')
  revalidatePath('/admin')
  return { success: true }
}

export interface DepartmentMemberWithProfile {
  user_id: string
  email: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  grade: TraineeGrade | null
  role: UserRole
  joined_at: string
}

export async function getDepartmentMembersWithProfiles(
  departmentId: string
): Promise<DepartmentMemberWithProfile[]> {
  await requireDepartmentModerator(departmentId)
  const orgId = await requireOrg()

  const db = await getServiceDb()

  const { data: members, error: memError } = await db
    .from('department_members')
    .select('user_id, role, grade, created_at')
    .eq('department_id', departmentId)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  if (memError) throw new Error(`Failed to fetch department members: ${memError.message}`)
  if (!members || members.length === 0) return []

  const userIds = members.map((m) => m.user_id)

  const { data: profiles } = await db
    .from('profiles')
    .select('user_id, email, full_name, first_name, last_name')
    .in('user_id', userIds)

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.user_id, p])
  )

  return members.map((m) => {
    const profile = profileMap.get(m.user_id)
    return {
      user_id: m.user_id,
      email: profile?.email ?? '',
      full_name: profile?.full_name ?? null,
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
      grade: m.grade as TraineeGrade | null,
      role: m.role,
      joined_at: m.created_at,
    }
  })
}

export async function removeDepartmentMember(
  departmentId: string,
  memberUserId: string
) {
  await requireDepartmentModerator(departmentId)

  const orgId = await departmentsDb.findDepartmentOrgId(departmentId)
  if (!orgId) {
    throw new DbNotFoundError('Department not found')
  }

  await departmentsDb.deleteDepartmentMember(departmentId, memberUserId)
  await departmentsDb.deleteOrgMember(orgId, memberUserId)

  revalidatePath(`/departments/${departmentId}`)
  revalidatePath('/admin')
  revalidatePath('/settings')
  return { success: true }
}
