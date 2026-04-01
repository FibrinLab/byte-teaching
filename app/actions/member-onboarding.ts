'use server'

import { revalidatePath } from 'next/cache'
import {
  createSupabaseClient,
  createSupabaseServiceClient,
} from '@/lib/supabase/server'
import {
  getCurrentOrgId,
  getCurrentUser,
  getCurrentUserId,
  isOrgAdmin,
  isSuperAdmin,
  requireOrg,
  requireOrgManager,
} from '@/lib/auth'
import { getDepartmentsForOrg, getMyModeratedDepartments } from '@/app/actions/departments'
import { getAppUrl } from '@/lib/app-url'
import { getResendClient } from '@/lib/resend'
import {
  buildDepartmentInviteActivationEmailHtml,
  buildDepartmentJoinMagicLinkEmailHtml,
  buildPasswordlessLoginEmailHtml,
} from '@/lib/email-templates'
import type {
  ManagedDepartmentInviteLink,
  ManagedOrgMember,
  OnboardingLinkType,
  Profile,
  UserRole,
} from '@/lib/types'

const DEFAULT_MEMBER_ROLE: UserRole = 'trainee'

interface InviteLookupRecord {
  id: string
  org_id: string
  department_id: string
  invite_code: string
  departments: {
    id: string
    name: string
  } | null
  organizations: {
    id: string
    name: string
  } | null
}

interface PendingOnboardingRequest {
  id: string
  org_id: string
  department_id: string
  invite_link_id: string
  email: string
  first_name: string
  last_name: string
  requested_role: UserRole
  link_type: OnboardingLinkType
  requested_user_id: string | null
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED'
  completed_at: string | null
}

interface BeginDepartmentOnboardingInput {
  inviteCode: string
  email: string
  firstName: string
  lastName: string
  confirmOrgSwitch?: boolean
}

type BeginDepartmentOnboardingResult =
  | {
      status: 'confirm-switch'
      currentOrgName: string
      targetOrgName: string
    }
  | {
      status: 'email-sent'
      message: string
    }
  | {
      status: 'joined'
      redirectTo: string
    }

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function normalizeName(name: string) {
  return name.trim()
}

function buildFullName(firstName: string, lastName: string) {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ')
}

function generateInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 12; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return code
}

