'use server'

import { revalidatePath } from 'next/cache'
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import {
  getCurrentOrgId,
  getCurrentUser,
  getCurrentUserId,
  isOrgAdmin,
  isSuperAdmin,
  requireOrg,
  requireOrgManager,
} from '@/lib/auth'
import {
  getDepartmentsForOrg,
  getMyModeratedDepartments,
} from '@/app/actions/departments'
import { getAppUrl, getAppUrlFromHeaders } from '@/lib/app-url'
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
import * as onboardingDb from '@/lib/db/onboarding'
import type {
  InviteLookupRecord,
  PendingOnboardingRequest,
} from '@/lib/db/onboarding'
import { DbNotFoundError } from '@/lib/db'

const DEFAULT_MEMBER_ROLE: UserRole = 'trainee'

/**
 * Supabase admin.generateLink() ignores the redirectTo option and sets
 * redirect_to to the Site URL. This replaces it with the correct value.
 */
function patchActionLinkRedirect(actionLink: string, redirectTo: string): string {
  const url = new URL(actionLink)
  url.searchParams.set('redirect_to', redirectTo)
  return url.toString()
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
): Promise<ManagedDepartmentInviteLink[]> {
  if (departments.length === 0) return []

  const currentUserId = await getCurrentUserId()
  const departmentIds = departments.map((d) => d.id)

  const existingDepartmentIds = new Set(
    await onboardingDb.listInviteLinkDepartmentIds(departmentIds)
  )
  const missingDepartments = departments.filter((d) => !existingDepartmentIds.has(d.id))

  if (missingDepartments.length > 0) {
    await onboardingDb.insertInviteLinksForDepartments(
      missingDepartments.map((d) => ({
        orgId,
        departmentId: d.id,
        createdBy: currentUserId,
      }))
    )
  }

  const inviteLinks = await onboardingDb.listInviteLinksForDepartments(departmentIds)
  const appUrl = getAppUrl()

  return departments
    .map((department) => {
      const inviteLink = inviteLinks.find((row) => row.department_id === department.id)
      if (!inviteLink) return null
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
): Promise<PendingOnboardingRequest> {
  const existing = await onboardingDb.findPendingOnboardingRequest({
    departmentId: invite.department_id,
    email: input.email,
  })

  if (existing) {
    return onboardingDb.updateOnboardingRequest(existing.id, {
      orgId: invite.org_id,
      inviteLinkId: invite.id,
      firstName: input.firstName,
      lastName: input.lastName,
      requestedRole: DEFAULT_MEMBER_ROLE,
      linkType: input.linkType,
      requestedUserId: input.requestedUserId,
    })
  }

  return onboardingDb.insertOnboardingRequest({
    orgId: invite.org_id,
    departmentId: invite.department_id,
    inviteLinkId: invite.id,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    requestedRole: DEFAULT_MEMBER_ROLE,
    linkType: input.linkType,
    requestedUserId: input.requestedUserId,
  })
}

async function upsertProfileForUser(params: {
  userId: string
  email: string
  firstName: string
  lastName: string
  emailVerifiedAt: string | null
}) {
  const fullName = buildFullName(params.firstName, params.lastName)
  await onboardingDb.upsertProfile({
    userId: params.userId,
    email: params.email,
    firstName: params.firstName || null,
    lastName: params.lastName || null,
    fullName: fullName || null,
    emailVerifiedAt: params.emailVerifiedAt,
  })
}

async function finalizeOnboardingRequest(
  request: PendingOnboardingRequest,
  currentUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
) {
  const normalizedCurrentEmail = normalizeEmail(currentUser.email || '')

  if (!normalizedCurrentEmail || normalizedCurrentEmail !== request.email) {
    throw new Error('Signed-in email does not match this invite')
  }

  const memberships = await onboardingDb.listUserOrganizationMemberships(currentUser.id)

  const targetOrgMembership = memberships.find((m) => m.org_id === request.org_id)
  const otherOrgIds = Array.from(
    new Set(
      memberships.filter((m) => m.org_id !== request.org_id).map((m) => m.org_id)
    )
  )

  if (otherOrgIds.length > 0) {
    await onboardingDb.deleteDepartmentMembershipsInOrgs(currentUser.id, otherOrgIds)
    await onboardingDb.deleteOrganizationMembershipsInOrgs(currentUser.id, otherOrgIds)
  }

  const existingDepartmentRole = await onboardingDb.findDepartmentMembershipRole(
    request.department_id,
    currentUser.id
  )

  const resolvedOrgRole =
    (targetOrgMembership?.role as UserRole | undefined) || request.requested_role
  const resolvedDepartmentRole = existingDepartmentRole || request.requested_role

  await onboardingDb.upsertOrganizationMember({
    orgId: request.org_id,
    userId: currentUser.id,
    role: resolvedOrgRole,
  })

  await onboardingDb.upsertDepartmentMember({
    orgId: request.org_id,
    departmentId: request.department_id,
    userId: currentUser.id,
    role: resolvedDepartmentRole,
  })

  const firstName = normalizeName(request.first_name)
  const lastName = normalizeName(request.last_name)
  const fullName = buildFullName(firstName, lastName)

  // Auth-plane: sync user metadata via GoTrue admin API.
  const serviceClient = await createSupabaseServiceClient()
  const { error: updateUserError } = await serviceClient.auth.admin.updateUserById(
    currentUser.id,
    {
      user_metadata: {
        ...(currentUser.user_metadata || {}),
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
      },
    }
  )

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

  await onboardingDb.markOnboardingRequestComplete(request.id, currentUser.id)

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

  const department = await onboardingDb.findDepartmentScope(departmentId, orgId)
  if (!department) {
    throw new DbNotFoundError('Department not found')
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const nextCode = generateInviteCode()
    const result = await onboardingDb.rotateInviteCode({
      departmentId,
      orgId,
      newCode: nextCode,
    })

    if (result.ok) {
      revalidatePath('/admin')
      return { success: true }
    }
    // If it was a duplicate, loop and try a fresh code.
  }

  throw new Error('Failed to generate a unique invite code')
}

export async function getOrgMembersForManagement(): Promise<ManagedOrgMember[]> {
  const orgId = await requireOrg()
  await requireOrgManager(orgId)

  const [organizationMembers, departmentMembers] = await Promise.all([
    onboardingDb.listOrganizationMembers(orgId),
    onboardingDb.listDepartmentMembersWithNames(orgId),
  ])

  const userIds = organizationMembers.map((m) => m.user_id)
  if (userIds.length === 0) return []

  const profiles = await onboardingDb.listProfilesForUsers(userIds)
  const profileMap = new Map<
    string,
    Pick<Profile, 'email' | 'full_name' | 'first_name' | 'last_name'>
  >(
    profiles.map((profile) => [
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

  for (const member of organizationMembers) {
    membersByUserId.set(member.user_id, {
      role: member.role,
      joinedAt: member.created_at,
      departments: [],
      hasDepartmentAdminRole: false,
    })
  }

  for (const departmentMember of departmentMembers) {
    const entry = membersByUserId.get(departmentMember.user_id)
    if (!entry) continue

    if (
      departmentMember.department_name &&
      !entry.departments.includes(departmentMember.department_name)
    ) {
      entry.departments.push(departmentMember.department_name)
    }

    if (departmentMember.role === 'department_admin') {
      entry.hasDepartmentAdminRole = true
    }
  }

  // Auth-plane: back-fill profile info from GoTrue for users without a
  // profile row. Stays on a direct Supabase client until auth swap.
  const missingProfileUserIds = userIds.filter((userId) => !profileMap.has(userId))
  if (missingProfileUserIds.length > 0) {
    const serviceClient = await createSupabaseServiceClient()
    const fallbackUsers = await Promise.all(
      missingProfileUserIds.map(async (userId) => {
        const { data, error } = await serviceClient.auth.admin.getUserById(userId)
        if (error || !data.user.email) return null
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
      if (!fallbackUser) continue
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
      if (!member || !profile?.email) return null
      return {
        user_id: userId,
        email: profile.email,
        full_name: profile.full_name,
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: member.role,
        joined_at: member.joinedAt,
        department_names: [...member.departments].sort((a, b) => a.localeCompare(b)),
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

  const [organizationRole, isDepartmentAdmin] = await Promise.all([
    onboardingDb.findOrganizationMembershipRole({ orgId, userId: memberUserId }),
    onboardingDb.hasDepartmentAdminRole({ orgId, userId: memberUserId }),
  ])

  if (!organizationRole) {
    throw new DbNotFoundError('Member not found in this organization')
  }

  if (organizationRole === 'org_admin' || isDepartmentAdmin) {
    throw new Error('Removing organization admins or moderators is out of scope for this flow')
  }

  await onboardingDb.deleteDepartmentMembershipsForOrgUser({ orgId, userId: memberUserId })
  await onboardingDb.deleteOrganizationMembership({ orgId, userId: memberUserId })

  revalidatePath('/admin')
  revalidatePath('/dashboard')
  revalidatePath('/departments')

  return { success: true }
}

export async function beginDepartmentOnboarding(
  input: BeginDepartmentOnboardingInput
): Promise<BeginDepartmentOnboardingResult> {
  const invite = await onboardingDb.findInviteByCode(input.inviteCode)

  if (!invite || !invite.departments || !invite.organizations) {
    throw new DbNotFoundError('Invite link not found')
  }

  const email = normalizeEmail(input.email)
  const firstName = normalizeName(input.firstName)
  const lastName = normalizeName(input.lastName)

  if (!email || !firstName || !lastName) {
    throw new Error('Email, first name, and last name are required')
  }

  const currentUser = await getCurrentUser()
  const profile = await onboardingDb.findProfileByEmail(email)

  const currentUserMatchesEmail =
    !!currentUser?.email && normalizeEmail(currentUser.email) === email
  const resolvedUserId =
    (currentUserMatchesEmail ? currentUser?.id : null) || profile?.user_id || null
  const isVerifiedAccount =
    !!profile?.email_verified_at ||
    !!(currentUserMatchesEmail && currentUser?.email_confirmed_at)

  let currentOrgName: string | null = null

  if (resolvedUserId) {
    const memberships = await onboardingDb.listUserOrganizationMemberships(resolvedUserId)
    const conflicting = memberships.find((m) => m.org_id !== invite.org_id)
    if (conflicting) {
      currentOrgName = conflicting.organization_name
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
    return { status: 'joined', redirectTo: '/dashboard' }
  }

  // Auth-plane: generate onboarding link via GoTrue and send email.
  const serviceClient = await createSupabaseServiceClient()
  const baseUrl = await getAppUrlFromHeaders()
  const redirectTo = `${baseUrl}/join/callback?requestId=${request.id}`
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
    if (error) return { actionLink: null, error }
    return { actionLink: data.properties.action_link, error: null }
  }

  let generatedLink = await generateLink(linkType)

  if (
    generatedLink.error &&
    linkType === 'invite' &&
    generatedLink.error.message.toLowerCase().includes('already')
  ) {
    generatedLinkType = 'magiclink'
    await onboardingDb.updateOnboardingRequestLinkType(request.id, 'magiclink')
    generatedLink = await generateLink('magiclink')
  }

  if (generatedLink.error || !generatedLink.actionLink) {
    throw new Error(
      `Failed to generate onboarding link: ${generatedLink.error?.message || 'Unknown error'}`
    )
  }

  actionLink = patchActionLinkRedirect(generatedLink.actionLink, redirectTo)

  const resend = getResendClient()
  const fromAddress =
    process.env.RESEND_FROM_EMAIL || 'Byte Teaching <onboarding@resend.dev>'
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

  const request = await onboardingDb.findOnboardingRequestById(requestId)
  if (!request) {
    throw new DbNotFoundError('Onboarding request not found')
  }

  if (request.status === 'COMPLETED') {
    return { success: true, redirectTo: '/dashboard' }
  }

  if (request.status !== 'PENDING') {
    throw new Error('This onboarding request is no longer active')
  }

  await finalizeOnboardingRequest(request, currentUser)

  return { success: true, redirectTo: '/dashboard' }
}

export async function sendPasswordlessLoginLink(emailInput: string) {
  const email = normalizeEmail(emailInput)
  if (!email) {
    throw new Error('Email is required')
  }

  const profile = await onboardingDb.findProfileByEmail(email)

  if (!profile?.email_verified_at) {
    return {
      success: true,
      message: 'If that email has access, a sign-in link has been sent.',
    }
  }

  // Auth-plane: generate magic link via GoTrue.
  const serviceClient = await createSupabaseServiceClient()
  const baseUrl = await getAppUrlFromHeaders()
  const redirectTo = `${baseUrl}/join/callback?mode=login&next=/dashboard`
  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  })

  if (error) {
    throw new Error(`Failed to generate sign-in link: ${error.message}`)
  }

  const resend = getResendClient()
  const fromAddress =
    process.env.RESEND_FROM_EMAIL || 'Byte Teaching <onboarding@resend.dev>'
  const firstName =
    (profile.first_name && profile.first_name.trim()) ||
    (profile.full_name && profile.full_name.trim().split(' ')[0]) ||
    null

  const { error: emailError } = await resend.emails.send({
    from: fromAddress,
    to: email,
    subject: 'Your Byte Teaching sign-in link',
    html: buildPasswordlessLoginEmailHtml({
      inviteUrl: patchActionLinkRedirect(data.properties.action_link, redirectTo),
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
  const invite = await onboardingDb.findInviteByCode(inviteCode)

  if (!invite || !invite.departments || !invite.organizations) {
    return null
  }

  const currentUser = await getCurrentUser()
  const currentUserMatchesOrg = currentUser ? await getCurrentOrgId() : null

  const profile = currentUser?.id
    ? await onboardingDb.findProfileByUserId(currentUser.id)
    : null

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
