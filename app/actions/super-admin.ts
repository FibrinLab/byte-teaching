'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth, requireSuperAdmin } from '@/lib/auth'
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import * as superAdminsDb from '@/lib/db/super-admins'
import * as onboardingDb from '@/lib/db/onboarding'
import { DbNotFoundError } from '@/lib/db'

export async function createOrganizationAsSuperAdmin(name: string) {
  const userId = await requireAuth()
  await requireSuperAdmin()

  const org = await superAdminsDb.insertOrganizationAsUser({
    name,
    createdBy: userId,
  })

  await superAdminsDb.insertOrganizationMemberAsUser({
    orgId: org.id,
    userId,
    role: 'org_admin',
  })

  revalidatePath('/super-admin')
  return org
}

export async function createDepartmentForOrg(orgId: string, name: string) {
  const userId = await requireAuth()
  await requireSuperAdmin()

  const department = await superAdminsDb.insertDepartmentForOrg({
    orgId,
    name,
    createdBy: userId,
  })

  revalidatePath('/super-admin')
  return department
}

export async function getAllOrganizations() {
  await requireSuperAdmin()
  return superAdminsDb.listAllOrganizations()
}

export async function getAllDepartments() {
  await requireSuperAdmin()
  return superAdminsDb.listAllDepartments()
}

export async function deleteOrganization(orgId: string) {
  await requireSuperAdmin()
  await superAdminsDb.deleteOrganizationById(orgId)
  revalidatePath('/super-admin')
  return { success: true }
}

export async function deleteDepartment(departmentId: string) {
  await requireSuperAdmin()
  await superAdminsDb.deleteDepartmentById(departmentId)
  revalidatePath('/super-admin')
  return { success: true }
}

export async function getAllUsers() {
  await requireSuperAdmin()

  // Auth-plane: listing users via GoTrue admin API. Stays on direct Supabase
  // client until auth is swapped out.
  const supabase = await createSupabaseServiceClient()
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })

  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`)
  }

  return data.users || []
}

export async function getSuperAdmins() {
  await requireSuperAdmin()
  return superAdminsDb.listSuperAdmins()
}

export async function getAllDepartmentMemberships() {
  await requireSuperAdmin()
  return superAdminsDb.listAllDepartmentMemberships()
}

export async function getAllOrganizationMemberships() {
  await requireSuperAdmin()
  return superAdminsDb.listAllOrganizationMemberships()
}

export async function grantDepartmentModerator(userId: string, departmentId: string) {
  await requireSuperAdmin()

  const department = await superAdminsDb.findDepartmentOrg(departmentId)
  if (!department) {
    throw new DbNotFoundError('Department not found')
  }

  // Move the user into this department's org, clearing prior memberships.
  await onboardingDb.deleteMembershipsInOtherOrgs(userId, department.org_id)

  await onboardingDb.upsertOrganizationMember({
    orgId: department.org_id,
    userId,
    role: 'department_admin',
  })

  await onboardingDb.upsertDepartmentMember({
    orgId: department.org_id,
    departmentId,
    userId,
    role: 'department_admin',
  })

  revalidatePath('/super-admin')
  return { success: true }
}

export async function revokeDepartmentModerator(userId: string, departmentId: string) {
  await requireSuperAdmin()
  await superAdminsDb.deleteDepartmentModeratorRole({ departmentId, userId })
  revalidatePath('/super-admin')
  return { success: true }
}

export async function grantSuperAdmin(userId: string) {
  await requireSuperAdmin()
  await superAdminsDb.upsertSuperAdmin(userId)
  revalidatePath('/super-admin')
  return { success: true }
}

export async function revokeSuperAdmin(userId: string) {
  await requireSuperAdmin()
  await superAdminsDb.deleteSuperAdmin(userId)
  revalidatePath('/super-admin')
  return { success: true }
}
