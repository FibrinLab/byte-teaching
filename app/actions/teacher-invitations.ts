'use server'

import { createSupabaseClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { requireAuth, requireOrg, requireDepartmentModerator } from '@/lib/auth'
import { getResendClient } from '@/lib/resend'
import { buildInvitationEmailHtml } from '@/lib/email-templates'
import { revalidatePath } from 'next/cache'
import type { Session } from '@/lib/types'

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export async function inviteExternalTeacher(sessionId: string, email: string) {
  const currentUserId = await requireAuth()
  const orgId = await requireOrg()
  const supabase = await createSupabaseClient()

  // Get session
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('org_id', orgId)
    .single()

  if (sessionError || !session) {
    throw new Error('Session not found')
  }

  await requireDepartmentModerator(session.department_id)

  // Check for existing pending invitation for same email + session
  const serviceClient = await createSupabaseServiceClient()
  const { data: existing } = await serviceClient
    .from('teacher_invitations')
    .select('id, status')
    .eq('session_id', sessionId)
    .eq('email', email.toLowerCase())
    .single()

  if (existing && existing.status === 'PENDING') {
    throw new Error('An invitation has already been sent to this email')
  }

  const inviteCode = generateInviteCode()

  // Create invitation
  const { error: insertError } = await serviceClient
    .from('teacher_invitations')
    .insert({
      org_id: orgId,
      session_id: sessionId,
      email: email.toLowerCase(),
      invite_code: inviteCode,
      sent_by: currentUserId,
    })

  if (insertError) {
    throw new Error(`Failed to create invitation: ${insertError.message}`)
  }

  // Get department name
  const { data: department } = await supabase
    .from('departments')
    .select('name')
    .eq('id', session.department_id)
    .single()

  // Build RSVP URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const rsvpUrl = `${baseUrl}/sessions/${sessionId}/teacher-rsvp/${inviteCode}`

  // Send email via Resend
  const resend = getResendClient()
  const htmlBody = buildInvitationEmailHtml(session as Session, department?.name || '', rsvpUrl)
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Byte Teaching <onboarding@resend.dev>'

  const { data: emailResult, error: emailError } = await resend.emails.send({
    from: fromAddress,
    to: email.toLowerCase(),
    subject: `You're invited to teach: ${session.title}`,
    html: htmlBody,
  })

  if (emailError) {
    console.error('Failed to send invitation email:', emailError.message)
    revalidatePath(`/sessions/${sessionId}/manage`)
    return { success: true, emailSent: false, emailError: emailError.message }
  }

  // Record in teacher_emails table
  const { error: recordError } = await serviceClient
    .from('teacher_emails')
    .insert({
      org_id: orgId,
      session_id: sessionId,
      user_id: currentUserId,
      email_type: 'INVITATION',
      recipient_email: email.toLowerCase(),
      sent_by: currentUserId,
      resend_id: emailResult?.id || null,
    })

  if (recordError) {
    console.error('Failed to record email send:', recordError.message)
  }

  revalidatePath(`/sessions/${sessionId}/manage`)
  return { success: true, emailSent: true }
}

export async function getSessionInvitations(sessionId: string) {
  await requireAuth()
  const orgId = await requireOrg()
  const serviceClient = await createSupabaseServiceClient()

  const { data, error } = await serviceClient
    .from('teacher_invitations')
    .select('*')
    .eq('session_id', sessionId)
    .eq('org_id', orgId)
    .order('sent_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch invitations: ${error.message}`)
  }

  return data || []
}

export async function deleteTeacherInvitation(sessionId: string, invitationId: string) {
  await requireAuth()
  const orgId = await requireOrg()
  const supabase = await createSupabaseClient()

  // Get session to verify permissions
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('department_id')
    .eq('id', sessionId)
    .eq('org_id', orgId)
    .single()

  if (sessionError || !session) {
    throw new Error('Session not found')
  }

  await requireDepartmentModerator(session.department_id)

  const serviceClient = await createSupabaseServiceClient()

  const { error } = await serviceClient
    .from('teacher_invitations')
    .delete()
    .eq('id', invitationId)
    .eq('session_id', sessionId)
    .eq('org_id', orgId)

  if (error) {
    throw new Error(`Failed to delete invitation: ${error.message}`)
  }

  revalidatePath(`/sessions/${sessionId}/manage`)
}

export async function respondToInvitation(
  inviteCode: string,
  firstName: string,
  lastName: string,
  accepted: boolean
) {
  const serviceClient = await createSupabaseServiceClient()

  // Look up invitation
  const { data: invitation, error: lookupError } = await serviceClient
    .from('teacher_invitations')
    .select('*')
    .eq('invite_code', inviteCode)
    .single()

  if (lookupError || !invitation) {
    throw new Error('Invitation not found')
  }

  if (invitation.status !== 'PENDING') {
    throw new Error('This invitation has already been responded to')
  }

  // Update invitation
  const { error: updateError } = await serviceClient
    .from('teacher_invitations')
    .update({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      status: accepted ? 'ACCEPTED' : 'DECLINED',
      responded_at: new Date().toISOString(),
    })
    .eq('id', invitation.id)

  if (updateError) {
    throw new Error(`Failed to update invitation: ${updateError.message}`)
  }

  return { success: true, status: accepted ? 'ACCEPTED' : 'DECLINED' }
}