async function getInviteByCode(inviteCode: string) {
  const serviceClient = await createSupabaseServiceClient()
  const normalizedCode = inviteCode.trim().toUpperCase()

  const { data, error } = await serviceClient
    .from('department_invite_links')
    .select('id, org_id, department_id, invite_code, departments:department_id(id, name), organizations:org_id(id, name)')
    .eq('invite_code', normalizedCode)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to resolve invite link: ${error.message}`)
  }

  return data as InviteLookupRecord | null
}

async function getManagedDepartmentsForCurrentUser(orgId: string) {
  const [superAdmin, orgAdmin] = await Promise.all([isSuperAdmin(), isOrgAdmin(orgId)])

  if (superAdmin || orgAdmin) {
    return getDepartmentsForOrg(orgId)
  }

  return getMyModeratedDepartments(orgId)
}

async function ensureInviteLinksForDepartments(
  orgId: string,
  departments: { id: string; name: string }[]
) {
  if (departments.length === 0) {
    return []
  }

  const serviceClient = await createSupabaseServiceClient()
  const currentUserId = await getCurrentUserId()
  const departmentIds = departments.map((department) => department.id)

  const { data: existingLinks, error: existingLinksError } = await serviceClient
    .from('department_invite_links')
    .select('department_id')
    .in('department_id', departmentIds)

  if (existingLinksError) {
    throw new Error(`Failed to load invite links: ${existingLinksError.message}`)
  }

  const existingDepartmentIds = new Set((existingLinks || []).map((row) => row.department_id))
  const missingDepartments = departments.filter(
    (department) => !existingDepartmentIds.has(department.id)
  )

  if (missingDepartments.length > 0) {
    const { error: insertError } = await serviceClient
      .from('department_invite_links')
      .insert(
        missingDepartments.map((department) => ({
          org_id: orgId,
          department_id: department.id,
          created_by: currentUserId,
        }))
      )

    if (insertError) {
      throw new Error(`Failed to initialize invite links: ${insertError.message}`)
    }
  }

  const { data: inviteLinks, error: inviteLinksError } = await serviceClient
    .from('department_invite_links')
    .select('department_id, invite_code, rotated_at')
    .in('department_id', departmentIds)

  if (inviteLinksError) {
    throw new Error(`Failed to fetch invite links: ${inviteLinksError.message}`)
  }

  const appUrl = getAppUrl()

  return departments
    .map((department) => {
      const inviteLink = (inviteLinks || []).find((row) => row.department_id === department.id)
      if (!inviteLink) {
        return null
      }

      return {
        department_id: department.id,
        department_name: department.name,
        invite_code: inviteLink.invite_code,
        invite_url: `${appUrl}/join/${inviteLink.invite_code}`,
        rotated_at: inviteLink.rotated_at,
      }
    })
    .filter(Boolean) as ManagedDepartmentInviteLink[]
}

async function upsertPendingOnboardingRequest(
  invite: InviteLookupRecord,
  input: {
    email: string
    firstName: string
    lastName: string
    requestedUserId: string | null
    linkType: OnboardingLinkType
  }
) {
  const serviceClient = await createSupabaseServiceClient()

  const { data: existingRequest, error: existingRequestError } = await serviceClient
    .from('member_onboarding_requests')
    .select('*')
    .eq('department_id', invite.department_id)
    .eq('email', input.email)
    .eq('status', 'PENDING')
    .maybeSingle()

  if (existingRequestError) {
    throw new Error(`Failed to load onboarding request: ${existingRequestError.message}`)
  }

  if (existingRequest) {
    const { data, error } = await serviceClient
      .from('member_onboarding_requests')
      .update({
        org_id: invite.org_id,
        invite_link_id: invite.id,
        first_name: input.firstName,
        last_name: input.lastName,
        requested_role: DEFAULT_MEMBER_ROLE,
        link_type: input.linkType,
        requested_user_id: input.requestedUserId,
      })
      .eq('id', existingRequest.id)
      .select('*')
      .single()

    if (error) {
      throw new Error(`Failed to update onboarding request: ${error.message}`)
    }

    return data as PendingOnboardingRequest
  }

  const { data, error } = await serviceClient
    .from('member_onboarding_requests')
    .insert({
      org_id: invite.org_id,
      department_id: invite.department_id,
      invite_link_id: invite.id,
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      requested_role: DEFAULT_MEMBER_ROLE,
      link_type: input.linkType,
      requested_user_id: input.requestedUserId,
      status: 'PENDING',
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(`Failed to create onboarding request: ${error.message}`)
  }

  return data as PendingOnboardingRequest
}

async function upsertProfileForUser(params: {
  userId: string
  email: string
  firstName: string
  lastName: string
  emailVerifiedAt: string | null
}) {
  const serviceClient = await createSupabaseServiceClient()
  const fullName = buildFullName(params.firstName, params.lastName)

  const { error } = await serviceClient
    .from('profiles')
    .upsert(
      {
        user_id: params.userId,
        email: params.email,
        first_name: params.firstName || null,
        last_name: params.lastName || null,
        full_name: fullName || null,
        email_verified_at: params.emailVerifiedAt,
      },
      { onConflict: 'user_id' }
    )

  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`)
  }
}

