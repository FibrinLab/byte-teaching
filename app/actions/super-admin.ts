'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth, requireSuperAdmin } from '@/lib/auth'
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { getResendClient } from '@/lib/resend'
import { buildModeratorWelcomeEmailHtml } from '@/lib/email-templates'
import { getAppUrl } from '@/lib/app-url'
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

function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  let password = ''
  for (let i = 0; i < 12; i++) {
    password += chars[Math.floor(Math.random() * chars.length)]
  }
  return password
}

export async function createModeratorAccount(input: {
  email: string
  departmentId: string
  firstName?: string
  lastName?: string
}) {
  await requireSuperAdmin()

  const email = input.email.trim().toLowerCase()
  if (!email) throw new Error('Email is required')

  const supabase = await createSupabaseServiceClient()

  // Look up department to get org_id
  const { data: dept, error: deptErr } = await supabase
    .from('departments')
    .select('id, name, org_id, organizations:org_id(name)')
    .eq('id', input.departmentId)
    .single()

  if (deptErr || !dept) throw new DbNotFoundError('Department not found')

  const org = Array.isArray(dept.organizations) ? dept.organizations[0] : dept.organizations
  const orgName = org?.name ?? 'Unknown'

  // Generate temporary password
  const temporaryPassword = generateTemporaryPassword()

  // Create user in Supabase Auth
  const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      first_name: input.firstName?.trim() || null,
      last_name: input.lastName?.trim() || null,
      full_name: [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean).join(' ') || null,
    },
  })

  if (createErr) {
    throw new Error(`Failed to create account: ${createErr.message}`)
  }

  const userId = newUser.user.id

  // Add to org as department_admin
  await supabase.from('organization_members').upsert(
    { org_id: dept.org_id, user_id: userId, role: 'department_admin' },
    { onConflict: 'org_id,user_id' }
  )

  // Add to department as department_admin
  await supabase.from('department_members').upsert(
    { org_id: dept.org_id, department_id: input.departmentId, user_id: userId, role: 'department_admin' },
    { onConflict: 'department_id,user_id' }
  )

  // Create profile
  await supabase.from('profiles').upsert(
    {
      user_id: userId,
      email,
      first_name: input.firstName?.trim() || null,
      last_name: input.lastName?.trim() || null,
      full_name: [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean).join(' ') || null,
      email_verified_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )

  // Send welcome email
  const appUrl = getAppUrl()
  const resend = getResendClient()
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Byte Teaching <onboarding@resend.dev>'

  await resend.emails.send({
    from: fromAddress,
    to: email,
    subject: `Your Byte Teaching Moderator Account`,
    html: buildModeratorWelcomeEmailHtml({
      departmentName: dept.name,
      organizationName: orgName,
      email,
      temporaryPassword,
      loginUrl: `${appUrl}/login`,
    }),
  })

  revalidatePath('/super-admin')
  return { success: true }
}
