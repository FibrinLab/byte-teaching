'use server'

import { createSupabaseClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { requireAuth, requireOrg, requireDepartmentModerator } from '@/lib/auth'
import { getResendClient } from '@/lib/resend'
import { revalidatePath } from 'next/cache'
import type { EmailType, Session } from '@/lib/types'

export async function sendTeacherEmail(
  sessionId: string,
  teacherUserId: string,
  emailType: EmailType
) {
  const currentUserId = await requireAuth()
  const orgId = await requireOrg()
  const supabase = await createSupabaseClient()

  // Get session details
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

  // Verify teacher is assigned to this session
  const { data: teacherAssignment } = await supabase
    .from('session_teachers')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', teacherUserId)
    .single()

  if (!teacherAssignment) {
    throw new Error('User is not a teacher for this session')
  }

  // Get teacher email via admin API
  const serviceClient = await createSupabaseServiceClient()
  const { data: userData, error: userError } = await serviceClient.auth.admin.getUserById(teacherUserId)

  if (userError || !userData.user.email) {
    throw new Error('Could not retrieve teacher email address')
  }

  const teacherEmail = userData.user.email

  // Get department name
  const { data: department } = await supabase
    .from('departments')
    .select('name')
    .eq('id', session.department_id)
    .single()

  // Send email via Resend
  const resend = getResendClient()
  const subject = emailType === 'INVITATION'
    ? `You're invited to teach: ${session.title}`
    : `Reminder: Upcoming session - ${session.title}`

  const htmlBody = buildEmailHtml(session as Session, department?.name || '', emailType)
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Byte Teaching <onboarding@resend.dev>'

  const { data: emailResult, error: emailError } = await resend.emails.send({
    from: fromAddress,
    to: teacherEmail,
    subject,
    html: htmlBody,
  })

  if (emailError) {
    throw new Error(`Failed to send email: ${emailError.message}`)
  }

  // Record in teacher_emails table
  const { error: recordError } = await serviceClient
    .from('teacher_emails')
    .insert({
      org_id: orgId,
      session_id: sessionId,
      user_id: teacherUserId,
      email_type: emailType,
      recipient_email: teacherEmail,
      sent_by: currentUserId,
      resend_id: emailResult?.id || null,
    })

  if (recordError) {
    console.error('Failed to record email send:', recordError.message)
  }

  revalidatePath(`/sessions/${sessionId}/manage`)
  return { success: true }
}

export async function getTeacherEmailHistory(sessionId: string) {
  await requireAuth()
  const orgId = await requireOrg()
  const serviceClient = await createSupabaseServiceClient()

  const { data, error } = await serviceClient
    .from('teacher_emails')
    .select('*')
    .eq('session_id', sessionId)
    .eq('org_id', orgId)
    .order('sent_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch email history: ${error.message}`)
  }

  return data || []
}

function buildEmailHtml(
  session: Session,
  departmentName: string,
  emailType: EmailType
): string {
  const startDate = new Date(session.date_start)
  const endDate = new Date(session.date_end)
  const dateStr = startDate.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
  const startTime = startDate.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit'
  })
  const endTime = endDate.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit'
  })

  const locationLabel: Record<string, string> = {
    'MS_TEAMS': 'Microsoft Teams (Online)',
    'IN_PERSON': 'In Person',
    'HYBRID': 'Hybrid (In Person + Online)',
  }

  const heading = emailType === 'INVITATION'
    ? 'You have been invited to teach a session'
    : 'This is a reminder about an upcoming session you are teaching'

  const teamsSection = session.teams_meeting_url
    ? `<tr>
         <td style="padding:8px 0;font-weight:bold;vertical-align:top;">Teams Link:</td>
         <td style="padding:8px 0;">
           <a href="${session.teams_meeting_url}" style="color:#000;text-decoration:underline;">
             Join Meeting
           </a>
         </td>
       </tr>`
    : ''

  const descriptionSection = session.description
    ? `<tr>
         <td style="padding:8px 0;font-weight:bold;vertical-align:top;">Description:</td>
         <td style="padding:8px 0;">${session.description}</td>
       </tr>`
    : ''

  return `
    <div style="font-family:monospace;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="border-bottom:2px solid #000;padding-bottom:10px;">${heading}</h2>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <tr>
          <td style="padding:8px 0;font-weight:bold;vertical-align:top;">Session:</td>
          <td style="padding:8px 0;">${session.title}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-weight:bold;vertical-align:top;">Department:</td>
          <td style="padding:8px 0;">${departmentName}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-weight:bold;vertical-align:top;">Date:</td>
          <td style="padding:8px 0;">${dateStr}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-weight:bold;vertical-align:top;">Time:</td>
          <td style="padding:8px 0;">${startTime} - ${endTime}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-weight:bold;vertical-align:top;">Location:</td>
          <td style="padding:8px 0;">${locationLabel[session.location_type] || session.location_type}</td>
        </tr>
        ${teamsSection}
        ${descriptionSection}
      </table>
      <p style="font-size:12px;color:#666;margin-top:20px;border-top:1px solid #ccc;padding-top:10px;">
        This email was sent via Byte Teaching.
      </p>
    </div>
  `
}