async function finalizeOnboardingRequest(
  request: PendingOnboardingRequest,
  currentUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
) {
  const normalizedCurrentEmail = normalizeEmail(currentUser.email || '')

  if (!normalizedCurrentEmail || normalizedCurrentEmail !== request.email) {
    throw new Error('Signed-in email does not match this invite')
  }

  const serviceClient = await createSupabaseServiceClient()
  const { data: memberships, error: membershipsError } = await serviceClient
    .from('organization_members')
    .select('org_id, role')
    .eq('user_id', currentUser.id)

  if (membershipsError) {
    throw new Error(`Failed to load organization memberships: ${membershipsError.message}`)
  }

  const targetOrgMembership = (memberships || []).find(
    (membership) => membership.org_id === request.org_id
  )
  const otherOrgIds = Array.from(
    new Set(
      (memberships || [])
        .filter((membership) => membership.org_id !== request.org_id)
        .map((membership) => membership.org_id)
    )
  )

  if (otherOrgIds.length > 0) {
    const { error: removeDepartmentMembershipsError } = await serviceClient
      .from('department_members')
      .delete()
      .eq('user_id', currentUser.id)
      .in('org_id', otherOrgIds)

    if (removeDepartmentMembershipsError) {
      throw new Error(
        `Failed to remove previous department memberships: ${removeDepartmentMembershipsError.message}`
      )
    }

    const { error: removeOrganizationMembershipsError } = await serviceClient
      .from('organization_members')
      .delete()
      .eq('user_id', currentUser.id)
      .in('org_id', otherOrgIds)

    if (removeOrganizationMembershipsError) {
      throw new Error(
        `Failed to remove previous organization memberships: ${removeOrganizationMembershipsError.message}`
      )
    }
  }

  const { data: existingDepartmentMembership, error: existingDepartmentMembershipError } =
    await serviceClient
      .from('department_members')
      .select('role')
      .eq('department_id', request.department_id)
      .eq('user_id', currentUser.id)
      .maybeSingle()

  if (existingDepartmentMembershipError) {
    throw new Error(
      `Failed to load existing department membership: ${existingDepartmentMembershipError.message}`
    )
  }

  const resolvedOrgRole = (targetOrgMembership?.role as UserRole | undefined) || request.requested_role
  const resolvedDepartmentRole =
    (existingDepartmentMembership?.role as UserRole | undefined) || request.requested_role

  const { error: organizationMembershipError } = await serviceClient
    .from('organization_members')
    .upsert(
      {
        org_id: request.org_id,
        user_id: currentUser.id,
        role: resolvedOrgRole,
      },
      { onConflict: 'org_id,user_id' }
    )

  if (organizationMembershipError) {
    throw new Error(
      `Failed to upsert organization membership: ${organizationMembershipError.message}`
    )
  }

  const { error: departmentMembershipError } = await serviceClient
    .from('department_members')
    .upsert(
      {
        org_id: request.org_id,
        department_id: request.department_id,
        user_id: currentUser.id,
        role: resolvedDepartmentRole,
      },
      { onConflict: 'department_id,user_id' }
    )

  if (departmentMembershipError) {
    throw new Error(`Failed to upsert department membership: ${departmentMembershipError.message}`)
  }

  const firstName = normalizeName(request.first_name)
  const lastName = normalizeName(request.last_name)
  const fullName = buildFullName(firstName, lastName)

  const { error: updateUserError } = await serviceClient.auth.admin.updateUserById(currentUser.id, {
    user_metadata: {
      ...(currentUser.user_metadata || {}),
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
    },
  })

  if (updateUserError) {
    throw new Error(`Failed to sync user metadata: ${updateUserError.message}`)
  }

  await upsertProfileForUser({
    userId: currentUser.id,
    email: normalizedCurrentEmail,
    firstName,
    lastName,
    emailVerifiedAt: currentUser.email_confirmed_at || new Date().toISOString(),
  })

  const { error: completeRequestError } = await serviceClient
    .from('member_onboarding_requests')
    .update({
      requested_user_id: currentUser.id,
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
    })
    .eq('id', request.id)

  if (completeRequestError) {
    throw new Error(`Failed to complete onboarding request: ${completeRequestError.message}`)
  }

  revalidatePath('/admin')
  revalidatePath('/dashboard')
  revalidatePath('/settings')
}

export async function getManagedDepartmentInviteLinks() {
  const orgId = await requireOrg()
  await requireOrgManager(orgId)

  const departments = await getManagedDepartmentsForCurrentUser(orgId)
  return ensureInviteLinksForDepartments(orgId, departments)
}

export async function rotateDepartmentInviteLink(departmentId: string) {
  const orgId = await requireOrg()
  await requireOrgManager(orgId)

  const serviceClient = await createSupabaseServiceClient()
  const { data: department, error: departmentError } = await serviceClient
    .from('departments')
    .select('id, org_id')
    .eq('id', departmentId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (departmentError) {
    throw new Error(`Failed to load department: ${departmentError.message}`)
  }

  if (!department) {
    throw new Error('Department not found')
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const nextCode = generateInviteCode()
    const { error } = await serviceClient
      .from('department_invite_links')
      .update({
        invite_code: nextCode,
        rotated_at: new Date().toISOString(),
      })
      .eq('department_id', departmentId)
      .eq('org_id', orgId)

    if (!error) {
      revalidatePath('/admin')
      return { success: true }
    }

    if (!error.message.toLowerCase().includes('duplicate')) {
      throw new Error(`Failed to rotate invite link: ${error.message}`)
    }
  }

  throw new Error('Failed to generate a unique invite code')
}

export async function getOrgMembersForManagement() {
  const orgId = await requireOrg()
  await requireOrgManager(orgId)

  const serviceClient = await createSupabaseServiceClient()
  const [{ data: organizationMembers, error: organizationMembersError }, { data: departmentMembers, error: departmentMembersError }] =
    await Promise.all([
      serviceClient
        .from('organization_members')
        .select('user_id, role, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true }),
      serviceClient
        .from('department_members')
        .select('user_id, role, departments:department_id(name)')
        .eq('org_id', orgId),
    ])

  if (organizationMembersError) {
    throw new Error(`Failed to fetch organization members: ${organizationMembersError.message}`)
  }

  if (departmentMembersError) {
    throw new Error(`Failed to fetch department members: ${departmentMembersError.message}`)
  }

  const userIds = (organizationMembers || []).map((member) => member.user_id)

  if (userIds.length === 0) {
    return [] as ManagedOrgMember[]
  }

  const { data: profiles, error: profilesError } = await serviceClient
    .from('profiles')
    .select('user_id, email, full_name, first_name, last_name')
    .in('user_id', userIds)

  if (profilesError) {
    throw new Error(`Failed to fetch profiles: ${profilesError.message}`)
  }

  const profileMap = new Map<string, Pick<Profile, 'email' | 'full_name' | 'first_name' | 'last_name'>>(
    (profiles || []).map((profile) => [
      profile.user_id,
      {
        email: profile.email,
        full_name: profile.full_name,
        first_name: profile.first_name,
        last_name: profile.last_name,
      },
    ])
  )

  const membersByUserId = new Map<
    string,
    {
      role: UserRole
      joinedAt: string
      departments: string[]
      hasDepartmentAdminRole: boolean
    }
  >()

  for (const member of organizationMembers || []) {
    membersByUserId.set(member.user_id, {
      role: member.role as UserRole,
      joinedAt: member.created_at,
      departments: [],
      hasDepartmentAdminRole: false,
    })
  }

  for (const departmentMember of departmentMembers || []) {
    const entry = membersByUserId.get(departmentMember.user_id)
    if (!entry) {
      continue
    }

    const departmentRelation = departmentMember.departments as
      | { name: string }
      | { name: string }[]
      | null
    const departmentName = Array.isArray(departmentRelation)
      ? departmentRelation[0]?.name
      : departmentRelation?.name

    if (departmentName && !entry.departments.includes(departmentName)) {
      entry.departments.push(departmentName)
    }

    if (departmentMember.role === 'department_admin') {
      entry.hasDepartmentAdminRole = true
    }
  }

  const missingProfileUserIds = userIds.filter((userId) => !profileMap.has(userId))
  if (missingProfileUserIds.length > 0) {
    const fallbackUsers = await Promise.all(
      missingProfileUserIds.map(async (userId) => {
        const { data, error } = await serviceClient.auth.admin.getUserById(userId)
        if (error || !data.user.email) {
          return null
        }

        return {
          userId,
          email: data.user.email,
          fullName:
            typeof data.user.user_metadata?.full_name === 'string'
              ? data.user.user_metadata.full_name
              : null,
          firstName:
            typeof data.user.user_metadata?.first_name === 'string'
              ? data.user.user_metadata.first_name
              : null,
          lastName:
            typeof data.user.user_metadata?.last_name === 'string'
              ? data.user.user_metadata.last_name
              : null,
        }
      })
    )

    for (const fallbackUser of fallbackUsers) {
      if (!fallbackUser) {
        continue
      }

      profileMap.set(fallbackUser.userId, {
        email: fallbackUser.email,
        full_name: fallbackUser.fullName,
        first_name: fallbackUser.firstName,
        last_name: fallbackUser.lastName,
      })
    }
  }

  return userIds
    .map((userId) => {
      const member = membersByUserId.get(userId)
      const profile = profileMap.get(userId)
      if (!member || !profile?.email) {
        return null
      }

      return {
        user_id: userId,
        email: profile.email,
        full_name: profile.full_name,
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: member.role,
        joined_at: member.joinedAt,
        department_names: [...member.departments].sort((left, right) => left.localeCompare(right)),
        removable: member.role !== 'org_admin' && !member.hasDepartmentAdminRole,
      }
    })
    .filter(Boolean) as ManagedOrgMember[]
}

export async function removeOrgMember(memberUserId: string) {
  const currentUserId = await getCurrentUserId()
  const orgId = await requireOrg()
  await requireOrgManager(orgId)

  if (currentUserId && currentUserId === memberUserId) {
    throw new Error('You cannot remove your own membership from here')
  }

  const serviceClient = await createSupabaseServiceClient()
  const [{ data: organizationMembership, error: organizationMembershipError }, { data: departmentAdminMembership, error: departmentAdminMembershipError }] =
    await Promise.all([
      serviceClient
        .from('organization_members')
        .select('role')
        .eq('org_id', orgId)
        .eq('user_id', memberUserId)
        .maybeSingle(),
      serviceClient
        .from('department_members')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', memberUserId)
        .eq('role', 'department_admin')
        .maybeSingle(),
    ])

  if (organizationMembershipError) {
    throw new Error(`Failed to load organization membership: ${organizationMembershipError.message}`)
  }

  if (departmentAdminMembershipError) {
    throw new Error(`Failed to load department roles: ${departmentAdminMembershipError.message}`)
  }

  if (!organizationMembership) {
    throw new Error('Member not found in this organization')
  }

  if (organizationMembership.role === 'org_admin' || departmentAdminMembership) {
    throw new Error('Removing organization admins or moderators is out of scope for this flow')
  }

  const { error: removeDepartmentMembershipsError } = await serviceClient
    .from('department_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', memberUserId)

  if (removeDepartmentMembershipsError) {
    throw new Error(
      `Failed to remove department memberships: ${removeDepartmentMembershipsError.message}`
    )
  }

  const { error: removeOrganizationMembershipError } = await serviceClient
    .from('organization_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', memberUserId)

  if (removeOrganizationMembershipError) {
    throw new Error(
      `Failed to remove organization membership: ${removeOrganizationMembershipError.message}`
    )
  }

  revalidatePath('/admin')
  revalidatePath('/dashboard')
  revalidatePath('/departments')

  return { success: true }
}

export async function beginDepartmentOnboarding(
  input: BeginDepartmentOnboardingInput
): Promise<BeginDepartmentOnboardingResult> {
  const invite = await getInviteByCode(input.inviteCode)

  if (!invite || !invite.departments || !invite.organizations) {
    throw new Error('Invite link not found')
  }

  const email = normalizeEmail(input.email)
  const firstName = normalizeName(input.firstName)
  const lastName = normalizeName(input.lastName)

  if (!email || !firstName || !lastName) {
    throw new Error('Email, first name, and last name are required')
  }

  const currentUser = await getCurrentUser()
  const serviceClient = await createSupabaseServiceClient()

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('user_id, email, email_verified_at, first_name, last_name, full_name')
    .eq('email', email)
    .maybeSingle()

  if (profileError) {
    throw new Error(`Failed to load profile: ${profileError.message}`)
  }

  const currentUserMatchesEmail =
    !!currentUser?.email && normalizeEmail(currentUser.email) === email
  const resolvedUserId =
    (currentUserMatchesEmail ? currentUser?.id : null) || profile?.user_id || null
  const isVerifiedAccount =
    !!profile?.email_verified_at || !!(currentUserMatchesEmail && currentUser?.email_confirmed_at)

  let currentOrgName: string | null = null

  if (resolvedUserId) {
    const { data: memberships, error: membershipsError } = await serviceClient
      .from('organization_members')
      .select('org_id, organizations:org_id(name)')
      .eq('user_id', resolvedUserId)

    if (membershipsError) {
      throw new Error(`Failed to load existing organization memberships: ${membershipsError.message}`)
    }

    const conflictingMembership = (memberships || []).find(
      (membership) => membership.org_id !== invite.org_id
    )

    if (conflictingMembership) {
      const organizationRelation = conflictingMembership.organizations as
        | { name: string }
        | { name: string }[]
        | null
      currentOrgName =
        Array.isArray(organizationRelation)
          ? organizationRelation[0]?.name || null
          : organizationRelation?.name || null
    }
  }

  if (currentOrgName && !input.confirmOrgSwitch) {
    return {
      status: 'confirm-switch',
      currentOrgName,
      targetOrgName: invite.organizations.name,
    }
  }

  const linkType: OnboardingLinkType = isVerifiedAccount ? 'magiclink' : 'invite'
  const request = await upsertPendingOnboardingRequest(invite, {
    email,
    firstName,
    lastName,
    requestedUserId: resolvedUserId,
    linkType,
  })

  if (currentUserMatchesEmail && currentUser?.email_confirmed_at) {
    await finalizeOnboardingRequest(request, currentUser)
    return {
      status: 'joined',
      redirectTo: '/dashboard',
    }
  }

  const redirectTo = `${getAppUrl()}/join/callback?requestId=${request.id}`
  const fullName = buildFullName(firstName, lastName)

  let generatedLinkType: OnboardingLinkType = linkType
  let actionLink: string | null = null

  const generateLink = async (type: OnboardingLinkType) => {
    const { data, error } = await serviceClient.auth.admin.generateLink({
      type,
      email,
      options: {
        redirectTo,
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
        },
      },
    })

    if (error) {
      return { actionLink: null, error }
    }

    return {
      actionLink: data.properties.action_link,
      error: null,
    }
  }

  let generatedLink = await generateLink(linkType)

  if (
    generatedLink.error &&
    linkType === 'invite' &&
    generatedLink.error.message.toLowerCase().includes('already')
  ) {
    generatedLinkType = 'magiclink'

    const { error: updateRequestTypeError } = await serviceClient
      .from('member_onboarding_requests')
      .update({ link_type: 'magiclink' })
      .eq('id', request.id)

    if (updateRequestTypeError) {
      throw new Error(`Failed to update onboarding request: ${updateRequestTypeError.message}`)
    }

    generatedLink = await generateLink('magiclink')
  }

  if (generatedLink.error || !generatedLink.actionLink) {
    throw new Error(
      `Failed to generate onboarding link: ${generatedLink.error?.message || 'Unknown error'}`
    )
  }

  actionLink = generatedLink.actionLink

  const resend = getResendClient()
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Byte Teaching <onboarding@resend.dev>'
  const html =
    generatedLinkType === 'invite'
      ? buildDepartmentInviteActivationEmailHtml({
          departmentName: invite.departments.name,
          organizationName: invite.organizations.name,
          inviteUrl: actionLink,
          firstName,
        })
      : buildDepartmentJoinMagicLinkEmailHtml({
          departmentName: invite.departments.name,
          organizationName: invite.organizations.name,
          inviteUrl: actionLink,
          firstName,
        })

  const { error: emailError } = await resend.emails.send({
    from: fromAddress,
    to: email,
    subject:
      generatedLinkType === 'invite'
        ? `Activate your access to ${invite.departments.name}`
        : `Join ${invite.departments.name}`,
    html,
  })

  if (emailError) {
    throw new Error(`Failed to send onboarding email: ${emailError.message}`)
  }

  return {
    status: 'email-sent',
    message:
      generatedLinkType === 'invite'
        ? `Check ${email} for your activation email.`
        : `Check ${email} for your sign-in link.`,
  }
}

export async function finalizeMemberOnboarding(requestId: string) {
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    throw new Error('You must be signed in to complete onboarding')
  }

  const serviceClient = await createSupabaseServiceClient()
  const { data: request, error } = await serviceClient
    .from('member_onboarding_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load onboarding request: ${error.message}`)
  }

  if (!request) {
    throw new Error('Onboarding request not found')
  }

  if (request.status === 'COMPLETED') {
    return { success: true, redirectTo: '/dashboard' }
  }

  if (request.status !== 'PENDING') {
    throw new Error('This onboarding request is no longer active')
  }

  await finalizeOnboardingRequest(request as PendingOnboardingRequest, currentUser)

  return { success: true, redirectTo: '/dashboard' }
}

export async function sendPasswordlessLoginLink(emailInput: string) {
  const email = normalizeEmail(emailInput)
  if (!email) {
    throw new Error('Email is required')
  }

  const serviceClient = await createSupabaseServiceClient()
  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('email_verified_at, first_name, full_name')
    .eq('email', email)
    .maybeSingle()

  if (profileError) {
    throw new Error(`Failed to load account profile: ${profileError.message}`)
  }

  if (!profile?.email_verified_at) {
    return {
      success: true,
      message: 'If that email has access, a sign-in link has been sent.',
    }
  }

  const redirectTo = `${getAppUrl()}/join/callback?mode=login&next=/dashboard`
  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo,
    },
  })

  if (error) {
    throw new Error(`Failed to generate sign-in link: ${error.message}`)
  }

  const resend = getResendClient()
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Byte Teaching <onboarding@resend.dev>'
  const firstName =
    (profile.first_name && profile.first_name.trim()) ||
    (profile.full_name && profile.full_name.trim().split(' ')[0]) ||
    null

  const { error: emailError } = await resend.emails.send({
    from: fromAddress,
    to: email,
    subject: 'Your Byte Teaching sign-in link',
    html: buildPasswordlessLoginEmailHtml({
      inviteUrl: data.properties.action_link,
      firstName,
    }),
  })

  if (emailError) {
    throw new Error(`Failed to send sign-in email: ${emailError.message}`)
  }

  return {
    success: true,
    message: 'Check your email for a sign-in link.',
  }
}

export async function getJoinInviteLandingData(inviteCode: string) {
  const invite = await getInviteByCode(inviteCode)

  if (!invite || !invite.departments || !invite.organizations) {
    return null
  }

  const currentUser = await getCurrentUser()
  const currentUserMatchesOrg = currentUser ? await getCurrentOrgId() : null
  let profile: Profile | null = null

  if (currentUser?.id) {
    const supabase = await createSupabaseClient()
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', currentUser.id)
      .maybeSingle()

    profile = (data as Profile | null) || null
  }

  return {
    inviteCode: invite.invite_code,
    organizationName: invite.organizations.name,
    departmentName: invite.departments.name,
    isSignedIn: !!currentUser,
    currentOrgId: currentUserMatchesOrg,
    initialEmail: currentUser?.email || profile?.email || '',
    initialFirstName:
      profile?.first_name ||
      (typeof currentUser?.user_metadata?.first_name === 'string'
        ? currentUser.user_metadata.first_name
        : '') ||
      '',
    initialLastName:
      profile?.last_name ||
      (typeof currentUser?.user_metadata?.last_name === 'string'
        ? currentUser.user_metadata.last_name
        : '') ||
      '',
  }
}
